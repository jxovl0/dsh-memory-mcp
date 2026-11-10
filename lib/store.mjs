// 存储层：markdown 卡片是真相源，SQLite 只做可重建的索引（FTS5 trigram + 可选向量）
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, unlinkSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const HALF_LIFE_DAYS = 180;

const sha = (t) => createHash('sha1').update(t).digest('hex').slice(0, 12);
const nowIso = () => new Date().toISOString();
const decay = (ts) => Math.exp(-Math.LN2 * Math.max((Date.now() - new Date(ts).getTime()) / 86400e3, 0) / HALF_LIFE_DAYS);
const f32 = (arr) => Buffer.from(new Float32Array(arr).buffer);
const cosine = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const toTokens = (q) => q.split(/[^\p{L}\p{N}_]+/u).filter((t) => t.length > 0);

export class CardStore {
  #dir;
  #db;
  #embedder = null;
  #embedTried = false;

  constructor(dir) {
    this.#dir = dir;
    mkdirSync(join(dir, 'cards'), { recursive: true });
    this.#db = new DatabaseSync(join(dir, 'index.db'));
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, type TEXT, tags TEXT, ts TEXT, text TEXT, pinned INTEGER DEFAULT 0);
      CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(text, id UNINDEXED, tokenize='trigram');
      CREATE TABLE IF NOT EXISTS vecs (id TEXT PRIMARY KEY, dim INTEGER, vec BLOB);
    `);
    this.syncFromDisk();
  }

  get dir() { return this.#dir; }
  cardFile(id) { return join(this.#dir, 'cards', `${id}.md`); }

  // ---------- 卡片文件 ----------
  #readCard(id) {
    const f = this.cardFile(id);
    if (!existsSync(f)) return null;
    const raw = readFileSync(f, 'utf8');
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) return null;
    const meta = {};
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^(\w+):\s*(.*)$/);
      if (kv) meta[kv[1]] = kv[2];
    }
    return {
      id,
      type: meta.type ?? 'fact',
      tags: (meta.tags ?? '').replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean),
      ts: meta.ts ?? nowIso(),
      pinned: meta.pinned === 'true',
      text: m[2].trim(),
    };
  }

  #writeCard(card) {
    const md = [
      '---',
      `id: ${card.id}`,
      `type: ${card.type}`,
      `tags: [${(card.tags ?? []).join(', ')}]`,
      `ts: ${card.ts}`,
      `pinned: ${card.pinned ? 'true' : 'false'}`,
      '---',
      card.text,
      '',
    ].join('\n');
    writeFileSync(this.cardFile(card.id), md, 'utf8');
  }

  #allFiles() {
    const dir = join(this.#dir, 'cards');
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));
  }

  /** 用磁盘上的卡片校正索引（外部手改文件后调用） */
  syncFromDisk() {
    const files = new Set(this.#allFiles());
    const known = new Set(this.#db.prepare('SELECT id FROM cards').all().map((r) => r.id));
    let changed = 0;
    for (const id of files) {
      const card = this.#readCard(id);
      if (!card) continue;
      const row = this.#db.prepare('SELECT text, tags, pinned FROM cards WHERE id = ?').get(id);
      if (!row || row.text !== card.text || row.tags !== card.tags.join(',') || Boolean(row.pinned) !== card.pinned) {
        this.#upsert(card);
        changed++;
      }
    }
    for (const id of known) {
      if (!files.has(id)) {
        this.#db.prepare('DELETE FROM cards WHERE id = ?').run(id);
        this.#db.prepare('DELETE FROM cards_fts WHERE id = ?').run(id);
        this.#db.prepare('DELETE FROM vecs WHERE id = ?').run(id);
        changed++;
      }
    }
    return changed;
  }

  #upsert(card) {
    this.#db.prepare('INSERT OR REPLACE INTO cards(id,type,tags,ts,text,pinned) VALUES (?,?,?,?,?,?)')
      .run(card.id, card.type, card.tags.join(','), card.ts, card.text, card.pinned ? 1 : 0);
    this.#db.prepare('DELETE FROM cards_fts WHERE id = ?').run(card.id);
    this.#db.prepare('INSERT INTO cards_fts(text,id) VALUES (?,?)').run(card.text, card.id);
    // 向量延后到首次检索时补齐（embeddings 可能不可用）
  }

  write({ text, type = 'fact', tags = [], pinned = false }) {
    const card = { id: sha(text), type, tags, ts: nowIso(), pinned, text };
    this.#writeCard(card);
    this.#upsert(card);
    return card;
  }

  forget(id) {
    const f = this.cardFile(id);
    if (!existsSync(f)) return false;
    unlinkSync(f);
    this.#db.prepare('DELETE FROM cards WHERE id = ?').run(id);
    this.#db.prepare('DELETE FROM cards_fts WHERE id = ?').run(id);
    this.#db.prepare('DELETE FROM vecs WHERE id = ?').run(id);
    return true;
  }

  pin(id, pinned) {
    const card = this.#readCard(id);
    if (!card) return false;
    card.pinned = pinned;
    this.#writeCard(card);
    this.#upsert(card);
    return true;
  }

  list(limit = 20) {
    return this.#db.prepare('SELECT * FROM cards ORDER BY ts DESC LIMIT ?').all(limit).map(this.#row);
  }

  #row = (r) => ({ id: r.id, type: r.type, tags: r.tags ? r.tags.split(',') : [], ts: r.ts, text: r.text, pinned: Boolean(r.pinned) });

  /** 注入用：置顶优先，其次最近 */
  forPrompt(recentCount) {
    const pinned = this.#db.prepare('SELECT * FROM cards WHERE pinned = 1 ORDER BY ts DESC').all().map(this.#row);
    const recent = this.#db.prepare('SELECT * FROM cards WHERE pinned = 0 ORDER BY ts DESC LIMIT ?').all(recentCount).map(this.#row);
    return [...pinned, ...recent];
  }

  count() { return this.#db.prepare('SELECT COUNT(*) AS n FROM cards').get().n; }

  // ---------- 可选语义 ----------
  async #getEmbedder() {
    if (this.#embedTried) return this.#embedder;
    this.#embedTried = true;
    try {
      const mod = await import('@huggingface/transformers');
      mod.env.allowLocalModels = false;
      mod.env.cacheDir = join(this.#dir, '.hf-cache', '');
      this.#embedder = await mod.pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5', { dtype: 'q8' });
    } catch {
      this.#embedder = null;
    }
    return this.#embedder;
  }

  async #ensureVectors() {
    const ext = await this.#getEmbedder();
    if (!ext) return null;
    const cards = this.#db.prepare('SELECT id, text FROM cards').all();
    const have = new Set(this.#db.prepare('SELECT id FROM vecs').all().map((r) => r.id));
    const missing = cards.filter((c) => !have.has(c.id));
    if (missing.length) {
      const out = await ext(missing.map((c) => c.text), { pooling: 'mean', normalize: true });
      const dim = out.dims[1];
      const stmt = this.#db.prepare('INSERT OR REPLACE INTO vecs(id,dim,vec) VALUES (?,?,?)');
      for (let i = 0; i < missing.length; i++) {
        stmt.run(missing[i].id, dim, f32(Array.from(out.data.slice(i * dim, (i + 1) * dim))));
      }
    }
    return this.#db.prepare('SELECT COUNT(*) AS n FROM vecs').get().n > 0;
  }

  async search(query, limit = 10) {
    const q = query.trim();
    if (!q) return [];
    const all = this.#db.prepare('SELECT * FROM cards').all().map(this.#row);
    const byId = new Map(all.map((c) => [c.id, c]));

    // 关键词：trigram 需要 >=3 字符，否则 LIKE
    let kwIds = [];
    try {
      const tokens = toTokens(q);
      if ([...q.replace(/\s/g, '')].length >= 3) {
        const match = tokens.map((t) => `"${t}"`).join(' ');
        kwIds = this.#db.prepare('SELECT id FROM cards_fts WHERE cards_fts MATCH ? ORDER BY rank LIMIT 50').all(match).map((r) => r.id);
      }
    } catch { /* 查询语法问题退回 LIKE */ }
    if (!kwIds.length) kwIds = all.filter((c) => c.text.includes(q)).slice(0, 50).map((c) => c.id);
    const kwRank = new Map(kwIds.map((id, i) => [id, i]));

    // 向量（可用时才跑）
    const simMap = new Map();
    let simRank = new Map();
    try {
      if (await this.#ensureVectors()) {
        const ext = this.#embedder;
        const out = await ext([q], { pooling: 'mean', normalize: true });
        const qv = Array.from(out.data);
        const scored = [];
        for (const row of this.#db.prepare('SELECT id, vec FROM vecs').all()) {
          if (!byId.has(row.id)) continue;
          const arr = Array.from(new Float32Array(row.vec.buffer, row.vec.byteOffset, row.vec.byteLength / 4));
          scored.push({ id: row.id, sim: cosine(qv, arr) });
        }
        scored.sort((a, b) => b.sim - a.sim);
        scored.slice(0, 50).forEach((s, i) => simRank.set(s.id, i));
        for (const s of scored) simMap.set(s.id, s.sim);
      }
    } catch { /* 向量不可用则纯关键词 */ }

    const ids = [...new Set([...simRank.keys(), ...kwRank.keys()])];
    const results = ids.map((id) => {
      const card = byId.get(id);
      const sim = simMap.get(id) ?? 0;
      const kw = kwRank.has(id) ? 1 / (1 + kwRank.get(id)) : 0;
      const literal = q.length >= 2 && card.text.includes(q) ? 1 : 0;
      const base = 0.65 * Math.max(sim, 0) + 0.25 * kw + 0.10 * literal;
      return { card, score: base * (0.6 + 0.4 * decay(card.ts)) };
    }).sort((a, b) => b.score - a.score).slice(0, limit);
    return results;
  }

  async hasSemantic() {
    return Boolean(await this.#getEmbedder());
  }

  /**
   * 记忆海：先按向量聚类出「主题分区」（大节点），再把卡片（小节点）分到各自分区。
   * 没有向量时按类型分区。
   * @param {number} threshold 相似度阈值（0-1）
   * @param {number} maxNodes 最多节点数
   */
  graph(threshold = 0.62, maxNodes = 240) {
    const cards = this.#db.prepare('SELECT * FROM cards ORDER BY ts DESC LIMIT ?').all(maxNodes).map(this.#row);
    const byId = new Map(cards.map((c) => [c.id, c]));
    const vecRows = this.#db.prepare('SELECT id, vec FROM vecs').all().filter((r) => byId.has(r.id));
    const vecs = vecRows.map((r) => ({
      id: r.id,
      v: Array.from(new Float32Array(r.vec.buffer, r.vec.byteOffset, r.vec.byteLength / 4)),
    }));
    const vecById = new Map(vecs.map((v) => [v.id, v.v]));

    // ---------- 聚类 ----------
    let clusters = [];
    if (vecs.length >= 6) {
      const k = Math.max(2, Math.min(8, Math.round(Math.sqrt(vecs.length / 2))));
      const dim = vecs[0].v.length;
      // 初始化：按索引均匀取样，避免随机导致每次图形变化
      let centers = [];
      for (let i = 0; i < k; i++) centers.push(vecs[Math.floor((i * vecs.length) / k)].v.slice());
      let assign = new Array(vecs.length).fill(0);
      for (let iter = 0; iter < 14; iter++) {
        let changed = false;
        for (let i = 0; i < vecs.length; i++) {
          let best = 0;
          let bestSim = -Infinity;
          for (let c = 0; c < k; c++) {
            let s = 0;
            const v = vecs[i].v;
            const cv = centers[c];
            for (let d = 0; d < dim; d++) s += v[d] * cv[d];
            if (s > bestSim) { bestSim = s; best = c; }
          }
          if (assign[i] !== best) { assign[i] = best; changed = true; }
        }
        const sums = Array.from({ length: k }, () => new Array(dim).fill(0));
        const counts = new Array(k).fill(0);
        for (let i = 0; i < vecs.length; i++) {
          counts[assign[i]]++;
          const v = vecs[i].v;
          const sum = sums[assign[i]];
          for (let d = 0; d < dim; d++) sum[d] += v[d];
        }
        for (let c = 0; c < k; c++) {
          if (!counts[c]) continue;
          const nv = sums[c].map((x) => x / counts[c]);
          let norm = 0;
          for (const x of nv) norm += x * x;
          norm = Math.sqrt(norm) || 1;
          centers[c] = nv.map((x) => x / norm);
        }
        if (!changed) break;
      }
      const members = Array.from({ length: k }, () => []);
      for (let i = 0; i < vecs.length; i++) members[assign[i]].push(vecs[i].id);
      clusters = members
        .map((ids, i) => ({ ids, center: centers[i], raw: i }))
        .filter((c) => c.ids.length > 0)
        .map((c, i) => ({ id: `c${i}`, label: this.#clusterLabel(c.ids, byId), count: c.ids.length, ids: c.ids }));
      var assignOf = new Map();
      clusters.forEach((c) => c.ids.forEach((id) => assignOf.set(id, c.id)));
    } else {
      // 无向量：按类型分区
      const types = [...new Set(cards.map((c) => c.type))];
      clusters = types.map((t, i) => {
        const ids = cards.filter((c) => c.type === t).map((c) => c.id);
        return { id: `c${i}`, label: TYPE_LABEL_CN[t] ?? t, count: ids.length, ids };
      });
      var assignOf = new Map();
      clusters.forEach((c) => c.ids.forEach((id) => assignOf.set(id, c.id)));
    }

    // ---------- 边（只连同一分区内的，避免跨区噪声） ----------
    const edges = [];
    const deg = new Map(cards.map((c) => [c.id, 0]));
    if (vecs.length >= 6) {
      for (let i = 0; i < vecs.length; i++) {
        for (let j = i + 1; j < vecs.length; j++) {
          if (assignOf.get(vecs[i].id) !== assignOf.get(vecs[j].id)) continue;
          const a = vecs[i].v;
          const b = vecs[j].v;
          let s = 0;
          for (let k = 0; k < a.length; k++) s += a[k] * b[k];
          if (s >= threshold) {
            edges.push({ source: vecs[i].id, target: vecs[j].id, weight: Number(s.toFixed(3)) });
            deg.set(vecs[i].id, (deg.get(vecs[i].id) ?? 0) + 1);
            deg.set(vecs[j].id, (deg.get(vecs[j].id) ?? 0) + 1);
          }
        }
      }
    } else {
      for (const c of clusters) {
        for (let i = 0; i < c.ids.length; i++) {
          for (let j = i + 1; j < c.ids.length; j++) {
            edges.push({ source: c.ids[i], target: c.ids[j], weight: 0.3 });
          }
        }
      }
    }

    // 分区按大小排序，便于界面稳定
    clusters.sort((a, b) => b.count - a.count).map((c, i) => ({ ...c, id: `c${i}` }));
    const clusterList = clusters.map((c, i) => ({
      id: `c${i}`,
      label: c.label,
      count: c.count,
      sample: c.ids.slice(0, 3).map((id) => (byId.get(id)?.text ?? '').slice(0, 60)),
    }));
    const clusterIdOf = new Map();
    clusters.forEach((c, i) => c.ids.forEach((id) => clusterIdOf.set(id, `c${i}`)));

    return {
      nodes: cards.map((c) => ({
        id: c.id,
        type: c.type,
        tags: c.tags,
        ts: c.ts,
        pinned: c.pinned,
        degree: deg.get(c.id) ?? 0,
        cluster: clusterIdOf.get(c.id) ?? null,
        text: c.text.length > 160 ? `${c.text.slice(0, 160)}…` : c.text,
      })),
      edges,
      clusters: clusterList,
      semantic: vecs.length >= 6,
    };
  }

  /** 从分区成员里提炼一个短标签：优先高频英文标识，其次不重叠的中文双字词 */
  #clusterLabel(ids, byId) {
    const tagCount = new Map();
    const asciiCount = new Map();
    const bigramCount = new Map();
    const stop = new Set(['这个', '那个', '我们', '可以', '不是', '就是', '然后', '因为', '所以', '已经', '现在', '需要', '没有', '一个', '什么', '怎么', '如果', '但是', '而且', '还是', '之后', '之前', '时候', '这样', '那样', '两个', '一下', '一些']);
    for (const id of ids) {
      const card = byId.get(id);
      if (!card) continue;
      for (const tg of card.tags) tagCount.set(tg, (tagCount.get(tg) ?? 0) + 1);
      const ascii = card.text.match(/[A-Za-z][A-Za-z0-9_-]{2,}/g) ?? [];
      for (const w of ascii) asciiCount.set(w.toLowerCase(), (asciiCount.get(w.toLowerCase()) ?? 0) + 1);
      const cjk = card.text.match(/[\u4e00-\u9fa5]{2,}/g) ?? [];
      for (const run of cjk) {
        for (let i = 0; i + 1 < run.length; i++) {
          const bg = run.slice(i, i + 2);
          if (stop.has(bg)) continue;
          bigramCount.set(bg, (bigramCount.get(bg) ?? 0) + 1);
        }
      }
    }
    const topTag = [...tagCount.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topTag && topTag[1] >= 2) return topTag[0];
    const ascii = [...asciiCount.entries()].filter((e) => e[1] >= 2).sort((a, b) => b[1] - a[1]).slice(0, 2).map((e) => e[0]);
    if (ascii.length) return ascii.join(' · ');
    const bigrams = [...bigramCount.entries()].sort((a, b) => b[1] - a[1]);
    if (bigrams.length) {
      const first = bigrams[0][0];
      const second = bigrams.slice(1).find((e) => !e[0].split('').some((ch) => first.includes(ch)))?.[0];
      return second ? `${first} · ${second}` : first;
    }
    const sample = byId.get(ids[0]);
    return sample ? sample.text.replace(/[`*#>\n]/g, ' ').trim().slice(0, 8) : '未分类';
  }
  close() { try { this.#db.close(); } catch { } }
}

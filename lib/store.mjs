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

  close() { try { this.#db.close(); } catch { } }
}

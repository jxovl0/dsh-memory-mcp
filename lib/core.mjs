// dsh-memory 核心：markdown 卡片为真相源，SQLite 做 FTS5 + 可选向量索引
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const HOME = process.env.DSH_MEMORY_HOME
  || (process.env.DSH_HOME ? join(process.env.DSH_HOME, 'memory-cards') : join(homedir(), '.dsh-memory'));
export const CARDS = join(HOME, 'cards');
export const DB_PATH = join(HOME, 'memory.db');
export const MODEL = process.env.DSH_MEMORY_MODEL || 'Xenova/bge-small-zh-v1.5';
const HALF_LIFE_DAYS = Number(process.env.DSH_MEMORY_HALF_LIFE ?? 180);
const EMBED_DTYPE = process.env.DSH_MEMORY_DTYPE || 'q8';
// 向量模型加载/推理的超时（毫秒）。HuggingFace 在国内常常"连上但不给数据"，
// 没有超时就会永久 await，把每轮对话的 pre-step 卡死。默认 4 秒，可用环境变量覆盖。
const EMBED_TIMEOUT_MS = Number(process.env.DSH_MEMORY_EMBED_TIMEOUT_MS || 4000);
// 默认"离线优先"：本地没有模型缓存就直接走关键词检索，不在对话路径上等网络。
// 需要首次联网下载模型时，设 DSH_MEMORY_FETCH_MODEL=1（建议单独跑一次下载，别在主流程里）。
const FETCH_REMOTE_MODEL = process.env.DSH_MEMORY_FETCH_MODEL === '1';
const HF_CACHE = join(HOME, '.hf-cache', '');

function hasLocalModelCache() {
  // 目录存在不代表模型在（transformers 会建空壳），必须有 .onnx 权重才算可用
  try {
    const stack = [HF_CACHE];
    let guard = 0;
    while (stack.length && guard++ < 2000) {
      const dir = stack.pop();
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) stack.push(join(dir, e.name));
        else if (/\.onnx$/i.test(e.name)) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/** 给 Promise 套一层超时；超时后 reject，调用方按"不可用"降级处理 */
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}超时 ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

mkdirSync(CARDS, { recursive: true });

// ---------- 可选：本地 embedding ----------
let _embedder = null;
let _embedTried = false;

async function tryEmbedder() {
  if (_embedTried) return _embedder;
  _embedTried = true;
  try {
    if (!FETCH_REMOTE_MODEL && !hasLocalModelCache()) {
      process.stderr.write('[dsh-memory] 本地无向量模型缓存（设 DSH_MEMORY_FETCH_MODEL=1 可联网下载）；仅关键词模式\n');
      _embedder = null;
      return _embedder;
    }
    const mod = await import('@huggingface/transformers');
    mod.env.cacheDir = HF_CACHE;
    if (FETCH_REMOTE_MODEL) {
      // 显式要求联网下载时才允许远程
      mod.env.allowLocalModels = false;
    } else {
      // 默认只读本地缓存：transformers 即使模型已缓存，也默认会去 hub 校验文件列表，
      // 那条请求在国内经常挂住，所以必须把远程彻底关掉。
      mod.env.allowRemoteModels = false;
      mod.env.allowLocalModels = true;
      mod.env.localModelPath = HF_CACHE;
    }
    const loading = mod.pipeline('feature-extraction', MODEL, { dtype: EMBED_DTYPE });
    // 超时后底层下载可能还在跑，吞掉迟到的 rejection，避免 unhandledRejection 把进程搞挂
    loading.catch(() => {});
    _embedder = await withTimeout(loading, EMBED_TIMEOUT_MS, '向量模型加载');
  } catch (e) {
    process.stderr.write(`[dsh-memory] 未启用向量检索（${String(e?.message ?? e).slice(0, 120)}）；仅关键词模式\n`);
    _embedder = null;
  }
  return _embedder;
}

export async function hasEmbeddings() {
  return Boolean(await tryEmbedder());
}

export async function embed(texts) {
  const ext = await tryEmbedder();
  if (!ext) return null;
  try {
    const infer = Promise.resolve().then(() => ext(texts, { pooling: 'mean', normalize: true }));
    const out = await withTimeout(infer, Math.max(EMBED_TIMEOUT_MS * 2, 5000), '向量推理');
    const dim = out.dims[1];
    const rows = [];
    for (let i = 0; i < out.dims[0]; i++) rows.push(Array.from(out.data.slice(i * dim, (i + 1) * dim)));
    return { dim, rows };
  } catch (e) {
    // 推理失败就本次降级为关键词检索，不阻塞对话
    process.stderr.write(`[dsh-memory] 向量推理失败（${String(e?.message ?? e).slice(0, 120)}）；本次仅关键词模式\n`);
    _embedder = null;
    return null;
  }
}

const f32 = (arr) => Buffer.from(new Float32Array(arr).buffer);
export const newId = (text) => createHash('sha1').update(text).digest('hex').slice(0, 12);
const decay = (ts) => Math.exp(-Math.LN2 * Math.max((Date.now() - new Date(ts).getTime()) / 86400e3, 0) / HALF_LIFE_DAYS);
const cosine = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
export const cardPath = (id) => join(CARDS, `${id}.md`);

export function db() {
  const d = new DatabaseSync(DB_PATH);
  d.exec(`
    CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, type TEXT, tags TEXT, ts TEXT, source TEXT, text TEXT, file TEXT);
    CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(text, id UNINDEXED, tokenize='trigram');
    CREATE TABLE IF NOT EXISTS vecs (id TEXT PRIMARY KEY, dim INTEGER, vec BLOB);
  `);
  return d;
}

const splitSentences = (s) => s.split(/[；;。]/).map((x) => x.trim()).filter((x) => x.length >= 10);

function inferType(section, text) {
  const s = section + ' ' + text;
  if (/坑|失败|错误|教训|挂了|不通|超时/.test(s)) return 'pitfall';
  if (/决定|结论|判断|选择了/.test(s)) return 'decision';
  if (/偏好|要求|不能|不要|必须/.test(s)) return 'preference';
  return 'fact';
}

/** 把日记 markdown 解析成句子级卡片 */
export function parseDiary(path) {
  const raw = readFileSync(path, 'utf8');
  const dateMatch = path.match(/(\d{4}-\d{2}-\d{2})/);
  const day = dateMatch ? dateMatch[1] : new Date().toISOString().slice(0, 10);
  const out = [];
  let section = '';
  for (const line of raw.split('\n')) {
    const h = line.match(/^##+\s+(.*)$/);
    if (h) { section = h[1].trim(); continue; }
    const m = line.match(/^[-*]\s+(.+)$/);
    if (!m) continue;
    let text = m[1].trim();
    if (text.length < 8) continue;
    let ts = `${day}T00:00:00+08:00`;
    const tm = text.match(/^(\d{2}):(\d{2})\s+(.*)$/);
    if (tm) { ts = `${day}T${tm[1]}:${tm[2]}:00+08:00`; text = tm[3]; }
    for (const piece of splitSentences(text)) out.push({ type: inferType(section, piece), text: piece, ts, source: `日记/${path.split(/[\\/]/).pop()}` });
  }
  return out;
}

export function writeCard(card) {
  const md = ['---', `id: ${card.id}`, `type: ${card.type}`, `tags: [${(card.tags ?? []).join(', ')}]`, `ts: ${card.ts}`, `source: ${card.source ?? ''}`, '---', card.text, ''].join('\n');
  writeFileSync(cardPath(card.id), md, 'utf8');
  return card.id;
}

export function readCards() {
  if (!existsSync(CARDS)) return [];
  return readdirSync(CARDS).filter((f) => f.endsWith('.md')).map((f) => {
    const raw = readFileSync(join(CARDS, f), 'utf8');
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) return null;
    const meta = {};
    for (const line of m[1].split('\n')) { const kv = line.match(/^(\w+):\s*(.*)$/); if (kv) meta[kv[1]] = kv[2]; }
    return { id: meta.id ?? f.replace('.md', ''), type: meta.type ?? 'fact', tags: (meta.tags ?? '').replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean), ts: meta.ts ?? new Date().toISOString(), source: meta.source ?? '', text: m[2].trim() };
  }).filter(Boolean);
}

export async function indexAll(cards = readCards()) {
  const d = db();
  d.exec('DELETE FROM cards; DELETE FROM cards_fts; DELETE FROM vecs;');
  if (!cards.length) { d.close(); return 0; }
  const a = d.prepare('INSERT OR REPLACE INTO cards(id,type,tags,ts,source,text,file) VALUES (?,?,?,?,?,?,?)');
  const b = d.prepare('INSERT INTO cards_fts(text,id) VALUES (?,?)');
  const emb = await embed(cards.map((c) => c.text));
  const c = emb ? d.prepare('INSERT OR REPLACE INTO vecs(id,dim,vec) VALUES (?,?,?)') : null;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    a.run(card.id, card.type, (card.tags ?? []).join(','), card.ts, card.source ?? '', card.text, cardPath(card.id));
    b.run(card.text, card.id);
    if (c) c.run(card.id, emb.dim, f32(emb.rows[i]));
  }
  d.close();
  return cards.length;
}

export async function importDir(dir) {
  const files = statSync(dir).isDirectory() ? readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => join(dir, f)) : [dir];
  const added = [];
  for (const f of files) {
    for (const card of parseDiary(f)) {
      card.id = newId(card.text);
      writeCard(card);
      added.push(card);
    }
  }
  const n = await indexAll(readCards());
  return { added: added.length, total: n };
}

export async function addCard({ text, type = 'fact', tags = [], ts, source = '手动' }) {
  const card = { id: newId(text), type, tags, ts: ts ?? new Date().toISOString(), source, text };
  writeCard(card);
  const n = await indexAll(readCards());
  return { id: card.id, total: n };
}

export async function search(query, k = 5, tag = null) {
  const d = db();
  const cards = d.prepare('SELECT * FROM cards').all();
  if (!cards.length) { d.close(); return []; }
  let pool = cards;
  if (tag) pool = cards.filter((c) => (c.tags ?? '').includes(tag));
  if (!pool.length) { d.close(); return []; }
  const byId = new Map(pool.map((c) => [c.id, c]));

  const emb = await embed([query]);
  const simRank = new Map();
  let simMap = new Map();
  if (emb) {
    const qv = emb.rows[0];
    const scored = [];
    for (const row of d.prepare('SELECT id, vec FROM vecs').all()) {
      if (!byId.has(row.id)) continue;
      const arr = Array.from(new Float32Array(row.vec.buffer, row.vec.byteOffset, row.vec.byteLength / 4));
      scored.push({ id: row.id, sim: cosine(qv, arr) });
    }
    scored.sort((a, b) => b.sim - a.sim);
    scored.slice(0, 50).forEach((s, i) => simRank.set(s.id, i));
    simMap = new Map(scored.map((s) => [s.id, s.sim]));
  }

  const kwIds = pool.filter((c) => c.text.includes(query)).slice(0, 30).map((c) => c.id);
  const kwRank = new Map(kwIds.map((id, i) => [id, i]));

  const results = [...new Set([...simRank.keys(), ...kwRank.keys(), ...(kwIds.length ? [] : [])])].map((id) => {
    const card = byId.get(id);
    const sim = simMap.get(id) ?? 0;
    const kw = kwRank.has(id) ? 1 / (1 + kwRank.get(id)) : 0;
    const literal = query.length >= 2 && card.text.includes(query) ? 1 : 0;
    const base = 0.65 * Math.max(sim, 0) + 0.25 * kw + 0.10 * literal;
    return { card, score: base * (0.6 + 0.4 * decay(card.ts)) };
  }).sort((a, b) => b.score - a.score).slice(0, k);

  if (!results.length) {
    // 关键词模式下的兜底：返回最新的卡片
    for (const c of pool.slice(0, k)) results.push({ card: c, score: 0 });
  }
  d.close();
  return results;
}

export function stats() {
  const d = db();
  const n = d.prepare('SELECT COUNT(*) AS n FROM cards').get().n;
  const by = d.prepare('SELECT type, COUNT(*) AS n FROM cards GROUP BY type').all();
  d.close();
  return { total: n, byType: by };
}

/** 合并语义重复的卡片（同类型，余弦 >= 阈值） */
export async function consolidate(threshold = 0.9) {
  const d = db();
  const rows = d.prepare('SELECT c.id, c.type, c.tags, c.ts, c.source, c.text, v.vec FROM cards c JOIN vecs v ON v.id = c.id').all();
  d.close();
  if (rows.length < 2) return { merged: 0, remaining: rows.length };
  const vecOf = new Map(rows.map((r) => [r.id, Array.from(new Float32Array(r.vec.buffer, r.vec.byteOffset, r.vec.byteLength / 4))]));
  const parent = new Map(rows.map((r) => [r.id, r.id]));
  const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[i].type !== rows[j].type) continue;
      if (cosine(vecOf.get(rows[i].id), vecOf.get(rows[j].id)) >= threshold) union(rows[i].id, rows[j].id);
    }
  }
  const groups = new Map();
  for (const r of rows) { const root = find(r.id); if (!groups.has(root)) groups.set(root, []); groups.get(root).push(r); }
  mkdirSync(join(CARDS, 'archive'), { recursive: true });
  let merged = 0, removed = 0;
  for (const [, list] of groups) {
    if (list.length < 2) continue;
    list.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    const text = [...new Set(list.map((r) => r.text.trim()))].join('；');
    writeCard({
      id: newId(text), type: list[0].type,
      tags: [...new Set(list.flatMap((r) => (r.tags ?? '').split(',').map((s) => s.trim()).filter(Boolean)))],
      ts: list[0].ts,
      source: [...new Set(list.map((r) => r.source).filter(Boolean))].join(' / '),
      text,
    });
    merged++;
    for (const r of list) {
      const f = cardPath(r.id);
      if (existsSync(f)) {
        writeFileSync(join(CARDS, 'archive', `${r.id}.md`), readFileSync(f, 'utf8'), 'utf8');
        unlinkSync(f);
        removed++;
      }
    }
  }
  const n = await indexAll(readCards());
  return { merged, archived: removed, remaining: n };
}

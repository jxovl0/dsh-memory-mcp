// dsh-memory-mcp：DSH 原生记忆插件的 cordis 层
// 记忆本体是可读的 markdown 卡片（<path>/cards/*.md），SQLite 只存可重建的索引。
import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { createUserMessage, boundContextSummary } from '@deepseek-ai/dsh-llm';
import { CardStore } from './store.mjs';
import { MemoryRemoteService } from './remote.mjs';

export const name = 'dsh-memory-mcp';

/** 需要的能力由宿主注入 */
export const inject = ['tools', 'systemPrompt'];

export const Config = z.object({
  path: z.string().description('记忆目录（markdown 卡片 + index.db）'),
  promptRecentCount: z.number().default(4).description('系统提示里常驻的最近记忆条数'),
  promptMaxChars: z.number().default(900).description('系统提示注入的字符上限'),
  injectEnabled: z.boolean().default(true).description('每轮按当前消息检索并注入相关记忆'),
  injectCount: z.number().default(3).description('每轮注入的相关记忆条数上限'),
  injectMinScore: z.number().default(0.30).description('有字面重合时的最低分数'),
  injectSemanticMinScore: z.number().default(0.45).description('纯语义匹配（无字面重合）时的最低分数，更严'),
  injectRelRatio: z.number().default(0.85).description('只保留相对最高分不低于该比例的条目'),
  injectMinQueryChars: z.number().default(4).description('查询短于该长度时不做相关注入'),
  injectMaxChars: z.number().default(800).description('每轮注入的字符上限'),
  maxTextChars: z.number().default(2000).description('单条记忆字符上限'),
  searchLimitDefault: z.number().default(8).description('检索默认条数'),
  searchLimitMax: z.number().default(30).description('检索条数上限'),
  rejectSecrets: z.boolean().default(true).description('拒绝写入疑似密钥/凭据'),
  promptOrder: z.number().default(50).description('提示词段排序'),
});

const WRITE_DESC = '写入一条长期记忆。适合：用户偏好、已定决策、踩过的坑/教训、关键路径。不适合：临时任务状态（用 todo）、密钥、代码里已写明的常识。记忆会存成可读的 markdown 卡片。';
const SEARCH_DESC = '检索长期记忆（语义 + 关键词混合，旧的记忆会降权）。回答“上次/之前/为什么当初”这类问题前先查一次。';
const LIST_DESC = '按时间倒序列出最近的记忆卡片。';
const FORGET_DESC = '删除一条已经过时或错误的记忆（需要 id）。';

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /npm_[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /Bearer\s+[A-Za-z0-9._-]{20,}/,
];

const looksLikeSecret = (text) => SECRET_PATTERNS.some((re) => re.test(text));
const truncate = (s, n) => (s.length <= n ? s : `${s.slice(0, n)}…`);
const promptLine = (c) => `- [${c.type}${c.pinned ? ' · 置顶' : ''}] ${truncate(c.text, 200)}`;

function renderPrompt(records, maxChars) {
  if (!records.length) return '';
  const out = ['## 长期记忆（dsh-memory-mcp）', '下面是之前会话沉淀的事实，可直接使用；需要更多细节用 memory_search 检索。'];
  let used = out.join('\n').length;
  for (const r of records) {
    const l = promptLine(r);
    if (used + l.length > maxChars) break;
    out.push(l);
    used += l.length;
  }
  return out.join('\n');
}

function renderRelevant(results, maxChars) {
  if (!results.length) return '';
  const lines = results.map((r) => `- [${r.card.type}] ${truncate(r.card.text, 220)}`);
  const head = `相关记忆（按当前对话自动检索 ${results.length} 条）：`;
  const tail = '需要细节用 memory_search；过时用 memory_forget。';
  let text = `${head}\n${lines.join('\n')}\n${tail}`;
  if (text.length > maxChars) text = `${text.slice(0, maxChars)}…`;
  return text;
}

/**
 * 判断查询和记忆文本是否有「字面重合」：
 * - 英文/数字 token 长度 >= 3 直接比
 * - 中文取相邻双字（bigram），命中 >= 1 个即算（过滤常见虚词组合）
 * 有字面重合才允许按较低门槛注入；纯语义匹配要求更高分，避免模糊查询把整库翻出来。
 */
const CJK_STOP_BIGRAMS = new Set(['这样', '会不', '不会', '是不', '不是', '可以', '我们', '你们', '这个', '那个', '什么', '怎么', '为什', '么会', '的话', '就是', '还是', '然后', '而且', '但是', '因为', '所以', '如果', '已经', '现在', '一下', '一些', '有点', '有点']);

function hasLexicalOverlap(query, text) {
  const ascii = query.match(/[A-Za-z0-9_.]{3,}/g) ?? [];
  const lowerText = text.toLowerCase();
  for (const token of ascii) {
    if (lowerText.includes(token.toLowerCase())) return true;
  }
  const cjk = query.match(/[\u4e00-\u9fa5]+/g) ?? [];
  for (const run of cjk) {
    for (let i = 0; i + 1 < run.length; i++) {
      const bigram = run.slice(i, i + 2);
      if (CJK_STOP_BIGRAMS.has(bigram)) continue;
      if (text.includes(bigram)) return true;
    }
  }
  return false;
}

/** 从对话消息里拼出用于检索的查询串 */
function queryFromMessages(messages) {
  const parts = [];
  for (const msg of messages ?? []) {
    const content = msg?.data?.content ?? msg?.content;
    if (typeof content === 'string') parts.push(content);
    else if (Array.isArray(content)) parts.push(content.map((b) => (typeof b?.text === 'string' ? b.text : '')).join('\n'));
  }
  return parts.join('\n').slice(0, 600).trim();
}

export function apply(ctx, config) {
  process.stderr.write(`[dsh-memory-mcp] 已加载，记忆目录：${config.path}\n`);
  let store;
  ctx.effect(() => {
    store = new CardStore(config.path);
    return () => { store?.close(); store = undefined; };
  });

  const open = () => {
    if (!store) throw new Error('dsh-memory-mcp: store 未打开');
    return store;
  };

  // 设置页背后的 host 服务（client 通过 memory/<method> 调用）
  ctx.plugin(MemoryRemoteService, { store: open(), pluginConfig: config });

  ctx.systemPrompt.section({
    name: 'memory:recall',
    order: config.promptOrder,
    text: () => {
      try {
        open().syncFromDisk();
        return renderPrompt(open().forPrompt(config.promptRecentCount), config.promptMaxChars);
      } catch {
        return '';
      }
    },
  });

  // 每轮按当前消息检索相关记忆并注入（与常驻段互补）
  if (config.injectEnabled && config.injectCount > 0) {
    let lastKey = '';
    ctx.on('agent/pre-step', async (payload, next) => {
      const decision = await next();
      if (decision.kind !== 'enter') return decision;
      const query = queryFromMessages(payload.messages);
      if (query.length < config.injectMinQueryChars) return decision;
      let results;
      try {
        results = await open().search(query, Math.max(config.injectCount * 3, 12));
      } catch {
        return decision;
      }
      const top = results[0]?.score ?? 0;
      if (top <= 0) return decision;
      const grounded = results.filter((r) => hasLexicalOverlap(query, r.card.text));
      const candidates = grounded.length ? grounded : results;
      const floor = grounded.length
        ? Math.max(config.injectMinScore, top * config.injectRelRatio)
        : Math.max(config.injectSemanticMinScore, top * config.injectRelRatio);
      const picked = candidates.filter((r) => r.score >= floor).slice(0, config.injectCount);
      if (!picked.length) return decision;
      const key = picked.map((r) => r.card.id).sort().join(',');
      if (key === lastKey) return decision;
      lastKey = key;
      const text = renderRelevant(picked, config.injectMaxChars);
      if (!text) return decision;
      const memMessage = createUserMessage({
        content: [{ type: 'text', text }],
        source: {
          // DSH v4 会话格式禁止 source.kind === 'plugin'，必须是生产者自有形态 plugin:<name>
          kind: 'plugin:memory',
          form: 'notice',
          summary: boundContextSummary(`相关记忆 ${picked.length} 条`),
        },
      });
      return { ...decision, messages: [...decision.messages, memMessage] };
    });
  }

  ctx.tools.register(defineTool({
    name: 'memory_write',
    description: WRITE_DESC,
    parameters: {
      text: { type: 'string', required: true, description: '一条自包含的记忆内容' },
      type: { type: 'string', description: '类型：preference / decision / pitfall / fact（默认 fact）' },
      tags: { type: 'array', items: { type: 'string' }, description: '可选标签，便于过滤' },
      pinned: { type: 'boolean', description: '置顶：每个会话都会注入，留给最重要的规则' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { id: { type: 'string', required: true }, file: { type: 'string', required: true } },
      },
      render: (_args, value) => [{ type: 'text', text: `已记住 ${value.id}（${value.file}）` }],
    },
    async execute(args) {
      const text = (args.text ?? '').trim();
      if (!text) throw new Error('memory_write: text 不能为空');
      if (text.length > config.maxTextChars) throw new Error(`memory_write: 内容 ${text.length} 字，超过 ${config.maxTextChars} 上限`);
      if (config.rejectSecrets && looksLikeSecret(text)) throw new Error('memory_write: 内容看起来包含密钥/凭据，已拒绝写入');
      const card = open().write({ text, type: args.type ?? 'fact', tags: args.tags ?? [], pinned: args.pinned ?? false });
      return { id: card.id, file: open().cardFile(card.id) };
    },
  }));

  ctx.tools.register(defineTool({
    name: 'memory_search',
    description: SEARCH_DESC,
    parameters: {
      query: { type: 'string', required: true, description: '查询内容' },
      limit: { type: 'number', description: `返回条数，默认 ${config.searchLimitDefault}，最大 ${config.searchLimitMax}` },
      tag: { type: 'string', description: '只搜带该标签的记忆' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          matches: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                score: { type: 'number', required: true },
                type: { type: 'string', required: true },
                ts: { type: 'string', required: true },
                text: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.matches.length
          ? value.matches.map((m) => `[${m.score.toFixed(3)}] ${m.ts.slice(0, 10)} · ${m.type}\n${m.text}`).join('\n\n')
          : '没有匹配的记忆。',
      }],
    },
    async execute(args) {
      const limit = Math.min(args.limit ?? config.searchLimitDefault, config.searchLimitMax);
      let res = await open().search(args.query, limit);
      if (args.tag) res = res.filter((r) => r.card.tags.includes(args.tag));
      return {
        matches: res.map((r) => ({ id: r.card.id, score: Number(r.score.toFixed(4)), type: r.card.type, ts: r.card.ts, text: r.card.text })),
      };
    },
  }));

  ctx.tools.register(defineTool({
    name: 'memory_list',
    description: LIST_DESC,
    parameters: { limit: { type: 'number', description: '条数，默认 20' } },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          items: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                ts: { type: 'string', required: true },
                type: { type: 'string', required: true },
                pinned: { type: 'boolean', required: true },
                text: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.items.map((i) => `${i.ts.slice(0, 16)} · ${i.type}${i.pinned ? ' · 📌' : ''} · ${i.id}\n  ${i.text.slice(0, 160)}`).join('\n') || '记忆库是空的' }],
    },
    async execute(args) {
      return { items: open().list(args.limit ?? 20) };
    },
  }));

  ctx.tools.register(defineTool({
    name: 'memory_forget',
    description: FORGET_DESC,
    parameters: { id: { type: 'string', required: true, description: '要删除的记忆 id' } },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { id: { type: 'string', required: true }, forgotten: { type: 'boolean', required: true } },
      },
      render: (_args, value) => [{ type: 'text', text: value.forgotten ? `已删除 ${value.id}` : `没有找到 ${value.id}` }],
    },
    async execute(args) {
      return { id: args.id, forgotten: open().forget(args.id) };
    },
  }));

}

#!/usr/bin/env node
// dsh-memory MCP server（stdio）：把记忆库暴露成 memory_search / memory_add / memory_stats
import { search, addCard, stats, hasEmbeddings, HOME } from './lib/core.mjs';

const TOOLS = [
  {
    name: 'memory_search',
    description: '检索本地长期记忆（日记、偏好、决定、踩过的坑）。回答"上次/之前/为什么当初"这类问题前先用它。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '查询内容' },
        k: { type: 'number', description: '返回条数，默认 5' },
        tag: { type: 'string', description: '按标签过滤（可选）' },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_add',
    description: '写入一条长期记忆卡片。重要结论、用户偏好、踩坑教训都值得记。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '记忆内容，一句话' },
        type: { type: 'string', enum: ['preference', 'decision', 'pitfall', 'fact'], description: '类型' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签' },
      },
      required: ['text'],
    },
  },
  { name: 'memory_stats', description: '查看记忆库统计（卡片数、类型分布、存储路径、是否启用向量检索）', inputSchema: { type: 'object', properties: {} } },
];

const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
const fmt = (res) => res.map((m) => `[${m.score.toFixed(3)}] ${m.card.ts.slice(0, 10)} · ${m.card.type}${m.card.tags ? ' · ' + m.card.tags : ''}\n${m.card.text}${m.card.source ? `\n  出处：${m.card.source}` : ''}`).join('\n\n');

async function handle(msg) {
  const { id, method, params } = msg;
  const reply = (result) => send({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

  if (method === 'initialize') {
    return reply({
      protocolVersion: params?.protocolVersion ?? '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'dsh-memory', version: '0.1.0' },
    });
  }
  if (method === 'notifications/initialized' || method === 'initialized') return;
  if (method === 'ping') return reply({});
  if (method === 'tools/list') return reply({ tools: TOOLS });

  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments ?? {};
    try {
      let text;
      if (name === 'memory_search') text = fmt(await search(args.query, args.k ?? 5, args.tag ?? null)) || '没有找到相关记忆';
      else if (name === 'memory_add') { const r = await addCard({ text: args.text, type: args.type ?? 'fact', tags: args.tags ?? [] }); text = `已写入 ${r.id}，共 ${r.total} 条`; }
      else if (name === 'memory_stats') {
        const s = stats();
        const vec = await hasEmbeddings();
        text = `卡片 ${s.total} 条\n` + s.byType.map((r) => `  ${r.type}: ${r.n}`).join('\n') + `\n存储：${HOME}\n向量检索：${vec ? '已启用' : '未启用（仅关键词）'}`;
      } else return fail(-32602, `unknown tool: ${name}`);
      return reply({ content: [{ type: 'text', text }] });
    } catch (e) {
      return reply({ content: [{ type: 'text', text: `工具执行失败: ${e.message}` }], isError: true });
    }
  }
  if (id !== undefined) return fail(-32601, `method not found: ${method}`);
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    handle(msg).catch((e) => send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: e.message } }));
  }
});

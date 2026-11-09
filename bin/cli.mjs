#!/usr/bin/env node
// dsh-memory CLI：setup / search / add / import / reindex / consolidate / stats
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { search, addCard, importDir, indexAll, readCards, stats, consolidate, hasEmbeddings, HOME } from '../lib/core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, '..');
const MCP_SERVER = join(PKG_ROOT, 'mcp-server.mjs');

const [, , cmd, ...rest] = process.argv;

function findDshHome() {
  if (process.env.DSH_HOME) return process.env.DSH_HOME;
  const candidates = [join(homedir(), '.dsh'), 'D:\\Deepseek\\.dsh'];
  for (const c of candidates) if (existsSync(c)) return c;
  return candidates[0];
}

function findProfile(home, name) {
  if (name) return join(home, 'profiles', name);
  const base = join(home, 'profiles');
  if (!existsSync(base)) return null;
  // 优先 desktop，其次第一个
  const dirs = readdirSync(base);
  if (dirs.includes('desktop')) return join(base, 'desktop');
  return dirs.length ? join(base, dirs[0]) : null;
}

async function setup() {
  const profileName = rest[0] ?? process.env.DSH_PROFILE ?? null;
  const home = findDshHome();
  const profile = findProfile(home, profileName);
  if (!profile || !existsSync(profile)) {
    console.error(`找不到 profile（DSH_HOME=${home}）。用法：dsh-memory setup [profile名]`);
    process.exit(1);
  }
  const patch = join(profile, 'cordis.patch.yml');
  const nodeExe = process.execPath;
  const block = `
# dsh-memory：本地长期记忆（MCP stdio）
- insert:
    - id: mcp-memory
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: memory
        transport: stdio
        command: '${nodeExe.replace(/\\/g, '\\\\')}'
        args: ['${MCP_SERVER.replace(/\\/g, '\\\\')}']
        env:
          DSH_MEMORY_HOME: '${HOME.replace(/\\/g, '\\\\')}'
        toolCallTimeoutMs: 120000
        failOnStartupError: false
`;
  if (!existsSync(patch)) {
    mkdirSync(profile, { recursive: true });
    writeFileSync(patch, block.trimStart(), 'utf8');
    console.log(`已创建 ${patch}`);
  } else {
    const text = readFileSync(patch, 'utf8');
    if (text.includes('mcp-memory')) {
      console.log(`已经配置过（${patch} 里已有 mcp-memory），无需重复。`);
    } else {
      writeFileSync(patch, text.trimEnd() + '\n' + block, 'utf8');
      console.log(`已追加到 ${patch}`);
    }
  }
  console.log(`
下一步：
  1. 重启 DSH（bundle/patch 变更需要重启）
  2. 重启后模型会多出三个工具：mcp__memory__memory_search / memory_add / memory_stats
  3. 首次写入时若装了 @huggingface/transformers 会自动下载向量模型（约 23MB）

记忆数据目录：${HOME}
（可用环境变量 DSH_MEMORY_HOME 覆盖）`);
}

async function main() {
  if (cmd === 'setup') return setup();

  if (cmd === 'search') {
    const tagIdx = rest.indexOf('--tag');
    const tag = tagIdx >= 0 ? rest[tagIdx + 1] : null;
    const args = rest.filter((x, i) => !x.startsWith('--') && !(tagIdx >= 0 && i === tagIdx + 1));
    if (!args[0]) return console.log('用法：dsh-memory search "查询" [条数] [--tag 标签]');
    const res = await search(args[0], Number(args[1] ?? 5), tag);
    if (!res.length) return console.log('没有找到相关记忆');
    for (const m of res) {
      console.log(`[${m.score.toFixed(3)}] ${m.card.ts.slice(0, 10)} · ${m.card.type}${m.card.tags ? ' · ' + m.card.tags : ''}`);
      console.log(`  ${m.card.text}`);
      if (m.card.source) console.log(`  出处：${m.card.source}`);
      console.log('');
    }
    return;
  }

  if (cmd === 'add') {
    const get = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
    const text = get('--text');
    if (!text) return console.log('用法：dsh-memory add --type preference --tags a,b --text "..."');
    const r = await addCard({ text, type: get('--type') ?? 'fact', tags: (get('--tags') ?? '').split(',').map((s) => s.trim()).filter(Boolean) });
    console.log(`已写入 ${r.id}，共 ${r.total} 条`);
    return;
  }

  if (cmd === 'import') {
    if (!rest[0]) return console.log('用法：dsh-memory import <日记目录|md文件>');
    const r = await importDir(rest[0]);
    console.log(`导入 ${r.added} 条，索引 ${r.total} 条`);
    return;
  }

  if (cmd === 'reindex') { const n = await indexAll(readCards()); console.log(`重建索引：${n} 条`); return; }

  if (cmd === 'consolidate') {
    const r = await consolidate(Number(rest[0] ?? 0.9));
    console.log(`合并 ${r.merged} 组，归档 ${r.archived} 张，剩余 ${r.remaining} 条`);
    return;
  }

  if (cmd === 'stats') {
    const s = stats();
    const vec = await hasEmbeddings();
    console.log(`卡片 ${s.total} 条`);
    for (const r of s.byType) console.log(`  ${r.type}: ${r.n}`);
    console.log(`存储：${HOME}`);
    console.log(`向量检索：${vec ? '已启用' : '未启用（仅关键词）'}`);
    return;
  }

  console.log(`dsh-memory 用法：
  dsh-memory setup [profile]        把 MCP 配置写进 DSH profile（重启 DSH 生效）
  dsh-memory search "查询" [n] [--tag t]
  dsh-memory add --type preference --tags a,b --text "..."
  dsh-memory import <日记目录>
  dsh-memory reindex | consolidate [阈值] | stats`);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });

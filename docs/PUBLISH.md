# 发布清单：GitHub + npm + DSH 插件市场

当前包：**dsh-memory-mcp 0.3.0**（bundle 插件，`dsh plugin add` 一条命令安装）

## 1. GitHub

```bash
cd D:\Deepseek\dshwork\dsh-memory
git init
git add -A
git commit -m "feat: dsh-memory-mcp 0.3.0 — markdown 记忆 + 自动注入 + 本地向量检索"
git branch -M main
git remote add origin https://github.com/<你的账号>/dsh-memory-mcp.git
git push -u origin main
git tag v0.3.0 && git push --tags
```

发布前检查：

- [ ] `.gitignore` 已排除 `node_modules/`、`*.db`、`.hf-cache/`、`cards/`
- [ ] README 里的包名/命令与实际一致（`dsh-memory-mcp`）
- [ ] LICENSE（MIT）在
- [ ] 版本号与 tag 一致

## 2. npm

```bash
npm login
npm publish --access public
```

包体积约 15 KB（无必装依赖，`@huggingface/transformers` 由用户按需另装）。

发布后自测：

```bash
npm i -g dsh-memory-mcp        # 可选：CLI 用
dsh plugin --profile desktop add dsh-memory-mcp
# 重启 DSH → 工具列表应有 memory_write / memory_search / memory_list / memory_forget / memory_stats
```

## 3. 插件市场（dshopen.org，index.json format 1）

```json
{
  "name": "dsh-memory-mcp",
  "title": { "en": "Markdown Memory", "zh": "Markdown 长期记忆" },
  "author": "<你的 GitHub 名>",
  "repository": { "url": "https://github.com/<账号>/dsh-memory-mcp" },
  "homepage": "https://github.com/<账号>/dsh-memory-mcp#readme",
  "metadata": {
    "category": "integrations",
    "keywords": ["dsh-plugin", "deepseek-harness", "memory", "markdown", "mcp"],
    "labels": ["new"]
  },
  "versions": [
    {
      "version": "0.3.0",
      "publishTimestamp": 1794220000,
      "source": { "type": "npm", "registry": "https://registry.npmjs.org/" },
      "engines": { "dsh": "^0.3.0-rc.1" }
    }
  ],
  "description": {
    "en": "Cross-session memory for DSH whose store is human-readable markdown cards: auto-injected context, hybrid keyword+local-embedding search, one-command install.",
    "zh": "以可读 markdown 卡片为存储的 DSH 长期记忆：自动注入上下文、关键词+本地向量混合检索、一条命令安装。"
  }
}
```

## 4. 与竞品的差异（写进市场描述，别硬碰）

| 我们 | 对手 |
|---|---|
| markdown 卡片 = 数据本体 | 数据在 SQLite/JSON 里 |
| 内置中文向量（opt-in 安装） | 多数纯关键词 |
| 句子级卡片 + 时间衰减 | 整条记忆 |
| CLI/MCP 可在 DSH 外用 | 只在 DSH 内 |

## 5. 已知风险（发布前确认）

1. **peerDependencies 必须对齐目标 DSH 版本**，否则安装被拒（本次实测：DSH 0.2.1-rc.2 拒装 0.1.0-rc.6 的 peer 范围）
2. **不要把 `@huggingface/transformers` 写成 optionalDependency**：`onnxruntime-node` 的构建脚本会让 pnpm 退出码 1，插件管理器判定安装失败
3. 用户关掉向量模式时确保静默降级（已实现）
4. `memory-cards/` 是用户数据，不能随包发布；`.gitignore` 已排除

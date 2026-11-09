// 设置页背后的 host 端服务：给 client 提供 list / search / save / remove / pin / preview
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';

/** 手动应用 Remote(name) 标记（无 TS 装饰器） */
function markRemoteMethod(serviceClass, method, exportName = method) {
  const instance = Object.create(serviceClass.prototype);
  const decorate = Remote(exportName);
  decorate(undefined, {
    kind: 'method',
    name: method,
    static: false,
    private: false,
    addInitializer(fn) { fn.call(instance); },
  });
}

const toView = (card) => ({
  id: card.id,
  type: card.type,
  tags: card.tags,
  ts: card.ts,
  pinned: card.pinned,
  text: card.text,
});

const truncate = (s, n) => (s.length <= n ? s : `${s.slice(0, n)}…`);

export class MemoryRemoteService extends TypertRemoteService {
  static inject = [];

  constructor(ctx, config = {}) {
    super(ctx, 'memory');
    if (!config.store) throw new Error('memory remote service requires a store');
    this.store = config.store;
    this.pluginConfig = config.pluginConfig ?? {};
  }

  stats() {
    return { ok: true, total: this.store.count(), dir: this.store.dir };
  }

  list(limit) {
    const n = Math.max(1, Math.min(Number(limit) || 200, 500));
    return { ok: true, entries: this.store.list(n).map(toView) };
  }

  async search(query, limit, tag) {
    const q = String(query ?? '').trim();
    if (!q) return { ok: true, entries: [] };
    let results = await this.store.search(q, Math.max(1, Math.min(Number(limit) || 20, 50)));
    if (tag) results = results.filter((r) => r.card.tags.includes(String(tag)));
    return { ok: true, entries: results.map((r) => ({ ...toView(r.card), score: Number(r.score.toFixed(4)) })) };
  }

  save(id, text, type, tags, pinned) {
    const body = String(text ?? '').trim();
    if (!body) throw new Error('内容不能为空');
    if (this.pluginConfig.rejectSecrets && /sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|npm_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(body)) {
      throw new Error('内容看起来包含密钥/凭据，已拒绝保存');
    }
    const cleanTags = Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : [];
    const card = this.store.write({ text: body, type: type || 'fact', tags: cleanTags, pinned: Boolean(pinned) });
    if (id && id !== card.id) this.store.forget(String(id));
    return { ok: true, entry: toView(card) };
  }

  remove(id) {
    if (!id) throw new Error('id 必填');
    return { ok: true, removed: this.store.forget(String(id)), id: String(id) };
  }

  pin(id, pinned) {
    if (!id) throw new Error('id 必填');
    return { ok: true, pinned: this.store.pin(String(id), Boolean(pinned)), id: String(id) };
  }

  /** 预览当前会注入什么（常驻段 + 给定查询时的相关片段） */
  async preview(query) {
    const q = String(query ?? '').trim();
    const recent = this.store.forPrompt(this.pluginConfig.promptRecentCount ?? 4);
    const lines = recent.map((c) => `- [${c.type}${c.pinned ? ' · 置顶' : ''}] ${truncate(c.text, 200)}`);
    let related = [];
    if (q.length >= 2) {
      try {
        const res = await this.store.search(q, 10);
        related = res.filter((r) => r.score >= (this.pluginConfig.injectMinScore ?? 0.3)).slice(0, this.pluginConfig.injectCount ?? 3);
      } catch { /* 预览失败不影响 */ }
    }
    return {
      ok: true,
      pinnedText: lines.length ? ['## 常驻记忆（每轮注入）', ...lines].join('\n') : '（无常驻记忆）',
      relatedText: related.length
        ? ['## 相关记忆（本轮检索）', ...related.map((r) => `- [${r.card.type}] ${truncate(r.card.text, 200)}`)].join('\n')
        : '（本轮没有相关记忆注入）',
      relatedCount: related.length,
      recentCount: recent.length,
    };
  }

  reload() {
    const changed = this.store.syncFromDisk();
    return { ok: true, changed, total: this.store.count() };
  }
}

markRemoteMethod(MemoryRemoteService, 'stats');
markRemoteMethod(MemoryRemoteService, 'list');
markRemoteMethod(MemoryRemoteService, 'search');
markRemoteMethod(MemoryRemoteService, 'save');
markRemoteMethod(MemoryRemoteService, 'remove');
markRemoteMethod(MemoryRemoteService, 'pin');
markRemoteMethod(MemoryRemoteService, 'preview');
markRemoteMethod(MemoryRemoteService, 'reload');

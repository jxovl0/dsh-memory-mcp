// dsh-memory-mcp 设置页（DSH web client 插件）
// 在 设置 → 记忆 里管理 markdown 卡片：列表、搜索、新增、编辑、删除、置顶、预览注入。
window.__ModuleLoader__.load({
  id: 'dsh-memory-mcp',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useMemo } = React;

    // 只用中性 rgba 与 currentColor，深浅主题都能看清
    const CSS = `
      .mem_panel {
        display:flex; flex-direction:column; gap:12px;
        height:100%; min-height:0; padding:2px 2px 8px;
        color:inherit; font-size:13.5px;
      }
      .mem_header { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
      .mem_title { font-size:18px; font-weight:650; letter-spacing:.2px; }
      .mem_meta { opacity:.55; font-size:12.5px; }
      .mem_spacer { flex:1 }
      .mem_btn {
        display:inline-flex; align-items:center; gap:4px;
        font:inherit; font-size:12.5px; line-height:1;
        padding:6px 11px; border-radius:8px; cursor:pointer;
        color:inherit; background:rgba(127,127,127,.10);
        border:1px solid rgba(127,127,127,.22);
        transition:background .12s ease, border-color .12s ease, opacity .12s ease;
        white-space:nowrap;
      }
      .mem_btn:hover:not(:disabled) { background:rgba(127,127,127,.18); border-color:rgba(127,127,127,.38); }
      .mem_btn:disabled { opacity:.45; cursor:default; }
      .mem_btn.primary { background:rgba(79,140,255,.16); border-color:rgba(79,140,255,.45); }
      .mem_btn.primary:hover:not(:disabled) { background:rgba(79,140,255,.26); }
      .mem_btn.danger:hover:not(:disabled) { background:rgba(229,83,75,.16); border-color:rgba(229,83,75,.5); }
      .mem_btn.ghost { background:transparent; border-color:transparent; opacity:.7; padding:6px 8px; }
      .mem_btn.ghost:hover:not(:disabled) { background:rgba(127,127,127,.12); opacity:1; }

      .mem_toolbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
      .mem_field {
        flex:1; min-width:180px; box-sizing:border-box;
        font:inherit; font-size:13px;
        padding:8px 11px; border-radius:9px;
        color:inherit; background:rgba(127,127,127,.07);
        border:1px solid rgba(127,127,127,.22);
        outline:none; transition:border-color .12s ease, background .12s ease;
      }
      .mem_field:focus { border-color:rgba(79,140,255,.55); background:rgba(127,127,127,.10); }
      .mem_textarea {
        box-sizing:border-box; width:100%; min-height:70px; resize:vertical;
        font:inherit; font-size:13px; line-height:1.55;
        padding:9px 11px; border-radius:9px;
        color:inherit; background:rgba(127,127,127,.07);
        border:1px solid rgba(127,127,127,.22); outline:none;
      }
      .mem_textarea:focus { border-color:rgba(79,140,255,.55); }
      .mem_select {
        font:inherit; font-size:12.5px; padding:7px 9px; border-radius:8px;
        color:inherit; background:rgba(127,127,127,.10);
        border:1px solid rgba(127,127,127,.22); outline:none;
      }
      .mem_select option { color:#111; background:#fff; }

      .mem_form {
        display:flex; flex-direction:column; gap:8px;
        padding:12px; border-radius:12px;
        background:rgba(127,127,127,.06);
        border:1px solid rgba(127,127,127,.18);
      }
      .mem_form_row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
      .mem_check { display:inline-flex; align-items:center; gap:6px; opacity:.85; font-size:12.5px; }

      .mem_list { display:flex; flex-direction:column; gap:8px; overflow-y:auto; padding-right:2px; flex:1; min-height:0; }
      .mem_card {
        display:flex; flex-direction:column; gap:7px;
        padding:11px 13px; border-radius:11px;
        background:rgba(127,127,127,.05);
        border:1px solid rgba(127,127,127,.16);
        transition:border-color .12s ease, background .12s ease;
      }
      .mem_card:hover { border-color:rgba(127,127,127,.32); background:rgba(127,127,127,.08); }
      .mem_card.pinned { border-color:rgba(79,140,255,.42); background:rgba(79,140,255,.06); }
      .mem_card_head { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      .mem_actions { margin-left:auto; display:flex; gap:6px; }
      .mem_text {
        white-space:pre-wrap; line-height:1.62; font-size:13.5px;
        display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;
        cursor:pointer;
      }
      .mem_text.expanded { display:block; -webkit-line-clamp:unset; overflow:visible; }

      .mem_badge {
        display:inline-flex; align-items:center; gap:4px;
        font-size:11.5px; line-height:1; padding:4px 8px; border-radius:999px;
        background:rgba(127,127,127,.14); border:1px solid transparent; opacity:.9;
      }
      .mem_badge.t-preference { background:rgba(46,160,67,.16); color:#2ea043; }
      .mem_badge.t-decision   { background:rgba(79,140,255,.16); color:#4f8cff; }
      .mem_badge.t-pitfall    { background:rgba(255,140,80,.16); color:#e07b2d; }
      .mem_badge.t-fact       { background:rgba(127,127,127,.16); }
      .mem_badge.pin { background:rgba(79,140,255,.14); color:#4f8cff; }
      .mem_tags { opacity:.5; font-size:11.5px; }

      .mem_empty {
        display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px;
        padding:36px 0; opacity:.5; font-size:13px; text-align:center;
      }
      .mem_pre {
        white-space:pre-wrap; margin:0; padding:11px 13px; border-radius:10px;
        font-size:12.5px; line-height:1.6; font-family:inherit;
        background:rgba(127,127,127,.06); border:1px solid rgba(127,127,127,.16);
      }
      .mem_pre_title { font-size:12px; font-weight:600; opacity:.65; margin-bottom:4px; }
      .mem_err { color:#e5534b; font-size:12.5px; }
      .mem_hint { opacity:.45; font-size:11.5px; }
    `;

    const TYPES = [
      ['fact', '事实'],
      ['preference', '偏好'],
      ['decision', '决策'],
      ['pitfall', '坑'],
    ];

    const TYPE_LABEL = Object.fromEntries(TYPES);
    const fmtTime = (ts) => {
      try {
        const d = new Date(ts);
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      } catch { return String(ts ?? '').slice(0, 16); }
    };

    function makeApi(ctx) {
      const call = (method, args) => ctx.connection.rpc
        .call('/api', `memory/${method}`, { args: args || {} }, undefined)
        .then((response) => {
          if (response && response.ok) return response.value;
          throw new Error(response?.error?.message ?? 'memory 调用失败');
        });
      return {
        stats: () => call('stats', {}),
        list: () => call('list', { limit: 300 }),
        search: (query) => call('search', { query, limit: 30 }),
        save: (args) => call('save', {
          id: args.id || '', text: args.text, type: args.type,
          tags: Array.isArray(args.tags) ? args.tags : [], pinned: Boolean(args.pinned),
        }),
        remove: (id) => call('remove', { id }),
        pin: (id, pinned) => call('pin', { id, pinned }),
        preview: (query) => call('preview', { query: query || '' }),
        reload: () => call('reload', {}),
      };
    }

    function MemoryPanel(props) {
      const api = props.memory;
      const [entries, setEntries] = useState([]);
      const [stats, setStats] = useState(null);
      const [query, setQuery] = useState('');
      const [error, setError] = useState('');
      const [busy, setBusy] = useState(false);
      const [showForm, setShowForm] = useState(false);
      const [draft, setDraft] = useState({ text: '', type: 'fact', tags: '', pinned: false });
      const [editing, setEditing] = useState(null);
      const [expanded, setExpanded] = useState({});
      const [preview, setPreview] = useState(null);

      const load = async (q) => {
        setBusy(true);
        setError('');
        try {
          const [list, st] = await Promise.all([
            q && q.trim() ? api.search(q.trim()) : api.list(),
            api.stats(),
          ]);
          setEntries(list.entries || []);
          setStats(st);
        } catch (e) {
          setError(e.message || String(e));
        } finally {
          setBusy(false);
        }
      };

      useEffect(() => { load(''); }, []);

      const refreshPreview = async () => {
        try { setPreview(await api.preview(query)); } catch (e) { setError(e.message); }
      };

      const submitDraft = async () => {
        if (!draft.text.trim()) return;
        setBusy(true);
        try {
          await api.save({
            text: draft.text, type: draft.type,
            tags: draft.tags.split(',').map((s) => s.trim()).filter(Boolean),
            pinned: draft.pinned,
          });
          setDraft({ text: '', type: 'fact', tags: '', pinned: false });
          setShowForm(false);
          await load(query);
        } catch (e) { setError(e.message); } finally { setBusy(false); }
      };

      const saveEdit = async () => {
        if (!editing) return;
        setBusy(true);
        try {
          await api.save({ id: editing.id, text: editing.text, type: editing.type, tags: editing.tags, pinned: editing.pinned });
          setEditing(null);
          await load(query);
        } catch (e) { setError(e.message); } finally { setBusy(false); }
      };

      const removeEntry = async (id) => {
        setBusy(true);
        try { await api.remove(id); await load(query); } catch (e) { setError(e.message); } finally { setBusy(false); }
      };

      const togglePin = async (entry) => {
        setBusy(true);
        try { await api.pin(entry.id, !entry.pinned); await load(query); } catch (e) { setError(e.message); } finally { setBusy(false); }
      };

      const header = h('div', { className: 'mem_header' },
        h('div', { className: 'mem_title' }, '记忆'),
        stats ? h('div', { className: 'mem_meta' }, `${stats.total} 条 · ${stats.dir}`) : null,
        h('div', { className: 'mem_spacer' }),
        h('button', { className: 'mem_btn ghost', onClick: () => load(query), disabled: busy }, '刷新'),
        h('button', {
          className: 'mem_btn ghost',
          disabled: busy,
          onClick: async () => {
            try { const r = await api.reload(); await load(query); setError(`索引已校正 · 变动 ${r.changed} 条`); } catch (e) { setError(e.message); }
          },
        }, '重扫卡片'),
        h('button', { className: 'mem_btn primary', onClick: () => setShowForm(!showForm) }, showForm ? '收起' : '+ 新增'),
      );

      const toolbar = h('div', { className: 'mem_toolbar' },
        h('input', {
          className: 'mem_field',
          placeholder: '搜索记忆（语义 + 关键词）…',
          value: query,
          onChange: (e) => setQuery(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Enter') load(query); },
        }),
        h('button', { className: 'mem_btn', onClick: () => load(query), disabled: busy }, '搜索'),
        h('button', { className: 'mem_btn ghost', onClick: () => { setQuery(''); load(''); }, disabled: busy }, '清空'),
        h('button', { className: 'mem_btn ghost', onClick: refreshPreview, disabled: busy }, '预览注入'),
      );

      const form = showForm ? h('div', { className: 'mem_form' },
        h('textarea', {
          className: 'mem_textarea',
          placeholder: '写一条自包含的记忆，例如：用户要求所有写盘限制在工作区内',
          value: draft.text,
          onChange: (e) => setDraft({ ...draft, text: e.target.value }),
        }),
        h('div', { className: 'mem_form_row' },
          h('select', {
            className: 'mem_select', value: draft.type,
            onChange: (e) => setDraft({ ...draft, type: e.target.value }),
          }, ...TYPES.map(([v, label]) => h('option', { key: v, value: v }, label))),
          h('input', {
            className: 'mem_field', style: { minWidth: 160 }, placeholder: '标签（逗号分隔，可空）',
            value: draft.tags, onChange: (e) => setDraft({ ...draft, tags: e.target.value }),
          }),
          h('label', { className: 'mem_check' },
            h('input', { type: 'checkbox', checked: draft.pinned, onChange: (e) => setDraft({ ...draft, pinned: e.target.checked }) }),
            '置顶'),
          h('div', { className: 'mem_spacer' }),
          h('button', { className: 'mem_btn ghost', onClick: () => setShowForm(false) }, '取消'),
          h('button', { className: 'mem_btn primary', onClick: submitDraft, disabled: busy || !draft.text.trim() }, '保存'),
        ),
      ) : null;

      const listView = entries.length === 0
        ? h('div', { className: 'mem_empty' },
            h('div', null, query ? '没有匹配的记忆' : '还没有记忆'),
            h('div', { className: 'mem_hint' }, query ? '换个关键词试试' : '点右上角「+ 新增」，或让我用 memory_write 记一条'))
        : h('div', { className: 'mem_list' }, ...entries.map((entry) => {
          const isEditing = editing && editing.id === entry.id;
          const head = h('div', { className: 'mem_card_head' },
            h('span', { className: `mem_badge t-${entry.type}` }, TYPE_LABEL[entry.type] ?? entry.type),
            h('span', { className: 'mem_meta' }, fmtTime(entry.ts)),
            entry.score !== undefined ? h('span', { className: 'mem_meta' }, `相关度 ${entry.score.toFixed(3)}`) : null,
            entry.pinned ? h('span', { className: 'mem_badge pin' }, '置顶') : null,
            h('div', { className: 'mem_actions' },
              h('button', { className: 'mem_btn ghost', onClick: () => togglePin(entry), disabled: busy }, entry.pinned ? '取消置顶' : '置顶'),
              h('button', {
                className: 'mem_btn ghost', disabled: busy,
                onClick: () => setEditing({ id: entry.id, text: entry.text, type: entry.type, tags: entry.tags, pinned: entry.pinned }),
              }, '编辑'),
              h('button', { className: 'mem_btn ghost danger', onClick: () => removeEntry(entry.id), disabled: busy }, '删除'),
            ),
          );

          const body = isEditing
            ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
                h('textarea', {
                  className: 'mem_textarea', value: editing.text,
                  onChange: (e) => setEditing({ ...editing, text: e.target.value }),
                }),
                h('div', { className: 'mem_form_row' },
                  h('select', {
                    className: 'mem_select', value: editing.type,
                    onChange: (e) => setEditing({ ...editing, type: e.target.value }),
                  }, ...TYPES.map(([v, label]) => h('option', { key: v, value: v }, label))),
                  h('input', {
                    className: 'mem_field', style: { minWidth: 140 }, placeholder: '标签',
                    value: (editing.tags || []).join(', '),
                    onChange: (e) => setEditing({ ...editing, tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }),
                  }),
                  h('div', { className: 'mem_spacer' }),
                  h('button', { className: 'mem_btn ghost', onClick: () => setEditing(null) }, '取消'),
                  h('button', { className: 'mem_btn primary', onClick: saveEdit, disabled: busy }, '保存'),
                ))
            : h('div', {
                className: `mem_text${expanded[entry.id] ? ' expanded' : ''}`,
                onClick: () => setExpanded({ ...expanded, [entry.id]: !expanded[entry.id] }),
                title: expanded[entry.id] ? '点击收起' : '点击展开',
              }, entry.text);

          return h('div', { key: entry.id, className: `mem_card${entry.pinned ? ' pinned' : ''}` },
            head,
            body,
            entry.tags && entry.tags.length ? h('div', { className: 'mem_tags' }, entry.tags.join(' · ')) : null,
          );
        }));

      const previewView = preview ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        h('div', { className: 'mem_meta' }, `常驻 ${preview.recentCount} 条 · 本轮相关 ${preview.relatedCount} 条`),
        h('div', null,
          h('div', { className: 'mem_pre_title' }, '常驻段（每轮注入）'),
          h('pre', { className: 'mem_pre' }, preview.pinnedText)),
        h('div', null,
          h('div', { className: 'mem_pre_title' }, '相关段（本轮检索）'),
          h('pre', { className: 'mem_pre' }, preview.relatedText)),
      ) : null;

      return h('div', { className: 'mem_panel' },
        header,
        error ? h('div', { className: 'mem_err' }, error) : null,
        toolbar,
        form,
        listView,
        previewView,
      );
    }

    return {
      inject: ['slots', 'connection'],
      apply(ctx) {
        const style = document.createElement('style');
        style.dataset.plugin = 'dsh-memory-mcp';
        style.textContent = CSS;
        document.head.appendChild(style);
        ctx.effect(() => () => style.remove());

        const memory = makeApi(ctx);
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'memory-cards',
          order: 46,
          label: () => '记忆',
          inject: () => ({ memory }),
        }, MemoryPanel));
      },
    };
  },
});

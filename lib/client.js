// dsh-memory-mcp 设置页（DSH web client 插件）
// 在 设置 → 记忆 里管理 markdown 卡片：列表、搜索、新增、编辑、删除、置顶、预览注入。
window.__ModuleLoader__.load({
  id: 'dsh-memory-mcp',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useMemo, useRef } = React;

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
      .mem_tabs { display:inline-flex; gap:2px; padding:2px; border-radius:9px; background:rgba(127,127,127,.10); }
      .mem_tab { font:inherit; font-size:12.5px; padding:5px 12px; border-radius:7px; border:0; background:transparent; color:inherit; opacity:.7; cursor:pointer; }
      .mem_tab:hover { opacity:1; }
      .mem_tab.active { background:rgba(127,127,127,.22); opacity:1; font-weight:600; }
      .mem_sea { position:relative; flex:1; min-height:0; border-radius:12px; border:1px solid rgba(127,127,127,.18); background:rgba(127,127,127,.04); overflow:hidden; }
      .mem_sea_canvas { display:block; width:100%; height:100%; cursor:grab; }
      .mem_sea_canvas.dragging { cursor:grabbing; }
      .mem_sea_tip { position:absolute; left:10px; bottom:8px; font-size:11.5px; opacity:.45; pointer-events:none; }
      .mem_sea_sel {
        position:absolute; right:10px; top:10px; width:min(320px,70%); max-height:70%; overflow:auto;
        padding:12px 14px; border-radius:12px; font-size:12.5px; line-height:1.6;
        background:var(--surface,#fff); border:1px solid rgba(127,127,127,.28);
        box-shadow:0 10px 30px rgba(0,0,0,.18);
      }
      .mem_sea_sel .mem_meta { margin-bottom:6px; }
      .mem_sea_sel_text { white-space:pre-wrap; }
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
        graph: (threshold) => call('graph', { threshold: Number(threshold) || 0.6, maxNodes: 240 }),
      };
    }

    const TYPE_COLOR = {
      fact: '#8a8f98',
      preference: '#2ea043',
      decision: '#4f8cff',
      pitfall: '#e07b2d',
    };

    /** 2D 记忆海：节点=卡片，连线=语义相似度，画布力导向图 */
    function MemorySea(props) {
      const api = props.memory;
      const canvasRef = useRef(null);
      const wrapRef = useRef(null);
      const stateRef = useRef({ nodes: [], edges: [], byId: new Map(), transform: { k: 1, x: 0, y: 0 }, selected: null, hover: null, dragging: null, panning: null, alpha: 1 });
      const [info, setInfo] = useState(null);
      const [error, setError] = useState('');
      const [selectedId, setSelectedId] = useState(null);
      const [loading, setLoading] = useState(true);
      const [threshold, setThreshold] = useState(0.6);
      const rafRef = useRef(0);

      const load = async () => {
        setLoading(true);
        setError('');
        try {
          const g = await api.graph(threshold);
          const n = (g.nodes || []).length;
          const R = Math.min(320, 60 + Math.sqrt(n) * 26);
          const nodes = (g.nodes || []).map((node, i) => {
            const ang = (i / Math.max(n, 1)) * Math.PI * 2;
            const r = R * (0.35 + 0.65 * ((i * 37) % 100) / 100);
            return { ...node, x: Math.cos(ang) * r, y: Math.sin(ang) * r, vx: 0, vy: 0 };
          });
          const index = new Map(nodes.map((node) => [node.id, node]));
          const edges = (g.edges || [])
            .map((e) => ({ a: index.get(e.source), b: index.get(e.target), w: e.weight }))
            .filter((e) => e.a && e.b);
          const st = stateRef.current;
          st.nodes = nodes;
          st.edges = edges;
          st.byId = index;
          st.alpha = 1;
          setInfo({ nodes: nodes.length, edges: edges.length, semantic: g.semantic });
        } catch (e) {
          setError(e.message || String(e));
        } finally {
          setLoading(false);
        }
      };

      useEffect(() => { load(); }, [threshold]);

      // 力导向模拟 + 绘制
      useEffect(() => {
        const canvas = canvasRef.current;
        const wrap = wrapRef.current;
        if (!canvas || !wrap) return undefined;
        const ctx = canvas.getContext('2d');
        let width = 0;
        let height = 0;

        const resize = () => {
          const rect = wrap.getBoundingClientRect();
          const dpr = window.devicePixelRatio || 1;
          width = Math.max(rect.width, 200);
          height = Math.max(rect.height, 200);
          canvas.width = Math.floor(width * dpr);
          canvas.height = Math.floor(height * dpr);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(wrap);

        const toWorld = (sx, sy) => {
          const t = stateRef.current.transform;
          return { x: (sx - t.x) / t.k, y: (sy - t.y) / t.k };
        };
        const nodeAt = (sx, sy) => {
          const p = toWorld(sx, sy);
          const t = stateRef.current;
          let best = null;
          let bestD = Infinity;
          for (const node of t.nodes) {
            const d = Math.hypot(node.x - p.x, node.y - p.y);
            const r = 5 + Math.sqrt(node.degree) * 2.2;
            if (d < Math.max(r + 4, 12) && d < bestD) { best = node; bestD = d; }
          }
          return best;
        };

        const step = () => {
          const t = stateRef.current;
          const ns = t.nodes;
          if (!ns.length) return;
          const k = 0.9;
          const repulse = 1400;
          const center = 0.012;
          // 斥力（简化的网格近似：全对全，节点数 <= 240）
          for (let i = 0; i < ns.length; i++) {
            const a = ns[i];
            for (let j = i + 1; j < ns.length; j++) {
              const b = ns[j];
              let dx = a.x - b.x;
              let dy = a.y - b.y;
              let d2 = dx * dx + dy * dy;
              if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
              const d = Math.sqrt(d2);
              const f = (repulse / d2) * t.alpha;
              const fx = (dx / d) * f;
              const fy = (dy / d) * f;
              a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
            }
          }
          // 边弹簧
          for (const e of t.edges) {
            const dx = e.b.x - e.a.x;
            const dy = e.b.y - e.a.y;
            const d = Math.hypot(dx, dy) || 1;
            const target = 90;
            const f = ((d - target) / d) * 0.06 * t.alpha * (0.5 + e.w);
            const fx = dx * f;
            const fy = dy * f;
            e.a.vx += fx; e.a.vy += fy; e.b.vx -= fx; e.b.vy -= fy;
          }
          // 向心 + 阻尼
          for (const node of ns) {
            node.vx -= node.x * center * t.alpha;
            node.vy -= node.y * center * t.alpha;
            if (t.dragging !== node) {
              node.vx *= 0.86;
              node.vy *= 0.86;
              node.x += node.vx * k;
              node.y += node.vy * k;
            }
          }
          t.alpha = Math.max(0.05, t.alpha * 0.994);
        };

        const draw = () => {
          const t = stateRef.current;
          ctx.clearRect(0, 0, width, height);
          ctx.save();
          ctx.translate(t.transform.x, t.transform.y);
          ctx.scale(t.transform.k, t.transform.k);
          // 边
          for (const e of t.edges) {
            const alpha = 0.06 + Math.min(0.35, e.w * 0.35);
            ctx.strokeStyle = `rgba(127,127,127,${alpha})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(e.a.x, e.a.y);
            ctx.lineTo(e.b.x, e.b.y);
            ctx.stroke();
          }
          // 节点
          for (const node of t.nodes) {
            const r = 5 + Math.sqrt(node.degree) * 2.2;
            const color = TYPE_COLOR[node.type] || '#8a8f98';
            if (node.pinned) {
              ctx.beginPath();
              ctx.arc(node.x, node.y, r + 3, 0, Math.PI * 2);
              ctx.strokeStyle = 'rgba(79,140,255,.55)';
              ctx.lineWidth = 1.5;
              ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.globalAlpha = t.hover === node || t.selected === node ? 1 : 0.85;
            ctx.fill();
            ctx.globalAlpha = 1;
            if (t.selected === node) {
              ctx.beginPath();
              ctx.arc(node.x, node.y, r + 5, 0, Math.PI * 2);
              ctx.strokeStyle = 'rgba(0,0,0,.35)';
              ctx.lineWidth = 1.5;
              ctx.stroke();
            }
          }
          ctx.restore();
          // 悬浮标签（屏幕坐标）
          if (t.hover) {
            const p = { x: t.hover.x * t.transform.k + t.transform.x, y: t.hover.y * t.transform.k + t.transform.y };
            const label = t.hover.text.slice(0, 42);
            ctx.font = '12px system-ui, sans-serif';
            const w = ctx.measureText(label).width + 14;
            ctx.fillStyle = 'rgba(20,20,24,.88)';
            ctx.beginPath();
            ctx.roundRect(p.x + 10, p.y - 10, w, 22, 6);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillText(label, p.x + 17, p.y + 5);
          }
        };

        const loop = () => {
          step();
          draw();
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);

        const onMouseDown = (ev) => {
          const rect = canvas.getBoundingClientRect();
          const sx = ev.clientX - rect.left;
          const sy = ev.clientY - rect.top;
          const node = nodeAt(sx, sy);
          const t = stateRef.current;
          if (node) {
            t.dragging = node;
            t.selected = node;
            setSelectedId(node.id);
            canvas.classList.add('dragging');
          } else {
            t.panning = { sx, sy, ox: t.transform.x, oy: t.transform.y };
            canvas.classList.add('dragging');
          }
        };
        const onMouseMove = (ev) => {
          const rect = canvas.getBoundingClientRect();
          const sx = ev.clientX - rect.left;
          const sy = ev.clientY - rect.top;
          const t = stateRef.current;
          if (t.dragging) {
            const p = toWorld(sx, sy);
            t.dragging.x = p.x;
            t.dragging.y = p.y;
            t.dragging.vx = 0;
            t.dragging.vy = 0;
            t.alpha = Math.max(t.alpha, 0.35);
            return;
          }
          if (t.panning) {
            t.transform.x = t.panning.ox + (sx - t.panning.sx);
            t.transform.y = t.panning.oy + (sy - t.panning.sy);
            return;
          }
          t.hover = nodeAt(sx, sy);
        };
        const endDrag = () => {
          const t = stateRef.current;
          t.dragging = null;
          t.panning = null;
          canvas.classList.remove('dragging');
        };
        const onWheel = (ev) => {
          ev.preventDefault();
          const rect = canvas.getBoundingClientRect();
          const t = stateRef.current;
          const sx = ev.clientX - rect.left;
          const sy = ev.clientY - rect.top;
          const before = toWorld(sx, sy);
          const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
          const k = Math.min(4, Math.max(0.25, t.transform.k * factor));
          t.transform.k = k;
          t.transform.x = sx - before.x * k;
          t.transform.y = sy - before.y * k;
        };

        canvas.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', endDrag);
        canvas.addEventListener('wheel', onWheel, { passive: false });

        return () => {
          cancelAnimationFrame(rafRef.current);
          ro.disconnect();
          canvas.removeEventListener('mousedown', onMouseDown);
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', endDrag);
          canvas.removeEventListener('wheel', onWheel);
        };
      }, [info]);

      const selected = selectedId ? stateRef.current.byId.get(selectedId) : null;

      return h('div', { className: 'mem_sea', ref: wrapRef },
        h('canvas', { className: 'mem_sea_canvas', ref: canvasRef }),
        h('div', { style: { position: 'absolute', left: 10, top: 8, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 } },
          h('span', { className: 'mem_meta' }, '语义阈值'),
          h('input', {
            type: 'range', min: 0.5, max: 0.8, step: 0.01, value: threshold,
            style: { width: 120 },
            onChange: (e) => setThreshold(Number(e.target.value)),
          }),
          h('span', { className: 'mem_meta' }, threshold.toFixed(2)),
          h('button', { className: 'mem_btn ghost', onClick: () => load(), disabled: loading }, '刷新'),
        ),
        h('div', { className: 'mem_sea_tip' },
          loading ? '加载中…' : info ? `${info.nodes} 个节点 · ${info.edges} 条语义连线 · ${info.semantic ? '语义图谱' : '按类型/标签连接'}` : ''),
        error ? h('div', { className: 'mem_sea_tip', style: { color: '#e5534b' } }, error) : null,
        selected ? h('div', { className: 'mem_sea_sel' },
          h('div', { className: 'mem_row', style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 } },
            h('span', { className: `mem_badge t-${selected.type}` }, TYPE_LABEL[selected.type] ?? selected.type),
            h('span', { className: 'mem_meta' }, fmtTime(selected.ts)),
            h('div', { style: { flex: 1 } }),
            h('button', { className: 'mem_btn ghost', onClick: () => { setSelectedId(null); stateRef.current.selected = null; } }, '关闭'),
          ),
          h('div', { className: 'mem_sea_sel_text' }, selected.text),
          selected.tags && selected.tags.length ? h('div', { className: 'mem_tags', style: { marginTop: 8 } }, selected.tags.join(' · ')) : null,
        ) : null,
      );
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
      const [tab, setTab] = useState('list');

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
        h('div', { className: 'mem_tabs' },
          h('button', { className: `mem_tab${tab === 'list' ? ' active' : ''}`, onClick: () => setTab('list') }, '列表'),
          h('button', { className: `mem_tab${tab === 'sea' ? ' active' : ''}`, onClick: () => setTab('sea') }, '记忆海'),
        ),
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

      if (tab === 'sea') {
        return h('div', { className: 'mem_panel' },
          header,
          error ? h('div', { className: 'mem_err' }, error) : null,
          h(MemorySea, { memory: api }),
        );
      }

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

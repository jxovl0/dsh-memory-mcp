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
      .mem_sea { position:relative; flex:1; min-height:420px; border-radius:12px; border:1px solid rgba(127,127,127,.18); background:rgba(127,127,127,.04); overflow:hidden; }
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
    const CLUSTER_TINT = [
      '79,140,255',
      '46,160,67',
      '224,123,45',
      '168,85,247',
      '20,184,166',
      '244,114,182',
      '234,179,8',
      '100,116,139',
    ];

    /** 2D 记忆海：大节点=语义分区，小节点=记忆卡片，连线=同区内的语义相似度 */
    function MemorySea(props) {
      const api = props.memory;
      const canvasRef = useRef(null);
      const wrapRef = useRef(null);
      const stateRef = useRef({
        nodes: [], edges: [], clusters: [], byId: new Map(), clusterById: new Map(),
        transform: { k: 1, x: 0, y: 0 }, selected: null, hover: null, hoverCluster: null,
        dragging: null, panning: null, alpha: 0, t: 0,
      });
      const [info, setInfo] = useState(null);
      const [error, setError] = useState('');
      const [selectedId, setSelectedId] = useState(null);
      const [loading, setLoading] = useState(true);
      const [threshold, setThreshold] = useState(0.62);
      const rafRef = useRef(0);
      const thresholdRef = useRef(threshold);

      const load = async () => {
        setLoading(true);
        setError('');
        try {
          const g = await api.graph(thresholdRef.current);
          const clusters = (g.clusters || []).map((c, i) => {
            const ang = (i / Math.max(g.clusters.length, 1)) * Math.PI * 2 - Math.PI / 2;
            const homeR = 190 + (i % 2) * 55 + Math.min(c.count, 20) * 3;
            return { ...c, tint: CLUSTER_TINT[i % CLUSTER_TINT.length], x: Math.cos(ang) * homeR, y: Math.sin(ang) * homeR, hx: Math.cos(ang) * homeR, hy: Math.sin(ang) * homeR, vx: 0, vy: 0, r: 22 + Math.min(26, Math.sqrt(c.count) * 5) };
          });
          const clusterById = new Map(clusters.map((c) => [c.id, c]));
          const byId = new Map();
          const nodes = (g.nodes || []).map((node) => {
            const c = clusterById.get(node.cluster);
            const base = c ?? { x: 0, y: 0, r: 40 };
            const ang = Math.random() * Math.PI * 2;
            const rad = (Math.random() * 0.6 + 0.2) * (base.r + 26);
            return {
              ...node,
              x: base.x + Math.cos(ang) * rad,
              y: base.y + Math.sin(ang) * rad,
              vx: 0, vy: 0,
              r: 3.2 + Math.sqrt(node.degree) * 1.1,
            };
          });
          nodes.forEach((n) => byId.set(n.id, n));
          const index = byId;
          const edges = (g.edges || [])
            .map((e) => ({ a: index.get(e.source), b: index.get(e.target), w: e.weight }))
            .filter((e) => e.a && e.b);
          const st = stateRef.current;
          st.nodes = nodes;
          st.edges = edges;
          st.clusters = clusters;
          st.byId = byId;
          st.clusterById = clusterById;
          st.alpha = 1;
          st.t = 0;
          st.selected = null;
          st.hover = null;
          st.hoverCluster = null;
          setSelectedId(null);
          setInfo({ nodes: nodes.length, edges: edges.length, clusters: clusters.length, semantic: g.semantic });
        } catch (e) {
          setError(e.message || String(e));
        } finally {
          setLoading(false);
        }
      };

      useEffect(() => { load(); }, []);
      useEffect(() => { thresholdRef.current = threshold; return undefined; }, [threshold]);

      useEffect(() => {
        const canvas = canvasRef.current;
        const wrap = wrapRef.current;
        if (!canvas || !wrap) return undefined;
        const ctx = canvas.getContext('2d');
        let width = 0;
        let height = 0;
        let dpr = window.devicePixelRatio || 1;

        const resize = () => {
          const rect = wrap.getBoundingClientRect();
          dpr = window.devicePixelRatio || 1;
          width = Math.max(rect.width, 200);
          height = Math.max(rect.height, 200);
          canvas.width = Math.floor(width * dpr);
          canvas.height = Math.floor(height * dpr);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          // 首帧把内容居中
          const st = stateRef.current;
          if (st.transform.k === 1 && st.transform.x === 0 && st.transform.y === 0) {
            st.transform.x = width / 2;
            st.transform.y = height / 2;
          }
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(wrap);

        const toWorld = (sx, sy) => {
          const t = stateRef.current.transform;
          return { x: (sx - t.x) / t.k, y: (sy - t.y) / t.k };
        };

        const hit = (sx, sy) => {
          const p = toWorld(sx, sy);
          const st = stateRef.current;
          let best = null;
          let bestD = Infinity;
          for (const c of st.clusters) {
            const d = Math.hypot(c.x - p.x, c.y - p.y);
            if (d < c.r + 6 && d < bestD) { best = { kind: 'cluster', cluster: c }; bestD = d; }
          }
          if (best) return best;
          for (const n of st.nodes) {
            const d = Math.hypot(n.x - p.x, n.y - p.y);
            if (d < n.r + 6 && d < bestD) { best = { kind: 'node', node: n }; bestD = d; }
          }
          return best;
        };

        const step = () => {
          const st = stateRef.current;
          const ns = st.nodes;
          if (!ns.length || st.alpha < 0.02) return;
          const a = st.alpha;
          const cById = st.clusterById;

          // 大节点：互相排斥 + 回家
          for (let i = 0; i < st.clusters.length; i++) {
            const c = st.clusters[i];
            for (let j = i + 1; j < st.clusters.length; j++) {
              const d = st.clusters[j];
              let dx = c.x - d.x;
              let dy = c.y - d.y;
              const dist = Math.hypot(dx, dy) || 1;
              const f = ((c.r + d.r + 90) / dist) * 3.2 * a;
              const fx = (dx / dist) * (f - 1);
              const fy = (dy / dist) * (f - 1);
              c.vx += fx; c.vy += fy; d.vx -= fx; d.vy -= fy;
            }
            c.vx += (c.hx - c.x) * 0.012 * a;
            c.vy += (c.hy - c.y) * 0.012 * a;
            c.vx *= 0.9;
            c.vy *= 0.9;
            c.x += c.vx;
            c.y += c.vy;
          }

          // 小节点：向所属分区收拢 + 互斥（只算同分区）
          for (let i = 0; i < ns.length; i++) {
            const n = ns[i];
            const c = cById.get(n.cluster);
            if (st.dragging === n) continue;
            if (c) {
              const dx = c.x - n.x;
              const dy = c.y - n.y;
              const dist = Math.hypot(dx, dy) || 1;
              const target = c.r + 18 + (n.r * 2.2);
              const f = (dist - target) * 0.02 * a;
              n.vx += (dx / dist) * f;
              n.vy += (dy / dist) * f;
            }
            for (let j = i + 1; j < ns.length; j++) {
              const m = ns[j];
              if (m.cluster !== n.cluster) continue;
              let dx = n.x - m.x;
              let dy = n.y - m.y;
              let d2 = dx * dx + dy * dy;
              if (d2 > 3600) continue;
              if (d2 < 1) { dx = 0.5; dy = 0.5; d2 = 1; }
              const dist = Math.sqrt(d2);
              const f = (26 / d2) * a;
              n.vx += (dx / dist) * f;
              n.vy += (dy / dist) * f;
              m.vx -= (dx / dist) * f;
              m.vy -= (dy / dist) * f;
            }
            n.vx *= 0.82;
            n.vy *= 0.82;
            n.x += n.vx;
            n.y += n.vy;
          }
          st.alpha = Math.max(0, st.alpha * 0.992 - 0.0004);
          st.t += 1;
        };

        const drawBackground = () => {
          const st = stateRef.current;
          const g = ctx.createRadialGradient(width * 0.5, height * 0.45, 10, width * 0.5, height * 0.5, Math.max(width, height) * 0.75);
          g.addColorStop(0, 'rgba(79,140,255,0.055)');
          g.addColorStop(0.55, 'rgba(127,127,127,0.02)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, width, height);

          // 细网格（跟随 pan/zoom）
          const t = st.transform;
          const stepPx = 46 * t.k;
          if (stepPx > 8) {
            ctx.strokeStyle = 'rgba(127,127,127,0.07)';
            ctx.lineWidth = 1;
            const ox = ((t.x % stepPx) + stepPx) % stepPx;
            const oy = ((t.y % stepPx) + stepPx) % stepPx;
            ctx.beginPath();
            for (let x = ox; x < width; x += stepPx) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
            for (let y = oy; y < height; y += stepPx) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
            ctx.stroke();
          }

          // 缓慢漂移的星尘
          const time = performance.now() / 1000;
          ctx.fillStyle = 'rgba(127,127,127,0.22)';
          for (let i = 0; i < 46; i++) {
            const seed = i * 97.13;
            const bx = (Math.sin(seed) * 0.5 + 0.5) * width;
            const by = (Math.cos(seed * 1.7) * 0.5 + 0.5) * height;
            const px = (bx + Math.sin(time * 0.12 + i) * 12) % width;
            const py = (by + Math.cos(time * 0.1 + i * 0.7) * 10) % height;
            const size = 0.7 + (i % 3) * 0.5;
            ctx.globalAlpha = 0.25 + 0.15 * Math.sin(time * 0.9 + i);
            ctx.beginPath();
            ctx.arc(px < 0 ? px + width : px, py < 0 ? py + height : py, size, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        };

        const roundLabel = (text, x, y, font, color, bg) => {
          ctx.font = font;
          const w = ctx.measureText(text).width + 16;
          ctx.fillStyle = bg;
          ctx.beginPath();
          ctx.roundRect(x - w / 2, y - 11, w, 22, 11);
          ctx.fill();
          ctx.fillStyle = color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, x, y + 0.5);
          ctx.textAlign = 'start';
          ctx.textBaseline = 'alphabetic';
        };

        const draw = () => {
          const st = stateRef.current;
          const t = st.transform;
          ctx.clearRect(0, 0, width, height);
          drawBackground();

          ctx.save();
          ctx.translate(t.x, t.y);
          ctx.scale(t.k, t.k);

          // 分区光晕
          for (const c of st.clusters) {
            const glow = ctx.createRadialGradient(c.x, c.y, c.r * 0.4, c.x, c.y, c.r * 4.2);
            glow.addColorStop(0, `rgba(${c.tint},0.16)`);
            glow.addColorStop(0.55, `rgba(${c.tint},0.05)`);
            glow.addColorStop(1, `rgba(${c.tint},0)`);
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(c.x, c.y, c.r * 4.2, 0, Math.PI * 2);
            ctx.fill();
          }

          // 连线
          for (const e of st.edges) {
            const same = e.a.cluster === e.b.cluster;
            ctx.strokeStyle = `rgba(127,127,127,${same ? 0.10 + Math.min(0.22, e.w * 0.25) : 0.05})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(e.a.x, e.a.y);
            ctx.lineTo(e.b.x, e.b.y);
            ctx.stroke();
          }

          // 大节点
          for (const c of st.clusters) {
            const hovered = st.hoverCluster === c;
            const sel = st.selected && st.selected.cluster === c.id;
            const r = c.r * (hovered ? 1.06 : 1);
            const core = ctx.createRadialGradient(c.x - r * 0.3, c.y - r * 0.35, r * 0.15, c.x, c.y, r);
            core.addColorStop(0, `rgba(${c.tint},${hovered || sel ? 0.95 : 0.8})`);
            core.addColorStop(1, `rgba(${c.tint},0.55)`);
            ctx.fillStyle = core;
            ctx.beginPath();
            ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = `rgba(${c.tint},${hovered || sel ? 0.9 : 0.5})`;
            ctx.lineWidth = 1.6;
            ctx.stroke();

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.font = `600 ${Math.max(11, Math.min(14, r * 0.42))}px system-ui, sans-serif`;
            ctx.fillText(c.label.slice(0, 8), c.x, c.y - 2);
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.font = '10.5px system-ui, sans-serif';
            ctx.fillText(String(c.count), c.x, c.y + r * 0.45);
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
          }

          // 小节点
          for (const n of st.nodes) {
            const color = TYPE_COLOR[n.type] || '#8a8f98';
            const active = st.selected === n || st.hover === n;
            if (n.pinned) {
              ctx.beginPath();
              ctx.arc(n.x, n.y, n.r + 3, 0, Math.PI * 2);
              ctx.strokeStyle = 'rgba(79,140,255,0.6)';
              ctx.lineWidth = 1.2;
              ctx.stroke();
            }
            const halo = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 2.6);
            halo.addColorStop(0, `rgba(${hexToRgb(color)},${active ? 0.55 : 0.32})`);
            halo.addColorStop(1, `rgba(${hexToRgb(color)},0)`);
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r * 2.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = color;
            ctx.globalAlpha = active ? 1 : 0.92;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r * (active ? 1.25 : 1), 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          ctx.restore();

          // 悬浮标签（屏幕坐标）
          const labelFor = (obj, text) => {
            const px = obj.x * t.k + t.x;
            const py = obj.y * t.k + t.y;
            const label = text.length > 44 ? `${text.slice(0, 44)}…` : text;
            roundLabel(label, Math.min(Math.max(px, 90), width - 90), py - 18, '12px system-ui, sans-serif', '#fff', 'rgba(18,18,22,0.88)');
          };
          if (st.hover) labelFor(st.hover, st.hover.text);
          else if (st.hoverCluster) labelFor(st.hoverCluster, `${st.hoverCluster.label} · ${st.hoverCluster.count} 条`);
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
          const st = stateRef.current;
          const found = hit(sx, sy);
          if (found && found.kind === 'node') {
            st.dragging = found.node;
            st.selected = found.node;
            setSelectedId(found.node.id);
            canvas.classList.add('dragging');
          } else if (found && found.kind === 'cluster') {
            st.selected = { cluster: found.cluster.id };
            setSelectedId(null);
          } else {
            st.panning = { sx, sy, ox: st.transform.x, oy: st.transform.y };
            canvas.classList.add('dragging');
          }
        };
        const onMouseMove = (ev) => {
          const rect = canvas.getBoundingClientRect();
          const sx = ev.clientX - rect.left;
          const sy = ev.clientY - rect.top;
          const st = stateRef.current;
          if (st.dragging) {
            const p = toWorld(sx, sy);
            st.dragging.x = p.x;
            st.dragging.y = p.y;
            st.dragging.vx = 0;
            st.dragging.vy = 0;
            st.alpha = Math.max(st.alpha, 0.25);
            return;
          }
          if (st.panning) {
            st.transform.x = st.panning.ox + (sx - st.panning.sx);
            st.transform.y = st.panning.oy + (sy - st.panning.sy);
            return;
          }
          const found = hit(sx, sy);
          st.hover = found && found.kind === 'node' ? found.node : null;
          st.hoverCluster = found && found.kind === 'cluster' ? found.cluster : null;
        };
        const endDrag = () => {
          const st = stateRef.current;
          st.dragging = null;
          st.panning = null;
          canvas.classList.remove('dragging');
        };
        const onWheel = (ev) => {
          ev.preventDefault();
          const rect = canvas.getBoundingClientRect();
          const sx = ev.clientX - rect.left;
          const sy = ev.clientY - rect.top;
          const st = stateRef.current;
          const before = toWorld(sx, sy);
          const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
          const k = Math.min(4, Math.max(0.25, st.transform.k * factor));
          st.transform.k = k;
          st.transform.x = sx - before.x * k;
          st.transform.y = sy - before.y * k;
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
        h('div', { style: { position: 'absolute', left: 12, top: 10, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, zIndex: 2 } },
          h('span', { className: 'mem_meta' }, '连线阈值'),
          h('input', {
            type: 'range', min: 0.5, max: 0.82, step: 0.01, value: threshold,
            style: { width: 110 },
            onChange: (e) => setThreshold(Number(e.target.value)),
            onMouseUp: () => load(),
            onTouchEnd: () => load(),
          }),
          h('span', { className: 'mem_meta' }, threshold.toFixed(2)),
          h('button', { className: 'mem_btn ghost', onClick: () => load(), disabled: loading }, '重新布局'),
        ),
        h('div', { className: 'mem_sea_tip' },
          loading ? '布局中…' : info ? `${info.clusters} 个分区 · ${info.nodes} 个节点 · ${info.edges} 条连线 · ${info.semantic ? '语义聚类' : '按类型分区'}` : ''),
        error ? h('div', { className: 'mem_sea_tip', style: { color: '#e5534b' } }, error) : null,
        selected ? h('div', { className: 'mem_sea_sel' },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 } },
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

    function hexToRgb(hex) {
      const m = hex.replace('#', '');
      const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16);
      return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
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

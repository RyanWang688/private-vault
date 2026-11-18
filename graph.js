'use strict';
/* 力导向关系图谱（纯 Canvas，无外部依赖）
   物理模型参照 d3-force：速度衰减 + 弹簧 + 斥力 + 碰撞 + 向心力，alpha 退火；
   拖拽时整张图保持“温热”，邻居会被平滑地带动，松手后慢慢静下来。 */
window.VGraph = (() => {
  const FONT = '12px system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // 分组配色：12 种色相均匀分布、明度一致的颜色，深浅主题各一套
  const PALETTE = {
    dark: ['#8b9cff', '#ff8a7a', '#4fd1b5', '#f5c451', '#e48bf0', '#5cc8ff', '#a3dc5c', '#ff9fc4', '#ffb067', '#7de3e0', '#c3a4ff', '#f27fa0'],
    light: ['#4f5fe0', '#e0553f', '#14a185', '#c99417', '#b54bc9', '#1f8fd1', '#5f9e1c', '#d4517f', '#d97a1f', '#169c99', '#7a55e0', '#c8385f'],
  };
  const hex = (c) => { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec((c || '').trim()); return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : [140, 140, 150]; };
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (c, w, t) => c.map((v, i) => v + (w[i] - v) * t);
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  function create(canvas, opts = {}) {
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    let nodes = [], edges = [], byId = new Map(), adj = new Map();
    let alpha = 0, alphaTarget = 0, raf = 0, colors = {};
    const cam = { x: 0, y: 0, k: 1 };
    let camT = null, hover = null, highlight = null, drag = null, fresh = true, pendingFit = null;
    let inertia = null, needFit = false;
    const pointers = new Map();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');

    function readColors() {
      const cs = getComputedStyle(canvas);
      const v = (n) => cs.getPropertyValue(n).trim();
      colors = {
        login: v('--c-login'), identity: v('--c-identity'), bank: v('--c-bank'), note: v('--c-note'),
        file: v('--c-file'), tag: v('--c-tag'), fg: v('--fg'), muted: v('--muted'), line: v('--line-strong'), bg: v('--bg'), accent: v('--accent'),
      };
      const b = hex(colors.bg);
      dark = (b[0] * 0.299 + b[1] * 0.587 + b[2] * 0.114) < 128;
      bgRGB = b;
      if (nodes.length) assignColors(true);
    }
    let dark = true, bgRGB = [12, 13, 18], mode = opts.colorMode === 'type' ? 'type' : 'group', groups = [];

    // 按“关联项 / [[提及]]”连成的分组上色（标签连线不参与分组，否则会全部连成一团）
    function assignColors(instant) {
      const pal = PALETTE[dark ? 'dark' : 'light'];
      const items = nodes.filter((n) => n.kind !== 'tag');
      const parent = new Map(items.map((n) => [n, n]));
      const find = (n) => { while (parent.get(n) !== n) { parent.set(n, parent.get(parent.get(n))); n = parent.get(n); } return n; };
      for (const e of edges) if (e.s.kind !== 'tag' && e.t.kind !== 'tag') { const a = find(e.s), b = find(e.t); if (a !== b) parent.set(a, b); }
      const comp = new Map();
      for (const n of items) { const r = find(n); if (!comp.has(r)) comp.set(r, []); comp.get(r).push(n); }
      const list = [...comp.values()].filter((g) => g.length > 1)
        .map((g) => ({ members: g, key: g.map((n) => n.id).sort()[0], hub: g.reduce((a, b) => (b.deg > a.deg ? b : a)) }))
        .sort((a, b) => b.members.length - a.members.length || a.key.localeCompare(b.key));
      const used = new Set();
      groups = list.map((g) => {
        let i = hashStr(g.key) % pal.length;
        if (used.size < pal.length) while (used.has(i)) i = (i + 1) % pal.length;
        used.add(i);
        const color = pal[i];
        for (const n of g.members) n.group = color;
        return { color, label: g.hub.label, size: g.members.length, ids: g.members.map((n) => n.id) };
      });
      for (const n of items) if (!comp.get(find(n)) || comp.get(find(n)).length < 2) n.group = null;
      for (const n of nodes) {
        const base = n.kind === 'tag' ? colors.tag : (mode === 'group' && n.group) ? n.group
          : mode === 'group' ? colors[n.type] : colors[n.type];
        n.tc = hex(base || colors.tag);
        if (mode === 'group' && !n.group && n.kind !== 'tag') n.tc = mix(n.tc, hex(colors.muted), 0.35);
        if (instant || !n.cc) n.cc = n.tc.slice();
      }
      kick();
    }
    function resize() {
      const r = canvas.getBoundingClientRect();
      if (!r.width) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      if (needFit) { needFit = false; applyFit(null, 1.6, true); }
      kick();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ---------- 数据 ----------
    function labelOf(n) { return n.label.length > 18 ? n.label.slice(0, 17) + '…' : n.label; }
    function setData(ns, es) {
      const old = byId;
      byId = new Map();
      const added = [];
      nodes = ns.map((n) => {
        let node = old.get(n.id);
        if (!node) { node = { x: 0, y: 0, vx: 0, vy: 0, a: 0, s: 1, placed: false }; added.push(node); }
        Object.assign(node, n);
        node.text = labelOf(node);
        byId.set(n.id, node);
        return node;
      });
      edges = es.filter(([s, t]) => byId.has(s) && byId.has(t)).map(([s, t]) => ({ s: byId.get(s), t: byId.get(t) }));
      adj = new Map(nodes.map((n) => [n, new Set()]));
      for (const e of edges) { adj.get(e.s).add(e.t); adj.get(e.t).add(e.s); }
      for (const n of nodes) {
        n.deg = adj.get(n).size;
        n.r = n.kind === 'tag' ? 3.5 + Math.min(3, Math.sqrt(n.deg)) : 5 + Math.min(9, Math.sqrt(n.deg) * 2.2);
      }
      for (const e of edges) {
        e.str = 1 / Math.max(1, Math.min(e.s.deg, e.t.deg));
        e.bias = e.s.deg / ((e.s.deg + e.t.deg) || 1);
        e.len = (e.s.kind === 'tag' || e.t.kind === 'tag') ? 55 : 75;
      }
      // 新节点放在已有邻居旁边，避免从中心“炸开”
      added.forEach((n, i) => {
        const nb = [...adj.get(n)].find((m) => m.placed);
        if (nb) { n.x = nb.x + (Math.random() - 0.5) * 30; n.y = nb.y + (Math.random() - 0.5) * 30; }
        else { const ang = i * 2.39996, rad = 12 * Math.sqrt(i + 0.5) + (old.size ? 80 : 0); n.x = Math.cos(ang) * rad; n.y = Math.sin(ang) * rad; }
        n.placed = true;
      });
      if (hover && !byId.has(hover.id)) hover = null;
      assignColors(false);
      if (!nodes.length) { fresh = true; alpha = 0; draw(); return; }
      if (fresh) {
        // 首次：先在后台把布局跑到基本稳定，再直接定好视角，打开就是整齐的
        fresh = false;
        alpha = 1;
        for (let i = 0; i < 260 && alpha > 0.03; i++) tick();
        for (const n of nodes) n.a = targetA(n);
        applyFit(null, 1.6, true);
      } else if (added.length || old.size !== nodes.length) {
        alpha = Math.max(alpha, 0.35);
      }
      kick();
    }

    // ---------- 物理 ----------
    function tick() {
      const n = nodes.length;
      // 弹簧
      for (const e of edges) {
        const s = e.s, t = e.t;
        let dx = t.x + t.vx - s.x - s.vx, dy = t.y + t.vy - s.y - s.vy;
        let l = Math.sqrt(dx * dx + dy * dy) || 1e-3;
        l = (l - e.len) / l * alpha * e.str;
        dx *= l; dy *= l;
        t.vx -= dx * e.bias; t.vy -= dy * e.bias;
        s.vx += dx * (1 - e.bias); s.vy += dy * (1 - e.bias);
      }
      // 斥力 + 碰撞（节点数量很少，直接 O(n²)）
      for (let i = 0; i < n; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < n; j++) {
          const b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
          if (d2 < 1e-6) { dx = (Math.random() - 0.5) * 1e-2; dy = (Math.random() - 0.5) * 1e-2; d2 = dx * dx + dy * dy; }
          if (d2 < 360000) {
            const sa = a.kind === 'tag' ? 60 : 150, sb = b.kind === 'tag' ? 60 : 150;
            const w = alpha / Math.max(d2, 64);
            a.vx -= dx * w * sb; a.vy -= dy * w * sb;
            b.vx += dx * w * sa; b.vy += dy * w * sa;
          }
          const rr = a.r + b.r + 26;
          if (d2 < rr * rr) {
            const d = Math.sqrt(d2), push = (rr - d) / d * 0.35;
            a.vx -= dx * push; a.vy -= dy * push; b.vx += dx * push; b.vy += dy * push;
          }
        }
      }
      // 向心力：让孤立的小团不会漂得很远
      for (const p of nodes) {
        const g = p.deg ? 0.06 : 0.12;
        p.vx -= p.x * g * alpha; p.vy -= p.y * g * alpha;
      }
      for (const p of nodes) {
        if (p.fx != null) { p.x = p.fx; p.y = p.fy; p.vx = p.vy = 0; continue; }
        p.vx *= 0.58; p.vy *= 0.58;
        p.x += p.vx; p.y += p.vy;
      }
      alpha += (alphaTarget - alpha) * 0.0228;
    }

    // ---------- 渲染循环 ----------
    function targetA(p) {
      if (hover) return (p === hover || adj.get(hover).has(p)) ? 1 : 0.14;
      if (highlight) {
        if (highlight.has(p.id)) return 1;
        for (const m of adj.get(p)) if (highlight.has(m.id)) return 0.4;
        return 0.1;
      }
      return 1;
    }
    const ease = (cur, t, f) => { const d = t - cur; return Math.abs(d) < 0.004 ? [t, false] : [cur + d * f, true]; };

    function frame() {
      raf = 0;
      let moving = false;
      if (alpha > 0.004 || alphaTarget > 0) { tick(); moving = true; }
      if (pendingFit && alpha < 0.05) { applyFit(pendingFit.ids, pendingFit.maxK); pendingFit = null; }
      if (inertia) {
        cam.x += inertia.vx; cam.y += inertia.vy;
        inertia.vx *= 0.9; inertia.vy *= 0.9;
        if (Math.abs(inertia.vx) + Math.abs(inertia.vy) < 0.2) inertia = null;
        moving = true;
      }
      if (camT) {
        const f = reduce.matches ? 1 : 0.16;
        cam.x += (camT.x - cam.x) * f; cam.y += (camT.y - cam.y) * f; cam.k += (camT.k - cam.k) * f;
        if (Math.abs(camT.x - cam.x) < 0.3 && Math.abs(camT.y - cam.y) < 0.3 && Math.abs(camT.k - cam.k) < 0.001) { Object.assign(cam, camT); camT = null; }
        moving = true;
      }
      for (const p of nodes) {
        let m1, m2;
        [p.a, m1] = ease(p.a, targetA(p), 0.14);
        [p.s, m2] = ease(p.s, p === hover ? 1.35 : 1, 0.2);
        if (m1 || m2) moving = true;
        if (p.cc && p.tc) for (let i = 0; i < 3; i++) {
          const d = p.tc[i] - p.cc[i];
          if (Math.abs(d) > 0.5) { p.cc[i] += d * 0.12; moving = true; } else p.cc[i] = p.tc[i];
        }
      }
      draw();
      if (moving || drag) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf) raf = requestAnimationFrame(frame); }

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (!nodes.length) return;
      const ox = W / 2 + cam.x, oy = H / 2 + cam.y, k = cam.k;
      const X = (p) => p.x * k + ox, Y = (p) => p.y * k + oy;

      // 连线：先画普通的，再画高亮的，保证高亮线在上层
      ctx.lineCap = 'round';
      const lw = Math.max(0.7, Math.min(1.6, k * 1.1));
      const lineRGB = hex(colors.line);
      for (const e of edges) {
        const hot = hover && (e.s === hover || e.t === hover);
        if (hot) continue;
        const a = Math.min(e.s.a, e.t.a);
        if (a < 0.02) continue;
        const x1 = X(e.s), y1 = Y(e.s), x2 = X(e.t), y2 = Y(e.t);
        // 同一分组内的连线用分组颜色，渐变过渡；其他连线用中性色
        if (mode === 'group' && e.s.group && e.s.group === e.t.group) {
          const g = ctx.createLinearGradient(x1, y1, x2, y2);
          g.addColorStop(0, rgba(e.s.cc, 0.55)); g.addColorStop(1, rgba(e.t.cc, 0.55));
          ctx.strokeStyle = g; ctx.lineWidth = lw * 1.25;
        } else { ctx.strokeStyle = rgba(lineRGB, 1); ctx.lineWidth = lw; }
        ctx.globalAlpha = 0.85 * a;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      if (hover) {
        ctx.lineWidth = 1.8; ctx.globalAlpha = 0.95;
        for (const e of edges) {
          if (e.s !== hover && e.t !== hover) continue;
          const x1 = X(e.s), y1 = Y(e.s), x2 = X(e.t), y2 = Y(e.t);
          const g = ctx.createLinearGradient(x1, y1, x2, y2);
          g.addColorStop(0, rgba(e.s.cc, 1)); g.addColorStop(1, rgba(e.t.cc, 1));
          ctx.strokeStyle = g;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        }
      }

      // 节点：柔和光晕 + 径向渐变 + 高光，标签是空心环
      for (const p of nodes) {
        const x = X(p), y = Y(p), r = Math.max(2.2, p.r * k) * p.s;
        const c = p.cc || hex(colors.tag);
        ctx.globalAlpha = Math.max(0.06, p.a);
        if (p.kind === 'tag') {
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = colors.bg; ctx.fill();
          ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(c, 1); ctx.stroke();
          continue;
        }
        const halo = r + (p === hover ? 9 : 4.5);
        const hg = ctx.createRadialGradient(x, y, r * 0.6, x, y, halo);
        hg.addColorStop(0, rgba(c, p === hover ? 0.45 : 0.22)); hg.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(x, y, halo, 0, Math.PI * 2); ctx.fill();
        const light = mix(c, [255, 255, 255], dark ? 0.35 : 0.3), deep = mix(c, bgRGB, dark ? 0.18 : 0.08);
        const fg = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
        fg.addColorStop(0, rgba(light, 1)); fg.addColorStop(0.55, rgba(c, 1)); fg.addColorStop(1, rgba(deep, 1));
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        if (r > 4) {
          ctx.lineWidth = 1; ctx.strokeStyle = rgba(mix(c, [255, 255, 255], 0.5), dark ? 0.35 : 0.55);
          ctx.beginPath(); ctx.arc(x, y, r - 0.5, 0, Math.PI * 2); ctx.stroke();
        }
      }

      // 文字：缩小时淡出；按优先级放置，互相重叠的就不画，避免糊成一片
      ctx.font = FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.lineJoin = 'round';
      const zoomFade = nodes.length <= 40 ? 1 : clamp((k - 0.55) / 0.45, 0, 1);
      const cand = [];
      for (const p of nodes) {
        const near = hover && (p === hover || adj.get(hover).has(p));
        const hit = highlight && highlight.has(p.id);
        let op = near ? 1 : (hover ? 0 : (hit ? 1 : zoomFade) * p.a);
        if (p.kind === 'tag' && !near && !hit) op *= 0.75;
        if (op < 0.05) continue;
        const x = X(p), y = Y(p) + Math.max(2.2, p.r * k) * p.s + 4;
        if (x < -100 || x > W + 100 || y < -30 || y > H + 30) continue;
        const pri = (p === hover ? 1e6 : 0) + (near ? 1e5 : 0) + (hit ? 1e4 : 0) + p.deg * 10 + (p.kind === 'tag' ? 0 : 5);
        cand.push({ p, x, y, op, pri });
      }
      cand.sort((a, b) => b.pri - a.pri);
      const boxes = [];
      for (const c of cand) {
        const w = ctx.measureText(c.p.text).width;
        const b = { x0: c.x - w / 2 - 3, x1: c.x + w / 2 + 3, y0: c.y - 1, y1: c.y + 15 };
        if (boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0)) continue;
        boxes.push(b);
        ctx.globalAlpha = c.op;
        ctx.lineWidth = 4; ctx.strokeStyle = colors.bg; ctx.strokeText(c.p.text, c.x, c.y);
        ctx.fillStyle = c.p.kind === 'tag' ? colors.muted : colors.fg;
        ctx.fillText(c.p.text, c.x, c.y);
      }
      ctx.globalAlpha = 1;
    }

    // ---------- 视角 ----------
    function toWorld(sx, sy) { return { x: (sx - W / 2 - cam.x) / cam.k, y: (sy - H / 2 - cam.y) / cam.k }; }
    function hit(sx, sy) {
      const w = toWorld(sx, sy);
      let best = null, bd = Infinity;
      for (const p of nodes) {
        const d = Math.hypot(p.x - w.x, p.y - w.y);
        if (d < p.r + 9 / cam.k && d < bd) { best = p; bd = d; }
      }
      return best;
    }
    function fit(ids, maxK = 1.6) {
      pendingFit = alpha > 0.05 ? { ids, maxK } : null;
      applyFit(ids, maxK);
    }
    function applyFit(ids, maxK, instant) {
      const list = ids ? nodes.filter((n) => ids.has(n.id)) : nodes;
      if (!list.length) return;
      if (!W) { if (instant) needFit = true; return; }
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of list) { x0 = Math.min(x0, p.x - p.r); y0 = Math.min(y0, p.y - p.r); x1 = Math.max(x1, p.x + p.r); y1 = Math.max(y1, p.y + p.r + 18); }
      const k = clamp(Math.min((W - 140) / Math.max(x1 - x0, 1), (H - 140) / Math.max(y1 - y0, 1)), 0.3, maxK);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const t = { x: -cx * k, y: -cy * k, k };
      if (instant) { Object.assign(cam, t); camT = null; } else camT = t;
      kick();
    }
    function setHighlight(set, doFit) {
      highlight = set || null;
      if (doFit) fit(highlight && highlight.size ? highlight : null, highlight ? 1.6 : 1.6);
      kick();
    }
    function zoomAt(mx, my, k2, smooth) {
      const base = smooth && camT ? camT : cam;
      k2 = clamp(k2, 0.2, 4);
      const wx = (mx - W / 2 - base.x) / base.k, wy = (my - H / 2 - base.y) / base.k;
      const t = { x: mx - W / 2 - wx * k2, y: my - H / 2 - wy * k2, k: k2 };
      pendingFit = null; inertia = null;
      if (smooth && !reduce.matches) camT = t; else { Object.assign(cam, t); camT = null; }
      kick();
    }

    // ---------- 交互 ----------
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      const p = pos(e);
      pointers.set(e.pointerId, p);
      camT = null; pendingFit = null; inertia = null;
      if (pointers.size === 2) {
        if (drag && drag.n) { drag.n.fx = drag.n.fy = null; alphaTarget = 0; }
        const [a, b] = [...pointers.values()];
        drag = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), k0: cam.k, moved: true };
        return;
      }
      const n = hit(p.x, p.y);
      drag = n ? { mode: 'node', n, sx: p.x, sy: p.y, moved: false }
        : { mode: 'pan', sx: p.x, sy: p.y, cx: cam.x, cy: cam.y, moved: false, lx: p.x, ly: p.y, lt: e.timeStamp, vx: 0, vy: 0 };
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = pos(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
      if (!drag) {
        const n = hit(p.x, p.y);
        if (n !== hover) { hover = n; canvas.style.cursor = n ? 'pointer' : 'grab'; kick(); }
        return;
      }
      if (drag.mode === 'pinch') {
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, drag.k0 * Math.hypot(a.x - b.x, a.y - b.y) / drag.d0, false);
        }
        return;
      }
      if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) > 4) {
        drag.moved = true;
        if (drag.mode === 'node') { alphaTarget = 0.3; alpha = Math.max(alpha, 0.3); hover = drag.n; }
      }
      if (!drag.moved) return;
      if (drag.mode === 'node') {
        const w = toWorld(p.x, p.y);
        drag.n.fx = w.x; drag.n.fy = w.y;
        canvas.style.cursor = 'grabbing';
      } else {
        cam.x = drag.cx + p.x - drag.sx; cam.y = drag.cy + p.y - drag.sy;
        const dt = Math.max(1, e.timeStamp - drag.lt);
        drag.vx = clamp((p.x - drag.lx) / Math.max(dt, 8) * 16, -28, 28); drag.vy = clamp((p.y - drag.ly) / Math.max(dt, 8) * 16, -28, 28);
        drag.lx = p.x; drag.ly = p.y; drag.lt = e.timeStamp;
        canvas.style.cursor = 'grabbing';
      }
      kick();
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      if (!drag) return;
      if (drag.mode === 'node') {
        drag.n.fx = drag.n.fy = null;
        alphaTarget = 0;
        if (drag.moved) alpha = Math.max(alpha, 0.3);
        if (!drag.moved && opts.onClick) opts.onClick(drag.n);
      } else if (drag.mode === 'pan' && drag.moved && e.type === 'pointerup' && !reduce.matches && e.timeStamp - drag.lt < 80) {
        inertia = { vx: drag.vx, vy: drag.vy };
      }
      if (pointers.size === 0) drag = null;
      canvas.style.cursor = hover ? 'pointer' : 'grab';
      kick();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', () => { if (!drag && hover) { hover = null; kick(); } });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = pos(e);
      const base = camT ? camT.k : cam.k;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(p.x, p.y, base * Math.exp(-clamp(dy, -120, 120) * 0.0022), true);
    }, { passive: false });
    canvas.addEventListener('dblclick', (e) => { if (!hit(pos(e).x, pos(e).y)) fit(); });

    readColors();
    resize();
    return {
      setData, setHighlight, fit, resize,
      refreshColors() { readColors(); kick(); },
      setColorMode(m) { mode = m === 'type' ? 'type' : 'group'; assignColors(false); },
      groups() { return groups; },
      zoom(f) { zoomAt(W / 2, H / 2, (camT ? camT.k : cam.k) * f, true); },
      reheat() { alpha = Math.max(alpha, 0.5); kick(); },
    };
  }
  return { create };
})();

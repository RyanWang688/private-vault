'use strict';
/* 力导向关系图谱（纯 Canvas，无外部依赖） */
window.VGraph = (() => {
  function create(canvas, opts = {}) {
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    let nodes = [], edges = [], byId = new Map(), adj = new Map();
    let alpha = 1, raf = 0, colors = {};
    const cam = { x: 0, y: 0, k: 1 };
    let camT = null, hover = null, highlight = null, drag = null, firstFit = true;
    const pointers = new Map();

    function readColors() {
      const cs = getComputedStyle(canvas);
      const v = (n) => cs.getPropertyValue(n).trim();
      colors = {
        login: v('--c-login'), identity: v('--c-identity'), bank: v('--c-bank'), note: v('--c-note'),
        file: v('--c-file'), tag: v('--c-tag'), fg: v('--fg'), line: v('--line-strong'), bg: v('--bg'), accent: v('--accent'),
      };
    }
    function resize() {
      const r = canvas.getBoundingClientRect();
      if (!r.width) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      kick();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function setData(ns, es) {
      const old = byId;
      byId = new Map();
      nodes = ns.map((n) => {
        const o = old.get(n.id);
        const node = Object.assign(o || { x: (Math.random() - 0.5) * 60, y: (Math.random() - 0.5) * 60, vx: 0, vy: 0, a: 0 }, n);
        byId.set(n.id, node);
        return node;
      });
      edges = es.filter(([s, t]) => byId.has(s) && byId.has(t)).map(([s, t]) => ({ s: byId.get(s), t: byId.get(t) }));
      adj = new Map(nodes.map((n) => [n, new Set()]));
      for (const e of edges) { adj.get(e.s).add(e.t); adj.get(e.t).add(e.s); }
      for (const n of nodes) n.r = n.kind === 'tag' ? 4 : Math.min(15, 6 + Math.sqrt(adj.get(n).size) * 2.4);
      if (hover && !byId.has(hover.id)) hover = null;
      alpha = Math.max(alpha, old.size ? 0.4 : 1);
      if (firstFit && nodes.length) { firstFit = false; setTimeout(() => fit(), 700); }
      kick();
    }

    function tick() {
      if (alpha < 0.003) return;
      const n = nodes.length;
      for (let i = 0; i < n; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < n; j++) {
          const b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
          if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
          if (d2 > 160000) continue;
          const f = ((a.kind === 'tag' || b.kind === 'tag') ? 70 : 150) * alpha / d2;
          a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
        }
      }
      for (const e of edges) {
        const dx = e.t.x - e.s.x, dy = e.t.y - e.s.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const L = (e.s.kind === 'tag' || e.t.kind === 'tag') ? 55 : 85;
        const k = (d - L) / d * alpha * 0.1;
        e.t.vx -= dx * k; e.t.vy -= dy * k; e.s.vx += dx * k; e.s.vy += dy * k;
      }
      for (const p of nodes) {
        if (p.fx != null) { p.x = p.fx; p.y = p.fy; p.vx = p.vy = 0; continue; }
        p.vx -= p.x * 0.012 * alpha; p.vy -= p.y * 0.012 * alpha;
        p.vx *= 0.6; p.vy *= 0.6;
        p.x += p.vx; p.y += p.vy;
      }
      alpha += (0 - alpha) * 0.02;
    }

    function targetA(p) {
      if (hover) return (p === hover || adj.get(hover).has(p)) ? 1 : 0.1;
      if (highlight) return highlight.has(p.id) ? 1 : 0.12;
      return 1;
    }

    function frame() {
      raf = 0;
      const wasHot = alpha >= 0.04;
      tick();
      if (wasHot && alpha < 0.04 && pendingFit) { applyFit(pendingFit.ids, pendingFit.maxK); pendingFit = null; }
      let moving = alpha >= 0.003 || !!drag;
      if (camT) {
        cam.x += (camT.x - cam.x) * 0.14; cam.y += (camT.y - cam.y) * 0.14; cam.k += (camT.k - cam.k) * 0.14;
        if (Math.abs(camT.x - cam.x) < 0.5 && Math.abs(camT.y - cam.y) < 0.5 && Math.abs(camT.k - cam.k) < 0.002) { Object.assign(cam, camT); camT = null; }
        moving = true;
      }
      for (const p of nodes) {
        const t = targetA(p), d = t - p.a;
        if (Math.abs(d) > 0.01) { p.a += d * 0.16; moving = true; } else p.a = t;
      }
      draw();
      if (moving) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf) raf = requestAnimationFrame(frame); }

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const ox = W / 2 + cam.x, oy = H / 2 + cam.y, k = cam.k;
      for (const e of edges) {
        const hot = hover && (e.s === hover || e.t === hover);
        ctx.globalAlpha = hot ? 0.95 : 0.85 * Math.min(e.s.a, e.t.a);
        ctx.strokeStyle = hot ? colors.accent : colors.line;
        ctx.lineWidth = hot ? 1.6 : 1;
        ctx.beginPath();
        ctx.moveTo(e.s.x * k + ox, e.s.y * k + oy);
        ctx.lineTo(e.t.x * k + ox, e.t.y * k + oy);
        ctx.stroke();
      }
      for (const p of nodes) {
        const x = p.x * k + ox, y = p.y * k + oy, r = Math.max(2.5, p.r * k);
        const col = colors[p.type] || colors.tag;
        ctx.globalAlpha = Math.max(0.08, p.a);
        if (p === hover) { ctx.shadowColor = col; ctx.shadowBlur = 18; }
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        if (p.kind === 'tag') {
          ctx.fillStyle = colors.bg; ctx.fill();
          ctx.lineWidth = 1.5; ctx.strokeStyle = col; ctx.stroke();
        } else {
          ctx.fillStyle = col; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = colors.bg; ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }
      ctx.font = '12px system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const p of nodes) {
        const near = hover && (p === hover || adj.get(hover).has(p));
        const show = near || (highlight && highlight.has(p.id)) || k > 1.15 || nodes.length <= 36;
        if (!show || p.a < 0.3) continue;
        const label = p.label.length > 16 ? p.label.slice(0, 15) + '…' : p.label;
        ctx.globalAlpha = p.a * (p.kind === 'tag' ? 0.65 : 0.92);
        ctx.fillStyle = colors.fg;
        ctx.fillText(label, p.x * k + ox, p.y * k + oy + Math.max(2.5, p.r * k) + 5);
      }
      ctx.globalAlpha = 1;
    }

    function toWorld(sx, sy) { return { x: (sx - W / 2 - cam.x) / cam.k, y: (sy - H / 2 - cam.y) / cam.k }; }
    function hit(sx, sy) {
      const w = toWorld(sx, sy);
      let best = null, bd = Infinity;
      for (const p of nodes) {
        const d = Math.hypot(p.x - w.x, p.y - w.y);
        if (d < p.r + 8 / cam.k && d < bd) { best = p; bd = d; }
      }
      return best;
    }

    let pendingFit = null;
    function fit(ids, maxK = 2) {
      pendingFit = { ids, maxK };
      applyFit(ids, maxK);
    }
    function applyFit(ids, maxK) {
      const list = ids ? nodes.filter((n) => ids.has(n.id)) : nodes;
      if (!list.length || !W) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of list) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      const k = Math.max(0.3, Math.min(maxK, (W - 120) / Math.max(x1 - x0, 1), (H - 120) / Math.max(y1 - y0, 1)));
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      camT = { x: -cx * k, y: -cy * k, k };
      kick();
    }

    function setHighlight(set, doFit) {
      highlight = set || null;
      if (doFit) fit(highlight && highlight.size ? highlight : null, highlight ? 1.8 : 2);
      kick();
    }

    // ---- 交互 ----
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      const p = pos(e);
      pointers.set(e.pointerId, p);
      camT = null; pendingFit = null;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        drag = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), k0: cam.k, moved: true };
        return;
      }
      const n = hit(p.x, p.y);
      drag = n ? { mode: 'node', n, sx: p.x, sy: p.y, moved: false } : { mode: 'pan', sx: p.x, sy: p.y, cx: cam.x, cy: cam.y, moved: false };
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = pos(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
      if (!drag) {
        const n = hit(p.x, p.y);
        if (n !== hover) { hover = n; canvas.style.cursor = n ? 'pointer' : 'grab'; kick(); }
        return;
      }
      if (drag.mode === 'pinch' && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        zoomAt(mid.x, mid.y, drag.k0 * Math.hypot(a.x - b.x, a.y - b.y) / drag.d0);
        return;
      }
      if (Math.hypot(p.x - drag.sx, p.y - drag.sy) > 4) drag.moved = true;
      if (!drag.moved) return;
      if (drag.mode === 'node') {
        const w = toWorld(p.x, p.y);
        drag.n.fx = w.x; drag.n.fy = w.y;
        hover = drag.n;
        alpha = Math.max(alpha, 0.25);
      } else if (drag.mode === 'pan') {
        cam.x = drag.cx + p.x - drag.sx; cam.y = drag.cy + p.y - drag.sy;
        canvas.style.cursor = 'grabbing';
      }
      kick();
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      if (!drag) return;
      if (drag.mode === 'node') {
        drag.n.fx = drag.n.fy = null;
        if (!drag.moved && opts.onClick) opts.onClick(drag.n);
      }
      if (pointers.size === 0) drag = null;
      canvas.style.cursor = hover ? 'pointer' : 'grab';
      kick();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', () => { if (!drag && hover) { hover = null; kick(); } });
    function zoomAt(mx, my, k2) {
      k2 = Math.max(0.25, Math.min(4, k2));
      camT = null; pendingFit = null;
      const w = toWorld(mx, my);
      cam.k = k2;
      cam.x = mx - W / 2 - w.x * k2; cam.y = my - H / 2 - w.y * k2;
      kick();
    }
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault(); camT = null; pendingFit = null;
      const p = pos(e);
      zoomAt(p.x, p.y, cam.k * Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    canvas.addEventListener('dblclick', () => fit());

    readColors();
    resize();
    return {
      setData, setHighlight, fit, resize,
      refreshColors() { readColors(); kick(); },
      zoom(f) { zoomAt(W / 2, H / 2, cam.k * f); },
      reheat() { alpha = Math.max(alpha, 0.6); kick(); },
    };
  }
  return { create };
})();

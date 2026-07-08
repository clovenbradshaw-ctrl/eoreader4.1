// mountTieredGraph — the pivotable tiered graph surface. Entities as nodes
// across the three helix tiers — existence (the source and the figures INSed
// from it), structure (the bonds between them, each reified and wearing its
// operator), significance (the claims those bonds trace to) — connected by
// operator edges. Three switchable layouts (flow · tiers · radial) with
// animated pivoting, tier filtering, pan/zoom/fit, and click-to-inspect.
//
// The host builds the {nodes, edges} data honestly from the record
// (app.dc.js _tieredGraphData); this module only draws. Pure DOM + SVG, no
// dependencies; returns { destroy }.
//
//   nodes: [{ id, tier: 0|1|2, label, kind, ref }]
//   edges: [{ a, b, tier, gl, code }]   — a → b, gl = operator glyph
//   onOpen(node)  optional — "open →" in the inspector for kinds that navigate

const TIER = {
  0: { fill: '#7F77DD', stroke: '#534AB7', edge: '#7F77DD', name: 'existence',    chipBg: '#EEEDFE', chipFg: '#3C3489', glyphs: '∅○●' },
  1: { fill: '#1D9E75', stroke: '#0F6E56', edge: '#1D9E75', name: 'structure',    chipBg: '#E1F5EE', chipFg: '#085041', glyphs: '｜⋈△' },
  2: { fill: '#EF9F27', stroke: '#BA7517', edge: '#EF9F27', name: 'significance', chipBg: '#FAEEDA', chipFg: '#633806', glyphs: '⊢⊨⊛' },
};

const STYLE_ID = 'eo-tg-style';
const CSS = `
.eo-tg{font-family:var(--sans,system-ui,sans-serif);color:var(--ink,#15181e);}
.eo-tg .tg-btn{font-size:12px;padding:5px 10px;border:1px solid var(--line2,#e5e7eb);border-radius:7px;background:var(--card,#fff);color:var(--ink2,#555);cursor:pointer;display:inline-flex;align-items:center;gap:5px;line-height:1.2;}
.eo-tg .tg-btn:hover{background:var(--app,#f4f5f7);}
.eo-tg .tg-btn.on{background:var(--ink,#15181e);color:var(--card,#fff);border-color:var(--ink,#15181e);}
.eo-tg .tg-chip{font-size:11px;padding:4px 9px;border-radius:7px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;border:1px solid transparent;user-select:none;}
.eo-tg .tg-chip .gl{font-size:13px;letter-spacing:2px;font-family:var(--mono,ui-monospace,Menlo,monospace);}
.eo-tg .tg-chip.off{opacity:0.35;}
.eo-tg .tg-seg{display:inline-flex;border:1px solid var(--line2,#e5e7eb);border-radius:8px;overflow:hidden;}
.eo-tg .tg-seg .tg-btn{border:none;border-radius:0;}
.eo-tg .tg-node{cursor:pointer;}
.eo-tg .tg-node circle{transition:r .15s;}
`;

const NS = 'http://www.w3.org/2000/svg';

export function mountTieredGraph(root, { nodes: inNodes = [], edges: inEdges = [], onOpen = null, countsLabel = '' } = {}) {
  if (!document.getElementById(STYLE_ID)) {
    const st = document.createElement('style'); st.id = STYLE_ID; st.textContent = CSS; document.head.appendChild(st);
  }
  const el = (t, a = {}) => { const e = document.createElement(t); for (const k in a) { if (k === 'text') e.textContent = a[k]; else if (k === 'html') e.innerHTML = a[k]; else e.setAttribute(k, a[k]); } return e; };
  const sv = (t, a = {}) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const nodes = inNodes.map((n) => ({ ...n, x: 340, y: 220, px: 340, py: 220, tx: 340, ty: 220, rank: 0 }));
  const byId = {}; nodes.forEach((n) => byId[n.id] = n);
  const edges = inEdges.filter((e) => byId[e.a] && byId[e.b]);

  // rank = longest path from a root, over the (acyclic by construction) DAG
  const indeg = {}; nodes.forEach((n) => indeg[n.id] = 0);
  edges.forEach((e) => indeg[e.b]++);
  const order = [], q = nodes.filter((n) => indeg[n.id] === 0).map((n) => n.id);
  const din = {}; nodes.forEach((n) => din[n.id] = indeg[n.id]);
  while (q.length) { const id = q.shift(); order.push(id); edges.forEach((e) => { if (e.a === id) { din[e.b]--; if (din[e.b] === 0) q.push(e.b); } }); }
  order.forEach((id) => { const n = byId[id]; edges.forEach((e) => { if (e.b === id) n.rank = Math.max(n.rank, byId[e.a].rank + 1); }); });
  let maxRank = 0; nodes.forEach((n) => maxRank = Math.max(maxRank, n.rank));

  const W = 680, H = 440, state = { layout: 'radial', orient: 'h', rot: 0, tiers: { 0: true, 1: true, 2: true }, sel: null };

  // ── shell ────────────────────────────────────────────────────────────────
  const wrap = el('div', { class: 'eo-tg', role: 'region', 'aria-label': 'Interactive record graph: nodes across three helix tiers, connected by operator edges' });
  wrap.innerHTML =
    '<div style="border:1px solid var(--line,#e5e7eb);border-radius:12px;overflow:hidden;background:var(--card,#fff);">' +
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border-bottom:1px solid var(--line,#e5e7eb);background:var(--app,#f7f8fb);">' +
      '<div class="tg-seg">' +
        '<button class="tg-btn" data-layout="flow">⇢ flow</button>' +
        '<button class="tg-btn" data-layout="tiers">≡ tiers</button>' +
        '<button class="tg-btn on" data-layout="radial">◎ radial</button>' +
      '</div>' +
      '<button class="tg-btn" data-pivot>⟲ <span data-pivot-lbl>rotate</span></button>' +
      '<div style="display:flex;gap:5px;margin-left:auto;">' +
        '<button class="tg-btn" data-zin aria-label="zoom in">+</button>' +
        '<button class="tg-btn" data-zout aria-label="zoom out">−</button>' +
        '<button class="tg-btn" data-fit>⌖ fit</button>' +
      '</div>' +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:7px;padding:8px 12px;border-bottom:1px solid var(--line,#e5e7eb);">' +
      '<span style="font-size:11px;color:var(--ink3,#999);letter-spacing:.04em;margin-right:2px;">tiers</span>' +
      [0, 1, 2].map((t) => '<span class="tg-chip" data-tier="' + t + '" style="background:' + TIER[t].chipBg + ';color:' + TIER[t].chipFg + ';"><span class="gl">' + TIER[t].glyphs + '</span>' + TIER[t].name + '</span>').join('') +
    '</div>' +
    '<div style="position:relative;background:var(--card,#fff);background-image:radial-gradient(var(--line,#e5e7eb) 0.5px,transparent 0.5px);background-size:16px 16px;">' +
      '<svg data-svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;touch-action:none;cursor:grab;">' +
        '<defs><marker data-marker markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L5,3 L0,6 Z" fill="#B4B2A9"/></marker></defs>' +
        '<g data-vp><g data-edges></g><g data-nodes></g><g data-labels></g></g>' +
      '</svg>' +
    '</div>' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:9px;padding:9px 13px;border-top:1px solid var(--line,#e5e7eb);background:var(--app,#f7f8fb);font-size:12px;color:var(--ink2,#555);min-height:20px;">' +
      '<div data-detail style="display:flex;align-items:center;gap:9px;min-width:0;flex:1;"><span style="color:var(--ink3,#999);">click a node to inspect · drag to pan · scroll to zoom</span></div>' +
      '<span data-counts style="font-family:var(--mono,ui-monospace,monospace);color:var(--ink3,#999);flex:0 0 auto;">' + esc(countsLabel) + '</span>' +
    '</div>' +
    '</div>';
  root.appendChild(wrap);

  // the marker id must be unique per mount or filters collide across mounts
  const mk = 'tg-eh-' + Math.floor(Math.random() * 1e9);
  wrap.querySelector('[data-marker]').setAttribute('id', mk);

  const svg = wrap.querySelector('[data-svg]'), gN = wrap.querySelector('[data-nodes]'), gE = wrap.querySelector('[data-edges]'), gL = wrap.querySelector('[data-labels]'), vp = wrap.querySelector('[data-vp]');
  const detail = wrap.querySelector('[data-detail]'), countsEl = wrap.querySelector('[data-counts]');

  // ── layouts ──────────────────────────────────────────────────────────────
  function layoutFlow() {
    const byRank = {}; nodes.forEach((n) => (byRank[n.rank] = byRank[n.rank] || []).push(n));
    const horiz = state.orient === 'h';
    nodes.forEach((n) => {
      const arr = byRank[n.rank], idx = arr.indexOf(n), cnt = arr.length;
      const along = 60 + (n.rank / (maxRank || 1)) * ((horiz ? W : H) - 120);
      const cross = cnt < 2 ? (horiz ? H : W) / 2 : 40 + (idx / (cnt - 1)) * ((horiz ? H : W) - 80);
      if (horiz) { n.tx = along; n.ty = cross; } else { n.tx = cross; n.ty = along; }
    });
  }
  function layoutTiers() {
    const horiz = state.orient === 'h';
    const groups = { 0: [], 1: [], 2: [] }; nodes.forEach((n) => groups[n.tier].push(n));
    [0, 1, 2].forEach((t) => {
      const arr = groups[t], n = arr.length;
      if (horiz) {
        const bandY = 70 + t * ((H - 140) / 2), perRow = Math.ceil(n / 2);
        arr.forEach((nd, k) => { const row = Math.floor(k / perRow), col = k % perRow, rc = Math.min(perRow, n - row * perRow);
          nd.tx = 70 + (rc < 2 ? 0.5 : col / (rc - 1)) * (W - 140) * (rc < 2 ? 0 : 1) + (rc < 2 ? (W - 140) / 2 : 0);
          nd.ty = bandY - 16 + row * 40; });
      } else {
        const bandX = 90 + t * ((W - 180) / 2), perCol = Math.ceil(n / 2);
        arr.forEach((nd, k) => { const col = Math.floor(k / perCol), row = k % perCol, cc = Math.min(perCol, n - col * perCol);
          nd.ty = 60 + (cc < 2 ? 0.5 : row / (cc - 1)) * (H - 120) * (cc < 2 ? 0 : 1) + (cc < 2 ? (H - 120) / 2 : 0);
          nd.tx = bandX - 16 + col * 40; });
      }
    });
  }
  function layoutRadial() {
    const cx = W / 2, cy = H / 2, groups = { 0: [], 1: [], 2: [] }; nodes.forEach((n) => groups[n.tier].push(n));
    [0, 1, 2].forEach((t) => {
      const arr = groups[t], n = arr.length, r = 55 + t * 78;
      arr.forEach((nd, k) => { const a = state.rot * Math.PI / 180 + (k / Math.max(1, n)) * Math.PI * 2; nd.tx = cx + Math.cos(a) * r; nd.ty = cy + Math.sin(a) * r; });
    });
  }
  function relayout() {
    if (state.layout === 'flow') layoutFlow(); else if (state.layout === 'tiers') layoutTiers(); else layoutRadial();
    animate();
  }

  // ── marks ────────────────────────────────────────────────────────────────
  const nodeEls = {}, edgeEls = [];
  nodes.forEach((n) => {
    const g = sv('g', { class: 'tg-node' }); g.style.transform = 'translate(' + n.x + 'px,' + n.y + 'px)';
    const c = sv('circle', { r: n.kind === 'doc' ? 9 : 7, fill: TIER[n.tier].fill, stroke: TIER[n.tier].stroke, 'stroke-width': 1.2 });
    g.appendChild(c);
    g.addEventListener('click', (ev) => { ev.stopPropagation(); select(n.id); });
    g.addEventListener('mouseenter', () => hover(n)); g.addEventListener('mouseleave', () => { if (!state.sel) clearLabels(); });
    gN.appendChild(g); nodeEls[n.id] = { g, c };
  });
  edges.forEach((e) => { const p = sv('path', { fill: 'none', stroke: TIER[e.tier].edge, 'stroke-width': 1, 'stroke-opacity': 0.45, 'marker-end': 'url(#' + mk + ')' }); gE.appendChild(p); edgeEls.push({ p, e }); });

  function edgePath(a, b) {
    const dx = b.tx - a.tx, dy = b.ty - a.ty, mx = (a.tx + b.tx) / 2 - dy * 0.08, my = (a.ty + b.ty) / 2 + dx * 0.08;
    const ux = b.tx - mx, uy = b.ty - my, L = Math.hypot(ux, uy) || 1, ex = b.tx - ux / L * 9, ey = b.ty - uy / L * 9;
    return 'M' + a.tx.toFixed(1) + ',' + a.ty.toFixed(1) + ' Q' + mx.toFixed(1) + ',' + my.toFixed(1) + ' ' + ex.toFixed(1) + ',' + ey.toFixed(1);
  }

  let animT = null;
  function animate() {
    nodes.forEach((n) => { n.px = n.x; n.py = n.y; });
    const start = performance.now(), dur = 460;
    if (animT) cancelAnimationFrame(animT);
    function frame(t) {
      const k = Math.min(1, (t - start) / dur), e = 1 - Math.pow(1 - k, 3);
      nodes.forEach((n) => { n.x = n.px + (n.tx - n.px) * e; n.y = n.py + (n.ty - n.py) * e;
        nodeEls[n.id].g.style.transform = 'translate(' + n.x.toFixed(1) + 'px,' + n.y.toFixed(1) + 'px)'; });
      drawEdges(true);
      if (k < 1) animT = requestAnimationFrame(frame); else drawEdges(false);
    }
    animT = requestAnimationFrame(frame);
  }
  function drawEdges(mid) {
    edgeEls.forEach((o) => { const a = byId[o.e.a], b = byId[o.e.b];
      const A = mid ? { tx: a.x, ty: a.y } : a, B = mid ? { tx: b.x, ty: b.y } : b;
      o.p.setAttribute('d', edgePath(A, B)); });
  }

  function applyFilter() {
    nodes.forEach((n) => { nodeEls[n.id].g.style.opacity = state.tiers[n.tier] ? 1 : 0.08; nodeEls[n.id].g.style.pointerEvents = state.tiers[n.tier] ? 'auto' : 'none'; });
    edgeEls.forEach((o) => { const vis = state.tiers[byId[o.e.a].tier] && state.tiers[byId[o.e.b].tier]; o.p.style.opacity = vis ? 1 : 0.05; });
  }

  function neighborSet(id) { const s = {}; edges.forEach((e) => { if (e.a === id) s[e.b] = 1; if (e.b === id) s[e.a] = 1; }); return s; }
  function clearLabels() { gL.innerHTML = ''; nodes.forEach((n) => nodeEls[n.id].c.setAttribute('r', n.kind === 'doc' ? 9 : 7)); }
  function label(n) {
    const g = sv('g', {}); let tx = n.x + 11, anchor = 'start'; if (n.x > W - 90) { tx = n.x - 11; anchor = 'end'; }
    const t = sv('text', { x: tx, y: n.y + 3.5, 'text-anchor': anchor, 'font-size': 11, fill: 'var(--ink,#15181e)' }); t.textContent = n.label;
    const bg = sv('rect', { fill: 'var(--card,#fff)', 'fill-opacity': 0.85 }); g.appendChild(bg); g.appendChild(t); gL.appendChild(g);
    const bb = t.getBBox(); bg.setAttribute('x', bb.x - 2); bg.setAttribute('y', bb.y - 1); bg.setAttribute('width', bb.width + 4); bg.setAttribute('height', bb.height + 2); bg.setAttribute('rx', 3);
  }
  function hover(n) { if (state.sel) return; clearLabels(); nodeEls[n.id].c.setAttribute('r', 9); label(n); }

  function select(id) {
    state.sel = id; const nb = neighborSet(id); clearLabels();
    nodes.forEach((n) => { nodeEls[n.id].g.style.opacity = (n.id === id || nb[n.id]) ? 1 : 0.12; });
    edgeEls.forEach((o) => { const inc = o.e.a === id || o.e.b === id; o.p.setAttribute('stroke-width', inc ? 2 : 1); o.p.setAttribute('stroke-opacity', inc ? 0.9 : 0.08); });
    nodeEls[id].c.setAttribute('r', 9); label(byId[id]); Object.keys(nb).forEach((k) => label(byId[k]));
    const n = byId[id], ins = edges.filter((e) => e.b === id), outs = edges.filter((e) => e.a === id);
    const glyphs = (arr) => arr.map((e) => e.gl).join(' ') || '—';
    countsEl.style.display = 'none';   // the inspector needs the full footer row
    detail.innerHTML = '<span style="width:16px;height:16px;flex:0 0 auto;border-radius:5px;background:' + TIER[n.tier].fill + ';display:inline-block;"></span>' +
      '<span style="color:var(--ink,#15181e);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:34%;">' + esc(n.label) + '</span>' +
      '<span style="color:var(--ink3,#999);">' + TIER[n.tier].name + '</span>' +
      '<span style="color:var(--ink2,#555);white-space:nowrap;">in <span style="font-size:14px;font-family:var(--mono,monospace);">' + esc(glyphs(ins)) + '</span></span>' +
      '<span style="color:var(--ink2,#555);white-space:nowrap;">out <span style="font-size:14px;font-family:var(--mono,monospace);">' + esc(glyphs(outs)) + '</span></span>';
    if (onOpen && (n.kind === 'ent' || n.kind === 'doc')) {
      const b = el('button', { class: 'tg-btn', text: 'open →' }); b.style.marginLeft = 'auto'; b.style.flex = '0 0 auto';
      b.addEventListener('click', () => onOpen(n)); detail.appendChild(b);
    }
  }
  function deselect() {
    state.sel = null; clearLabels();
    edgeEls.forEach((o) => { o.p.setAttribute('stroke-width', 1); o.p.setAttribute('stroke-opacity', 0.45); }); applyFilter();
    detail.innerHTML = '<span style="color:var(--ink3,#999);">click a node to inspect · drag to pan · scroll to zoom</span>';
    countsEl.style.display = '';
  }

  // ── pan / zoom ───────────────────────────────────────────────────────────
  const view = { x: 0, y: 0, k: 1 };
  function apply() { vp.setAttribute('transform', 'translate(' + view.x.toFixed(1) + ',' + view.y.toFixed(1) + ') scale(' + view.k.toFixed(3) + ')'); }
  function fit() {
    const xs = nodes.map((n) => n.tx), ys = nodes.map((n) => n.ty);
    const minx = Math.min.apply(0, xs) - 30, maxx = Math.max.apply(0, xs) + 30, miny = Math.min.apply(0, ys) - 30, maxy = Math.max.apply(0, ys) + 30;
    const k = Math.min(W / (maxx - minx), H / (maxy - miny), 1.6); view.k = k; view.x = (W - (minx + maxx) * k) / 2; view.y = (H - (miny + maxy) * k) / 2; apply();
  }

  let drag = null;
  const onDown = (e) => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; svg.style.cursor = 'grabbing'; svg.setPointerCapture(e.pointerId); };
  const onMove = (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    const r = svg.getBoundingClientRect(), sc = W / r.width; view.x = drag.vx + dx * sc; view.y = drag.vy + dy * sc; apply(); };
  const onUp = () => { if (drag && !drag.moved) deselect(); drag = null; svg.style.cursor = 'grab'; };
  const onWheel = (e) => { e.preventDefault(); const r = svg.getBoundingClientRect(), sc = W / r.width;
    const mx = (e.clientX - r.left) * sc, my = (e.clientY - r.top) * sc, f = e.deltaY < 0 ? 1.12 : 1 / 1.12, nk = Math.max(0.4, Math.min(3, view.k * f));
    view.x = mx - (mx - view.x) * (nk / view.k); view.y = my - (my - view.y) * (nk / view.k); view.k = nk; apply(); };
  svg.addEventListener('pointerdown', onDown); svg.addEventListener('pointermove', onMove); svg.addEventListener('pointerup', onUp);
  svg.addEventListener('wheel', onWheel, { passive: false });

  // ── controls ─────────────────────────────────────────────────────────────
  wrap.querySelectorAll('[data-layout]').forEach((b) => b.addEventListener('click', () => {
    wrap.querySelectorAll('[data-layout]').forEach((x) => x.classList.remove('on')); b.classList.add('on');
    state.layout = b.dataset.layout;
    wrap.querySelector('[data-pivot-lbl]').textContent = state.layout === 'radial' ? 'rotate' : 'pivot';
    relayout(); setTimeout(fit, 470);
  }));
  wrap.querySelector('[data-pivot]').addEventListener('click', () => {
    if (state.layout === 'radial') state.rot = (state.rot + 45) % 360; else state.orient = state.orient === 'h' ? 'v' : 'h';
    relayout(); setTimeout(fit, 470);
  });
  wrap.querySelectorAll('[data-tier]').forEach((ch) => ch.addEventListener('click', () => {
    const t = ch.dataset.tier; state.tiers[t] = !state.tiers[t]; ch.classList.toggle('off', !state.tiers[t]);
    if (state.sel) deselect(); else applyFilter();
  }));
  wrap.querySelector('[data-zin]').addEventListener('click', () => { view.k = Math.min(3, view.k * 1.2); apply(); });
  wrap.querySelector('[data-zout]').addEventListener('click', () => { view.k = Math.max(0.4, view.k / 1.2); apply(); });
  wrap.querySelector('[data-fit]').addEventListener('click', fit);

  layoutRadial(); nodes.forEach((n) => { n.x = n.tx; n.y = n.ty; nodeEls[n.id].g.style.transform = 'translate(' + n.x + 'px,' + n.y + 'px)'; });
  drawEdges(false); applyFilter(); fit();

  return { destroy() { if (animT) cancelAnimationFrame(animT); wrap.remove(); } };
}

// doc/render.js — the document as a Google-Docs-style page: a paper canvas of
// grounded blocks, with pending edits shown as suggestions (Google Docs'
// "Suggesting" mode) and a margin card per change to accept or reject.
//
// Pure string work over projectDoc(log): render twice, get the same bytes. The
// surface (surface.js) owns interaction and re-renders on every log append.
//
// Prior art adopted: Google Docs suggesting mode (insertions coloured +
// underlined, deletions struck, a margin card per suggestion with ✓/✗) and its
// three view modes (Editing · Suggesting · Viewing). The EO twist: the colour is
// the GROUNDING — green when the edit binds to the Record, amber when it "leaves
// the record" and can only be kept as void.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The provenance marker worn by a committed block: green ⚓ when it stands on a
// recorded span, grey ○ when it is the writer's own (the void), marked so.
const blockMark = (g) => g && g.kind === 'source'
  ? `<sup class="doc-pm doc-pm-src" data-span="${esc((g.span && g.span.id) || '')}" title="Grounded to a recorded read${g.srcId ? ' · ' + esc(g.srcId) : ''}${g.host ? ' · ' + esc(g.host) : ''} — click to see the passage">⚓</sup>`
  : `<sup class="doc-pm doc-pm-void" title="The writer's own words — grounded to the void, not to a recorded span">○</sup>`;

// One committed block, optionally shown with the replace/delete suggestion that
// targets it (suggesting mode only).
const committedBlock = (b, { mode, replace, del }) => {
  const editable = mode === 'editing' ? ' contenteditable="true" spellcheck="false"' : '';
  const delBtn = mode === 'editing'
    ? `<button class="doc-del" data-del="${esc(b.id)}" title="Delete this line">✕</button>` : '';
  if (mode === 'suggesting' && del) {
    return `<p class="doc-block doc-sugg-del" data-block="${esc(b.id)}"><span class="doc-strike">${esc(b.text)}</span>${blockMark(b.grounding)}</p>`;
  }
  if (mode === 'suggesting' && replace) {
    const tone = replace.grounding && replace.grounding.grounded ? 'src' : 'void';
    return `<p class="doc-block" data-block="${esc(b.id)}"><span class="doc-strike">${esc(b.text)}</span> <span class="doc-ins doc-ins-${tone}">${esc(replace.text)}</span></p>`;
  }
  return `<p class="doc-block"${editable} data-block="${esc(b.id)}"><span class="doc-text">${esc(b.text)}</span>${blockMark(b.grounding)}${delBtn}</p>`;
};

// A pending insert shown at its anchor as a ghost line (suggesting mode).
const insertGhost = (ch) => {
  const tone = ch.grounding && ch.grounding.grounded ? 'src' : 'void';
  return `<p class="doc-block doc-ghost" data-block="ghost:${esc(ch.id)}"><span class="doc-ins doc-ins-${tone}">${esc(ch.text)}</span></p>`;
};

// The margin card for one pending change — author, what it grounds to, ✓/✗.
const changeCard = (ch) => {
  const grounded = !!(ch.grounding && ch.grounding.grounded);
  const tone = grounded ? 'src' : 'void';
  const verb = ch.kind === 'insert' ? 'suggested a line' : ch.kind === 'replace' ? 'suggested a rewrite' : 'suggested a deletion';
  const groundLine = grounded
    ? `<span class="doc-card-ground doc-card-ground-src"><span class="doc-i">⚓</span>grounds to ${esc(ch.grounding.srcId || 'the record')}${ch.grounding.host ? ' · ' + esc(ch.grounding.host) : ''}</span>`
    : `<span class="doc-card-ground doc-card-ground-void"><span class="doc-i">⚠</span>leaves the record</span>`;
  const passage = grounded && ch.grounding.span
    ? `<div class="doc-card-passage">“${esc(ch.grounding.span.text)}”</div>` : '';
  const note = grounded ? '' :
    `<div class="doc-card-note">No recorded passage backs this. Accepting it moves the line to the void — the writer's own words, marked so.</div>`;
  const acceptLabel = grounded ? '✓ Accept' : '✓ Accept as void';
  const before = ch.kind !== 'insert' && ch.before
    ? `<div class="doc-card-before">${esc(ch.before)}</div>` : '';
  const after = ch.kind !== 'delete'
    ? `<div class="doc-card-after doc-ins-${tone}">${esc(ch.text)}</div>` : '';
  return `<div class="doc-card doc-card-${tone}" data-card="${esc(ch.id)}" data-anchor="${esc(ch.kind === 'insert' ? (ch.afterId || '') : ch.targetId || '')}">
    <div class="doc-card-head"><span class="doc-card-who">${esc(ch.author || 'you')}</span> ${verb}${ch.when ? ` <span class="doc-card-when">· ${esc(ch.when)}</span>` : ''}</div>
    ${before}${after}
    <div class="doc-card-groundrow">${groundLine}</div>${passage}${note}
    <div class="doc-card-actions">
      <button class="doc-accept doc-accept-${tone}" data-accept="${esc(ch.id)}">${acceptLabel}</button>
      <button class="doc-reject" data-reject="${esc(ch.id)}">✕ Reject</button>
    </div>
  </div>`;
};

// The document body: paper (blocks + ghosts) on the left, the suggestions margin
// on the right. mode ∈ 'suggesting' | 'editing' | 'viewing'.
export const renderDocFragment = (doc, mode = 'suggesting') => {
  const changes = mode === 'suggesting' ? doc.changes : [];
  const replaceOf = new Map(), delOf = new Set(), insAfter = new Map();
  for (const ch of changes) {
    if (ch.kind === 'replace' && ch.targetId) replaceOf.set(ch.targetId, ch);
    else if (ch.kind === 'delete' && ch.targetId) delOf.add(ch.targetId);
    else if (ch.kind === 'insert') { const k = ch.afterId || '__end__'; (insAfter.get(k) || insAfter.set(k, []).get(k)).push(ch); }
  }

  const rows = [];
  for (const b of doc.blocks) {
    rows.push(committedBlock(b, { mode, replace: replaceOf.get(b.id), del: delOf.has(b.id) }));
    for (const ch of (insAfter.get(b.id) || [])) rows.push(insertGhost(ch));
  }
  for (const ch of (insAfter.get('__end__') || [])) rows.push(insertGhost(ch));

  const empty = doc.blocks.length === 0
    ? `<p class="doc-empty">An empty page. Everything you write here is grounded to the Record — or marked as your own.</p>` : '';

  const cards = changes.length
    ? changes.map(changeCard).join('')
    : (mode === 'suggesting' ? `<div class="doc-card-none">No pending changes. Every line is committed and grounded.</div>` : '');

  return `<div class="doc-canvas">
    <div class="doc-paper" data-mode="${esc(mode)}">${rows.join('') || empty}</div>
    <div class="doc-margin">${cards}</div>
  </div>`;
};

// The honesty stat line for the toolbar — how much of the page stands on the Record.
export const docStatLine = (doc) => {
  const s = doc.stats;
  const pct = Math.round(s.boundFrac * 100);
  return `${s.blocks} line${s.blocks === 1 ? '' : 's'} · ${s.grounded} grounded · ${s.void} void · ${pct}% on the Record`;
};

export const DOC_CSS = `
.doc-surface{position:absolute;inset:0;display:flex;flex-direction:column;background:#f4f5f7;font-family:var(--doc-sans,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif);color:#1b1f24}
.doc-bar{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:9px 14px;background:#fff;border-bottom:1px solid #e6e8ec}
.doc-bar .doc-title{font-size:14px;font-weight:700;color:#1b1f24;border:none;background:transparent;outline:none;min-width:120px;max-width:340px;flex:0 1 auto;padding:2px 4px;border-radius:6px}
.doc-bar .doc-title:focus{background:#f1edfc}
.doc-bar .doc-stat{font-size:11px;color:#9aa1ab;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.doc-modes{margin-left:auto;display:flex;gap:2px;background:#eef0f3;border-radius:9px;padding:3px}
.doc-modes button{font-size:11.5px;font-weight:600;color:#5a626d;background:transparent;border:none;border-radius:7px;padding:5px 11px;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
.doc-modes button.on{color:#5b34d6;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.doc-x{width:28px;height:28px;flex:0 0 auto;border:1px solid #dde0e5;background:#fff;border-radius:8px;color:#9aa1ab;font-size:15px;line-height:1;cursor:pointer}
.doc-x:hover{background:#f7f8fa;color:#1b1f24}
.doc-scroll{flex:1;min-height:0;overflow-y:auto;padding:22px 18px 60px}
.doc-canvas{position:relative;max-width:1040px;margin:0 auto;display:flex;gap:26px;align-items:flex-start}
.doc-paper{flex:1;min-width:0;max-width:720px;background:#fff;border:1px solid #e6e8ec;border-radius:3px;box-shadow:0 1px 3px rgba(20,24,30,.10),0 10px 30px rgba(20,24,30,.06);padding:56px 68px 80px;min-height:520px}
.doc-paper[data-mode="editing"] .doc-block{outline:none}
.doc-paper[data-mode="editing"] .doc-block:hover{background:#fafbfc}
.doc-block{position:relative;margin:0 0 14px;font-size:15.5px;line-height:1.85;color:#1b1f24;border-radius:3px;padding:1px 2px}
.doc-block .doc-text{}
.doc-pm{font-size:9px;margin-left:5px;vertical-align:3px;cursor:pointer;user-select:none}
.doc-pm-src{color:#15803d}
.doc-pm-void{color:#9aa1ab;cursor:default}
.doc-strike{color:#9aa1ab;text-decoration:line-through;text-decoration-color:rgba(220,38,38,.55)}
.doc-ins{border-radius:2px;padding:0 1px}
.doc-ins-src{color:#15803d;border-bottom:1.5px solid rgba(21,128,61,.7)}
.doc-ins-void{color:#b45309;border-bottom:1.5px dotted rgba(180,83,9,.8)}
.doc-ghost{opacity:.96}
.doc-del{position:absolute;right:-2px;top:2px;opacity:0;border:none;background:transparent;color:#c0392b;font-size:12px;cursor:pointer;transition:opacity .1s}
.doc-block:hover .doc-del{opacity:.6}
.doc-block:hover .doc-del:hover{opacity:1}
.doc-empty{color:#9aa1ab;font-size:15px;line-height:1.8;font-style:italic}
.doc-margin{flex:0 0 274px;position:relative;min-height:10px}
.doc-card{background:#fff;border:1px solid #e6e8ec;border-radius:11px;box-shadow:0 1px 3px rgba(20,24,30,.08);padding:11px 13px;margin-bottom:11px;font-size:12px;line-height:1.5;transition:box-shadow .12s,border-color .12s}
.doc-card.active,.doc-card:hover{box-shadow:0 4px 14px rgba(20,24,30,.14)}
.doc-card-src{border-left:3px solid #15803d}
.doc-card-void{border-left:3px solid #b45309}
.doc-card-head{color:#5a626d;margin-bottom:7px}
.doc-card-who{font-weight:700;color:#1b1f24}
.doc-card-when{color:#9aa1ab}
.doc-card-before{color:#9aa1ab;text-decoration:line-through;text-decoration-color:rgba(220,38,38,.5);margin-bottom:3px}
.doc-card-after{color:#1b1f24;margin-bottom:7px}
.doc-card-groundrow{margin-bottom:2px}
.doc-card-ground{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;border-radius:6px;padding:2px 8px}
.doc-card-ground-src{color:#15803d;background:rgba(21,128,61,.10)}
.doc-card-ground-void{color:#b45309;background:#fef3e2}
.doc-i{font-size:11px}
.doc-card-passage{margin-top:6px;font-size:11.5px;line-height:1.5;color:#5a626d;border-left:2px solid #d8ccf7;padding:2px 0 2px 9px}
.doc-card-note{margin-top:6px;font-size:11px;line-height:1.45;color:#92400e}
.doc-card-actions{display:flex;gap:6px;margin-top:10px}
.doc-card-actions button{flex:1;font-size:11.5px;font-weight:600;border-radius:7px;padding:6px;cursor:pointer;border:1px solid transparent}
.doc-accept-src{color:#fff;background:#15803d;border-color:#15803d}
.doc-accept-src:hover{background:#136a34}
.doc-accept-void{color:#fff;background:#b45309;border-color:#b45309}
.doc-accept-void:hover{background:#98460a}
.doc-reject{color:#5a626d;background:#f4f5f7;border-color:#dde0e5!important}
.doc-reject:hover{color:#1b1f24;border-color:#c9ced6!important}
.doc-card-none{color:#9aa1ab;font-size:11.5px;line-height:1.5;padding:10px 4px;text-align:center}
.doc-compose{flex:0 0 auto;border-top:1px solid #e6e8ec;background:#fff;padding:10px 14px;display:flex;gap:9px;align-items:center}
.doc-compose input{flex:1;min-width:0;font:inherit;font-size:13px;color:#1b1f24;background:#f4f5f7;border:1px solid #dde0e5;border-radius:11px;padding:9px 13px;outline:none}
.doc-compose input:focus{border-color:#d8ccf7;background:#fff}
.doc-compose .doc-hint{font-size:10.5px;color:#9aa1ab;white-space:nowrap}
.doc-compose button{flex:0 0 auto;font-size:12.5px;font-weight:600;color:#fff;background:#5b34d6;border:none;border-radius:10px;padding:9px 15px;cursor:pointer}
.doc-compose button:hover{background:#4c29b8}
.doc-live{font-size:11px;color:#9aa1ab;padding:0 2px}
@media (max-width:900px){.doc-canvas{flex-direction:column}.doc-margin{flex:1 0 auto;width:100%}.doc-paper{padding:40px 28px 60px}}
`;

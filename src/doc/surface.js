// doc/surface.js — mount the EO change-tracking document into any element.
//
// A Google-Docs-style page whose model is an append-only edit log. The reader
// docks it like the deep-research surface; a document is projected from the log
// (project.js) and re-rendered on every append. Three modes (Google Docs' own):
//   Suggesting — edits become tracked changes, grounding-checked, reviewed in the
//                margin with ✓/✗; an ungrounded edit can only be kept as void.
//   Editing    — edits commit immediately (a change proposed AND accepted in one
//                step, still recorded and grounding-checked — nothing is silent).
//   Viewing    — the clean committed page, suggestions hidden.
//
// The only writer is this surface; the only truth is the log. Chat can drive it
// through proposeFromText (the "add a closing recommendation" path).

import { docCreate, blockAdd, changePropose, changeAccept, changeReject } from './events.js';
import { groundText } from './ground.js';
import { projectDoc } from './project.js';
import { renderDocFragment, docStatLine, DOC_CSS } from './render.js';

let _cssInjected = false;
const injectCss = (doc) => {
  if (_cssInjected) return;
  const s = doc.createElement('style');
  s.setAttribute('data-doc-surface', '');
  s.textContent = DOC_CSS;
  doc.head.appendChild(s);
  _cssInjected = true;
};

export const mountDocSurface = (el, opts = {}) => {
  const D = el.ownerDocument || document;
  injectCss(D);
  const author = opts.author || 'you';
  const record = opts.record || [];
  let mode = opts.mode || 'suggesting';
  let seq = 0;
  const nid = (p) => p + (++seq) + '_' + (opts.stamp ? opts.stamp() : (Date.now ? Date.now() : 0));

  // ── the log, and the writer ────────────────────────────────────────────────
  const log = [];
  const append = (e) => { log.push(e); render(); };
  const project = () => projectDoc(log);

  // ground a candidate line against the Record (the reader's recorded reads)
  const ground = (text) => groundText(text, record);

  // seed: a title + optional starter blocks (each grounding-checked)
  const seed = opts.seed || {};
  log.push(docCreate({ id: nid('doc'), title: seed.title || 'Untitled document', author, t: seq }));
  for (const b of (seed.blocks || [])) {
    const g = b.grounding || (() => { const r = ground(b.text); return r.grounded ? { kind: 'source', span: r.span, srcId: r.srcId, host: r.host, overlap: r.overlap } : { kind: 'void' }; })();
    log.push(blockAdd({ id: nid('e'), docId: 'doc', blockId: nid('b'), text: b.text, grounding: g, author, t: seq }));
  }

  // propose a change (insert unless told otherwise). accept:true commits at once
  // (Editing mode / a direct edit). Returns the changeId.
  const propose = ({ kind = 'insert', text = '', targetId = null, afterId = null, before = '', who = author, accept = false }) => {
    const cid = nid('c');
    const grounding = kind === 'delete' ? { grounded: false } : ground(text);
    log.push(changePropose({ id: cid, docId: 'doc', changeId: cid, kind, text, targetId, afterId, blockId: nid('b'), before, grounding, author: who, when: 'now', t: seq }));
    if (accept) log.push(changeAccept({ id: nid('a'), docId: 'doc', changeId: cid, t: seq }));
    render();
    return cid;
  };

  // ── chrome (built once) ────────────────────────────────────────────────────
  el.classList.add('doc-surface');
  el.innerHTML = `
    <div class="doc-bar">
      <input class="doc-title" value="${(seed.title || 'Untitled document').replace(/"/g, '&quot;')}" aria-label="Document title">
      <span class="doc-stat"></span>
      <div class="doc-modes">
        <button data-mode="suggesting" title="Edits become tracked suggestions, reviewed in the margin">✎ Suggesting</button>
        <button data-mode="editing" title="Edits commit immediately — still recorded and grounding-checked">✐ Editing</button>
        <button data-mode="viewing" title="The clean committed page">👁 Viewing</button>
      </div>
      ${opts.onClose ? '<button class="doc-x" title="Close">✕</button>' : ''}
    </div>
    <div class="doc-scroll"><div class="doc-body"></div></div>
    <div class="doc-compose">
      <input class="doc-line" placeholder="Suggest a line — it is grounded to the Record, or marked as your own…" aria-label="Suggest a line">
      <span class="doc-hint doc-live"></span>
      <button class="doc-add">Suggest</button>
    </div>`;

  const $ = (s) => el.querySelector(s);
  const body = $('.doc-body');
  const statEl = $('.doc-stat');
  const titleEl = $('.doc-title');
  const lineEl = $('.doc-line');
  const liveEl = $('.doc-live');

  // ── render + margin-card anchoring (Google Docs vertical alignment) ────────
  const render = () => {
    const doc = project();
    body.innerHTML = renderDocFragment(doc, mode);
    statEl.textContent = docStatLine(doc);
    for (const b of el.querySelectorAll('.doc-modes button')) b.classList.toggle('on', b.dataset.mode === mode);
    // compose bar only makes sense off Viewing
    $('.doc-compose').style.display = mode === 'viewing' ? 'none' : 'flex';
    layoutCards();
  };

  // Place each margin card next to the block it annotates, pushing overlaps down.
  const layoutCards = () => {
    const canvas = el.querySelector('.doc-canvas');
    const margin = el.querySelector('.doc-margin');
    if (!canvas || !margin) return;
    const cards = [...margin.querySelectorAll('.doc-card')];
    if (!cards.length || margin.clientWidth < 40) return; // stacked fallback (narrow / no cards)
    const cRect = canvas.getBoundingClientRect();
    let cursor = 0;
    for (const card of cards) {
      const anchorId = card.dataset.anchor;
      const anchor = anchorId ? el.querySelector('.doc-paper [data-block="' + CSS.escape(anchorId) + '"]') : null;
      const top = anchor ? (anchor.getBoundingClientRect().top - cRect.top) : cursor;
      const y = Math.max(top, cursor);
      card.style.position = 'absolute';
      card.style.top = y + 'px';
      card.style.left = '0';
      card.style.right = '0';
      cursor = y + card.offsetHeight + 10;
    }
    margin.style.minHeight = cursor + 'px';
  };

  // ── interaction (delegated, wired once) ────────────────────────────────────
  const setMode = (m) => { mode = m; render(); };

  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-mode],[data-accept],[data-reject],[data-del],.doc-pm-src,.doc-x,.doc-add');
    if (!t) return;
    if (t.classList.contains('doc-x')) { opts.onClose && opts.onClose(); return; }
    if (t.classList.contains('doc-add')) { submitLine(); return; }
    if (t.dataset.mode) { setMode(t.dataset.mode); return; }
    if (t.dataset.accept) { append(changeAccept({ id: nid('a'), docId: 'doc', changeId: t.dataset.accept, t: seq })); return; }
    if (t.dataset.reject) { append(changeReject({ id: nid('r'), docId: 'doc', changeId: t.dataset.reject, t: seq })); return; }
    if (t.dataset.del) { propose({ kind: 'delete', targetId: t.dataset.del, before: blockText(t.dataset.del), accept: mode === 'editing' }); return; }
    if (t.classList.contains('doc-pm-src')) { showSpan(t); return; }
  });

  // live grounding read-out as you type a suggestion
  lineEl.addEventListener('input', () => {
    const v = lineEl.value.trim();
    if (!v) { liveEl.textContent = ''; return; }
    const g = ground(v);
    liveEl.textContent = g.grounded ? '⚓ grounds to ' + (g.srcId || 'the record') : '⚠ leaves the record — kept as your own';
    liveEl.style.color = g.grounded ? '#15803d' : '#b45309';
  });
  lineEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitLine(); } });
  const submitLine = () => {
    const v = lineEl.value.trim();
    if (!v) return;
    const doc = project();
    const afterId = doc.blocks.length ? doc.blocks[doc.blocks.length - 1].id : null;
    propose({ kind: 'insert', text: v, afterId, accept: mode === 'editing' });
    lineEl.value = ''; liveEl.textContent = '';
  };

  // Editing mode: commit an inline block edit on blur/Enter (proposed + accepted).
  body.addEventListener('keydown', (e) => {
    const bl = e.target.closest('.doc-block[contenteditable="true"]');
    if (bl && e.key === 'Enter') { e.preventDefault(); bl.blur(); }
  });
  body.addEventListener('blur', (e) => {
    const bl = e.target.closest && e.target.closest('.doc-block[contenteditable="true"]');
    if (!bl) return;
    const id = bl.dataset.block;
    const next = (bl.querySelector('.doc-text') ? bl.querySelector('.doc-text').textContent : bl.textContent).trim();
    const prev = blockText(id);
    if (next && next !== prev) propose({ kind: 'replace', targetId: id, text: next, before: prev, accept: true });
  }, true);

  titleEl.addEventListener('change', () => { /* title is display-only for now; the seed holds it */ });

  const blockText = (id) => { const b = project().blocks.find((x) => x.id === id); return b ? b.text : ''; };

  // A small popover with the recorded span a block stands on.
  const showSpan = (mark) => {
    const spanId = mark.dataset.span;
    const b = project().blocks.find((x) => x.grounding && x.grounding.span && x.grounding.span.id === spanId);
    const span = b && b.grounding.span;
    closeSpan();
    if (!span) return;
    const pop = D.createElement('div');
    pop.className = 'doc-span-pop';
    pop.style.cssText = 'position:fixed;z-index:2147483001;max-width:320px;background:#1b1f24;color:#e8eaed;border-radius:9px;padding:9px 11px;font-size:11.5px;line-height:1.5;box-shadow:0 12px 32px rgba(0,0,0,.34)';
    pop.innerHTML = '<div style="font-weight:700;color:#7ee2a8;margin-bottom:4px">⚓ In the record' + (span.srcId ? ' · ' + span.srcId : '') + (span.host ? ' · ' + span.host : '') + '</div>“' + String(span.text).replace(/</g, '&lt;') + '”';
    D.body.appendChild(pop);
    const r = mark.getBoundingClientRect();
    pop.style.left = Math.min(r.left, (D.defaultView.innerWidth || 1200) - 340) + 'px';
    pop.style.top = (r.bottom + 6) + 'px';
    _pop = pop;
    setTimeout(() => D.addEventListener('click', closeSpan, { once: true }), 0);
  };
  let _pop = null;
  const closeSpan = () => { if (_pop) { _pop.remove(); _pop = null; } };

  window.addEventListener && window.addEventListener('resize', layoutCards);
  render();

  // the handle the host keeps — chat drives the doc through proposeFromText
  return {
    el,
    getLog: () => log.slice(),
    project,
    setMode,
    // "add a closing recommendation" → a grounded, tracked change the user reviews
    proposeFromText: (text, o = {}) => {
      const doc = project();
      const afterId = o.afterId || (doc.blocks.length ? doc.blocks[doc.blocks.length - 1].id : null);
      return propose({ kind: o.kind || 'insert', text, afterId, targetId: o.targetId || null, who: o.author || 'eo', accept: !!o.accept });
    },
    destroy: () => { closeSpan(); window.removeEventListener && window.removeEventListener('resize', layoutCards); el.innerHTML = ''; el.classList.remove('doc-surface'); },
  };
};

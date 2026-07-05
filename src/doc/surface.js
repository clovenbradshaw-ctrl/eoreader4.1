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
  // The host may hand in an existing log (a document reopened from a tab); else
  // we seed a fresh one. Every change is mirrored back through onChange so the
  // host persists it — the document survives tab switches and reloads.
  const log = [];
  const notify = () => { try { opts.onChange && opts.onChange(log.slice()); } catch (e) {} };
  const append = (e) => { log.push(e); notify(); render(); };
  const project = () => projectDoc(log);

  // ground a candidate line against the Record (the reader's recorded reads)
  const ground = (text) => groundText(text, record);

  const seed = opts.seed || {};
  if (opts.log && opts.log.length) {
    for (const e of opts.log) log.push(e);
  } else {
    log.push(docCreate({ id: nid('doc'), title: seed.title || 'Untitled document', author, t: seq }));
    for (const b of (seed.blocks || [])) {
      const g = b.grounding || (() => { const r = ground(b.text); return r.grounded ? { kind: 'source', span: r.span, srcId: r.srcId, host: r.host, overlap: r.overlap } : { kind: 'void' }; })();
      log.push(blockAdd({ id: nid('e'), docId: 'doc', blockId: nid('b'), text: b.text, grounding: g, author, t: seq }));
    }
    notify();
  }

  // propose a change (insert unless told otherwise). accept:true commits at once
  // (Editing mode / a direct edit). Returns the changeId.
  const propose = ({ kind = 'insert', text = '', html = '', type = 'p', targetId = null, afterId = null, before = '', who = author, accept = false }) => {
    const cid = nid('c');
    const grounding = kind === 'delete' ? { grounded: false } : ground(text);
    log.push(changePropose({ id: cid, docId: 'doc', changeId: cid, kind, text, html, type, targetId, afterId, blockId: nid('b'), before, grounding, author: who, when: 'now', t: seq }));
    if (accept) log.push(changeAccept({ id: nid('a'), docId: 'doc', changeId: cid, t: seq }));
    notify();
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
    <div class="doc-toolbar">
      <select class="doc-tb-sel" data-tb="block" title="Text style">
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
        <option value="quote">Quote</option>
      </select>
      <span class="doc-tb-sep"></span>
      <button class="doc-tb-btn" data-cmd="bold" title="Bold (⌘B)"><b>B</b></button>
      <button class="doc-tb-btn" data-cmd="italic" title="Italic (⌘I)"><i>I</i></button>
      <button class="doc-tb-btn" data-cmd="underline" title="Underline (⌘U)"><u>U</u></button>
      <button class="doc-tb-btn" data-cmd="strikeThrough" title="Strikethrough"><s>S</s></button>
      <span class="doc-tb-sep"></span>
      <button class="doc-tb-btn doc-tb-color" data-color="#dc2626" title="Red"><span class="doc-tb-swatch" style="background:#dc2626"></span></button>
      <button class="doc-tb-btn doc-tb-color" data-color="#15803d" title="Green"><span class="doc-tb-swatch" style="background:#15803d"></span></button>
      <button class="doc-tb-btn doc-tb-color" data-color="#2563eb" title="Blue"><span class="doc-tb-swatch" style="background:#2563eb"></span></button>
      <button class="doc-tb-btn doc-tb-color" data-color="#1b1f24" title="Default"><span class="doc-tb-swatch" style="background:#1b1f24"></span></button>
      <span class="doc-tb-sep"></span>
      <button class="doc-tb-btn" data-type="ul" title="Bulleted list">•—</button>
      <button class="doc-tb-btn" data-type="ol" title="Numbered list">1.</button>
      <span class="doc-tb-sep"></span>
      <button class="doc-tb-btn" data-cmd="createLink" title="Insert link">🔗</button>
      <button class="doc-tb-btn" data-cmd="removeFormat" title="Clear formatting">⨯</button>
      <span class="doc-tb-hint">formatting applies in Editing mode</span>
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

  // Editing mode: Enter commits the block (blur); Shift+Enter would be a soft break.
  body.addEventListener('keydown', (e) => {
    const bl = e.target.closest('.doc-block[contenteditable="true"]');
    if (bl && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); bl.blur(); }
  });
  // Commit on blur — DEFERRED to the next tick so we never replace the paper's
  // innerHTML from inside the blur event (that would detach the node the browser
  // is mid-operating on). We capture the block's sanitised rich HTML + its text.
  body.addEventListener('blur', (e) => {
    const bl = e.target.closest && e.target.closest('.doc-block[contenteditable="true"]');
    if (!bl) return;
    const id = bl.dataset.block;
    const cap = captureBlock(bl);
    setTimeout(() => {
      const b = project().blocks.find((x) => x.id === id);
      if (!b) return;
      if (!cap.text) { if (b.text) propose({ kind: 'delete', targetId: id, before: b.text, accept: true }); return; } // emptied → delete
      if (cap.text !== b.text || cap.html !== (b.html || '')) {
        propose({ kind: 'replace', targetId: id, text: cap.text, html: cap.html, type: b.type || 'p', before: b.text, accept: true });
      }
    }, 0);
  }, true);

  titleEl.addEventListener('input', () => { opts.onTitle && opts.onTitle(titleEl.value.trim() || 'Untitled document'); });
  const blockText = (id) => { const b = project().blocks.find((x) => x.id === id); return b ? b.text : ''; };

  // ── rich formatting (Editing mode) ─────────────────────────────────────────
  // Inline styling rides execCommand (the Gmail-era workhorse): it edits the
  // focused block's DOM live; the sanitised HTML is captured on the deferred blur
  // commit. Block SHAPE (heading/list/quote) is a block TYPE set directly, so one
  // editable element stays one line — no nested <ul>/<h1> to fight.
  let focusedBlock = null;
  body.addEventListener('focusin', (e) => {
    const bl = e.target.closest && e.target.closest('.doc-block[contenteditable="true"]');
    if (bl) { focusedBlock = bl; syncToolbar(); }
  });
  const syncToolbar = () => {
    const sel = el.querySelector('.doc-tb-sel');
    if (sel && focusedBlock) sel.value = focusedBlock.dataset.type || 'p';
    for (const b of el.querySelectorAll('.doc-tb-btn[data-cmd]')) {
      let on = false; try { on = !!(D.queryCommandState && D.queryCommandState(b.dataset.cmd)); } catch (e) {}
      b.classList.toggle('on', on);
    }
  };
  // The toolbar's mousedown-preventDefault keeps the block's selection alive, so
  // execCommand acts on it directly — calling focus() here would collapse it.
  const exec = (cmd, val) => { try { D.execCommand(cmd, false, val); syncToolbar(); } catch (e) {} };
  const toolbar = el.querySelector('.doc-toolbar');
  toolbar.addEventListener('mousedown', (e) => { if (e.target.closest('.doc-tb-btn')) e.preventDefault(); }); // keep the block's selection
  toolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('.doc-tb-btn'); if (!btn) return;
    if (mode !== 'editing') { setMode('editing'); return; }
    if (btn.dataset.cmd) {
      if (btn.dataset.cmd === 'createLink') { const url = D.defaultView.prompt('Link URL:'); if (url) exec('createLink', url); }
      else exec(btn.dataset.cmd);
      syncToolbar();
    } else if (btn.dataset.color) { exec('foreColor', btn.dataset.color); }
    else if (btn.dataset.type && focusedBlock) { setBlockType(focusedBlock.dataset.block, btn.dataset.type); }
  });
  el.querySelector('.doc-tb-sel').addEventListener('change', (e) => {
    if (mode !== 'editing') { setMode('editing'); return; }
    if (focusedBlock) setBlockType(focusedBlock.dataset.block, e.target.value);
  });
  const setBlockType = (id, type) => {
    const bl = el.querySelector('.doc-paper .doc-block[data-block="' + CSS.escape(id) + '"]');
    const b = project().blocks.find((x) => x.id === id);
    if (!b) return;
    const cap = bl ? captureBlock(bl) : { text: b.text, html: b.html || '' };
    propose({ kind: 'replace', targetId: id, text: cap.text || b.text, html: cap.html, type, before: b.text, accept: true });
  };

  // Whitelist-sanitise edited HTML down to inline formatting only (no script, no
  // block structure, no rogue attributes) — the stored html is then trusted by render.
  const ALLOWED = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1, DEL: 1, A: 1, SPAN: 1, FONT: 1, BR: 1 };
  const sanitizeInline = (html) => {
    const tmp = D.createElement('div');
    tmp.innerHTML = html;
    const walk = (node) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === 3) continue;
        if (child.nodeType !== 1) { child.remove(); continue; }
        if (!ALLOWED[child.tagName]) { const f = D.createDocumentFragment(); while (child.firstChild) f.appendChild(child.firstChild); child.replaceWith(f); walk(node); return; }
        for (const at of [...child.attributes]) { const n = at.name.toLowerCase(); const keep = (child.tagName === 'A' && n === 'href') || n === 'style' || (child.tagName === 'FONT' && n === 'color'); if (!keep) child.removeAttribute(at.name); }
        if (child.tagName === 'A') { const h = child.getAttribute('href') || ''; if (/^\s*javascript:/i.test(h)) child.removeAttribute('href'); else { child.setAttribute('rel', 'noopener'); child.setAttribute('target', '_blank'); } }
        const st = child.getAttribute && child.getAttribute('style');
        if (st) { const keep = (st.match(/(?:^|;)\s*(color|background-color|font-weight|font-style|text-decoration)\s*:[^;]+/gi) || []).join(';').replace(/^;/, ''); if (keep) child.setAttribute('style', keep); else child.removeAttribute('style'); }
        walk(child);
      }
    };
    walk(tmp);
    return tmp.innerHTML.trim();
  };
  const captureBlock = (bl) => {
    const clone = bl.cloneNode(true);
    for (const x of clone.querySelectorAll('.doc-del,.doc-pm')) x.remove();
    const html = sanitizeInline(clone.innerHTML);
    const tmp = D.createElement('div'); tmp.innerHTML = html;
    const text = (tmp.textContent || '').replace(/\s+/g, ' ').trim();
    return { html: /[<]/.test(html) ? html : '', text };  // plain text → no html, renders as text
  };

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

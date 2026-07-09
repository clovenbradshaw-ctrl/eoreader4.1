// reader/monologue-surface.js — a surface to SEE the model's INNER MONOLOGUE, at rest.
//
// The chat posture is inert until prompted, but idleness is the suppression to justify, not the
// machine's nature (SPEC §15). deep-reading.js is the continuity that closes the gate the other
// way: when the model is not otherwise busy, the reading turns back on the DOCUMENT IT ALREADY
// HOLDS — it surfs to the place of most interest (the surprising portions), folds the content
// there, and has a REFLECTION about it, which it deposits into the graph. The reflection is
// reafference (fromEnactor): by the §8 type law canWitness === false, so it rides the graph at
// band VOID — significance-level content, an interpretation the reading holds open, NEVER a
// witnessed fact. The record it can witness is provably untouched.
//
// This is the DOM surface over that engine. It is PURE PRESENTATION: the deterministic loop
// lives in fold/deep-reading.js (surf and reflect injected, no timers, no DOM), and "not
// otherwise busy" is the CALLER's signal — here, an idle tick this surface owns. Press "Let it
// rest" and the surface fires arrive() ticks while nothing else is happening; each fresh
// reflection streams into the monologue, each is deposited as an eo:Reflection node, and the
// loop SELF-TERMINATES (habituation + the median-band governor) back to rest when no fresh
// place beats the band. Framework-free, so it drops into a standalone page or the app's panel
// alike, and — like the reflection itself — runs with no model, no embedder, no weights.

import { ingestText } from '../organs/in/text.js';
import { createDeepReader, readReflections, buildSubstrate } from '../fold/index.js';
import { surfFold } from '../surfer/index.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clamp01 = (x) => Math.max(0, Math.min(1, x));

const SAMPLE = [
  'The office opened as usual. Papers were filed. The clerk sorted the mail. Routine held all morning.',
  'A courier arrived with a sealed crate nobody had ordered. The crate was opened and the room changed.',
  'Work stopped. The records were sealed. Filing resumed days later. The clerk sorted the mail again, but no one believed the routine.',
].join(' ');

const SURFACE_CSS = `
.mns{display:flex;flex-direction:column;height:100%;min-height:0;background:#0f1115;color:#e6e9ef;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13.5px}
.mns *{box-sizing:border-box}
.mns-head{flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:11px 16px;background:#151922;border-bottom:1px solid #262c39}
.mns-head .mns-mark{font-weight:700;font-size:14px;letter-spacing:.01em}
.mns-head .mns-sub{font-size:11px;color:#8791a3}
.mns-head .mns-sp{margin-left:auto}
.mns-btn{border:1px solid #2d3444;background:#1b2130;color:#e6e9ef;border-radius:8px;padding:6px 12px;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
.mns-btn:hover{background:#232b3d}
.mns-btn[disabled]{opacity:.45;cursor:default}
.mns-btn.on{background:#243b52;border-color:#3b5b7d;color:#c0d8f5}
.mns-in{flex:0 0 auto;display:flex;gap:8px;align-items:stretch;padding:10px 16px;background:#12161d;border-bottom:1px solid #262c39}
.mns-in textarea{flex:1;min-height:44px;max-height:150px;resize:vertical;border:1px solid #2d3444;border-radius:8px;padding:8px 10px;font:inherit;font-size:12.5px;background:#0c0e13;color:#e6e9ef}
.mns-in .mns-col{display:flex;flex-direction:column;gap:6px}
.mns-err{color:#f7768e;font-size:12px;padding:8px 16px}

/* The rest bar — the model's posture, and the wake control. */
.mns-rest{flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:9px 16px;background:#12161d;border-bottom:1px solid #262c39}
.mns-posture{display:flex;align-items:center;gap:8px;font-size:12px;color:#8791a3}
.mns-orb{width:10px;height:10px;border-radius:50%;background:#3d4657;box-shadow:0 0 0 0 rgba(122,162,247,0);}
.mns-posture.resting .mns-orb{background:#7aa2f7;animation:mns-breathe 3.4s ease-in-out infinite}
.mns-posture.reading .mns-orb{background:#e0af68;animation:mns-pulse 1s ease-in-out infinite}
.mns-posture.settled .mns-orb{background:#565f73}
@keyframes mns-breathe{0%,100%{box-shadow:0 0 0 0 rgba(122,162,247,.5)}50%{box-shadow:0 0 0 7px rgba(122,162,247,0)}}
@keyframes mns-pulse{0%,100%{opacity:.4}50%{opacity:1}}
.mns-rest .mns-sp{margin-left:auto}
.mns-tally{font-size:11px;color:#8791a3}
.mns-tally b{color:#c0caf5;font-weight:700}

.mns-cols{flex:1 1 auto;min-height:0;display:flex;gap:0}
@media(max-width:820px){.mns-cols{flex-direction:column}}
.mns-stream{flex:1 1 auto;min-height:0;min-width:0;overflow:auto;padding:14px 16px}
.mns-graph{flex:0 0 300px;min-height:0;overflow:auto;border-left:1px solid #262c39;background:#0c0e13;padding:14px 14px}
@media(max-width:820px){.mns-graph{flex:0 0 auto;border-left:none;border-top:1px solid #262c39;max-height:42%}}

.mns-empty{color:#8791a3;padding:30px 8px;text-align:center;line-height:1.6}
.mns-empty small{color:#565f73}

/* A monologue entry — one reflection, voiced as an inner note. */
.mns-refl{border:1px solid #262c39;border-left:3px solid #565f73;border-radius:9px;padding:11px 13px;margin-bottom:12px;background:#131722;animation:mns-in .5s ease both}
.mns-refl.strain{border-left-color:#f7768e}
.mns-refl.confirm{border-left-color:#9ece6a}
@keyframes mns-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.mns-r-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:7px}
.mns-place{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#7aa2f7}
.mns-focus{font-size:11.5px;color:#c0caf5;font-weight:600}
.mns-verdict{font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.06em;text-transform:uppercase;padding:1px 6px;border-radius:20px;border:1px solid #2d3444;color:#8791a3}
.mns-verdict.strain{color:#f7768e;border-color:#5a2a34}
.mns-verdict.confirm{color:#9ece6a;border-color:#33482a}
.mns-note{font-size:14px;line-height:1.55;color:#e6e9ef;font-style:italic;margin:2px 0 9px}
.mns-note::before{content:'“';color:#565f73;font-style:normal}
.mns-note::after{content:'”';color:#565f73;font-style:normal}

/* the surprise bar — how far the place beat the reach's own band. */
.mns-bar{position:relative;height:5px;border-radius:3px;background:#1b2130;margin:8px 0}
.mns-bar .fill{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:linear-gradient(90deg,#e0af68,#f7768e)}
.mns-bar .band{position:absolute;top:-2px;bottom:-2px;width:2px;background:#7aa2f7;opacity:.8}
.mns-metric{display:flex;gap:12px;font-family:ui-monospace,Menlo,monospace;font-size:10.5px;color:#8791a3;margin-top:3px}
.mns-metric b{color:#c0caf5}

/* the folded content it read — collapsible. */
.mns-fold{margin-top:9px;font-size:12px}
.mns-fold summary{cursor:pointer;color:#8791a3;font-size:11px;list-style:none;user-select:none}
.mns-fold summary::-webkit-details-marker{display:none}
.mns-fold summary::before{content:'▸ ';color:#565f73}
.mns-fold[open] summary::before{content:'▾ '}
.mns-excerpt{margin-top:6px;padding:8px 10px;border-radius:7px;background:#0c0e13;border:1px solid #232a38;color:#c3cbdb;line-height:1.55}
.mns-excerpt .peak{color:#e6e9ef;background:rgba(224,175,104,.14);border-radius:3px;padding:0 2px}
.mns-src{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#565f73;margin-top:6px}

/* the firewall footer — the epistemics, on every note. */
.mns-fire{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
.mns-tag{font-family:ui-monospace,Menlo,monospace;font-size:9.5px;letter-spacing:.04em;text-transform:uppercase;padding:2px 6px;border-radius:5px;background:#0c0e13;border:1px solid #232a38;color:#7c8aa5}
.mns-tag.void{color:#bb9af7;border-color:#3a3350}
.mns-tag.reaff{color:#e0af68;border-color:#4a3d24}

/* the graph rail — significance-level content deposited. */
.mns-g-h{font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#565f73;margin:0 0 10px}
.mns-g-stat{display:flex;justify-content:space-between;align-items:baseline;padding:6px 0;border-bottom:1px solid #1b2130;font-size:12px;color:#8791a3}
.mns-g-stat b{font-family:ui-monospace,Menlo,monospace;font-size:15px;color:#e6e9ef}
.mns-g-stat.firm b{color:#9ece6a}
.mns-guar{font-size:11px;color:#8791a3;line-height:1.5;margin:12px 0 16px;padding:9px 10px;border-radius:7px;background:#0d1017;border:1px solid #1b2130}
.mns-guar b{color:#bb9af7}
.mns-node{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;color:#7c8aa5;padding:6px 0;border-bottom:1px solid #161a24;line-height:1.5}
.mns-node .nid{color:#bb9af7}
.mns-node .nat{color:#7aa2f7}
.mns-node .nread{color:#c3cbdb;font-family:inherit;font-size:11.5px;font-style:italic}

/* the trail spine — every place the surf considered, worth or below-band. */
.mns-spine{display:flex;align-items:flex-end;gap:3px;height:52px;margin:6px 0 4px;padding:0 1px}
.mns-tick{flex:1 1 0;min-width:2px;border-radius:2px 2px 0 0;background:#2d3444;position:relative}
.mns-tick.worth{background:linear-gradient(180deg,#f7768e,#e0af68)}
.mns-tick.below{background:#2d3444;opacity:.6}
.mns-spine-cap{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#565f73}
`;

// The model-free reflect leaves body text that leads with the focus figure ("clerk: …"); the
// stream shows the focus as a chip already, so strip a leading "focus: " to avoid doubling it.
const stripLead = (body, focus) => {
  const b = String(body || '');
  if (focus && b.toLowerCase().startsWith(String(focus).toLowerCase() + ':')) {
    return b.slice(String(focus).length + 1).trim();
  }
  return b;
};

// mountMonologueSurface(el, opts) → { destroy, read, rest, wake, stop }
//   opts.doc     an already-ingested doc to reflect over (skips the first ingest)
//   opts.text    initial document text to seed the input box with (default: a small sample)
//   opts.title   header label
//   opts.onClose show a close button that calls this
//   opts.autorest start resting immediately once a doc is held (default false)
export const mountMonologueSurface = (el, opts = {}) => {
  const root = document.createElement('div');
  root.className = 'mns';
  const style = document.createElement('style');
  style.textContent = SURFACE_CSS;
  root.appendChild(style);
  root.insertAdjacentHTML('beforeend', `
    <div class="mns-head">
      <span class="mns-mark">☾ ${esc(opts.title || 'The inner monologue — at rest')}</span>
      <span class="mns-sub"></span>
      <span class="mns-sp"></span>
      <button class="mns-btn mns-copy" disabled>Copy log</button>
      ${opts.onClose ? '<button class="mns-btn mns-close" title="Close">✕</button>' : ''}
    </div>
    <div class="mns-in">
      <textarea class="mns-text" placeholder="Paste a document — or drop a .txt/.md file — and let the reading rest on it."></textarea>
      <div class="mns-col">
        <button class="mns-btn mns-hold">Hold it ▸</button>
        <button class="mns-btn mns-file">Open file…</button>
        <input type="file" class="mns-fileinput" accept=".txt,.md,.markdown,text/*" hidden />
      </div>
    </div>
    <div class="mns-err" style="display:none"></div>
    <div class="mns-rest" style="display:none">
      <span class="mns-posture"><span class="mns-orb"></span><span class="mns-state">idle</span></span>
      <button class="mns-btn mns-tick-btn">Idle tick ▸</button>
      <button class="mns-btn mns-auto">Let it rest</button>
      <span class="mns-sp"></span>
      <span class="mns-tally"></span>
    </div>
    <div class="mns-cols" style="display:none">
      <div class="mns-stream"><div class="mns-empty">The reading is held, at rest.<br><small>Press <b>Idle tick</b> once, or <b>Let it rest</b> — when nothing else is happening the reading surfs to the place of most interest and reflects there.</small></div></div>
      <div class="mns-graph">
        <p class="mns-g-h">Deposited into the graph</p>
        <div class="mns-g-stat"><span>reflections · significance</span><b class="mns-c-refl">0</b></div>
        <div class="mns-g-stat firm"><span>facts witnessed</span><b>0</b></div>
        <div class="mns-guar">Every reflection is <b>reafference</b> — held at band <b>void</b>, <b>canWitness&nbsp;false</b>. It enriches the reading but can never be mistaken for a fact; the record it can witness is untouched.</div>
        <p class="mns-g-h">The places considered</p>
        <div class="mns-spine"></div>
        <div class="mns-spine-cap">surf's peaks · <span style="color:#f7768e">reflected</span> vs <span style="color:#565f73">below band</span></div>
        <p class="mns-g-h" style="margin-top:16px">eo:Reflection nodes</p>
        <div class="mns-nodes"><div class="mns-node" style="border:none;color:#565f73">none yet</div></div>
      </div>
    </div>
  `);
  el.appendChild(root);

  const $ = (s) => root.querySelector(s);
  const errEl = $('.mns-err');
  const subEl = $('.mns-head .mns-sub');
  const restBar = $('.mns-rest');
  const colsEl = $('.mns-cols');
  const streamEl = $('.mns-stream');
  const postureEl = $('.mns-posture');
  const stateEl = $('.mns-state');
  const tallyEl = $('.mns-tally');
  const autoBtn = $('.mns-auto');
  const tickBtn = $('.mns-tick-btn');

  const showErr = (m) => { errEl.style.display = m ? '' : 'none'; errEl.textContent = m || ''; };

  let doc = null;
  let reader = null;
  let anchor = 0;
  let nSent = 0;
  const reflections = [];   // the stream, in the order the model had the thoughts
  const trail = [];         // every place considered (from reader.trail)
  let autoTimer = null;
  let restedFully = false;

  const setPosture = (mode) => {
    postureEl.className = 'mns-posture ' + mode;
    stateEl.textContent = mode === 'reading' ? 'reading…' : mode === 'settled' ? 'at rest — settled' : 'idle · resting';
  };

  // Fold the reflections off the log into eo:Reflection substrate nodes — the graph-side view.
  // buildSubstrate tolerates a null structure, so this is exactly the significance-level content
  // the membrane would surface: band void, witness reafferent, grounded false.
  const graphNodes = () => {
    if (!doc) return [];
    return buildSubstrate({ structure: null, reflections: readReflections(doc) }).reflections;
  };

  const renderGraph = () => {
    const nodes = graphNodes();
    $('.mns-c-refl').textContent = String(nodes.length);
    // the spine of considered places
    const spine = $('.mns-spine');
    if (trail.length) {
      const maxS = Math.max(...trail.map((t) => t.surprise), 0.0001);
      spine.innerHTML = trail.map((t) => {
        const h = 8 + Math.round(clamp01(t.surprise / maxS) * 40);
        return `<span class="mns-tick ${t.worth ? 'worth' : 'below'}" style="height:${h}px" title="§${t.peak} · surprise ${t.surprise} · band ${t.band}"></span>`;
      }).join('');
    } else {
      spine.innerHTML = '';
    }
    const nodesEl = $('.mns-nodes');
    nodesEl.innerHTML = nodes.length
      ? nodes.map((n) => `<div class="mns-node"><span class="nid">${esc(n.id)}</span> · <span class="nat">§${n.atSentence ?? '—'}</span>${n.about ? ' · ' + esc(n.about) : ''}<br><span class="nread">${esc(n.reading)}</span></div>`).join('')
      : '<div class="mns-node" style="border:none;color:#565f73">none yet</div>';
  };

  const sentence = (i) => String((doc.units || doc.sentences || [])[i] ?? '');

  // The folded excerpt the reflection read — the peak span highlighted inside its little reach.
  const excerptHtml = (r) => {
    const peak = r.peak;
    const src = (r.sources && r.sources.length) ? r.sources : [peak];
    const lo = Math.min(...src, peak), hi = Math.max(...src, peak);
    const parts = [];
    for (let i = lo; i <= hi; i++) {
      const t = esc(sentence(i));
      parts.push(i === peak ? `<span class="peak">${t}</span>` : t);
    }
    return parts.join(' ');
  };

  const renderReflection = (r) => {
    const v = r.verdict || '';
    const band = Number(r.band) || 0, surprise = Number(r.surprise) || 0;
    const scale = Math.max(surprise, band) * 1.35 || 1;
    const fillPct = clamp01(surprise / scale) * 100;
    const bandPct = clamp01(band / scale) * 100;
    const note = esc(stripLead(r.body, r.focus)) || '…';
    const card = document.createElement('div');
    card.className = 'mns-refl ' + (v || '');
    card.innerHTML = `
      <div class="mns-r-top">
        <span class="mns-place">§${r.peak}</span>
        ${r.focus ? `<span class="mns-focus">${esc(r.focus)}</span>` : ''}
        ${v ? `<span class="mns-verdict ${v}">${esc(v)}</span>` : ''}
      </div>
      <div class="mns-note">${note}</div>
      <div class="mns-bar"><div class="fill" style="width:${fillPct}%"></div><div class="band" style="left:${bandPct}%"></div></div>
      <div class="mns-metric"><span>surprise <b>${surprise}</b></span><span>band <b>${band}</b></span><span>${surprise > band ? 'beats the band' : 'at the flat'}</span></div>
      <details class="mns-fold">
        <summary>the folded content it read</summary>
        <div class="mns-excerpt">${excerptHtml(r)}</div>
        <div class="mns-src">sources: ${(r.sources || []).map((i) => '§' + i).join(' ') || '—'}</div>
      </details>
      <div class="mns-fire">
        <span class="mns-tag">EVA · enacted</span>
        <span class="mns-tag void">band void</span>
        <span class="mns-tag reaff">reafferent</span>
        <span class="mns-tag">canWitness false</span>
      </div>`;
    streamEl.appendChild(card);
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  const refreshTally = () => {
    tallyEl.innerHTML = `<b>${reflections.length}</b> reflection${reflections.length === 1 ? '' : 's'} · <b>${trail.length}</b> place${trail.length === 1 ? '' : 's'} considered`;
  };

  // one idle tick — the caller's "not otherwise busy" signal (arrive is the wake-on-idle entry).
  // arrive() runs governed passes until it quiesces; the fresh reflections stream in, staggered,
  // so the monologue reveals one thought at a time. Advancing the anchor across ticks walks the
  // whole document rather than circling the head.
  const tick = () => {
    if (!reader || restedFully) return { fresh: 0, quiesced: true };
    setPosture('reading');
    const res = reader.arrive({ anchor });
    // absorb the reader's trail (it records EVERY place it weighed, worth or below-band).
    const t = reader.trail;
    trail.length = 0; trail.push(...t);
    const fresh = res.reflections || [];
    if (fresh.length) {
      // the empty placeholder gives way to the first real thought.
      const empty = streamEl.querySelector('.mns-empty');
      if (empty) empty.remove();
      anchor = Math.min(nSent - 1, fresh[fresh.length - 1].peak + 1);
      // stagger the reveal — a beat between thoughts.
      fresh.forEach((r, i) => setTimeout(() => {
        reflections.push(r);
        renderReflection(r);
        renderGraph();
        refreshTally();
        $('.mns-copy').disabled = false;
      }, i * 420));
    } else {
      // nothing fresh here — step the anchor forward to explore the rest of the document.
      anchor = anchor + 8;
    }
    const reachedEnd = anchor >= nSent - 1;
    // settle to rest when the walk has covered the document and the last tick found nothing.
    setTimeout(() => {
      if (reachedEnd && fresh.length === 0) { restedFully = true; setPosture('settled'); stopAuto(); }
      else setPosture('resting');
      renderGraph();
      refreshTally();
    }, Math.max(fresh.length * 420, 260));
    return { fresh: fresh.length, quiesced: reachedEnd && fresh.length === 0 };
  };

  const stopAuto = () => {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    autoBtn.classList.remove('on'); autoBtn.textContent = 'Let it rest';
  };
  const startAuto = () => {
    if (autoTimer || restedFully) return;
    autoBtn.classList.add('on'); autoBtn.textContent = 'Pause';
    tick();
    autoTimer = setInterval(() => {
      if (restedFully) return stopAuto();
      tick();
    }, 1600);
  };

  const holdDoc = (d) => {
    doc = d;
    nSent = (doc.units || doc.sentences || []).length;
    reader = createDeepReader({ doc, surf: surfFold });
    anchor = 0; restedFully = false;
    reflections.length = 0; trail.length = 0;
    streamEl.innerHTML = '<div class="mns-empty">The reading is held, at rest.<br><small>Press <b>Idle tick</b> once, or <b>Let it rest</b> — when nothing else is happening the reading surfs to the place of most interest and reflects there.</small></div>';
    subEl.textContent = `${doc.docId || 'document'} · ${nSent} sentences`;
    restBar.style.display = '';
    colsEl.style.display = '';
    setPosture('resting');
    renderGraph();
    refreshTally();
    showErr('');
    if (opts.autorest) startAuto();
  };

  const holdText = async (text, name) => {
    const t = String(text || '').trim();
    if (!t) return showErr('Paste some text first.');
    showErr('');
    stopAuto();
    const btn = $('.mns-hold'); btn.disabled = true; btn.textContent = 'Holding…';
    try {
      const d = await ingestText(t, {});
      if (name) d.docId = String(name).replace(/[^\w.-]+/g, '-');
      holdDoc(d);
    } catch (e) { showErr('Ingest failed: ' + (e?.message || e)); }
    btn.disabled = false; btn.textContent = 'Hold it ▸';
  };

  $('.mns-hold').addEventListener('click', () => holdText($('.mns-text').value));
  $('.mns-file').addEventListener('click', () => $('.mns-fileinput').click());
  $('.mns-fileinput').addEventListener('change', async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const text = await f.text(); $('.mns-text').value = text; holdText(text, f.name);
  });
  const inBox = $('.mns-in');
  inBox.addEventListener('dragover', (e) => { e.preventDefault(); });
  inBox.addEventListener('drop', async (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0]; if (!f) return;
    const text = await f.text(); $('.mns-text').value = text; holdText(text, f.name);
  });

  tickBtn.addEventListener('click', () => { stopAuto(); if (!restedFully) tick(); });
  autoBtn.addEventListener('click', () => { if (autoTimer) stopAuto(); else startAuto(); });

  $('.mns-copy').addEventListener('click', async () => {
    if (!doc) return;
    const jsonl = readReflections(doc).map((e) => JSON.stringify(e)).join('\n');
    try { await navigator.clipboard.writeText(jsonl); const b = $('.mns-copy'); b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy log'), 1200); }
    catch { showErr('Clipboard blocked — select and copy manually.'); }
  });
  if (opts.onClose) $('.mns-close').addEventListener('click', () => { stopAuto(); opts.onClose(); });

  // Seed: an already-ingested doc is held immediately; seed text (or the sample) fills the box.
  if (opts.doc) holdDoc(opts.doc);
  else $('.mns-text').value = opts.text != null ? opts.text : SAMPLE;

  return {
    destroy: () => { stopAuto(); root.remove(); },
    read: holdText,
    wake: tick,
    rest: startAuto,
    stop: stopAuto,
  };
};

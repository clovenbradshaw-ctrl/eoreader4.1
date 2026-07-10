// EO: SYN·CON·DEF(Network,Field → Field,Network, Composing,Tracing,Making) — the composition walk; renderer at the very end
// write/composition.js — the composition walk: the write loop with the renderer at the very end.
//
// streamAnswer (answer.js) is the writer's beat loop pointed at the TEXT talker. This is the
// SAME machinery with the realization step made a SEAM: everything before the renderer is
// operator events over hashIds — the plan read off the surfer's own arrests (surfToPlan: each
// arrest is one beat), the cursor collapsing identity at each beat (buildCursor's membrane:
// surface only, no hashes), the fold advancing, the witness binding back — and the
// modality-specific renderer (a talker, a TTS segmenter, a frame emitter, a sonifier) sits at
// the very end. Swap the renderer, keep the walk — that is what makes composition omnimodal.
// (docs/omnimodal-task-language.md defers exactly this bridge; this is that wiring. The organ
// contract render(view) → { output, sources } drops straight in as a renderer.)
//
// THE BEAT-SIZED CURSOR OVER THE GRAPH — what the renderer is handed per beat:
//   relation   the one resolved relation to render: op, kind, edge, via, band (firm|void)
//   input      the surface-only messages (no hashIds, the integral per argument Site)
//   expect     the Sites handed in — the witness's expected set
//   spans      the grounded excerpts this beat may cite — the ONLY citable substance
//   tail       the running tail of realized surface — continuity across beats
//   frame      the beat's posture (Ground/Figure/Pattern site, a plain-words target)
//   arc        where this beat sits phase-to-turn: { phase, phases, turn:{cursor,weight}|null,
//              heaviest, brokeHere } — a turn's weight is how hard the reading was rewritten
//   budget     the extent, in the renderer's native unit
//
// After each beat the witness binds/vetoes (a non-prose renderer may hand back its own witness
// verdict instead), and the connective leash checks the surface against the arc — a contrast
// needs a turn on the log, a sequence an order (two phases), a cause is never licensed.
// Flag-and-tell throughout: nothing rendered is ever un-streamed.

import { buildCursor } from './cursor.js';
import { witness } from './witness.js';
import { surfDraft, draftSurprise, advanceFold } from './spurt.js';
import { createFold } from './fold.js';
import { surfToPlan } from './plan.js';
import { frameAt } from './frame.js';
import { trajectory } from '../surfer/trajectory.js';
import { arcGravity, connectiveLeash, supersededBetween, predOf } from './gravity.js';
import { streamPhrase } from '../model/stream.js';

// turnNote(turn, heaviest, superseded) — the plain-language nudge a turn-crossing beat
// carries into its cursor, weight-proportional: the strongest turn earns the full
// supersession form (naming the relation the earlier reading held, when the arc supplies
// it), a light turn a light marking. A "heaviest" turn that measured no weight is NOT
// voiced as the strongest — gravity that cannot earn itself decays to the flat surface.
// Renderer-agnostic prose (the sentence renderer writes it into the sentence; a speech
// renderer would voice it; a music renderer would key-change on it) — and it licenses
// only what the leash will accept: a contrast, never a cause.
export const turnNote = (turn, heaviest = false, superseded = null) => {
  const w = Math.max(0, Math.min(1, turn?.weight ?? 0));
  const earned = heaviest && w > 0;
  const strength = earned ? 'the strongest turn' : (w >= 0.5 ? 'a hard turn' : 'a turn');
  return `The reading TURNS here (${strength}${w > 0 ? `, weight ${w.toFixed(2)}` : ''}): let this beat ` +
    `turn with it — carry the earlier reading${superseded && earned ? ` (${superseded})` : ''} forward ` +
    `as what the new one rose out of${earned ? ', with full weight' : (w >= 0.5 ? '' : ', lightly')}. ` +
    'A contrast is licensed here; a cause is not.';
};

// sentenceRenderer({ model, onToken, lens, signal }) — the TEXT organ of the walk: one grounded
// sentence per beat, streamed token by token through the talker. The join discipline is
// streamAnswer's (§3b): a single space before every beat but the first, emitted through the
// same token stream, so the visible stream and the walk's draft reconcile by construction.
export const sentenceRenderer = ({ model, onToken = null, lens = null, signal = null } = {}) =>
  async (view) => {
    if (view.index > 0) onToken?.(' ');
    const raw = await streamPhrase(model, view.input, { maxTokens: view.budget, onToken, lens, signal });
    return { output: String(raw || '').trim() };
  };

// The forward correction the NEXT beat carries (§3c of the streaming answer, restated for
// a composition): plain language into the next cursor, a flag alongside — never a touched
// token. Two kinds: a fired generation-grain seam (drift), and a witness retraction
// (hedge) — a claim the ground did not carry is corrected FORWARD, in the next beat's own
// words, and this beat's effective band is marked void so nothing on the surface is
// asserted-but-unmarked.
const reorient = (kind = 'drift') => Object.freeze({
  kind,
  note: kind === 'hedge'
    ? 'Note for the next beat: part of the last beat could not be grounded in the passages — ' +
      'carry the correction forward in your own words (for example, "though the sources do not settle this"); do not restate it as fact.'
    : 'Note for the next beat: the ground does not fully settle the previous point. ' +
      'Acknowledge that in your own words as you continue — do not restate or contradict what came before.',
  flag: kind === 'hedge'
    ? 'A beat asserted past its ground; the next carries the hedge forward rather than restating it.'
    : 'The composition drifted at one beat; the next carries the correction forward rather than restating it.',
});

// walkComposition — the modality-independent walk. Returns null when no plan resolves (the
// caller falls back, non-breaking by construction); otherwise:
//   { draft, beats, arc, retractions, flags, order }
// draft is the prose surfaces joined (a non-text renderer's outputs ride on the beats, where
// `output` keeps whatever the renderer returned and `text` its prose surface if any).
export const walkComposition = async ({
  doc, surf, renderer, focus = [], thread = null, orientation = '', budget, alpha,
  targetOf = null,        // (frame, cell, i, total) → the per-beat shape instruction; default
                          // the frame's own single-sentence target — a composition at a
                          // coarser grain (a paragraph, a scene) supplies its own words
  witnessOpts = null,     // { grounded } — the claim-grounder for this register (the strict
                          // lexical default suits verbatim beats; an own-words register
                          // injects its binder)
  signal = null, onBeat = null,
} = {}) => {
  if (!doc || !surf || typeof renderer !== 'function') return null;

  const fold = createFold();
  const plan = surfToPlan(surf, doc, fold, { focus });
  if (!plan.length) return null;

  // THE ARC, lifted once: the trajectory over the log (never words), segmented at the surf's
  // REC cursors, each turn weighted by how hard the reading was rewritten there (gravity.js).
  const traj = trajectory(doc, { focus: surf.focus ?? null, segments: surf.recCursors || [] });
  const arc = arcGravity(traj, { surf, thread });
  const cuts = [...new Set(surf.recCursors || [])].filter(Number.isFinite).sort((a, b) => a - b);
  const phaseOf = (at) => { let p = 0; for (const c of cuts) if (at >= c) p += 1; return p; };
  const weightOf = new Map((arc?.turns || []).map(t => [t.cursor, t.weight]));

  const beats = [];
  const retractions = [];
  const flags = [];
  // The witness's anchor set is CUMULATIVE: a later beat legitimately relates back to
  // earlier beats' ground (the Pattern posture asks it to), so its claims may bind to any
  // span the walk has already stood on — all exafferent source lines. Spans are copied
  // frozen before the renderer sees the walk, so a renderer that mutates its view can
  // never corrupt what the witness verifies against.
  const anchorSpans = [];
  const anchoredIdx = new Set();
  let draft = '';
  let prevStop = -Infinity;
  let pending = null;                 // a forward correction the last beat carried
  let aborted = false;

  for (let i = 0; i < plan.length; i++) {
    if (signal?.aborted) { aborted = true; break; }   // the Stop button — keep what was rendered
    const cell = plan[i];
    const frame = frameAt(fold, surf, cell.stop, i, plan.length);
    for (const h of cell.args) fold.appear(h);
    for (const s of cell.spans) {
      if (!anchoredIdx.has(s.idx)) { anchoredIdx.add(s.idx); anchorSpans.push(Object.freeze({ ...s })); }
    }

    // The beat's place in the arc: its phase, and the turn it renders ACROSS (a REC cursor
    // between the previous beat's stop and this one), with that rewrite's measured weight.
    const crossed = cuts.find(c => c > prevStop && c <= cell.stop);
    const turn = crossed != null
      ? Object.freeze({ cursor: crossed, weight: weightOf.get(crossed) ?? 0 }) : null;
    const heaviest = !!(turn && arc && arc.heaviest === turn.cursor);
    const arcCtx = Object.freeze({
      phase: phaseOf(cell.stop), phases: (traj.phases || []).length,
      turn, heaviest, brokeHere: cuts.includes(cell.stop),
    });

    // The heaviest measured turn may carry the SUPERSEDED relation — what the earlier
    // phase held that the new one dropped (gravity.js), the thing the full form names.
    let superseded = null;
    if (turn && heaviest && turn.weight > 0 && arc?.phases?.length) {
      const p = phaseOf(cell.stop);
      const after = arc.phases.find(x => x.phase === p) ?? null;
      const before = [...arc.phases].reverse().find(x => x.phase < p) ?? null;
      const lost = (before && after) ? supersededBetween(before, after) : null;
      if (lost) superseded = predOf(lost);
    }

    // Identity collapses at the cursor; the turn rides in as plain language, weighted.
    const cursor = buildCursor(
      { ...cell,
        target: targetOf ? targetOf(frame, cell, i, plan.length) : frame.target,
        budget: budget ?? frame.budget },
      fold, cell.spans,
      { resolution: cell.res, orientation,
        corrective: [pending?.note, turn ? turnNote(turn, heaviest, superseded) : ''].filter(Boolean).join(' ') },
    );

    // THE SEAM the renderer sees — surface only, one beat's worth, modality-neutral.
    const view = Object.freeze({
      relation: Object.freeze({ id: cell.id, op: cell.op, kind: cell.kind,
        edge: cell.edge || null, via: cell.via || null, band: cell.res }),
      input: cursor.input, expect: cursor.expect, spans: cell.spans,
      tail: draft.slice(-240), frame: Object.freeze({ site: frame.site, posture: frame.posture, target: frame.target }),
      arc: arcCtx, budget: cursor.budget, index: i, total: plan.length,
    });

    // The prose SURFACE of what was rendered — a bare string, a `text` field, or a string
    // `output`. A non-string output (a shot spec, a note event, an SVG plan) is not prose:
    // it rides the beat verbatim and contributes nothing to the draft.
    let rendered = null;
    try { rendered = await renderer(view); } catch { rendered = null; }
    const surfaceOf = (r) => {
      if (r == null) return '';
      if (typeof r === 'string') return r;
      if (typeof r.text === 'string') return r.text;
      return typeof r.output === 'string' ? r.output : '';
    };
    const text = surfaceOf(rendered).trim();
    if (i > 0 && text) draft += ' ';
    draft += text;

    // The witness binds the beat back (suppress-never-erase). A renderer that witnessed its
    // own output (a non-prose modality — the limner's grounding check, the speech gate) hands
    // the verdict in as `witness`; a prose surface takes the writer's own, its claims vetoed
    // against every span the walk has stood on so far (a beat that relates back to earlier
    // ground is grounded, not retracted). A renderer with NEITHER a prose surface NOR its own
    // verdict is flagged unwitnessable — never silently trusted.
    const w = (rendered && rendered.witness) ? rendered.witness
      : (text ? witness(text, cursor.expect, anchorSpans, fold, witnessOpts || undefined) : null);
    let effectiveBand = cell.res;
    if (w) {
      for (const r of (w.retractions || [])) retractions.push(Object.freeze({ ...r, cellId: cell.id }));
      if ((w.retractions || []).length) effectiveBand = 'void';
      if (w.ok === false) flags.push(Object.freeze({
        id: (w.retractions || []).length ? 'ungrounded' : 'referent-unexpected',
        beat: cell.id, refuses: false,
        message: (w.retractions || []).length
          ? 'One beat asserted something the ground does not carry; it is flagged and hedged forward, not removed.'
          : 'One beat named a figure it was not about; the binding is flagged.',
      }));
    } else {
      flags.push(Object.freeze({ id: 'unwitnessable', beat: cell.id, refuses: false,
        message: 'The renderer returned no prose surface and no witness verdict; this beat carries no truth-bind.' }));
    }

    // THE LEASH: every connective the surface claims, checked against the arc AS WALKED —
    // only the turns this beat is already past, only the segments it has spanned (a segment
    // the focus sat silent through still counts: the leash reads lengths, and trajectory
    // phases are sparse). A "then" cannot borrow an order the piece has not yet crossed;
    // a cause is never licensed by an arc.
    const leash = (arc && text) ? connectiveLeash(text, {
      turns: (arc.turns || []).filter(t => t.cursor <= cell.stop),
      phases: { length: phaseOf(cell.stop) + 1 },
    }) : null;
    if (leash && !leash.clean) for (const u of leash.unlicensed) flags.push(Object.freeze({
      id: 'connective-unlicensed', beat: cell.id, refuses: false,
      message: `A "${u.connective}" claims a ${u.kind} the arc does not hold; flagged, not removed.`,
    }));

    // Advance the fold, carry the tail; a fired seam — or a retraction, carried as a hedge —
    // re-orients the NEXT beat, never this one.
    advanceFold(fold, cell, cell.res);
    prevStop = cell.stop;
    const seam = text ? surfDraft(draftSurprise(text), { alpha }) : { fires: false };
    const needHedge = !!(w && (w.retractions || []).length);
    pending = (seam.fires || needHedge) && i + 1 < plan.length
      ? reorient(needHedge ? 'hedge' : 'drift') : null;
    if (pending && pending.kind === 'drift')
      flags.push(Object.freeze({ id: 'drift', beat: cell.id, refuses: false, message: pending.flag }));

    const beat = Object.freeze({
      text, output: rendered && typeof rendered === 'object' ? (rendered.output ?? text) : text,
      sources: (rendered && rendered.sources) || cell.spans.map(s => s.idx),
      cellId: cell.id, stop: cell.stop, site: frame.site, band: cell.res, effectiveBand,
      arc: arcCtx, witness: w, leash, seam,
    });
    beats.push(beat);
    if (onBeat) { try { onBeat(beat); } catch { /* a progress hook must never break the walk */ } }
  }

  return Object.freeze({
    draft,
    beats: Object.freeze(beats),
    arc,
    retractions: Object.freeze(retractions),
    flags: Object.freeze(flags),
    order: Object.freeze(plan.map(c => c.id)),
    aborted,
  });
};

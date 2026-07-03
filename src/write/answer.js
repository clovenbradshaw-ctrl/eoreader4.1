// write/answer.js — the streaming answer loop: the write loop on the answer path.
// (The Streaming Answer §3, §4, §6)
//
// The grounded answer used to be drawn in one shot and annotated after the fact.
// This routes it through the writer's own beat loop instead: the answer becomes a
// sequence of grounded sentences, each aware of the ones behind it (the fold) and
// carrying a prediction of the one ahead (the predictor) — STREAMED so seamlessly
// the seams do not show. The reader sees one flowing answer; the substrate sees a
// fold advancing one beat at a time.
//
// This is not a new engine. It is the writeLoop (write/spurt.js) pointed at the
// retrieval subgraph (write/plan.js) instead of a hand-written cell DAG, with a
// streaming surface (model/stream.js) laid over it, and each beat made frame-aware
// (write/frame.js) without the talker knowing it. Everything load-bearing already
// exists; this is the plumbing.
//
//   plan   = surfToPlan(surf, doc, fold)         // §2 — off the model, once, up front
//   for cell in plan:
//     frame  = frameAt(fold, surf, cell.stop)    // §8 — the beat's site, as a posture
//     cursor = buildCursor(cell, fold, spans)    // identity collapsed; band hedges
//     beat   = streamPhrase(model, cursor.input) // §3a — emitted token by token
//     seam   = surfDraft(beat)                   // §3c — generation-grain REC?
//     w      = witness(beat, expect, spans, fold)// §6 — the truth-bind, per beat
//     advanceFold(fold, cell)                    // §2 — next beat inherits the referents
//     predicted = predict(realized)              // §4 — p(next move) + the predictor's VOID
//     if seam.fires: reorient the NEXT beat      // §3c — re-route, never un-stream
//
// THE ASYMMETRY (load-bearing, §3c). Model UNCERTAINTY (a fired seam) may re-orient
// the cursor; model CONFIDENCE may never certify a claim or suppress the witness.
// Attention yes, certification no. And SUPPRESS-NEVER-ERASE is upheld by never
// un-streaming: a correction is appended in the next beat and recorded in the trail,
// the false word never unwritten.

import { buildCursor } from './cursor.js';
import { witness } from './witness.js';
import { surfDraft, draftSurprise, advanceFold } from './spurt.js';
import { createFold } from './fold.js';
import { surfToPlan } from './plan.js';
import { frameAt } from './frame.js';
import { streamPhrase } from '../model/stream.js';
import { predictNextMove, MOVE_ALPHABET } from '../predict/index.js';
import { mountPersonality, bandToCell, bandOfCell } from './voice.js';

// streamAnswer — realise the grounded answer one beat per surfer stop, streaming the
// tokens through `onToken` (§3a) and binding each beat backward with the witness
// (§6). Returns the draft (the canonical surface), the per-beat audit, the witness
// retractions, the flag-and-tell flags, and the forward predictions — or null when
// no plan resolves (the caller falls back to a single phrase(), non-breaking by
// construction).
export const streamAnswer = async ({
  doc, surf, model, focus = [], onToken, budget, orientation = '', alpha, lens = null, signal = null,
} = {}) => {
  if (!doc || !surf || !model) return null;

  const fold = createFold();
  const plan = surfToPlan(surf, doc, fold, { focus });
  if (!plan.length) return null;

  const beats = [];
  const audit = [];
  const retractions = [];
  const flags = [];
  const predictions = [];
  const realized = [];
  let draft = '';
  let pending = null;                 // a forward correction the last seam carried (§3c)

  for (let i = 0; i < plan.length; i++) {
    // CANCELLATION (the Stop button): the user stopped between beats — return the draft so far
    // rather than decoding more grounded sentences.
    if (signal?.aborted) break;
    const cell = plan[i];
    // The frame conditions the SURFACE only — posture, a plain-words target, budget.
    // It never touches the edge or the band; those are the resolver's and the
    // witness's (§8). The site name never reaches the talker.
    const frame = frameAt(fold, surf, cell.stop, i, plan.length);

    // Appear the beat's referents so the cursor can collapse their integrals
    // (identity fixed at the cursor, §5). Registration happened up front in the plan.
    for (const h of cell.args) fold.appear(h);

    const cursor = buildCursor(
      { ...cell, target: frame.target, budget: budget ?? frame.budget },
      fold, cell.spans,
      { resolution: cell.res, orientation, corrective: pending?.note || '' },
    );

    // Stream the beat token by token (§3a). The join (§3b): a single space before
    // every beat but the first — no boundary marker, no newline, ever reaches the
    // surface. The visible stream and the returned draft reconcile by construction.
    if (i > 0) { draft += ' '; onToken?.(' '); }
    // The lens port rides the same beat: each grounded sentence is steered through the logit bias
    // (lens-port.js) when armed, byte-identical when not (lens === null). BAND → REGISTER: the
    // beat's epistemic band is read from its PROVENANCE (the cell's resolved spans + operator), not
    // the model's self-judgment, and mounts the matching cartridge — Existence bare (DEF), Structure
    // assembled (Pattern + CON), Significance perspectival (SIG + EVA) — so the prose makes the
    // status audible. NUL-on-VOID stays locked. Empty baked vectors ⇒ a no-op until the bake lands.
    let beatLens = lens, band = null;
    if (lens?.banks) {
      band = lens.locked ? 'absence' : bandOfCell(cell);
      const cellAddr = { ...bandToCell(band), grain: band === 'structure' ? 'Pattern' : lens.grain || null, locked: lens.locked };
      const personality = mountPersonality({ cell: cellAddr, weights: { act: 1, grain: 1 }, banks: lens.banks, budget: lens.budget ?? 6, dialMul: lens.dialMul }).bias;
      beatLens = { ...lens, personality, lambda: personality.size ? 1 : 0 };
    }
    const raw = await streamPhrase(model, cursor.input, { maxTokens: cursor.budget, onToken, lens: beatLens, signal });
    const beat = raw.trim();
    draft += beat;

    // The seam (§3c): a generation-grain REC, gated by the noise null so it fires on
    // RESOLVABLE surprise, not TV-snow (the same guard the reading surfer runs).
    const seam = surfDraft(draftSurprise(beat), { alpha });

    // The witness owns the truth-bind, per beat (§6). Its retractions are surfaced
    // beside the kept beat — never un-streamed (suppress-never-erase).
    const w = witness(beat, cursor.expect, cell.spans, fold);
    for (const r of w.retractions) retractions.push(Object.freeze({ ...r, cellId: cell.id }));
    if (!w.ok) flags.push(witnessFlag(cell, w));

    // The fold advances; the next beat inherits the established referents (§2).
    advanceFold(fold, cell, cell.res);
    realized.push(cell);

    // Read the next move forward (§4): p(next move) and the predictor's VOID (a flat
    // posterior — "the reading sets up no strong expectation here", §6).
    const predicted = predictForward(realized, surf);
    predictions.push(predicted);

    // A fired seam re-orients the NEXT beat, never un-streams this one (§3c). The
    // following sentence will carry the correction in prose; the drift is flagged.
    pending = seam.fires && i + 1 < plan.length ? reorient() : null;
    if (pending) flags.push(Object.freeze({ id: 'drift', beat: cell.id, refuses: false, message: pending.flag }));

    beats.push(Object.freeze({
      text: beat, cellId: cell.id, stop: cell.stop, site: frame.site,
      band: cell.res, epistemicBand: band, witness: w, seam, predicted,
    }));
    audit.push(Object.freeze({
      cell: cell.id, op: cell.op, stop: cell.stop, kind: cell.kind,
      site: frame.site, posture: frame.posture, band: cell.res,
      edge: cell.edge || null, sources: cell.spans.map(s => s.idx),
      bound: w.bound, flagged: w.flagged, retracted: w.retractions.length,
      seam: seam.fires ? { at: seam.at, magnitude: seam.magnitude } : null,
      predicted: predicted ? { top: predicted.top, flat: predicted.flat } : null,
      line: cursor.audit?.line || null,
    }));
  }

  return Object.freeze({
    draft,
    beats: Object.freeze(beats),
    audit: Object.freeze(audit),
    retractions: Object.freeze(retractions),
    flags: Object.freeze(flags),
    predictions: Object.freeze(predictions),
    order: Object.freeze(plan.map(c => c.id)),
  });
};

// predictForward — the inter-beat fold/predict surfacing (§4, §7 Piece 3). Build a
// minimal move-log from the realized cells' ops (the moves the writer has made) and
// the surfer's per-cursor surprise (the structural frame), and read p(next move) off
// it. Reuses predict/predictor.js wholesale; the work is the plumbing, not the math.
// Degrades to the predictor's VOID (flat) if the prefix is too thin to score.
const predictForward = (realized, surf) => {
  const moves = realized.map(c => Object.freeze({ op: c.op, cursor: c.stop }));
  if (!moves.length) return null;
  const frameByCursor = [];
  for (const f of (surf.field || [])) {
    frameByCursor[f.idx] = {
      bayes: f.bayes ?? 0, ratio: 0, threshold: Infinity,
      newFigure: false, brokeHere: (surf.recCursors || []).includes(f.idx),
    };
  }
  try {
    const p = predictNextMove({ moves, frameByCursor, alphabet: MOVE_ALPHABET }, moves.length - 1);
    return Object.freeze({
      top: p.top, topP: p.topP, flat: p.flat,
      concentration: p.concentration, posterior: p.posterior.slice(0, 3),
    });
  } catch {
    return Object.freeze({ top: null, topP: 0, flat: true, concentration: 0, posterior: [] });
  }
};

// reorient — the forward correction a fired seam carries (§3c). The `note` is a
// plain-language instruction injected into the NEXT cursor (no machinery — the
// talker just writes the qualifier into its own sentence); the `flag` is surfaced
// after the stream (flag-and-tell). Neither touches a committed token.
const reorient = () => Object.freeze({
  note: 'Note for the next sentence: the passages do not fully settle the previous point. ' +
        'Acknowledge that in your own words as you continue (for example, "though the document does not settle this") — do not restate or contradict what you already wrote.',
  flag: 'The reading drifted at one step; the answer carries the correction forward rather than restating it.',
});

// The witness flag for a beat that did not bind cleanly (§6, flag-and-tell). A
// retraction names an ungrounded claim; a flagged referent names one handed in at no
// cursor. Either rides ALONGSIDE the answer — never a trade for it.
const witnessFlag = (cell, w) => Object.freeze({
  id: w.retractions.length ? 'ungrounded' : 'referent-unexpected',
  beat: cell.id,
  refuses: false,
  message: w.retractions.length
    ? `One sentence asserted something the passages do not carry; it is flagged, not removed.`
    : `One sentence named a figure the beat was not about; the binding is flagged.`,
});

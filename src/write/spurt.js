// EO: DEF·INS·REC(Network,Field → Field,Void, Making,Composing) — the renderer + §6 spurt loop
// write/spurt.js — the renderer and the spurt loop. (SPEC §6)
//
// The renderer is model.phrase. The loop writes in SPURTS and lets the model's own
// physics end each one. This is the improviser: write until you hit the turn, step
// back, read what you have, commit to where it's going, continue — the lag posture,
// triggered by the model's own physics, not a fixed cadence.
//
//   spurt(cursor, model) → { text, surprise? }
//
//   propose available (decode field): drive sampling through the gate, read the
//     next-token distribution, watch entropy and Δdistribution; stop the spurt on a
//     generation-grain REC — a spike where the distribution restructures (the model
//     surprises itself). Finer; fires WITHIN a spurt.
//   phrase only (text grain): draw the spurt, then surf the spurt text
//     (read-direction outward, §9). Coarser but universal — any backend.
//
//   write loop:
//     while cells remain:
//       cell   = next scheduled cell
//       cursor = buildCursor(cell, fold, spans)        // identity collapsed here
//       out    = spurt(cursor, model)                  // content collapsed here
//       seam   = surf(out.surprise ?? out.text, {dir:'out'})   // generation-grain REC?
//       if seam.fires: reground(out, source); reorient(cursor, seam)
//       witness(out, cursor.expect, source, fold)      // §7 — owns every factual bind
//       fold = update(fold, out)                       // frontier + integral advance
//
// THE ASYMMETRY (load-bearing, §6). Model UNCERTAINTY may steer the cursor (route
// attention, trigger a re-surf/re-ground). Model CONFIDENCE may never certify
// (cannot accept a claim, cannot suppress the source veto). Attention yes,
// certification no — corollary-discharge attenuation. So the seam (uncertainty)
// re-orients, and the witness (§7) still owns every truth-bind; the decode field is
// fused as ATTENTION only, never as evidence.
//
// NOISY-TV GUARD (§6). Trigger the re-surf on RESOLVABLE surprise — a spike that
// beats the reach's own noise null — not raw entropy. The same median-band / derived
// VOID-boundary calibration that keeps the reading-surfer from going numb (core
// deriveNull) is the guard here: a spike only fires when it beats what this draft's
// own non-cohering churn throws up by chance.

import { deriveNull } from '../core/index.js';
import { emitSurface } from '../model/stream.js';
import { buildCursor } from './cursor.js';
import { witness } from './witness.js';
import { schedule, propagateResolution, groupByGranularity } from './scheduler.js';

// spurt — render one beat and read its own seam. `model.phrase(messages, opts)` is
// the golden path; an optional decode-surprise array (from a propose-driven
// backend) fuses in as the finer signal (§6, §9).
export const spurt = async (cursor, model, opts = {}) => {
  const messages = cursor.input;
  const text = await model.phrase(messages, { maxTokens: cursor.budget, ...opts.phraseOpts });

  // The decode field, if the backend exposed it (propose). Fused as ATTENTION only.
  const decodeSurprise = opts.decodeSurprise ?? null;
  // The text-grain signal — coarse but universal: surf the spurt text outward.
  const signal = decodeSurprise || draftSurprise(text);
  const seam = surfDraft(signal, { alpha: opts.alpha });

  return Object.freeze({ text, surprise: signal, seam });
};

// surfDraft — surf a draft signal in the OUTWARD read-direction (§9): find the
// generation-grain REC, the spike where the draft's own structure turns. A spike
// FIRES only when it beats the derived noise null (the noisy-TV guard, §6). Returns
// { fires, at, magnitude, field }. This is the write-side, draft-facing companion to
// the reading surfer (src/surfer/surf.js), kept here so the surfer holon is not
// rebuilt for a draft string — the §9 fusion into the surfer proper is the P7 seam.
export const surfDraft = (signal, { alpha = 0.1 } = {}) => {
  const xs = (signal || []).map(Number).filter(Number.isFinite);
  if (xs.length < 3) return Object.freeze({ fires: false, at: -1, magnitude: 0, field: xs });
  let at = -1, magnitude = 0;
  const field = xs.map((x, i) => {
    const nul = deriveNull(xs, { scale: 'linear', alpha, leaveOut: x });
    const fires = Number.isFinite(nul) && x > nul;            // resolvable surprise only
    if (fires && x > magnitude) { magnitude = x; at = i; }
    return { i, x, nul: Number.isFinite(nul) ? nul : null, fires };
  });
  return Object.freeze({ fires: at >= 0, at, magnitude, field });
};

// draftSurprise — the coarse, universal text-grain proxy (§6 "phrase only"): a
// per-clause lexical-shift signal over the spurt, so a phrase-only backend still has
// SOMETHING to surf outward. Jaccard distance between consecutive clauses' content
// words: a clause that shares little with the one before it is a local turn. This is
// honestly coarse — the finer signal is the decode field (propose); this is the
// graceful fallback that keeps any backend in the loop.
export const draftSurprise = (text) => {
  const clauses = String(text ?? '').split(/(?<=[.!?])\s+|,\s+|;\s+/).map(s => s.trim()).filter(Boolean);
  if (clauses.length < 2) return [0];
  const bag = (s) => new Set(s.toLowerCase().match(/[a-z']{3,}/g) || []);
  const out = [0];
  for (let i = 1; i < clauses.length; i++) {
    const a = bag(clauses[i - 1]), b = bag(clauses[i]);
    const inter = [...a].filter(w => b.has(w)).length;
    const uni = new Set([...a, ...b]).size || 1;
    out.push(1 - inter / uni);                                // Jaccard distance — the local shift
  }
  return out;
};

// writeLoop — the full §6 loop over a cell DAG. Backend-agnostic: pass any model
// with `phrase`, or use stubModel for a deterministic, headless run (tests/demo).
// Returns the draft plus the per-beat audit, witness records, and retractions —
// nothing is hidden (§7d).
export const writeLoop = async (cells, ctx = {}) => {
  const {
    fold, model = stubModel(), source = [], posture = 'narrative',
    collapseGranularity = 1, budget, orientation = '', alpha,
  } = ctx;
  if (!fold) throw new Error('writeLoop: a fold (write/fold.js) is required');

  const order = schedule(cells, { posture });
  const resolution = propagateResolution(cells);
  const groups = groupByGranularity(order, collapseGranularity);

  const beats = [];
  const audit = [];
  const retractions = [];
  for (const group of groups) {
    for (const cell of group) {
      const spans = cell.spans || source.filter(s => (cell.sources || []).includes(s.idx)) || [];
      const cursor = buildCursor(cell, fold, spans, {
        resolution: resolution.get(cell.id), budget, orientation,
      });
      const out = await spurt(cursor, model, { alpha });

      // seam (§6): a generation-grain REC re-grounds and re-orients. Re-grounding is
      // just running the witness again against the source (truth stays the witness's);
      // re-orienting is recorded for the audit (the cursor move is the loop's next
      // pick in a fuller planner — here we log the turn).
      let regrounded = null;
      if (out.seam?.fires) {
        regrounded = witness(out.text, cursor.expect, spans, fold, ctx.witnessOpts);
      }
      const w = regrounded || witness(out.text, cursor.expect, spans, fold, ctx.witnessOpts);

      // fold advance (§6): the substrate records the STRUCTURAL fact (appearances +
      // the firm/void descriptor), not the model's prose — surface is the reader's.
      advanceFold(fold, cell, resolution.get(cell.id));

      beats.push({ text: out.text, cellId: cell.id, witness: w, seam: out.seam });
      audit.push(cursor.audit);
      for (const r of w.retractions) retractions.push({ ...r, cellId: cell.id });
    }
  }

  return Object.freeze({
    draft: beats.map(b => b.text).join(' '),
    beats: Object.freeze(beats),
    audit: Object.freeze(audit),
    retractions: Object.freeze(retractions),
    order: Object.freeze(order.map(c => c.id)),
  });
};

// advanceFold — turn a realized cell into a fold update (§6). INS appears its site;
// a relation appears its arguments and records its edge as a (firm/void) descriptor
// on the subject; a SYN appears its promoted figure. The Resolution band rides from
// the propagation so a void synthesis lands in `open`, not the name. Exported so the
// streaming answer loop (write/answer.js) advances the same fold per beat (§4).
export const advanceFold = (fold, cell, res) => {
  const op = cell.op ?? cell.kind;
  const hashes = (cell.args ?? sites(cell)).map(h => (typeof h === 'string' ? h : h?.hash)).filter(Boolean);
  const t = cell.t ?? 0;
  if (op === 'INS') {
    for (const h of hashes) fold.appear(h, cell.meta);
  } else if (op === 'CON' || op === 'SIG' || op === 'EVA') {
    for (const h of hashes) fold.appear(h);
    if (cell.edge && hashes[0]) fold.record(hashes[0], { attr: cell.edge, res, t, op });
  } else if (op === 'DEF' || op === 'NUL' || op === 'SEG') {
    if (cell.attr && hashes[0]) fold.record(hashes[0], { attr: cell.attr, res, t, op });
  } else if (op === 'SYN' || op === 'REC') {
    const p = typeof cell.promotes === 'string' ? cell.promotes : cell.promotes?.hash;
    if (p) fold.appear(p, cell.promoteMeta);
  }
};
const sites = (cell) => {
  const s = cell.site ?? cell.sites ?? null;
  return s == null ? [] : (Array.isArray(s) ? s : [s]);
};

// ── stubModel — the deterministic renderer (contract.mjs's stub, generalized) ──
// Collapses the cursor's impression to one surface sentence, REUSING the handed
// surfaces (so the witness round-trip binds). Backend-swappable: replace with
// createModel('wllama') and nothing above the membrane changes (§5). Useful for
// headless runs, the demo, and tests.
export const stubModel = () => ({
  id: 'stub-writer',
  async phrase(messages, opts = {}) {
    const user = messages.find(m => m.role === 'user')?.content || '';
    // Pull the established focus/subject/object names the cursor handed in (surface only).
    const names = [...user.matchAll(/(?:Focus|Subject|Object|Also): ([^\n—]+?)(?: —|$)/gm)].map(m => m[1].trim());
    // The relation rides in EOT surface now (A -> B : rel), not the retired flat arrow.
    const edge = user.match(/->\s*[^\n:]*:\s*([\w-]+)/)?.[1] || null;
    const hedged = /holding-open|not settled/.test(user);
    const subj = names[0] || 'They';
    const obj = names[1] || null;
    let text;
    if (hedged) {
      text = `Taken together, these suggest something the document holds open rather than fixes.`;
    } else if (edge && obj) text = `${subj} ${edge.replace(/-/g, ' ')} ${obj}.`;
    else if (obj) text = `${subj} turns toward ${obj}.`;
    else text = `${subj} is at the centre of the scene.`;
    // The streaming capability (model/stream.js §): surface the collapsed beat
    // token by token when a callback is handed, so the stub drives the answer
    // loop's stream exactly as a real decoder would. Byte-identical otherwise.
    return emitSurface(text, opts.onToken);
  },
});

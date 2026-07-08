// walk — the in-run multi-paragraph loop (docs/paragraph-at-a-time.md, the
// multi-paragraph-walk spec). v1 writes the whole design in one call: given a
// FOLD (ranked evidence spans), a DESIGN (ordered beats, or a { demand, outline }
// the walk carves once), and a MODEL, it emits paragraphs until the design is
// filled or the fold is spent. Each call to the model writes ONE paragraph — a
// CONTINUATION of the running document — bound and vetoed at claim grain after it
// is written. The only inputs that move from one call to the next are the two the
// walk is built on:
//
//   1. the prior paragraph, verbatim — the left-context the new paragraph opens on
//      (register/tense/diction inherited from real prose, never instructed);
//   2. a new part of the fold — the next beat's anchor span plus its strongest
//      UNCOVERED neighbours, so no span a prior paragraph consumed is re-served.
//
// Everything else is fixed or derived (seed, design, genre). Hold that invariant
// and the walk moves forward — five paragraphs cover five regions instead of
// restating one. Break it — re-serve covered spans, or drop the prior paragraph —
// and the two failure modes return: repetition, and a paragraph that opens cold.
//
//   SIG   select the beat's slice — its anchor span plus its fresh neighbours
//   render  build the continuation frame (facts above the line, heading, seed)
//   INS·CON  the model continues one paragraph from the seed; the binder cites it
//   EVA   check per sentence; splice off the ungrounded tail, regen below threshold
//   REC   fold the accepted paragraph into the running document
//
// maxBeats is the SEAM: v1 leaves it Infinity and writes the whole design; the
// deferred across-messages capacity sets it to write a bounded run now and resume
// the rest later, with no change to the body. The returned `state` is that seam's
// statistic — RETURNED by v1, consumed by nothing yet.

import { buildSkeleton } from './skeleton.js';
import { renderContinuation, seedFor } from './render.js';
import { progressAgainst } from './progress.js';
import { bindAndVeto } from '../ground/index.js';
import { REBIND_THRESHOLD, FLOOR_TOKENS, ceilingFor, EPSILON } from '../arc/index.js';
import { groundSaturation } from '../arc/index.js';

const MAX_REGEN = 1;   // one regenerate on an ungrounded paragraph, then hold (NUL)

// SIG — the beat's slice: its anchor span plus supporting context, a cluster of
// commitments (the chosen grain). Neighbours are NEVER another beat's anchor, so
// no beat's coverage is charged to a sibling; among the rest, the strongest
// UNCOVERED context comes first, then already-covered context is reused to fill
// out the cluster rather than leave a thin single-span beat (the seed keeps each
// beat on its own topic, so reused context is grounding, not repetition). This is
// the mechanical guarantee behind "a new part of the fold": fresh before reused.
export const sliceFor = (beat, pool, covered, anchors, { width = 3 } = {}) => {
  const anchor = pool.find(s => s.idx === beat.idx);
  const nbr = pool.filter(s => s.idx !== beat.idx && !anchors.has(s.idx));
  const byScore = (a, b) => (b.score || 0) - (a.score || 0);
  const fresh = nbr.filter(s => !covered.has(s.idx)).sort(byScore);
  const reused = nbr.filter(s => covered.has(s.idx)).sort(byScore);
  return [anchor, ...fresh, ...reused].filter(Boolean).slice(0, width);
};

// The leading run of bound claims — the grounded opening kept when the tail drifts
// (the arc's boundPrefixText, run at paragraph grain).
const boundPrefix = (bound = []) => {
  const kept = [];
  for (const b of bound) { if (b.citation) kept.push(b.claim); else break; }
  return kept.join(' ');
};

// FRAME LEAK — the assistant register the continuation frame is meant to make
// impossible, caught as a CHECKED property, never a prompt prohibition (naming a
// token to forbid it only raises its salience — the pink-elephant failure). These
// are the exact leaks a loose prompt ships: "According to what I found", "I didn't
// find … in what I read", "the text about the Royal National Park". A leak that
// binds lexically slips past the grounding floor (the preamble rides on a grounded
// claim), so EVA strikes it here. Returns the offending phrase, or null.
const LEAKS = [
  /according to what i (?:found|read)/i, /\bas an ai\b/i, /as a language model/i,
  /i (?:didn'?t|could ?n'?t) find/i, /\bthe user\b/i, /in this paragraph/i,
  /^\s*sure[,!]/i, /^\s*here'?s\b/i, /^\s*certainly[,!]/i, /\bi found\b/i,
  /the text (?:about|describes|mentions)/i, /the record (?:shows|says)/i,
];
export const frameLeak = (text = '') => {
  const t = String(text || '');
  for (const re of LEAKS) { const m = t.match(re); if (m) return (m[0] || '').trim(); }
  return null;
};

// EVA — the provenance gate: verify per sentence (bindAndVeto binds at claim
// grain); keep the bound prefix, strike the ungrounded tail; regenerate only when
// the bound fraction falls below REBIND_THRESHOLD. Pure on the gate result.
export const evaSplice = (gated) => {
  if (gated.boundFraction >= 1) return { action: 'accept', text: gated.answer };
  if (gated.boundFraction >= REBIND_THRESHOLD) {
    const prefix = boundPrefix(gated.bound);
    return prefix ? { action: 'splice', text: prefix } : { action: 'regen', text: '' };
  }
  return { action: 'regen', text: '' };
};

const round3 = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

// Derive a design from raw ordered beats handed in directly (design as an Array).
// The beats are copied forward as-is; sections and the planned count are read back
// off them so progressAgainst has the same shape buildSkeleton would produce.
const designFromBeats = (beats, { question = '' } = {}) => {
  const kept = (beats || []).filter(b => b && Number.isInteger(b.idx));
  const bySection = new Map();
  const norm = kept.map((b, i) => {
    const sectionId = b.sectionId || 's0';
    if (!bySection.has(sectionId)) bySection.set(sectionId, []);
    const beat = Object.freeze({
      id: b.id || `b${i}`, order: b.order ?? i, sectionId,
      idx: b.idx, topic: b.topic || '', kind: b.kind || 'connective',
      role: b.role || (bySection.get(sectionId).length ? 'continue' : 'open'),
      heading: b.heading ?? null, state: 'pending',
    });
    bySection.get(sectionId).push(beat.id);
    return beat;
  });
  const sections = [...bySection.entries()].map(([id, ids], si) => {
    const first = norm.find(b => b.sectionId === id);
    return Object.freeze({ id, heading: first?.heading ?? null, topic: first?.topic || '', beats: Object.freeze(ids) });
  });
  return Object.freeze({
    question: String(question || ''), demand: null, planned: norm.length,
    short: false, shortfall: 0,
    sections: Object.freeze(sections), beats: Object.freeze(norm),
  });
};

// Carve the design ONCE, or copy forward the one already carved. The design comes
// in three shapes, all normalised to the { beats, sections, planned, … } skeleton:
//   - an already-carved design (has `.beats`) — copied forward, never re-derived;
//   - an Array of ordered beats — wrapped as a design;
//   - a { demand, outline } carve spec — floored by the fold (a demand for five
//     regions over a fold that develops three yields three beats and a stated
//     reason, never five padded). The demand sets the ceiling; the fold the floor.
const carveDesign = ({ design, fold, question }) => {
  if (design && !Array.isArray(design) && Array.isArray(design.beats)) return design;
  if (Array.isArray(design)) return designFromBeats(design, { question });
  const spec = (design && typeof design === 'object') ? design : {};
  return buildSkeleton({
    ground: fold,
    question: spec.question ?? question ?? '',
    demand: spec.demand ?? null,
    outline: spec.outline ?? null,
  });
};

export const walk = async ({
  fold = [],              // the running situation: ranked evidence spans (the ground pool)
  design = null,          // ordered beats, or a { demand, outline } the walk carves once
  model,                  // model.phrase(messages, opts) -> text
  genre = '',             // optional cold-start genre declaration, first call only
  maxBeats = Infinity,    // beats to write this call. v1: the whole design.
  question = '',          // carried into the carve when design is a { demand, outline } spec
  state = null,           // resumable state — the SEAM; v1 produces no caller that feeds it back
  signal = null,
} = {}) => {
  // Normalise the fold idx so a span's identity is stable across calls.
  const pool = (fold || []).map((s, i) => ({ ...s, idx: s.idx ?? i }));

  // Carve the design ONCE, or resume the one carried in state — copied forward,
  // never re-derived, so the shape is stable across messages.
  const carved = state?.design || carveDesign({ design, fold: pool, question });
  const anchors = new Set(carved.beats.map(b => b.idx));

  const accepted = state?.accepted ? [...state.accepted] : [];
  const covered = new Set(state?.covered || accepted.flatMap(p => p.sources || []));
  const done = new Set(state?.done || accepted.map(p => p.beat));   // beats already walked (accepted or held)
  const trace = [];
  let wrote = 0;

  for (const beat of carved.beats) {
    if (signal?.aborted) { trace.push({ beat: beat.id, kind: 'aborted' }); break; }
    if (done.has(beat.id)) continue;               // resume: skip beats already walked
    if (wrote >= maxBeats) break;                  // this message's budget is spent; the rest resume

    // SATURATION — the honest floor beneath "the design is filled". If the
    // uncovered mass of the fold has fallen below epsilon, the fold is spent:
    // stop here and report the shortfall rather than pad the remaining beats.
    const sat = groundSaturation(pool, covered, { epsilon: EPSILON });
    if (sat.saturated) { trace.push({ beat: beat.id, kind: 'saturated', remainingFrac: round3(sat.remainingFrac) }); break; }

    const slice = sliceFor(beat, pool, covered, anchors);
    if (!slice.length) { done.add(beat.id); trace.push({ beat: beat.id, kind: 'no-slice' }); continue; }

    const prior = accepted.length ? accepted[accepted.length - 1].text : '';
    const coldStart = accepted.length === 0;
    const seed = seedFor({ beat, slice });
    const ceiling = ceilingFor({ mass: slice.reduce((m, s) => m + (s.score || 0), 0) / slice.length, spans: slice });

    let paragraph = null, gated = null, action = 'regen', leak = null;
    for (let attempt = 0; attempt <= MAX_REGEN; attempt++) {
      // The design is the length spec: stop at the next heading marker so the
      // model bridges one paragraph's worth to the gap, never a "one paragraph"
      // instruction. A backend without stop sequences ignores it, byte-identical.
      const messages = renderContinuation({ beat, slice, prior, coldStart, genre });
      const raw = await model.phrase(messages, { maxTokens: ceiling, minTokens: FLOOR_TOKENS, stop: ['\n##'], signal });
      // The paragraph is the seed (the DEF the model was handed) plus its
      // continuation — the topic sentence the model finished.
      const continuation = String(raw || '').trim();
      const full = seed ? `${seed} ${continuation}`.trim() : continuation;
      gated = bindAndVeto(full, slice, { question: beat.topic, task: 'answer' });
      let eva = evaSplice(gated);
      // A frame leak that bound lexically is struck here — the grounding floor
      // cannot see it (it rides on a grounded claim), so EVA must.
      leak = eva.action !== 'regen' ? frameLeak(eva.text) : null;
      if (leak) eva = { action: 'regen', text: '' };
      action = eva.action;
      if (eva.action !== 'regen') { paragraph = eva.text; break; }
    }

    // Cover the slice whether the beat held or not — a walked beat is not retried
    // against the same slice (monotone coverage), and the beat is marked done.
    for (const s of slice) covered.add(s.idx);
    done.add(beat.id);
    wrote += 1;

    if (!paragraph || !gated.sources.length) {
      // NUL — the slice is present but did not cohere into a grounded (and
      // un-leaked) paragraph; hold it (record the honest miss), never confabulate.
      trace.push({ beat: beat.id, kind: 'nul', boundFraction: round3(gated?.boundFraction ?? 0), leak });
      continue;
    }

    accepted.push(Object.freeze({
      beat: beat.id,
      sectionId: beat.sectionId,
      role: beat.role,
      heading: beat.heading,
      topic: beat.topic,
      kind: beat.kind,
      seed,
      text: paragraph,
      sources: gated.sources,
      boundFraction: gated.boundFraction,
      action,
      closes: false,
    }));
    trace.push({ beat: beat.id, kind: action, cited: gated.sources.length, boundFraction: round3(gated.boundFraction) });
  }

  const progress = progressAgainst(carved, accepted);
  const answer = accepted.map(p => p.text).filter(Boolean).join('\n\n');
  const sources = [...new Set(accepted.flatMap(p => p.sources || []))].sort((a, b) => a - b);

  return {
    answer,
    paragraphs: accepted,
    sources,
    design: carved,
    progress,
    trace,
    // The resumable statistic the deferred across-messages capacity will feed
    // back. In v1 no caller feeds it back, and no store persists it — it exists so
    // that turning on the next capacity is a wiring change, not a rewrite.
    state: { design: carved, accepted, covered: [...covered], done: [...done] },
  };
};

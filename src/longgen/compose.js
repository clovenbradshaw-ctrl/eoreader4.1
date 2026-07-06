// compose — the paragraph composer: walk the skeleton one beat at a time, each
// beat a CONTINUATION of the running document (docs/paragraph-at-a-time.md). One
// beat is the loop the theory settles on:
//
//   SIG   select the beat's slice — its anchor span plus nearest neighbours
//   render  build the continuation frame (facts above the line, heading, seed)
//   INS·CON  the model continues one paragraph from the seed; the binder cites it
//   EVA   check per sentence; splice off the ungrounded tail, regen below threshold
//   REC   fold the accepted paragraph into the running document
//
// The shape (skeleton) and how far along (progress) are message 1; the render is
// the "condition the artifact, not the behavior" bet. Resumable across messages:
// the returned state carries the skeleton and the accepted paragraphs, so a
// follow-up message resumes against the SAME shape from the first unwritten beat —
// which is what lets "this is not 5 paragraphs" continue the walk instead of
// searching the corpus. `longgen` orchestrates; it imports only public faces.

import { buildSkeleton } from './skeleton.js';
import { renderContinuation, seedFor } from './render.js';
import { progressAgainst } from './progress.js';
import { bindAndVeto } from '../ground/index.js';
import { REBIND_THRESHOLD, FLOOR_TOKENS, ceilingFor } from '../arc/index.js';

const MAX_REGEN = 1;   // one regenerate on an ungrounded paragraph, then hold (NUL)

// SIG — the beat's slice: its anchor span plus supporting context, a cluster of
// commitments (the chosen grain). Neighbours are NEVER another beat's anchor, so
// no beat's coverage is charged to a sibling; among the rest, the strongest
// UNCOVERED context comes first, then already-covered context is reused to fill
// out the cluster rather than leave a thin single-span beat (the seed keeps each
// beat on its own topic, so reused context is grounding, not repetition).
const sliceFor = (beat, pool, covered, anchors, { width = 3 } = {}) => {
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
// are the exact leaks the falcons run shipped: "According to what I found", "I
// didn't find … in what I read", "the text about the Royal National Park". A leak
// that binds lexically slips past the grounding floor (the preamble rides on a
// grounded claim), so EVA strikes it here. Returns the offending phrase, or null.
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

// EVA — the provenance gate, per the ruling (docs/paragraph-at-a-time.md): verify
// per sentence (bindAndVeto binds at claim grain); keep the bound prefix, strike
// the ungrounded tail; regenerate only when the bound fraction falls below
// REBIND_THRESHOLD. Pure on the gate result.
export const evaSplice = (gated) => {
  if (gated.boundFraction >= 1) return { action: 'accept', text: gated.answer };
  if (gated.boundFraction >= REBIND_THRESHOLD) {
    const prefix = boundPrefix(gated.bound);
    return prefix ? { action: 'splice', text: prefix } : { action: 'regen', text: '' };
  }
  return { action: 'regen', text: '' };
};

const round3 = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

export const composeParagraphs = async ({
  ground = [],
  question = '',
  demand = null,          // the length demand ("5 paragraphs") — the skeleton's ceiling
  model,
  genre = '',             // an optional cold-start genre declaration
  state = null,           // resumable state from a prior message
  maxBeats = Infinity,    // write at most this many NEW beats this call (the rest resume)
  signal = null,
} = {}) => {
  // Normalise the ground idx so a span's identity is stable across calls.
  const pool = (ground || []).map((s, i) => ({ ...s, idx: s.idx ?? i }));

  // Carve the skeleton ONCE, or resume the one carried in state — copied forward,
  // never re-derived, so the shape is stable across messages.
  const skeleton = state?.skeleton || buildSkeleton({ ground: pool, question, demand });
  const anchors = new Set(skeleton.beats.map(b => b.idx));

  const accepted = state?.accepted ? [...state.accepted] : [];
  const covered = new Set(state?.covered || accepted.flatMap(p => p.sources || []));
  const done = new Set(state?.done || accepted.map(p => p.beat));   // beats already walked (accepted or held)
  const trace = [];
  let wrote = 0;

  for (const beat of skeleton.beats) {
    if (signal?.aborted) { trace.push({ beat: beat.id, kind: 'aborted' }); break; }
    if (done.has(beat.id)) continue;               // resume: skip beats already walked
    if (wrote >= maxBeats) break;                  // this message's budget is spent; the rest resume

    const slice = sliceFor(beat, pool, covered, anchors);
    if (!slice.length) { done.add(beat.id); trace.push({ beat: beat.id, kind: 'no-slice' }); continue; }

    const prior = accepted.length ? accepted[accepted.length - 1].text : '';
    const coldStart = accepted.length === 0;
    const seed = seedFor({ beat, slice });
    const ceiling = ceilingFor({ mass: slice.reduce((m, s) => m + (s.score || 0), 0) / slice.length, spans: slice });

    let paragraph = null, gated = null, action = 'regen', leak = null;
    for (let attempt = 0; attempt <= MAX_REGEN; attempt++) {
      // The skeleton is the length spec: stop at the next heading marker so the
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

  const progress = progressAgainst(skeleton, accepted);
  const answer = accepted.map(p => p.text).filter(Boolean).join('\n\n');
  const sources = [...new Set(accepted.flatMap(p => p.sources || []))].sort((a, b) => a - b);

  return {
    answer,
    paragraphs: accepted,
    sources,
    skeleton,
    progress,
    trace,
    // The resumable state — feed this back with the next message to continue the
    // same shape from the first unwritten beat.
    state: { skeleton, accepted, covered: [...covered], done: [...done] },
  };
};

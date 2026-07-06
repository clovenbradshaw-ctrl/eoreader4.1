// skeleton — SEG: the shape of the proper output, carved from the field
// (docs/paragraph-at-a-time.md). Message 1: for longform to cohere across
// messages the loop must know what the whole output should be. The skeleton is a
// sequence of BEATS, one per developable region of the ground — derived, not an
// imposed canon (shape.js forbids a canon: a shape chosen from outside the field
// is "a void gate run backwards"). The request's length demand sets the CEILING;
// the field's developable regions set the FLOOR. When the demand exceeds what the
// field can develop, the honest skeleton is the smaller number and the shortfall
// is recorded, so the walk states it rather than pads to the demand — the
// "shapeless walk" answerable.js refuses (the falcons "5 paragraphs" over ~3 real
// regions).
//
// A beat is document furniture, not a command: it carries a HEADING the render
// writes beneath (goal-as-furniture, SEG) and a KIND — load-bearing or connective
// — that sets how tightly the seed pins it (the per-beat SEG choice). Carved ONCE
// at plan time, then copied forward across messages, never re-derived on resume
// (stable, the way the essay's thesis is copied forward).

import { developableRegions } from './answerable.js';

// A region strong enough to pin with a tight topic-sentence seed is LOAD-BEARING;
// a thinner one is CONNECTIVE and lets the render own the claim. The bar is above
// the developable floor (answerable.js DEVELOPABLE_SCORE 0.4) — a beat has to be
// clearly strong to be pinned tightly, or the tight seed over-commits a thin span.
const LOAD_BEARING_SCORE = 0.6;

// A heading written from the region's topic — a few words, title-ish, no trailing
// punctuation. Document furniture the model writes beneath; stripped from output.
export const headingOf = (topic = '') => {
  const words = String(topic).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).slice(0, 6);
  const h = words.join(' ').replace(/[.,;:!?]+$/, '');
  return h ? h[0].toUpperCase() + h.slice(1) : 'The reading';
};

// Carve the skeleton: one beat per developable region, ordered by salience, capped
// by the demand and floored by the field. Pure and deterministic on the ground.
export const buildSkeleton = ({ ground = [], question = '', demand = null, max = 8 } = {}) => {
  const cap = Number.isInteger(demand) && demand > 0 ? demand : null;
  const regions = developableRegions(ground, new Set(), { max: Math.max(cap || 0, max) });
  const available = regions.length;
  const planned = cap ? Math.min(cap, available) : available;

  const scoreByIdx = new Map((ground || []).map((s, i) => [s.idx ?? i, s.score || 0]));
  const beats = regions.slice(0, planned).map((r, i) => Object.freeze({
    id: `b${i}`,
    order: i,
    idx: r.idx,                       // the anchor span — the beat's grounding
    topic: r.topic,
    heading: headingOf(r.topic),
    kind: (scoreByIdx.get(r.idx) || 0) >= LOAD_BEARING_SCORE ? 'load-bearing' : 'connective',
    state: 'pending',
  }));

  return Object.freeze({
    question: String(question || ''),
    demand: cap,
    planned,
    // The honest-floor record: the demand asked for more than the field can
    // develop, so the walk writes `planned` beats and can state the shortfall
    // rather than pad to `demand`.
    short: cap ? cap > available : false,
    shortfall: cap ? Math.max(0, cap - available) : 0,
    beats: Object.freeze(beats),
  });
};

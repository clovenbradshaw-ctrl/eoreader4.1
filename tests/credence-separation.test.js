import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCredenceBook, CLASS, NUL_O, DEFAULT_CREDENCE_RULES } from '../src/credence/index.js';

// ── The build gate (spec §12) ──────────────────────────────────────────────────
//
// "The cheap read-only measurement comes first. Before any reweighting touches
// retrieve or veto, run the three channels read-only over held-out sources and
// check that they separate the synthetic seeker, the liar, and the bullshitter.
// If they do not separate, the build stops there."
//
// This file IS that gate. It runs the three channels over three synthetic sources
// and asserts the (M, O) plane pulls them apart. Only on these passing do the
// integration points (tested gated-off elsewhere) earn the right to turn on.

const lcg = (seed) => { let s = seed >>> 0; return () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; }; };
const R = DEFAULT_CREDENCE_RULES;

// A SEEKER: coherent, survives independent triangulation, revises toward the
// record. A LIAR: equally coherent (a real model) but its claims do NOT survive
// triangulation and it doubles down. A BULLSHITTER: incoherent — no model under
// the claims — scored with NO corroboration at all (no truth signal whatsoever).
const buildSeeker = (book) => {
  const rng = lcg(3);
  for (let i = 0; i < 30; i++) book.observeCoherence('seeker', 'news', 0.86 + 0.06 * (rng() - 0.5));
  for (let i = 0; i < 40; i++) book.observeCorroboration('seeker', 'news', 0.82 + 0.08 * (rng() - 0.5),
    { corroborators: [{ id: 'a' + i, w_indep: 1 }, { id: 'b' + i, w_indep: 1 }, { id: 'c' + i, w_indep: 1 }] });
  for (let i = 0; i < 14; i++) book.observeRevision('seeker', 'news', 0.45 + 0.25 * rng());
};
const buildLiar = (book) => {
  const rng = lcg(5);
  for (let i = 0; i < 30; i++) book.observeCoherence('liar', 'news', 0.88 + 0.05 * (rng() - 0.5));
  for (let i = 0; i < 40; i++) book.observeCorroboration('liar', 'news', 0.12 + 0.08 * (rng() - 0.5),
    { corroborators: [{ id: 'x' + i, w_indep: 1 }, { id: 'y' + i, w_indep: 1 }] });
  for (let i = 0; i < 14; i++) book.observeRevision('liar', 'news', -0.3 + 0.08 * (rng() - 0.5));
};
const buildBullshitter = (book) => {
  const rng = lcg(11);
  for (let i = 0; i < 40; i++) book.observeCoherence('bs', 'news', 0.30 * rng());   // low, dispersed
  for (let i = 0; i < 15; i++) book.observeRevision('bs', 'news', 2 * rng() - 1);   // unstructured — NO corroboration
};

test('§1 the bullshitter is called on appearances — low M, with no ground-truth input', () => {
  const book = createCredenceBook();
  buildBullshitter(book);
  const st = book.at('bs', 'news');
  // No corroboration event was ever written — the call uses only the internal channels.
  assert.ok(!book.log.snapshot().some(e => e.kind === 'corroboration_obs'), 'no corroboration (no truth) was used');
  assert.ok(st.M.hi < R.m_lo, `M is confidently low: M.hi=${st.M.hi.toFixed(3)} < m_lo=${R.m_lo}`);
  assert.equal(st.classification, CLASS.BULLSHITTER);
  assert.equal(st.O, NUL_O, 'no model → no orientation (O is NUL)');
});

test('§2 the liar is NOT a bullshitter — high M, low O', () => {
  const book = createCredenceBook();
  buildLiar(book);
  const st = book.at('liar', 'news');
  assert.ok(st.M.lo > R.m_hi, `M is confidently high: M.lo=${st.M.lo.toFixed(3)} > m_hi=${R.m_hi}`);
  assert.notEqual(st.classification, CLASS.BULLSHITTER, 'the liar is not collapsed into the bullshitter');
  assert.ok(st.O !== NUL_O && st.O.hi < R.o_lo, `O is confidently negative: O.hi=${st.O.hi.toFixed(3)} < o_lo=${R.o_lo}`);
  assert.equal(st.classification, CLASS.LIAR);
});

test('the three types separate on the (M, O) plane — the L, not a line', () => {
  const book = createCredenceBook();
  buildSeeker(book); buildLiar(book); buildBullshitter(book);
  const s = book.at('seeker', 'news');
  const l = book.at('liar', 'news');
  const b = book.at('bs', 'news');

  assert.equal(s.classification, CLASS.SEEKER);
  assert.equal(l.classification, CLASS.LIAR);
  assert.equal(b.classification, CLASS.BULLSHITTER);

  // M separates the bullshitter from the other two.
  assert.ok(s.M.mean - b.M.mean > 0.4 && l.M.mean - b.M.mean > 0.4, 'M pulls the bullshitter off the modelful pair');
  // O separates the seeker from the liar — reflections across the grounded plane.
  assert.ok(s.O.mean > 0 && l.O.mean < 0, 'seeker points toward the record, liar away');
  assert.ok(s.O.mean - l.O.mean > 0.5, 'and they are well apart on the orientation axis');
  // The bullshitter is off the O axis entirely (Frankfurt's orthogonality).
  assert.equal(b.O, NUL_O, 'the bullshitter has no orientation at all');
});

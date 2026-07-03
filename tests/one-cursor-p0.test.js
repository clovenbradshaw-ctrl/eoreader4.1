import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { readingAt } from '../src/perceiver/index.js';
import { DEFAULT_GAMMA as FOLD_GAMMA } from '../src/write/fold.js';

// one cursor §8 P0 — the two gate measurements, pinned as regression locks.
//
// The one-cursor spec is a build plan (P0→P4) whose every step is "preceded by a
// measurement that can come back negative." These tests pin what P0 measured (see
// scripts/two-fold-equivalence.mjs and scripts/frontier-predictor.mjs, and
// docs/one-cursor.md for the writeup) so P1–P4 build against a FIXED target. They are
// deliberately written to FAIL THE DAY the precondition is fixed — the divergence
// closes, or the entity horizon is re-seeded — which is the signal to advance the gate.

// ── P0.1 — the two folds are NOT the same standing state as shipped ──────────────
// The reader (reading.js) decays with γ=0.7 over a prior that EXCLUDES the cursor line
// (exponent at−1−sentIdx); the integral (fold.js) decays with γ=0.8 over a profile that
// INCLUDES it (exponent t−e.t). §4 claims they are "the same standing state computed
// twice" and §4 P4 proposes to delete the second — but only "If they diverge, reconcile
// γ and the decay before any collapse, or P4 is unsound."

test('P0.1: the reader γ (0.7) and the integral γ (0.8) diverge — observed, not asserted', () => {
  const doc = parseText('Ada Long met Ben Cole. Ada Long met Ben Cole. Cara Dove arrived.', { docId: 'g' });
  // The integral's γ is exported and is 0.8.
  assert.equal(FOLD_GAMMA, 0.8, 'fold.js DEFAULT_GAMMA');
  // The reader's default γ is private, but observable through its gamma knob: the
  // default reading equals an explicit γ=0.7 reading and differs from a γ=0.8 one.
  const bayes = (g) => readingAt(doc, 2, g ? { gamma: g } : {}).bayesBits;
  assert.equal(bayes(), bayes(0.7), 'the reader default is γ=0.7');
  assert.notEqual(bayes(), bayes(0.8), 'the reader default is NOT the integral γ=0.8');
});

// The two standing-weight kernels, transcribed from source (the divergence is pure decay
// math, isolated from any basis question):
//   reading.js:93  w = γ^(at−1−sentIdx),  sentIdx <  at   (prior EXCLUDES the cursor line)
//   fold.js:102    w = γ^(t − e.t),       e.t     <= t    (integral INCLUDES it)
const readingW = (c, k, g) => (k < c ? Math.pow(g, c - 1 - k) : 0);
const foldW    = (t, k, g) => (k <= t ? Math.pow(g, t - k)     : 0);

test('P0.1: as shipped the kernels diverge on the same arrival; aligning (γ, clock) makes them byte-identical', () => {
  // The same arrival at line k=5, read at cursor c=8.
  const c = 8, k = 5;
  // As shipped: γ 0.7 vs 0.8 AND the clock offset — they diverge.
  assert.notEqual(readingW(c, k, 0.7), foldW(c, k, 0.8), 'shipped kernels diverge');
  // Unify γ alone — still diverges (the one-step clock offset remains).
  assert.notEqual(readingW(c, k, 0.75), foldW(c, k, 0.75), 'γ alone does not close it');
  // Unify γ AND align the clock (the integral read at t := the reader's at−1): EQUAL,
  // for any γ. This is the constructive target — the collapse (P4) is sound only after
  // BOTH are reconciled, and unsound before.
  for (const g of [0.7, 0.75, 0.8, 0.95]) {
    assert.ok(Math.abs(readingW(c, k, g) - foldW(c - 1, k, g)) < 1e-12,
      `reconciled at γ=${g}: reader ${readingW(c, k, g)} === integral@(c−1) ${foldW(c - 1, k, g)}`);
  }
});

// ── P0.2 — the frontier predictor: alive + carries a move, on recency; dead on entity ─
// §2: "generation = read past the frontier." The loop "only walks if the frontier
// predictor carries a move" (§9). frontierReading reads ONE index past the last unit
// over a sentinel, so the prior is every real unit — the true "past the frontier."
const frontierReading = (doc, opts) => {
  const units = doc.units || doc.sentences || [];
  const S = units.length;
  const fd = { ...doc, units: [...units, ''], sentences: undefined };
  return readingAt(fd, S, { forward: true, ...opts });
};
const isMove = (atom) => atom.startsWith('p:') || atom.startsWith('d:');

// A document with a recurring proposition, so the frontier prior deterministically
// carries a MOVE (p:ada-long|met|ben-cole), not only figures.
const MOVES = 'Ada Long met Ben Cole. Ada Long met Ben Cole. Ada Long met Ben Cole. Cara Dove arrived. Ada Long met Ben Cole.';

test('P0.2: the recency frontier prior is ALIVE and carries a MOVE — generation has something to read off', () => {
  const doc = parseText(MOVES, { docId: 'f' });
  const r = frontierReading(doc, { horizon: 'recency' });
  // not flat: the reserve (unseen mass) is well below 1 — the prior set up an expectation.
  assert.ok(r.pNext.reserve < 0.9, `not flat: reserve ${r.pNext.reserve}`);
  // carries a move: a proposition/predicate atom is in p(next), and a bond is predicted.
  assert.ok(r.pNext.dist.some(([atom]) => isMove(atom)), 'p(next) carries a move atom (p:/d:)');
  assert.ok(r.predicted.bonds.length > 0, 'predicted.bonds is non-empty — a move, not only a figure');
});

test('P0.2: the entity frontier prior is DEAD as currently seeded — the precondition P3 must fix', () => {
  // The §2 loop literally specifies { horizon: 'entity' }, but the entity horizon seeds
  // its actor-set from events AT the cursor line (reading.js:68-76). At the frontier the
  // cursor line is the not-yet-generated one, so the seed is empty and the prior is
  // filtered to nothing. This pins that dead seed: P3 must re-seed the frontier's entity
  // horizon (from the DEF target / the recency top). WHEN that fix lands, this trips —
  // by design — and the gate advances.
  const doc = parseText(MOVES, { docId: 'f' });
  const r = frontierReading(doc, { horizon: 'entity' });
  assert.equal(r.pNext.reserve, 1, 'entity horizon admits no prior at the frontier (reserve all on the unseen)');
  assert.equal(r.pNext.dist.length, 0, 'entity horizon p(next) is empty at the frontier');
});

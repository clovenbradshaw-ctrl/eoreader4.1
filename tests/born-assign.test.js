import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIG } from '../src/core/index.js';

// ── the regression lock for exp-0005: SIG, sign-aware Born assignment ──
//
// SIG turns a direction into the reading it belongs to. The capability:
//   • squared (default) ranks by |<u|lens>|^2 — the Born probability — and is
//     SIGN-BLIND: the two poles of one bipolar lens read as the SAME reading;
//   • signed ranks over the ± poles and SEPARATES them (2i for +lens, 2i+1 for -lens),
//     so a balanced split centred onto one axis is resolved;
//   • it accepts eigenLenses output ({lens}) or bare lens vectors;
//   • it is pure. The lock fails the day the squared default or the signed split changes.

const e = (dim, k) => { const v = new Array(dim).fill(0); v[k] = 1; return v; };

test('squared assignment is sign-blind: ±pole of one lens are the SAME reading', () => {
  const lens = [{ lens: e(4, 0) }, { lens: e(4, 1) }];
  const plus = e(4, 0), minus = e(4, 0).map((x) => -x);
  assert.equal(SIG(plus, lens), 0);
  assert.equal(SIG(minus, lens), 0, 'squared cannot tell +axis from -axis');
});

test('signed assignment separates the ± poles of a bipolar lens', () => {
  const lens = [{ lens: e(4, 0) }, { lens: e(4, 1) }];
  const plus = e(4, 0), minus = e(4, 0).map((x) => -x);
  assert.equal(SIG(plus, lens, { signed: true }), 0, '+pole of lens 0');
  assert.equal(SIG(minus, lens, { signed: true }), 1, '-pole of lens 0 → different reading');
  // a second lens's +pole is a distinct reading again
  assert.equal(SIG(e(4, 1), lens, { signed: true }), 2);
});

test('signed resolves a balanced two-cluster split the squared rule collapses', () => {
  // two clusters at +a and -a of a single axis (a centred balanced split). Squared puts
  // both in reading 0 (no boundary); signed puts them in 0 and 1 (a boundary appears).
  const a = e(6, 2);
  const lens = [{ lens: a }];
  const left = Array.from({ length: 10 }, () => a.map((x) => x + 0));
  const right = Array.from({ length: 10 }, () => a.map((x) => -x));
  const sq = [...left, ...right].map((u) => SIG(u, lens));
  const sg = [...left, ...right].map((u) => SIG(u, lens, { signed: true }));
  assert.equal(new Set(sq).size, 1, 'squared: one reading, no boundary');
  assert.equal(new Set(sg).size, 2, 'signed: two readings, boundary at the split');
});

test('SIG accepts bare lens vectors and is pure', () => {
  const lenses = [e(3, 0), e(3, 1), e(3, 2)];   // bare vectors, not {lens}
  const u = [0.1, 0.9, 0.2], before = u.slice();
  assert.equal(SIG(u, lenses), 1);
  assert.deepEqual(u, before, 'input not mutated');
  assert.equal(SIG(u, lenses), SIG(u.slice(), lenses), 'deterministic');
});

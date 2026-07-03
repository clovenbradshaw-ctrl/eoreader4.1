import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEG } from '../src/core/index.js';

// ── the regression lock for exp-0004: SEG, the change-point detector ────
//
// SEG reads a per-position score curve (a departure/incommensurability signal)
// and returns the boundary positions: the LOCAL maxima that clear the bounded void
// line (boundedNull), tol-suppressed. The capability:
//   • it FINDS the planted peaks in a noisy curve and ignores the background;
//   • it SUPPRESSES within tol so one boundary is not double-counted;
//   • it maps through `indices` (a windowed score starting at an offset);
//   • it abstains (empty) on a flat curve and on a thin/cold background;
//   • it is pure — no state, no mutation.
// The lock fails the day any of these preconditions changes.

// a flat noisy background with sharp bumps planted at known positions
const curveWithPeaks = (T, peaks, seed) => {
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const c = Array.from({ length: T }, () => 0.05 + 0.02 * rnd());   // low, tight background
  for (const p of peaks) c[p] = 1.0;                                // a towering bump
  return c;
};

test('SEG finds the planted peaks and ignores the background', () => {
  const peaks = [17, 41, 73];
  const found = SEG(curveWithPeaks(100, peaks, 7), { tol: 3 });
  assert.deepEqual(found, peaks, `should recover the planted peaks, got ${found}`);
});

test('SEG suppresses within tol (no double-counting one boundary)', () => {
  // three adjacent high bins at 40,41,42 are ONE boundary — collapse to a single peak
  const c = curveWithPeaks(80, [], 9);
  c[40] = 1.0; c[41] = 0.98; c[42] = 0.96;
  const found = SEG(c, { tol: 3 });
  assert.equal(found.length, 1, `one cluster → one peak, got ${found}`);
  assert.ok(Math.abs(found[0] - 40) <= 2);
});

test('SEG maps peak positions through `indices`', () => {
  // a windowed score that starts at offset W=10 → array index k reports indices[k]
  const W = 10, scores = curveWithPeaks(50, [12, 33], 5);
  const indices = scores.map((_, k) => k + W);
  const found = SEG(scores, { tol: 3, indices });
  assert.deepEqual(found, [22, 43], `offset positions, got ${found}`);
});

test('SEG abstains on a flat curve and a thin background', () => {
  let s = 3 >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const flat = Array.from({ length: 120 }, () => 0.5 + 0.001 * rnd());   // no prominent peak
  assert.deepEqual(SEG(flat, { tol: 3 }), [], 'a flat curve has no boundaries');
  assert.deepEqual(SEG([1, 2], { tol: 1 }), [], 'a thin background cannot set a line → abstain');
  assert.deepEqual(SEG([], { tol: 1 }), []);
});

test('SEG is pure: no mutation, deterministic', () => {
  const c = curveWithPeaks(60, [20, 45], 11);
  const before = c.slice();
  const a = SEG(c, { tol: 3 }), b = SEG(c.slice(), { tol: 3 });
  assert.deepEqual(c, before, 'input must not be mutated');
  assert.deepEqual(a, b, 'same curve → same peaks');
});

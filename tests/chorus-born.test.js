// chorus-born — the Born measure keeps the distribution argmax threw away
// (docs/chorus.md, "The measure is Born"). Square the signed cosine amplitudes,
// normalize to sum one, and the weak projections are suppressed QUADRATICALLY —
// the signal-from-noise step a linear weighting cannot give.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  signedCosine, cubeAmplitudes, centeredAmplitudes, bornWeights, bornDistribution, sortedByWeight, topMass,
} from '../src/chorus/born.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('bornWeights squares, sums to one, and suppresses the weak quadratically', () => {
  const w = bornWeights([0.6, 0.8]);
  close(w[0], 0.36); close(w[1], 0.64);
  close(w[0] + w[1], 1);
  // linear would give 0.6/1.4 ≈ 0.43 for the weak; Born gives 0.36 — quadratically down.
  assert.ok(w[0] < 0.6 / (0.6 + 0.8));
});

test('the sign is kept to the square: ±amp weigh identically', () => {
  const w = bornWeights([-0.6, 0.8]);
  close(w[0], 0.36); close(w[1], 0.64);
});

test('an all-zero (or empty) reading is honest zeros — no fabricated uniform', () => {
  assert.deepEqual(bornWeights([0, 0, 0]), [0, 0, 0]);
  assert.deepEqual(bornWeights([]), []);
});

test('cubeAmplitudes projects a query onto every centroid, signed, skipping empties', () => {
  const q = [1, 0, 0];
  const vectors = { A: [1, 0, 0], B: [0, 1, 0], C: [-1, 0, 0], D: [] };
  const amps = cubeAmplitudes(q, vectors);
  assert.deepEqual(amps.map((a) => a.key), ['A', 'B', 'C']);   // D skipped
  close(amps[0].amp, 1); close(amps[1].amp, 0); close(amps[2].amp, -1);
});

test('signedCosine is signed and safe on a zero vector', () => {
  close(signedCosine([1, 0], [-1, 0]), -1);
  close(signedCosine([0, 0], [1, 0]), 0);
});

test('bornDistribution carries key, raw amp, and normalized weight in input order', () => {
  const dist = bornDistribution([{ key: 'X', amp: 0.6 }, { key: 'Y', amp: -0.8 }]);
  assert.deepEqual(dist.map((c) => c.key), ['X', 'Y']);
  close(dist[0].weight, 0.36); close(dist[1].weight, 0.64);
  assert.equal(dist[1].amp, -0.8, 'the raw signed amp survives for Probe B');
});

test('sortedByWeight is descending and deterministic on ties (input order breaks them)', () => {
  const dist = bornDistribution([{ key: 'a', amp: 0.5 }, { key: 'b', amp: 0.5 }, { key: 'c', amp: 0.9 }]);
  const s = sortedByWeight(dist);
  assert.equal(s[0].key, 'c');
  assert.deepEqual([s[1].key, s[2].key], ['a', 'b'], 'ties keep input order');
});

test('centeredAmplitudes signs each cell around the clause mean, concentrating the squares', () => {
  // correlated centroids → all-large-positive raw cosines: the raw Born mass is
  // spread thin; centering turns them signed and concentrates it.
  const raw = [{ key: 'a', amp: 0.9 }, { key: 'b', amp: 0.85 }, { key: 'c', amp: 0.5 }];
  const centered = centeredAmplitudes(raw);
  close(centered.reduce((s, a) => s + a.amp, 0), 0, 1e-9);   // residuals sum to zero
  const rawTop = topMass(bornDistribution(raw), 1);
  const ctrTop = topMass(bornDistribution(centered), 1);
  assert.ok(ctrTop > rawTop, `centering concentrates: ${ctrTop} > ${rawTop}`);
});

test('centeredAmplitudes is empty on empty input — no fabricated center', () => {
  assert.deepEqual(centeredAmplitudes([]), []);
});

test('topMass reads the head fraction the governor and Probe A both use', () => {
  const dist = bornDistribution([{ key: 'a', amp: 0.9 }, { key: 'b', amp: 0.2 }, { key: 'c', amp: 0.1 }]);
  const m = topMass(dist, 1);
  const total = dist.reduce((s, c) => s + c.weight, 0);
  close(total, 1);
  assert.ok(m > 0.9, `sharp reading concentrates: ${m}`);
});

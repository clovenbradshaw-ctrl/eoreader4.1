// frame-mass — the Born partition that decides frame breaking in the enacted loop
// (docs "Born-measure frame breaking, and the stance as a fold"). Split a reading's
// Born distribution into the mass ON the frame (the cells its terms occupy) and the
// mass OFF it; the frame breaks when offMass > onMass — the reading's own mass
// crossing, not a hand-derived k·step bar.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { frameMassPartition, centeredAmplitudes, cubeAmplitudes } from '../src/chorus/born.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('a frame standing on the cells that carry most squared amplitude holds: onMass > offMass', () => {
  // The reading's mass concentrates on A and B (big amps, big squares); the frame
  // stands on {A, B}. onMass carries the concentration, offMass the residue.
  const amps = [
    { key: 'A', amp: 0.9 },
    { key: 'B', amp: 0.7 },
    { key: 'C', amp: 0.1 },
    { key: 'D', amp: -0.1 },
  ];
  const { onMass, offMass } = frameMassPartition(amps, new Set(['A', 'B']));
  close(onMass + offMass, 1);
  assert.ok(onMass > offMass, `${onMass} > ${offMass}`);
  // Squaring suppresses the weak C/D quadratically, so the frame holds firmly.
  assert.ok(onMass > 0.95, `onMass ${onMass} carries the squared concentration`);
});

test('a reading whose mass has moved off the frame breaks: offMass > onMass', () => {
  // The frame still stands on {A, B}, but the reading's mass has moved to C and D.
  const amps = [
    { key: 'A', amp: 0.1 },
    { key: 'B', amp: -0.1 },
    { key: 'C', amp: 0.9 },
    { key: 'D', amp: 0.7 },
  ];
  const { onMass, offMass } = frameMassPartition(amps, new Set(['A', 'B']));
  close(onMass + offMass, 1);
  assert.ok(offMass > onMass, `${offMass} > ${onMass}`);
});

test('an all-zero reading is honest zeros — no fabricated partition', () => {
  const { onMass, offMass } = frameMassPartition(
    [{ key: 'A', amp: 0 }, { key: 'B', amp: 0 }], new Set(['A']));
  assert.equal(onMass, 0);
  assert.equal(offMass, 0);
});

test('an empty reading is zeros', () => {
  assert.deepEqual(frameMassPartition([], new Set(['A'])), { onMass: 0, offMass: 0 });
  assert.deepEqual(frameMassPartition(null, new Set(['A'])), { onMass: 0, offMass: 0 });
});

test('the two shares are of ONE distribution — normalized over all amps, summing to one', () => {
  const amps = [{ key: 'A', amp: 0.6 }, { key: 'B', amp: 0.8 }];
  const on = frameMassPartition(amps, new Set(['A']));
  const off = frameMassPartition(amps, new Set(['B']));
  // A carries 0.36, B carries 0.64 of the SAME Born distribution.
  close(on.onMass, 0.36); close(off.onMass, 0.64);
  close(on.onMass + on.offMass, 1);
});

test('frameCellSet accepts a Set or a bare array of keys', () => {
  const amps = [{ key: 'A', amp: 0.9 }, { key: 'B', amp: 0.1 }];
  const asSet = frameMassPartition(amps, new Set(['A']));
  const asArr = frameMassPartition(amps, ['A']);
  close(asSet.onMass, asArr.onMass);
  assert.ok(asArr.onMass > asArr.offMass);
});

test('an empty frameCellSet puts all mass off-frame (a frame standing on nothing holds nothing)', () => {
  const amps = [{ key: 'A', amp: 0.9 }, { key: 'B', amp: 0.7 }];
  const { onMass, offMass } = frameMassPartition(amps, new Set());
  close(onMass, 0); close(offMass, 1);
});

test('composes with the real Born pipeline (centeredAmplitudes ∘ cubeAmplitudes)', () => {
  // A query aligned with centroid A; centering signs the residuals (A positive, B/C
  // negative), squaring concentrates mass on A. A frame on {A} holds; one on {C} breaks.
  const q = [0.9, 0.1, 0.1];
  const vectors = { A: [1, 0, 0], B: [0, 1, 0], C: [0, 0, 1] };
  const amps = centeredAmplitudes(cubeAmplitudes(q, vectors));
  const onA = frameMassPartition(amps, new Set(['A']));
  const onC = frameMassPartition(amps, new Set(['C']));
  assert.ok(onA.onMass > onA.offMass, `frame on A holds: ${onA.onMass}`);
  assert.ok(onC.offMass > onC.onMass, `frame on C breaks: ${onC.offMass}`);
});

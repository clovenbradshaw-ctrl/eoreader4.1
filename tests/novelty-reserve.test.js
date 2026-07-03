import { test } from 'node:test';
import assert from 'node:assert/strict';

import { noveltyAmplitude, surpriseAt, forwardDist, NOVELTY_RESERVE } from '../src/core/surprise.js';
import { parseText } from '../src/perceiver/parse/index.js';
import { readingAt } from '../src/perceiver/index.js';
import { predictiveSequenceReading } from '../src/surfer/sequence.js';

// THE SIGNAL-DERIVED NOVELTY RESERVE — the regression lock for experiments/exp-0002.
//
// The consolidated form of a population of ~10 variant PRs (#90, 92, 93, 94, 95, 97, 98,
// 103, 104): the reserve held open for an unseen atom stops being the hand-rolled constant
// NOVELTY_RESERVE and becomes the γ-decayed rate of recent first-appearances (the protention
// learning its own amplitude). Measured aggregate-flat against its controls (exp-0002): it
// ships OPT-IN behind `opts.signalReserve` and is NOT promoted. This lock therefore pins TWO
// contracts at once: (1) the default path is byte-identical (the parity gate — the cardinal
// rule), and (2) the opt-in path's exact arithmetic, so a future cycle changes it on purpose.

// --- Mechanism: the γ-decayed count of recent first-appearances. ------------------------
test('noveltyAmplitude — Σ γ^(at−1−f) over first-appearances strictly before `at`', () => {
  // first seen at steps 0,1,2, evaluated at step 3, γ=0.7 → γ²+γ¹+γ⁰ = 0.49+0.7+1 = 2.19
  assert.equal(Math.round(noveltyAmplitude([0, 1, 2], 3, 0.7) * 100) / 100, 2.19);
  // strictly causal — a first-appearance AT `at` (the future) does not count
  assert.equal(noveltyAmplitude([0, 1, 2, 3], 3, 0.7), noveltyAmplitude([0, 1, 2], 3, 0.7));
  // cold start — no prior first-appearances → 0 (callers fall back to the SEED)
  assert.equal(noveltyAmplitude([], 3, 0.7), 0);
  // a lone recent newcomer decays toward the SEED weight γ⁰ = 1
  assert.equal(noveltyAmplitude([2], 3, 0.7), 1);
});

// --- The opening guards: a zero reserve is well-defined, no divide-by-zero, no name-snow. -
test('surpriseAt / forwardDist guard a zero reserve (the opening) instead of returning NaN', () => {
  assert.deepEqual(surpriseAt(new Map(), new Map(), { gamma: 0.7, novelty: 0 }), { bayesBits: 0, bayesBy: {} });
  assert.deepEqual(forwardDist(new Map(), { novelty: 0 }), { dist: [], reserve: 0, Z: 0 });
  // the default reserve (> 0) never trips the guard, so the text path is untouched
  assert.equal(NOVELTY_RESERVE, 1.0);
});

const STORY = 'Ada Long spoke. Ada Long spoke. Ben Cole arrived. Ben Cole spoke. Cara Dove entered. Cara Dove spoke.';

// --- Parity gate: opts.signalReserve OFF reproduces the goldens byte-for-byte. -----------
test('default reading is byte-identical with the reserve OFF (the parity gate)', () => {
  const doc = parseText(STORY, { docId: 'gold' });
  const at = (c) => { const r = readingAt(doc, c); return [r.surprisalBits, r.bayesBits]; };
  assert.deepEqual(at(0), [0, 0]);
  assert.deepEqual(at(1), [1, 0.05]);
  assert.deepEqual(at(2), [1.43, 0.2]);
  assert.deepEqual(at(4), [1.82, 0.26]);
});

// --- Ontogeny: the reserve tracks the recent newcomer rate, ON, with exact values. -------
test('opts.signalReserve ON makes the reserve track recent novelty — pinned exact values', () => {
  const doc = parseText(STORY, { docId: 'sig' });
  const at = (c) => { const r = readingAt(doc, c, { signalReserve: true }); return [r.surprisalBits, r.bayesBits]; };
  assert.deepEqual(at(0), [0, 0],       'the opening is still exactly zero (no prior to move against)');
  assert.deepEqual(at(1), [1, 0.05],    'a confirming recurrence is unchanged — no newcomers to re-weigh');
  // c=2: only ONE recent first-appearance (Ada, decayed) → a THIN reserve → Ben is MORE of a
  // shock than under the flat constant (default 0.2 → 0.3).
  assert.deepEqual(at(2), [1.78, 0.3],  'thin recent novelty → newcomer is a sharper shock');
  // c=4: a recent newcomer (Ben at step 2) lifts the reserve → Cara is LESS of a shock
  // than under the flat constant (default 0.26 → 0.25).
  assert.deepEqual(at(4), [1.78, 0.25], 'recent novelty fills the reserve → newcomer softer');
});

// --- The second sense: the surfer/n-gram reader shares the SAME interior (it is the core).
test('the surfer sequence reader inherits the signal-derived reserve (one interior, two senses)', () => {
  const doc = parseText('Ada spoke. Ben arrived. Ada smiled. Cara entered. Ben left. Dan arrived.', { docId: 'sq' });
  const off = predictiveSequenceReading(doc).map(s => s.bits);
  const on  = predictiveSequenceReading(doc, { signalReserve: true }).map(s => s.bits);
  assert.notDeepEqual(on, off, 'the flag changes the sequence reader too — the reserve lives in the core');
  assert.deepEqual(on, [1, 2.078, 1.143, 2.884, 1.168], 'pinned exact values with the reserve ON');
});

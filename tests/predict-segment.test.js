import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestMusic } from '../src/organs/in/music.js';
import { predictiveSequenceReading } from '../src/surfer/sequence.js';
import {
  learnBoundaries, learnBoundariesFromSurprise, segmentationScore,
  surpriseBoundaries, predictGrained, gradeGrained,
} from '../src/predict/index.js';

const tune = (notes) => ingestMusic({ name: 't', notes });

// Frère Jacques ×2 — 16 true phrase starts.
const FRERE = (() => {
  const once = [
    ['C4','D4','E4','C4'], ['C4','D4','E4','C4'],
    ['E4','F4','G4'], ['E4','F4','G4'],
    ['G4','A4','G4','F4','E4','C4'], ['G4','A4','G4','F4','E4','C4'],
    ['C4','G3','C4'], ['C4','G3','C4'],
  ];
  const phrases = [...once, ...once];
  const notes = phrases.flat();
  const truth = []; { let c = 0; for (const p of phrases) { truth.push(c); c += p.length; } }
  return { notes, truth };
})();

// ── segmentationScore arithmetic ──────────────────────────────────────────────
test('segmentationScore matches cuts within tolerance and ignores the 0 start', () => {
  const s = segmentationScore([0, 4, 9, 20], [0, 4, 8, 14], { tol: 1 });
  assert.equal(s.tp, 2, '4 matches 4, 9 matches 8 within ±1; 20 misses');
  assert.equal(s.found, 3);   // 0 excluded
  assert.equal(s.truth, 3);
  assert.ok(s.precision > 0 && s.recall > 0 && s.f1 > 0);
});

// ── the learned threshold is signal-derived, peaks, and gapped ────────────────
test('learnBoundariesFromSurprise always returns 0 first and respects minGap', () => {
  const series = [1,2,3,4,5,6,7,8].map((at) => ({ at, surprise: at % 2 ? 0.9 : 0.1 }));
  const b = learnBoundariesFromSurprise(series, { alpha: 0.5, minGap: 3 });
  assert.equal(b[0], 0, 'the start is always a boundary');
  for (let i = 1; i < b.length; i++) assert.ok(b[i] - b[i - 1] >= 3, 'no two cuts within minGap');
});

test('an empty series degenerates to a single boundary at 0', () => {
  assert.deepEqual(learnBoundariesFromSurprise([], {}), [0]);
});

// ── the headline: learned beats the naive flat threshold by a wide margin ─────
test('signal-derived segmentation beats the naive flat threshold on Frère ×2', () => {
  const doc = tune(FRERE.notes);
  const steps = predictiveSequenceReading(doc, { order: 2 });
  const naive = surpriseBoundaries(steps, { cut: 0.7 });
  const learned = learnBoundaries(doc, { order: 2, alpha: 0.4 });
  const naiveF1 = segmentationScore(naive, FRERE.truth).f1;
  const learnedF1 = segmentationScore(learned, FRERE.truth).f1;
  assert.ok(naive.length > 30, `naive flat threshold over-fires (${naive.length} cuts)`);
  assert.ok(learned.length <= 20, `learned stays near the true count (${learned.length} cuts)`);
  assert.ok(learnedF1 >= naiveF1 + 0.25, `learned F1 ${learnedF1} >> naive F1 ${naiveF1}`);
  assert.ok(learnedF1 >= 0.75, `learned segmentation is good (F1 ${learnedF1})`);
});

// ── end-to-end: no human boundaries, the predictor still improves ─────────────
test('grain-nested with LEARNED boundaries beats flat order-1 (fully self-supervised)', () => {
  const doc = tune(FRERE.notes);
  const flat1 = predictiveSequenceReading(doc, { order: 1 }).filter((s) => s.hit).length;
  // no boundaries passed → predictGrained learns them from surprise
  const learned = gradeGrained(predictGrained(doc, { order: 1 }));
  assert.ok(learned.composite.hits > flat1, `learned-boundary composite (${learned.composite.hits}) > flat order-1 (${flat1})`);
});

test('predictGrained learns boundaries when none are given (no crash, sane count)', () => {
  const doc = tune(FRERE.notes);
  const res = predictGrained(doc, { order: 2 });   // boundaries: null → learned
  assert.ok(res.starts.length >= 2 && res.starts.length <= 20, `sane learned cut count (${res.starts.length})`);
  assert.equal(res.starts[0], 0);
});

// ── falsification: a structureless signal yields few confident cuts ───────────
test('a random signal does not get crowded with learned boundaries', () => {
  const notes = ['A4','E4','B4','C4','D4','D5','D4','A4','E5','C4','D5','F4','C4','D4','B4','B4',
                 'D4','F4','D4','D5','B4','C4','E5','D4','F4','E5','C4','E5','E5','B4','C4','F4'];
  const learned = learnBoundaries(tune(notes), { order: 2, alpha: 0.4 });
  // with no real phrase structure, the peak+gap+quantile guards keep cuts sparse
  assert.ok(learned.length <= 12, `random signal stays sparsely cut (${learned.length})`);
});

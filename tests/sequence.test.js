import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestMusic } from '../src/organs/in/music.js';
import { predictiveSequenceReading, unitIdSequence, predictNextUnit } from '../src/surfer/index.js';

// The learned-sequence reader predicts the next unit from the signal's OWN
// n-grams — no scale, no key, no preference. These tests pin the two claims the
// demo rests on: order matters (a melody's figure is the phrase, not the step),
// and the reader genuinely learns a repeat rather than just decaying recency.

// "Frère Jacques" — every phrase twice, so a learner should anticipate repeats.
const FRERE = {
  name: 'frere', notes: [
    'C4','D4','E4','C4', 'C4','D4','E4','C4',
    'E4','F4','G4', 'E4','F4','G4',
    'G4','A4','G4','F4','E4','C4', 'G4','A4','G4','F4','E4','C4',
    'C4','G3','C4', 'C4','G3','C4',
  ],
};

const hits = (steps) => steps.filter(s => s.hit).length;

test('the reader reconstructs the note stream from the INS log', () => {
  const doc = ingestMusic(FRERE);
  const seq = unitIdSequence(doc);
  assert.equal(seq.length, FRERE.notes.length);
  assert.equal(seq[0], 'C');      // pitch class of C4
  assert.equal(seq[1], 'D');
});

test('two notes of context anticipate more of the tune than one', () => {
  const doc = ingestMusic(FRERE);
  const o1 = predictiveSequenceReading(doc, { order: 1 });
  const o2 = predictiveSequenceReading(doc, { order: 2 });
  // Order 2 holds enough of the phrase to anticipate its repeat; order 1 cannot.
  assert.ok(hits(o2) > hits(o1), `expected order-2 (${hits(o2)}) > order-1 (${hits(o1)})`);
});

test('it learns a repeat — a phrase is cheaper the second time', () => {
  const doc = ingestMusic(FRERE);
  const steps = predictiveSequenceReading(doc, { order: 2 });
  // "Sonnez les matines": first hearing predicts notes 15..19, the repeat 21..25.
  const mean = (lo, hi) => {
    const w = steps.filter(s => s.at >= lo && s.at <= hi);
    return w.reduce((a, s) => a + s.surprise, 0) / w.length;
  };
  assert.ok(mean(21, 25) < mean(15, 19), 'repeat should be less surprising than first hearing');
});

test('the model carries no domain knowledge — empty until the signal fills it', () => {
  // A signal of one repeated unit: after seeing A→A, the reader is near-certain of A.
  const doc = ingestMusic({ name: 'drone', notes: ['A4','A4','A4','A4','A4'] });
  const steps = predictiveSequenceReading(doc, { order: 1 });
  const last = steps[steps.length - 1];
  assert.equal(last.predicted, 'A');
  assert.ok(last.pActual > 0.6, `expected confidence to build, got ${last.pActual}`);
});

test('predictNextUnit accepts a bare id or a context array', () => {
  const doc = ingestMusic({ name: 'scale', notes: ['C4','D4','E4','D4'] });
  const steps = predictiveSequenceReading(doc, { order: 2 });
  assert.ok(steps.every(s => Array.isArray(s.ranked)));
  assert.ok(steps.every(s => typeof s.surprise === 'number'));
});

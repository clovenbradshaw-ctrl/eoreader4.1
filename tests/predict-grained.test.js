import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestMusic } from '../src/organs/in/music.js';
import { predictiveSequenceReading } from '../src/surfer/sequence.js';
import {
  predictGrained, gradeGrained, predictionTaskGraph,
  prefixOverlap, phraseSimilarity, surpriseBoundaries,
} from '../src/predict/index.js';
import { PATTERN } from '../src/tasks/index.js';

// ── overlap, the Level-1 measure ──────────────────────────────────────────────
test('prefixOverlap is hits/len of the short run aligned to the template', () => {
  assert.equal(prefixOverlap(['C', 'D'], ['C', 'D', 'E', 'C']), 1);
  assert.equal(prefixOverlap(['C', 'X'], ['C', 'D', 'E']), 0.5);
  assert.equal(prefixOverlap([], ['C']), 0);
});

test('phraseSimilarity penalises a length mismatch (a prefix is not the phrase)', () => {
  assert.equal(phraseSimilarity(['C', 'D', 'E'], ['C', 'D', 'E']), 1);
  assert.equal(phraseSimilarity(['C', 'D'], ['C', 'D', 'E', 'F']), 0.5); // 2 hits / max len 4
});

test('surpriseBoundaries returns sorted unique starts including 0', () => {
  const steps = [{ at: 2, surprise: 0.9 }, { at: 5, surprise: 0.2 }, { at: 7, surprise: 0.8 }];
  assert.deepEqual(surpriseBoundaries(steps, { cut: 0.7 }), [0, 2, 7]);
});

// ── the predictor shape ───────────────────────────────────────────────────────
const tune = (notes) => ingestMusic({ name: 't', notes });

test('predictGrained yields one step per prediction with both grains', () => {
  const doc = tune(['C4', 'D4', 'E4', 'C4', 'C4', 'D4', 'E4', 'C4']);
  const { steps } = predictGrained(doc, { order: 2, boundaries: [0, 4] });
  assert.equal(steps.length, 7);                       // n-1 predictions
  const s = steps[0];
  for (const k of ['figure', 'pattern', 'composite', 'boundary', 'routedGrain']) assert.ok(k in s, k);
  assert.ok('pred' in s.figure && 'hit' in s.composite);
});

// ── NO HARM: a confident Figure is never overridden ───────────────────────────
test('on a periodic signal the note grain holds and Pattern never overrides it', () => {
  // C G C G … — an order-1 Markov nails it; the gate must keep Figure.
  const doc = tune(Array.from({ length: 24 }, (_, i) => (i % 2 ? 'G4' : 'C4')));
  const g = gradeGrained(predictGrained(doc, { order: 1, boundaries: [0, 6, 12, 18] }));
  assert.equal(g.composite.hits, g.figure.hits, 'composite equals figure — no override, no harm');
  assert.ok(g.figure.rate > 0.9, 'and the note grain alone already reads it');
});

// ── NO HARM: a structureless signal gets no spurious lift ─────────────────────
test('a random signal gets no spurious Pattern lift (falsification control)', () => {
  const notes = ['A4','E4','B4','C4','D4','D5','D4','A4','E5','C4','D5','F4','C4','D4','B4','B4',
                 'D4','F4','D4','D5','B4','C4','E5','D4','F4','E5','C4','E5','E5','B4','C4','F4'];
  const g = gradeGrained(predictGrained(tune(notes), { order: 2, boundaries: [0,4,8,11,14,20,26,29] }));
  assert.ok(g.lift <= 0.03, `no meaningful lift without structure (got ${g.lift})`);
  assert.ok(g.lift >= -0.06, `and no meaningful harm either (got ${g.lift})`);
});

// ── THE THESIS: compose a small Figure with a Pattern grain > raise the order ──
const FRERE = (() => {
  const once = [
    ['C4','D4','E4','C4'], ['C4','D4','E4','C4'],
    ['E4','F4','G4'], ['E4','F4','G4'],
    ['G4','A4','G4','F4','E4','C4'], ['G4','A4','G4','F4','E4','C4'],
    ['C4','G3','C4'], ['C4','G3','C4'],
  ];
  const phrases = [...once, ...once];                  // ×2 so transitions repeat
  const notes = phrases.flat();
  const boundaries = []; { let c = 0; for (const p of phrases) { boundaries.push(c); c += p.length; } }
  return { notes, boundaries };
})();

test('grain-nested(order-1) beats its own flat order-1 on a repeat-rich signal', () => {
  const doc = tune(FRERE.notes);
  const g = gradeGrained(predictGrained(doc, { order: 1, boundaries: FRERE.boundaries }));
  assert.ok(g.composite.hits > g.figure.hits, `pattern grain adds hits (${g.composite.hits} > ${g.figure.hits})`);
});

test('grain-nested(order-1) ≥ flat order-2 — composing small beats cranking the order', () => {
  const doc = tune(FRERE.notes);
  const flat2 = predictiveSequenceReading(doc, { order: 2 }).filter(s => s.hit).length;
  const grain1 = gradeGrained(predictGrained(doc, { order: 1, boundaries: FRERE.boundaries })).composite.hits;
  assert.ok(grain1 >= flat2, `order-1+Pattern (${grain1}) ≥ flat order-2 (${flat2})`);
});

// ── composed through the task graph: surprise → grain-coherence ───────────────
test('predictionTaskGraph builds the grain tree and flags boundary notes incoherent', async () => {
  const doc = tune(['C4','D4','E4','C4','C4','D4','E4','C4','E4','F4','G4','E4','F4','G4']);
  const boundaries = [0, 4, 8, 11];
  const { graph, incoherent } = await predictionTaskGraph(doc, { order: 2, boundaries });
  assert.equal(graph.root.object, PATTERN, 'the piece is a Pattern over phrases');
  assert.equal(graph.root.children.length, 4, 'one Pattern branch per phrase');
  assert.ok(graph.root.children.every(c => c.object === PATTERN), 'each phrase is a Pattern branch');
  // every phrase-start note is declared Pattern (surprise routes up) → flagged a
  // Figure-maker handed a Pattern goal.
  assert.equal(incoherent.length, boundaries.length, 'one flag per phrase boundary');
});

// ── grading arithmetic ────────────────────────────────────────────────────────
test('gradeGrained counts figure, composite, lift, and boundary tallies', () => {
  const doc = tune(FRERE.notes);
  const res = predictGrained(doc, { order: 1, boundaries: FRERE.boundaries });
  const g = gradeGrained(res);
  assert.equal(g.n, res.steps.length);
  assert.equal(g.composite.hits, res.steps.filter(s => s.composite.hit).length);
  assert.equal(g.lift, Math.round((g.composite.hits - g.figure.hits) / g.n * 1000) / 1000);
  assert.equal(g.boundary.n, res.steps.filter(s => s.boundary).length);
});

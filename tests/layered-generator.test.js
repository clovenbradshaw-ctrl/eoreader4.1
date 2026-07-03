import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLayeredGenerator } from '../src/surfer/index.js';

// The layered generative stack: many layers of meaning at once, each conditioned on the
// one above, each independently re-groundable. Coherence lives high, fluency low.

// 20 sentences; a SLOW top layer (two long runs) over a FAST bottom layer (cycling).
const sentences = Array.from({ length: 20 }, (_, i) => ['w' + (i % 4), 'x' + (i % 3), '.']);
const layers = [
  { name: 'paradigm', syms: Array.from({ length: 20 }, (_, i) => (i < 10 ? 'A' : 'B')), order: 1 },   // slow
  { name: 'topic', syms: Array.from({ length: 20 }, (_, i) => 't' + (i % 3)), order: 2 },             // fast
];

test('the stack builds and generates a symbol per layer plus surface text', () => {
  const G = createLayeredGenerator({ layers, sentences, order: 2, tokenOrder: 2 });
  assert.deepEqual(G.layers, ['paradigm', 'topic']);
  const gen = G.generate(8, { seed: 3 });
  assert.equal(gen.length, 8);
  for (const g of gen) {
    assert.ok('paradigm' in g.symbols && 'topic' in g.symbols, 'every layer chose a symbol');
    assert.equal(typeof g.text, 'string');
  }
});

test('the layers hold at different timescales — slow above, fast below', () => {
  const G = createLayeredGenerator({ layers, sentences, order: 2 });
  const c = G.sourceCoherence();
  assert.ok(c.paradigm > c.topic, `the slow layer has longer runs than the fast one (${c.paradigm} > ${c.topic})`);
});

test('re-grounding ONE layer relocates it without erroring the others', () => {
  const G = createLayeredGenerator({ layers, sentences, order: 2, tokenOrder: 2 });
  const base = G.generate(10, { seed: 9 });
  const re = G.generate(10, { seed: 9, regroundAt: { 5: 'paradigm' } });
  assert.equal(re[5].regrounded, 'paradigm', 'the targeted layer is marked re-grounded at that step');
  assert.equal(re.length, 10);
  // the steps before the re-ground are identical (same seed, same draws up to that point)
  for (let i = 0; i < 5; i++) assert.equal(re[i].symbols.paradigm, base[i].symbols.paradigm);
});

test('coherenceOf reports per-layer run-lengths of a generation', () => {
  const G = createLayeredGenerator({ layers, sentences, order: 2 });
  const gen = G.generate(12, { seed: 1 });
  const c = G.coherenceOf(gen);
  assert.ok('paradigm' in c && 'topic' in c);
  assert.ok(c.paradigm >= 1 && c.topic >= 1);
});

test('deterministic — same layers, same seed, same generation', () => {
  const G = createLayeredGenerator({ layers, sentences, order: 2 });
  assert.deepEqual(G.generate(8, { seed: 4 }), G.generate(8, { seed: 4 }));
});

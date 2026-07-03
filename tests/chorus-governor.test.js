// chorus-governor — voice by cumulative mass to a coverage budget, no k to tune
// (docs/chorus.md, "The governor"), and the three faces as axis-marginals of the
// cube (docs/chorus.md, "The fold-voice").

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { govern, DEFAULT_COVERAGE } from '../src/chorus/governor.js';
import { bornDistribution } from '../src/chorus/born.js';
import { cellCoords, cubeMarginals, marginalCells } from '../src/chorus/marginals.js';

const distOf = (pairs) => pairs.map(([key, weight]) => ({ key, weight }));
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('a sharp reading voices one cell; the tail falls silent on its own', () => {
  const g = govern(distOf([['A', 0.95], ['B', 0.03], ['C', 0.02]]), { coverage: 0.8 });
  assert.equal(g.k, 1);
  assert.deepEqual(g.voiced.map((c) => c.key), ['A']);
  assert.deepEqual(g.silent.map((c) => c.key), ['B', 'C']);
});

test('an ambiguous reading voices several — the count is whatever the reading needs', () => {
  const g = govern(distOf([['A', 0.5], ['B', 0.3], ['C', 0.15], ['D', 0.05]]), { coverage: 0.8 });
  assert.equal(g.k, 2, 'no k was set — the distribution chose 2');
  close(g.massVoiced, 0.8);
});

test('the crossing cell is included — the running sum stops AT the budget', () => {
  const g = govern(distOf([['A', 0.7], ['B', 0.2], ['C', 0.1]]), { coverage: 0.8 });
  assert.deepEqual(g.voiced.map((c) => c.key), ['A', 'B']);
});

test('coverage is a readable knob, not a magic number: raising it voices more tail', () => {
  const d = distOf([['A', 0.6], ['B', 0.25], ['C', 0.1], ['D', 0.05]]);
  assert.equal(govern(d, { coverage: 0.5 }).k, 1);
  assert.ok(govern(d, { coverage: 0.95 }).k >= 3);
});

test('an all-zero distribution voices nothing — silence is the honest reading', () => {
  const g = govern(bornDistribution([{ key: 'A', amp: 0 }, { key: 'B', amp: 0 }]));
  assert.equal(g.k, 0);
  assert.equal(g.voiced.length, 0);
  assert.equal(g.silent.length, 2, 'the cells are kept WITH their address, never dropped');
});

test('the silent tail keeps every cell — recoverability is the whole point', () => {
  const d = distOf([['A', 0.9], ['B', 0.06], ['C', 0.04]]);
  const g = govern(d, { coverage: DEFAULT_COVERAGE });
  assert.equal(g.voiced.length + g.silent.length, 3);
});

// ── the marginals: lens and cell are ONE structure ──────────────────────────

test('cellCoords decomposes OP_Stance_Site into the cube coordinates', () => {
  const c = cellCoords('INS_Cultivating_Void');
  assert.equal(c.op, 'INS');
  assert.equal(c.mode, 'Generate');
  assert.equal(c.domain, 'Existence');
  assert.equal(c.grain, 'Ground');
  assert.equal(c.site, 'Void');
  assert.equal(c.stance, 'Cultivating');
});

test('the three faces are axis-marginals: each sums the cube over the third axis', () => {
  const dist = bornDistribution([
    { key: 'INS_Cultivating_Void', amp: Math.sqrt(0.5) },
    { key: 'INS_Making_Entity', amp: Math.sqrt(0.3) },
    { key: 'CON_Binding_Link', amp: Math.sqrt(0.2) },
  ]);
  const m = cubeMarginals(dist);
  // Act marginal (over grain): INS = 0.5+0.3, CON = 0.2
  close(m.act.INS, 0.8); close(m.act.CON, 0.2);
  // Site marginal (over mode): Void, Entity, Link each carry their cell's mass
  close(m.site.Void, 0.5); close(m.site.Entity, 0.3); close(m.site.Link, 0.2);
  // Stance marginal (over domain)
  close(m.stance.Cultivating, 0.5); close(m.stance.Making, 0.3); close(m.stance.Binding, 0.2);
  // each marginal sums to the cube's total mass (1)
  for (const face of ['act', 'site', 'stance'])
    close(Object.values(m[face]).reduce((s, x) => s + x, 0), 1);
});

test('marginalCells returns a face sorted descending — the render/governor form', () => {
  const dist = bornDistribution([
    { key: 'INS_Cultivating_Void', amp: Math.sqrt(0.2) },
    { key: 'INS_Making_Entity', amp: Math.sqrt(0.8) },
  ]);
  const act = marginalCells(cubeMarginals(dist), 'act');
  assert.equal(act[0].key, 'INS');
  close(act[0].weight, 1);
});

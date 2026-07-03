import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createGrowingBasis } from '../src/surfer/index.js';

// The growing basis: the cells learned, not shipped. A new cell composes only when
// misfits COHERE — recurring unframed meaning — never on scattered novelty.

const e = (i, d = 8) => { const v = new Array(d).fill(0); v[i] = 1; return v; };
const PRIOR = { vectors: { A: e(0), B: e(1), C: e(2) } };   // three orthonormal shipped cells
// a vector near direction k with a little deterministic jitter on another axis
const near = (k, j, w) => { const v = e(k); v[j] = w; return v; };

test('units near existing cells fit; the basis does not grow', () => {
  const g = createGrowingBasis(PRIOR, { minCluster: 3 });
  for (const k of [0, 1, 2, 0, 1, 2]) {
    const r = g.admit(near(k, (k + 3) % 8, 0.1));
    assert.ok(r.fit, `a unit near cell ${k} fits`);
    assert.equal(r.composed, null);
  }
  assert.equal(g.learnedCount, 0, 'no cells composed for in-frame units');
});

test('a COHERING cluster of misfits composes a new cell (REC Composing a Paradigm)', () => {
  const g = createGrowingBasis(PRIOR, { minCluster: 3 });
  // a recurring unframed direction (near e5), jittered
  const jit = [0.0, 0.06, -0.05];
  let composedKey = null;
  jit.forEach((w, i) => { const r = g.admit(near(5, 6, w), { label: `m${i}` }); if (r.composed) composedKey = r.composed; });
  assert.ok(composedKey, 'three cohering misfits compose a cell');
  assert.match(composedKey, /REC_Composing_Paradigm#/);
  assert.equal(g.learnedCount, 1);
  assert.equal(g.log.at(-1).stance, 'Composing');
  assert.equal(g.log.at(-1).site, 'Paradigm');
  // and now a further unit in that direction FITS the learned cell
  const r = g.admit(near(5, 6, 0.02));
  assert.ok(r.fit && r.cellKey === composedKey, 'the once-unframed reading now has a home');
});

test('scattered misfits compose NOTHING — novelty without coherence is not a category', () => {
  const g = createGrowingBasis(PRIOR, { minCluster: 3 });
  // three misfits in mutually distant directions
  for (const k of [5, 6, 7]) { const r = g.admit(e(k)); assert.equal(r.composed, null); }
  assert.equal(g.learnedCount, 0, 'unframed but incoherent units do not form a cell');
  assert.ok(g.pendingMisfits >= 3, 'they are buffered, not acted on');
});

test('the belongs-floor is derived from the cells\' geometry, not hand-set', () => {
  const g = createGrowingBasis(PRIOR);
  assert.ok(g.floor >= 0.2 && g.floor <= 0.95, 'a sane derived floor');
  // a unit orthogonal to every cell is a misfit; a unit on a cell fits
  assert.ok(g.residualOf(e(7)) > g.residualOf(e(0)), 'an off-frame unit has higher residual than an on-cell one');
});

test('the grown bundle carries the learned cell, ready for the rest of the column', () => {
  const g = createGrowingBasis(PRIOR, { minCluster: 2 });
  g.admit(near(4, 5, 0.05)); g.admit(near(4, 5, -0.03));
  const bundle = g.bundle();
  const keys = Object.keys(bundle.vectors);
  assert.ok(keys.length > 3, 'the bundle grew past the three shipped cells');
  assert.ok(keys.some(k => k.includes('#')), 'it carries the learned cell, in prior shape');
});

test('deterministic — same units, same growth', () => {
  const run = () => { const g = createGrowingBasis(PRIOR, { minCluster: 3 }); [0.0, 0.06, -0.05].forEach(w => g.admit(near(5, 6, w))); return { n: g.learnedCount, log: g.log }; };
  assert.deepEqual(run(), run());
});

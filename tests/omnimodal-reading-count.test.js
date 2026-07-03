import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDensity, eigenLenses, DEF } from '../src/core/index.js';

// ── the regression lock for exp-0003: the geography-derived reading count ─────
//
// DEF is the omnimodal sense's answer to "how many readings does this
// field NUL?" — not a universal constant but a property of the spectrum's shape,
// read as a void over the GAP spectrum (deriveNull, log scale). The capability:
//   • a spectrum with a real elbow returns the elbow k (structure);
//   • a FLAT spectrum (isotropic noise, one register, a collinear field) abstains
//     with k=1 — the same test that counts also refuses to over-read;
//   • it is pure on the eigenvalues (no module state, no mutation) so the count is
//     stable — the parity property every memoized reader depends on.
// The lock fails the day any of these preconditions changes.

const rng = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

// build a density's Born spectrum from a stream of vectors: remove the common mode
// (per-dim mean), normalise to directions, then read the eigenlens weights — the
// same front-end the omnimodal sense uses so the spectrum reflects the readings, not
// the DC that would otherwise swamp them.
const spectrum = (vectors) => {
  const norm = (v) => Math.sqrt(v.reduce((a, b) => a + b * b, 0));
  const D = vectors[0].length, T = vectors.length;
  const mean = new Array(D).fill(0);
  for (const v of vectors) for (let i = 0; i < D; i++) mean[i] += v[i] / T;
  const dirs = vectors.map((v) => {
    const c = v.map((x, i) => x - mean[i]); const n = norm(c) || 1; return c.map((x) => x / n);
  });
  return eigenLenses(buildDensity(dirs).rho).map((l) => l.weight);
};

// K readings: units cluster around K orthonormal axes with light jitter → K-block spectrum
const kReadingStream = (dim, K, per, seed, jitter = 0.2) => {
  const r = rng(seed), out = [];
  for (let k = 0; k < K; k++)
    for (let i = 0; i < per; i++) {
      const v = new Array(dim).fill(0).map(() => jitter * gauss(r));
      v[k] += 1;                              // the reading's axis dominates
      out.push(v);
    }
  return out;
};

test('DEF finds the elbow k on a spectrum with a real gap', () => {
  // a plateau of K equal readings then a noise floor — the elbow sits at K
  const withGap = (K) => [...Array(K).fill(1), ...Array(15).fill(0.02).map((x, i) => x - i * 1e-4)];
  for (const K of [2, 3, 5]) {
    const rc = DEF(withGap(K));
    assert.equal(rc.abstain, false, `K=${K} plateau should read as structure`);
    assert.equal(rc.k, K, `elbow should sit at k=${K}, got ${rc.k}`);
  }
  // a single reading over a flat noise tail still reads ≥2 groups (a gap was cleared);
  // the min-2 lives on the structure branch, never on the abstain branch below.
  assert.equal(DEF(withGap(1)).abstain, false);
});

test('DEF finds real structure through the engine (not flat)', () => {
  // three jittered clusters → a genuine elbow: the count is signal-set (≥2), not a cap
  const rc = DEF(spectrum(kReadingStream(24, 3, 30, 13)));
  assert.equal(rc.abstain, false, 'three separated clusters are structure, not noise');
  assert.ok(rc.k >= 2 && rc.k <= 4, `count tracks the geography, got k=${rc.k}`);
});

test('DEF abstains (k=1) on a flat / isotropic spectrum', () => {
  // pure isotropic noise: no axis dominates → flat spectrum → one reading, abstain
  const r = rng(101);
  const noise = Array.from({ length: 160 }, () => Array.from({ length: 24 }, () => gauss(r)));
  const rc = DEF(spectrum(noise));
  assert.equal(rc.abstain, true, 'isotropic noise must abstain');
  assert.equal(rc.k, 1, 'isotropic noise holds exactly one reading');
});

test('DEF abstains on a single-register (near rank-1) field', () => {
  const r = rng(202), axis = Array.from({ length: 24 }, () => gauss(r));
  const collinear = Array.from({ length: 120 }, () => axis.map((x) => x + 0.03 * gauss(r)));
  const rc = DEF(spectrum(collinear));
  assert.equal(rc.k, 1, 'a collinear field is one reading');
  assert.equal(rc.abstain, true);
});

test('DEF is pure: no mutation, deterministic, cap respected', () => {
  const ev = [1, 1, 1, 0.02, 0.019, 0.018, 0.017, 0.016];
  const before = ev.slice();
  const a = DEF(ev), b = DEF(ev.slice());
  assert.deepEqual(ev, before, 'input array must not be mutated');
  assert.deepEqual(a, b, 'same spectrum → same reading count');
  assert.equal(a.k, 3, 'three towering eigenvalues → k=3');
  // the maxK cap holds even when the elbow sits past it
  const many = Array.from({ length: 20 }, (_, i) => (i < 15 ? 1 - i * 0.001 : 0.001));
  assert.ok(DEF(many, { maxK: 4 }).k <= 4, 'maxK caps the count');
});

test('DEF is safe on degenerate inputs', () => {
  assert.deepEqual(DEF([]), { k: 0, gap: 0, floor: null, abstain: true });
  assert.equal(DEF([0.5]).k, 1);
  assert.equal(DEF([Infinity, NaN, 0.3]).k, 1);   // non-finite filtered, one left
});

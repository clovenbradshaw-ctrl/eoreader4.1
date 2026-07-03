import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  betai, betaInv, createBetaFilter, createEwFilter,
} from '../src/credence/filters.js';

// ── The regularized incomplete Beta and its inverse (the credible interval) ────

test('betai(1,1,x) is the uniform CDF — equals x', () => {
  for (const x of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    assert.ok(Math.abs(betai(1, 1, x) - x) < 1e-9, `I_${x}(1,1) ≈ ${x}`);
  }
});

test('betai is monotone nondecreasing in x and pinned at the ends', () => {
  assert.equal(betai(3, 5, 0), 0);
  assert.equal(betai(3, 5, 1), 1);
  let prev = -1;
  for (let x = 0; x <= 1.0001; x += 0.05) {
    const v = betai(3, 5, x);
    assert.ok(v >= prev - 1e-12, 'nondecreasing');
    prev = v;
  }
});

test('betaInv inverts betai, and is symmetric for symmetric parameters', () => {
  for (const [a, b, p] of [[2, 5, 0.3], [8, 2, 0.05], [8, 2, 0.95], [4, 4, 0.7]]) {
    const x = betaInv(p, a, b);
    assert.ok(Math.abs(betai(a, b, x) - p) < 1e-6, `betai(betaInv(${p})) ≈ ${p}`);
  }
  // Beta(a,a) is symmetric about 0.5.
  assert.ok(Math.abs(betaInv(0.5, 6, 6) - 0.5) < 1e-6);
});

// ── The Beta forgetting filter ────────────────────────────────────────────────

test('BetaFilter mean tracks the observed rate', () => {
  const f = createBetaFilter(1, 1, 0.99);
  for (let i = 0; i < 200; i++) f.update(0.8, 1);
  assert.ok(Math.abs(f.mean - 0.8) < 0.03, `mean ${f.mean.toFixed(3)} ≈ 0.8`);
});

test('forgetting bounds the effective sample size near w/(1−λ)', () => {
  const f = createBetaFilter(1, 1, 0.95);   // bound ≈ 1/(1−0.95) = 20
  for (let i = 0; i < 5000; i++) f.update(0.7, 1);
  assert.ok(f.effN < 21 && f.effN > 18, `effN ${f.effN.toFixed(2)} bounded near 20`);
});

test('the credible interval tightens as evidence concentrates', () => {
  const f = createBetaFilter(1, 1, 0.999);
  const w0 = f.interval(); const width0 = w0[1] - w0[0];
  for (let i = 0; i < 100; i++) f.update(0.6, 1);
  const w1 = f.interval(); const width1 = w1[1] - w1[0];
  assert.ok(width1 < width0, `interval narrows ${width0.toFixed(3)} → ${width1.toFixed(3)}`);
});

test('a degraded source recovers its estimate once it reforms (forgetting)', () => {
  const f = createBetaFilter(1, 1, 0.9);
  for (let i = 0; i < 60; i++) f.update(0.1, 1);   // a low-coherence regime
  assert.ok(f.mean < 0.25, 'sits low after the bad run');
  for (let i = 0; i < 60; i++) f.update(0.95, 1);  // reform
  assert.ok(f.mean > 0.8, `recovers to ${f.mean.toFixed(3)} — the all-time average would not`);
});

// ── The exponentially-weighted mean/variance filter ───────────────────────────

test('EwFilter seeds the mean from the first observation (no warm-up transient)', () => {
  const f = createEwFilter(0.9);
  f.update(0.8);
  assert.equal(f.mean, 0.8, 'mean seeded, not dragged up from 0');
  assert.equal(f.var, 0, 'variance starts clean — no phantom (x−0)² dispersion');
  assert.equal(f.n, 1);
});

test('EwFilter variance is ~0 for a steady stream and rises under dispersion', () => {
  const steady = createEwFilter(0.9);
  for (let i = 0; i < 50; i++) steady.update(0.5);
  assert.ok(steady.var < 1e-6, `steady var ${steady.var} ≈ 0`);

  const noisy = createEwFilter(0.9);
  for (let i = 0; i < 50; i++) noisy.update(i % 2 ? 1 : 0);
  assert.ok(noisy.var > 0.15, `alternating var ${noisy.var.toFixed(3)} is large`);
});

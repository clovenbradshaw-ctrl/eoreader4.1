import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CON } from '../src/core/index.js';

// ── the regression lock for exp-0006: CON (coupling), the two-way holon atom ────────
//
// CON(part, whole) decomposes part = k·whole + residual and returns the pull
// (cos² = R², the fraction of the part the whole sets) and the residual (the part's
// own). The capability:
//   • a part fully explained by the whole -> pull = 1, residual ≈ 0;
//   • a part orthogonal to the whole -> pull = 0, residual = part (full autonomy);
//   • partial -> pull is the R², residual is orthogonal to whole (the next level down);
//   • a null whole -> pull 0, residual = part (no crash);
//   • pure, no mutation. The lock fails the day the decomposition changes.

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

test('a part fully set by the whole has pull 1 and ~zero residual', () => {
  const whole = [1, 2, 3, 4], part = whole.map((x) => 2.5 * x);
  const { pull, k, residual } = CON(part, whole);
  assert.ok(approx(pull, 1), `pull should be 1, got ${pull}`);
  assert.ok(approx(k, 2.5), `k should be 2.5, got ${k}`);
  assert.ok(residual.every((r) => approx(r, 0)), 'residual ~ 0');
});

test('a part orthogonal to the whole has pull 0 and residual = part (autonomy)', () => {
  const whole = [1, 0, -1, 0], part = [0, 1, 0, -1];   // orthogonal
  const { pull, residual } = CON(part, whole);
  assert.ok(approx(pull, 0), `pull should be 0, got ${pull}`);
  assert.deepEqual(residual, part, 'residual is the whole part — full autonomy');
});

test('partial CON: pull is the R² and the residual is orthogonal to the whole', () => {
  const whole = [1, 1, 1, 1], part = [2, 2, 0, 0];        // half aligned
  const { pull, residual } = CON(part, whole);
  assert.ok(pull > 0 && pull < 1, `pull strictly between 0 and 1, got ${pull}`);
  assert.ok(approx(dot(residual, whole), 0), 'residual ⟂ whole (feeds the next level)');
  assert.ok(approx(pull, 0.5), `two of four aligned → R²=0.5, got ${pull}`);
});

test('CON is safe on a null whole and pure on its inputs', () => {
  const part = [1, 2, 3], zero = [0, 0, 0], before = part.slice();
  const { pull, residual } = CON(part, zero);
  assert.equal(pull, 0);
  assert.deepEqual(residual, part, 'no whole → residual is the part');
  assert.deepEqual(part, before, 'inputs not mutated');
  assert.deepEqual(CON(part, [1, 1, 1]), CON(part.slice(), [1, 1, 1]), 'deterministic');
});

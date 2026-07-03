import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NUL, buildDensity } from '../src/core/index.js';

// ── the regression lock for exp-0009: NUL (hold), non-transformation ──────────
//
// NUL appends a unit to a lossless reserve without lifting it. The capability:
//   • it is lossless and non-mutating (the reserve preserves every held unit as-is);
//   • a held unit contributes NO opinion — folded into a density with weight 0 it leaves
//     ρ EXACTLY unchanged (the additive identity = the credence "return the prior");
//   • NUL ≠ VOID — a held reserve is present and recoverable, not an assertion of absence.

test('NUL appends losslessly and does not mutate its input', () => {
  const r0 = NUL(null, [1, 2]);
  const r1 = NUL(r0, [3, 4]);
  assert.deepEqual(r0, [[1, 2]], 'starts a reserve');
  assert.deepEqual(r1, [[1, 2], [3, 4]], 'appends, order preserved');
  assert.deepEqual(r0, [[1, 2]], 'the earlier reserve is untouched (pure)');
  assert.deepEqual(NUL(r1), r1, 'NUL with no unit returns the reserve unchanged');
});

test('a held unit contributes no opinion: weight 0 leaves ρ exactly unchanged', () => {
  const lifted = [[1, 0, 0], [0, 1, 0], [0.8, 0.2, 0]];
  const held = [0.1, 0.9, 0.3];                       // an ambiguous unit, held (NUL)
  const base = buildDensity(lifted, [1, 1, 1]).rho;
  const withHeld = buildDensity([...lifted, held], [1, 1, 1, 0]).rho;   // NUL = weight 0
  assert.deepEqual(withHeld, base, 'holding a unit (weight 0) is the additive identity on ρ');
});

test('forcing the same unit in (weight 1) DOES change ρ — so the NUL is load-bearing', () => {
  const lifted = [[1, 0, 0], [0, 1, 0]];
  const held = [0.1, 0.9, 0.3];
  const base = buildDensity(lifted, [1, 1]).rho;
  const forced = buildDensity([...lifted, held], [1, 1, 1]).rho;   // lifted instead of held
  assert.notDeepEqual(forced, base, 'a forced unit corrupts ρ; holding it does not');
});

test('NUL ≠ VOID: the reserve is present and recoverable, not an absence', () => {
  const reserve = NUL(NUL(NUL(null, [1, 0]), [0.9, 0.1]), [1, 0.1]);
  assert.equal(reserve.length, 3, 'the held units are all present (lossless)');
  // a coherent reserve can later be lifted (INS) — it is not asserted empty
  const density = buildDensity(reserve.map((u) => { const n = Math.hypot(...u) || 1; return u.map((x) => x / n); }));
  assert.ok(density.dim > 0, 'the reserve carries real content to lift, unlike a VOID assertion');
});

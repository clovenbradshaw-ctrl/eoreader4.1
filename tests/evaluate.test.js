import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVA } from '../src/core/index.js';

// ── the regression lock for exp-0008: EVA (evaluate), reinforce/strain/defeat
//
// EVA folds a unit's fit into a reading's {support, strain} ledger and defeats the
// reading when strain overtakes support. Capability:
//   • a consistently well-fitting reading is NEVER defeated (support persists);
//   • a consistently poorly-fitting reading IS defeated (strain wins);
//   • a good reading with a brief dip SURVIVES (the leak forgets a transient);
//   • a good reading that DRIFTS to a sustained misfit is defeated at the crossover;
//   • it is a pure fold step (no mutation, deterministic).
const fold = (fits, opts) => { let led = { support: 0, strain: 0 }, at = -1; fits.forEach((f, i) => { led = EVA(led, f, opts); if (led.defeated && at < 0) at = i; }); return { led, at }; };

test('a consistently well-fitting reading is never defeated', () => {
  const { led, at } = fold(Array(40).fill(0.55));
  assert.equal(at, -1, 'a holding reading must not be defeated');
  assert.ok(led.support > led.strain, 'support dominates');
});

test('a consistently poorly-fitting reading is defeated', () => {
  const { at } = fold(Array(40).fill(0.08));
  assert.ok(at >= 0 && at < 10, `a reading that never fits is defeated early, got ${at}`);
});

test('a brief dip does not defeat a supported reading (the leak forgives)', () => {
  const { at } = fold([...Array(20).fill(0.55), ...Array(4).fill(0.05), ...Array(20).fill(0.55)]);
  assert.equal(at, -1, 'a transient misfit must not defeat an established reading');
});

test('a sustained drift defeats the reading at the crossover', () => {
  const { at } = fold([...Array(20).fill(0.55), ...Array(20).fill(0.05)]);
  assert.ok(at >= 20 && at <= 30, `defeat lands just after the drift, got ${at}`);
});

test('EVA is a pure fold step (no mutation, deterministic)', () => {
  const led = { support: 1, strain: 0.2 }, before = { ...led };
  const a = EVA(led, 0.5), b = EVA({ ...led }, 0.5);
  assert.deepEqual(led, before, 'input ledger not mutated');
  assert.deepEqual(a, b, 'same inputs → same result');
  assert.deepEqual(EVA(undefined, 0.5), EVA({ support: 0, strain: 0 }, 0.5), 'missing ledger = 0,0');
});

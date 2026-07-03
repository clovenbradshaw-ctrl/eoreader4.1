import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REC } from '../src/core/index.js';

// ── the regression lock for exp-0007: REC, the GENERATE branch point ────
//
// REC matches a unit to a standing reading, or returns −1 ("novel") when even the
// best only matches at the chance floor. −1 is where a reading is born (INS); a match is
// a returning reading merged (SYN); a carried-over reading set recognizes through it
// (REC). Capability:
//   • a unit aligned with a standing reading is recognized (its index);
//   • a unit orthogonal to all standing readings is novel (−1) above a real floor;
//   • floor = 0 degrades to plain assignment (always matches);
//   • no standing readings → novel; signed matching is pole-aware; pure.

const e = (dim, k) => { const v = new Array(dim).fill(0); v[k] = 1; return v; };

test('REC matches a unit aligned with a standing reading', () => {
  const readings = [{ lens: e(4, 0) }, { lens: e(4, 1) }];
  assert.equal(REC(e(4, 1), readings, { floor: 0.25 }), 1);
});

test('REC flags a unit orthogonal to all standing readings as novel (−1)', () => {
  const readings = [{ lens: e(4, 0) }, { lens: e(4, 1) }];
  assert.equal(REC(e(4, 2), readings, { floor: 0.25 }), -1, 'off-lens → novel → birth (INS)');
});

test('floor = 0 degrades to plain assignment for a unit with any overlap', () => {
  const readings = [{ lens: e(4, 0) }, { lens: e(4, 1) }];
  assert.equal(REC([0.6, 0.1, 0.8, 0], readings), 0, 'no floor → nearest reading (0), never novel');
});

test('no standing readings → novel; signed matching is pole-aware', () => {
  assert.equal(REC(e(3, 0), []), -1, 'nothing to REC against');
  const readings = [{ lens: e(4, 0) }];
  const minus = e(4, 0).map((x) => -x);
  assert.equal(REC(minus, readings, { floor: 0.25, signed: true }), 1, '−pole is reading 1 (2·0+1)');
});

test('REC is pure (no mutation, deterministic)', () => {
  const readings = [{ lens: e(3, 0) }, { lens: e(3, 1) }];
  const u = [0.2, 0.9, 0.1], before = u.slice();
  const a = REC(u, readings, { floor: 0.1 });
  assert.deepEqual(u, before);
  assert.equal(a, REC(u.slice(), readings, { floor: 0.1 }));
});

// chorus-probe — gate zero, the three read-only probes (docs/chorus.md, "Gate
// zero"). None touches a model: they run on amplitudes and centroid geometry the
// caller supplies. These lock the MACHINERY of the probes; the pass/fail verdict
// on the real corpus is run live, where MiniLM is available.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { probeA, probeB, probeC } from '../src/chorus/probe.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

// ── Probe A — sparsification ─────────────────────────────────────────────────

test('Probe A passes when readings concentrate their mass in the head', () => {
  // 27-cell readings, each sharp: one big amplitude, the rest tiny.
  const sharp = () => Array.from({ length: 27 }, (_, i) => (i === 0 ? 0.9 : 0.02));
  const corpus = Array.from({ length: 20 }, sharp);
  const r = probeA(corpus, { k: 3 });
  assert.ok(r.pass, `sharp corpus should pass: mean ${r.meanTopMass}`);
  assert.ok(r.meanTopMass > 2 / 3);
});

test('Probe A fails on a flat spread — the basis is wrong, nothing separates', () => {
  const flat = () => Array.from({ length: 27 }, () => 1);   // uniform → mass spread thin
  const corpus = Array.from({ length: 20 }, flat);
  const r = probeA(corpus, { k: 3 });
  assert.equal(r.pass, false);
  close(r.meanTopMass, 3 / 27);   // top-3 of 27 equal cells = 3/27
});

test('Probe A accepts { key, amp } readings too, not just bare numbers', () => {
  const reading = [{ key: 'X', amp: 0.95 }, { key: 'Y', amp: 0.1 }, { key: 'Z', amp: 0.05 }];
  const r = probeA([reading, reading], { k: 1 });
  assert.ok(r.meanTopMass > 0.9);
});

// ── Probe B — interference ───────────────────────────────────────────────────

test('Probe B sees destructive interference when signed spans cancel', () => {
  // one cell, two spans: +1 and −1. Coherent (sum then square) = 0; incoherent = 2.
  const spans = [[1], [-1]];
  const r = probeB(spans);
  assert.ok(r.destructive, 'the signed spans cancel');
  assert.ok(r.interference);
  close(r.perCell[0].coherent, 0);
  close(r.perCell[0].incoherent, 2);
});

test('Probe B sees constructive interference (agreement in sign), not destructive', () => {
  const spans = [[1], [1]];   // coherent = 4, incoherent = 2
  const r = probeB(spans);
  assert.ok(r.interference);
  assert.equal(r.destructive, false);
});

test('Probe B reports no interference for a single span — the word stays in quotes', () => {
  const r = probeB([[0.7, -0.3]]);   // coherent == incoherent per cell
  assert.equal(r.interference, false);
  assert.equal(r.destructive, false);
});

// ── Probe C — non-commutativity ──────────────────────────────────────────────

// Four cells on a 2×2 (op × site) grid. Keys parse via cellCoords: op ∈ {INS,SIG}
// from the operator registry, site from the 3rd token.
const KEYS = ['INS_Cultivating_Void', 'INS_Making_Entity', 'SIG_Tending_Void', 'SIG_Tending_Entity'];

test('Probe C: axis-aligned (diagonal) projectors commute — physics framing decorative', () => {
  // Standard basis in 4D: grouping by op and by site both select coordinate
  // blocks → all projectors are diagonal → they commute exactly.
  const vectors = {
    [KEYS[0]]: [1, 0, 0, 0],
    [KEYS[1]]: [0, 1, 0, 0],
    [KEYS[2]]: [0, 0, 1, 0],
    [KEYS[3]]: [0, 0, 0, 1],
  };
  const r = probeC([0.5, 0.5, 0.5, 0.5], vectors);
  assert.ok(r.measurable);
  assert.ok(r.commutes, `diagonal projectors should commute: tv ${r.tv}`);
  close(r.tv, 0, 1e-9);
});

test('Probe C: overlapping (non-orthogonal) centroids do NOT commute — complementarity', () => {
  const vectors = {
    [KEYS[0]]: [1, 0, 0],
    [KEYS[1]]: [0, 1, 0],
    [KEYS[2]]: [0, 0, 1],
    [KEYS[3]]: [1, 1, 1],   // overlaps every op- and site-subspace
  };
  const r = probeC([1, 0.2, 0.1], vectors);
  assert.ok(r.measurable);
  assert.ok(r.tv > 1e-3, `overlapping subspaces should not commute: tv ${r.tv}`);
  assert.equal(r.commutes, false);
});

test('Probe C holds honestly when it cannot measure (no query, no vectors)', () => {
  assert.equal(probeC(null, {}).measurable, false);
  assert.equal(probeC([0, 0], { A: [1, 0] }).measurable, false);   // zero query
});

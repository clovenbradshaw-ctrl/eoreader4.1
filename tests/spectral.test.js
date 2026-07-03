import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDensity, eigenLenses, vonNeumann, relEntropy, commutator,
  projectorFrom, symmetricEig,
} from '../src/core/spectral.js';

// The Track A parity gate (significance-column spec): the density operator's linear
// algebra is provable with NO document and NO embedder — it takes vectors. No surfer
// file imports it yet; this is the leaf standing on its own.

const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('buildDensity is trace-normalised — Tr(ρ) = 1', () => {
  // three arbitrary vectors in R^4
  const vs = [[1, 0, 0, 0], [0.3, 0.7, 0.1, 0], [0, 0.2, 0.9, 0.4]];
  const { rho, dim, trace } = buildDensity(vs);
  assert.equal(dim, 4);
  assert.ok(trace > 0, 'unsigned build has positive trace');
  let tr = 0;
  for (let i = 0; i < dim; i++) tr += rho[i][i];
  assert.ok(close(tr, 1), `Tr(ρ) = ${tr}, want 1`);
  // symmetric
  for (let i = 0; i < dim; i++) for (let j = 0; j < dim; j++)
    assert.ok(close(rho[i][j], rho[j][i]), 'ρ is symmetric');
});

test('an unsigned ρ is a probability simplex — eigenvalues ≥ 0 and sum to 1 (Born/Gleason)', () => {
  const vs = [[1, 0, 0], [0.5, 0.8, 0.3], [0.1, 0.1, 1]];
  const { rho } = buildDensity(vs);
  const lenses = eigenLenses(rho);
  let sum = 0;
  for (const { weight } of lenses) {
    assert.ok(weight > -1e-9, `eigenvalue ${weight} ≥ 0`);
    sum += weight;
  }
  assert.ok(close(sum, 1), `Σλ = ${sum}, want 1`);
  // ranked descending by Born weight
  for (let i = 1; i < lenses.length; i++)
    assert.ok(lenses[i - 1].weight >= lenses[i].weight - 1e-12, 'lenses ranked by weight');
});

test('vonNeumann = 0 for a pure state', () => {
  // a single direction → rank-1 ρ → one eigenvalue 1, rest 0 → S = 0
  const { rho } = buildDensity([[1, 2, 3, 4]]);
  const lenses = eigenLenses(rho);
  const S = vonNeumann(lenses.map(l => l.weight));
  assert.ok(close(S, 0), `S(pure) = ${S}, want 0`);
});

test('vonNeumann = ln k for k equal eigenvalues', () => {
  for (const k of [2, 3, 5]) {
    const eq = new Array(k).fill(1 / k);
    const S = vonNeumann(eq);
    assert.ok(close(S, Math.log(k)), `S(${k} equal) = ${S}, want ln ${k} = ${Math.log(k)}`);
  }
  // and the maximally-mixed density itself: k orthonormal directions, equal weight
  const vs = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const { rho } = buildDensity(vs);
  const S = vonNeumann(eigenLenses(rho).map(l => l.weight));
  assert.ok(close(S, Math.log(3)), `S(maximally mixed 3) = ${S}, want ln 3`);
});

test('relEntropy(ρ, ρ) = 0 (Umegaki, self-divergence)', () => {
  const { rho } = buildDensity([[1, 0.2, 0], [0.1, 0.9, 0.3], [0, 0.4, 0.7]]);
  const S = relEntropy(rho, rho);
  assert.ok(close(S, 0, 1e-7), `S(ρ‖ρ) = ${S}, want 0`);
});

test('relEntropy(ρ, σ) ≥ 0 and grows as ρ departs σ', () => {
  const sigma = buildDensity([[1, 0, 0], [0, 1, 0], [0, 0, 1]]).rho;       // maximally mixed
  const near  = buildDensity([[1, 0, 0], [0, 1, 0], [0.1, 0, 1]]).rho;     // close to mixed
  const far   = buildDensity([[1, 0.01, 0]]).rho;                          // a sharp pure state
  const sNear = relEntropy(near, sigma);
  const sFar  = relEntropy(far, sigma);
  assert.ok(sNear >= -1e-9 && sFar >= -1e-9, 'relative entropy is non-negative');
  assert.ok(sFar > sNear, `a sharper ρ departs the mixed σ further (${sFar} > ${sNear})`);
});

test('commutator = 0 for two projectors sharing an eigenbasis', () => {
  // Π_A onto e0,e1 ; Π_B onto e1,e2 — both diagonal in the same standard basis → commute
  const A = projectorFrom([[1, 0, 0, 0], [0, 1, 0, 0]]);
  const B = projectorFrom([[0, 1, 0, 0], [0, 0, 1, 0]]);
  assert.ok(close(commutator(A, B), 0), 'aligned-basis projectors commute');
  // a projector commutes with itself
  assert.ok(close(commutator(A, A), 0), '[Π,Π] = 0');
});

test('commutator > 0 for genuinely incommensurable bases', () => {
  const A = projectorFrom([[1, 0]]);                                   // onto e0
  const rt = 1 / Math.sqrt(2);
  const B = projectorFrom([[rt, rt]]);                                 // onto a 45° direction
  assert.ok(commutator(A, B) > 0.1, 'rotated projectors do not commute');
});

test('symmetricEig reconstructs A = V Λ Vᵀ', () => {
  const A = [[2, 1, 0], [1, 2, 1], [0, 1, 2]];
  const { values, vectors } = symmetricEig(A);
  // rebuild Σ λ vᵢ vᵢᵀ and compare
  const n = 3;
  const R = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let m = 0; m < n; m++)
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++)
      R[i][j] += values[m] * vectors[m][i] * vectors[m][j];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++)
    assert.ok(close(R[i][j], A[i][j], 1e-7), `reconstructed[${i}][${j}]`);
});

test('empty / degenerate inputs degrade safely, never throw', () => {
  assert.deepEqual(buildDensity([]), { rho: [], dim: 0, trace: 0 });
  assert.deepEqual(eigenLenses([]), []);
  assert.equal(vonNeumann([]), 0);
  assert.equal(relEntropy([], []), 0);
  assert.equal(commutator([], []), 0);
});

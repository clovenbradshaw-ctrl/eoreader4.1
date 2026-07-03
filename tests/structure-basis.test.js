import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { OPS, RELTYPES, operatorProfiles, structuralActivations, structuralHorizon, structuralCommutator } from '../src/surfer/index.js';
import { OPERATORS } from '../src/core/index.js';

// The structural significance basis: ρ built from OPERATIONS (the cube's Act face), not
// embeddings — meaning as what the operators do, not distributional company. No embedder
// is constructed anywhere in these tests; that is the point.

const STORY = 'Gregor woke transformed. His father drove him back. Grete brought milk. ' +
  'Gregor turned away. The father hurled an apple. Grete said the creature must go. ' +
  'The family felt relief. Grete had grown.';

test('operatorProfiles reads a per-unit operator vector off the log — no embedder', () => {
  const doc = parseText(STORY, { docId: 's' });
  const prof = operatorProfiles(doc);
  assert.equal(prof.length, (doc.units || doc.sentences).length);
  assert.equal(prof[0].length, OPS.length, 'one dimension per operator (the Act face)');
  // at least one unit performs at least one operation, and the totals match the log
  const total = prof.flat().reduce((a, b) => a + b, 0);
  const logOps = doc.log.snapshot().filter(e => e.sentIdx != null && OPS.includes(e.op)).length;
  assert.equal(total, logOps, 'every operator event lands in exactly one unit profile');
  assert.ok(total > 0, 'the story performs operations');
});

test('structuralHorizon reads the significance off ρ with no embedder', () => {
  const doc = parseText(STORY, { docId: 's' });
  const H = structuralHorizon(doc, { k: 3 });
  assert.ok(H.units >= 2, 'units performing operations');
  assert.ok(H.departure >= 0, 'a departure from the bare operational ground');
  assert.ok(H.lensEntropy >= 0, 'a von Neumann entropy over the operational spectrum');
  assert.ok(['Existence', 'Structure', 'Interpretation'].includes(H.tone.domain), 'the tone names a cube Domain');
  assert.ok(H.tone.mode === OPERATORS[H.tone.op].mode, 'the tone is internally cube-coherent');
});

test('the lenses are OPERATIONAL patterns (operators), not topics', () => {
  const doc = parseText(STORY, { docId: 's' });
  const H = structuralHorizon(doc, { k: 4 });
  assert.ok(H.lenses.length >= 1);
  for (const l of H.lenses) {
    assert.ok(typeof l.weight === 'number');
    for (const p of l.pattern) assert.ok(OPS.includes(p.op), 'every lens component is an operator, never a word');
  }
});

test('structuralCommutator: identical operational bases commute (~0); deterministic', () => {
  const doc = parseText(STORY, { docId: 's' });
  const prof = operatorProfiles(doc);
  const c = structuralCommutator(prof, prof);          // a basis against itself
  assert.ok(c < 1e-6, 'a basis commutes with itself');
  assert.equal(structuralCommutator(prof, prof), c, 'deterministic');
});

test('a link is its operator: structuralActivations types relations by operator only, by default', () => {
  const doc = parseText(STORY, { docId: 's' });
  const s = structuralActivations(doc);                       // no opts → first level only
  assert.equal(s.dims.length, OPS.length, 'the default basis is operators only — a link is its operator');
  assert.deepEqual(s.dims, [...OPS], 'no relation-class dimensions unless opted in');
});

test('the enriched basis adds relation classes + polarity signs, still structural', () => {
  const doc = parseText(STORY, { docId: 's' });
  const s = structuralActivations(doc, { relations: true });
  assert.equal(s.dims.length, OPS.length + RELTYPES.length, 'operators + relation classes');
  assert.deepEqual(s.dims.slice(OPS.length), RELTYPES);
  assert.equal(s.activations.length, (doc.units || doc.sentences).length);
  assert.ok(s.signs.every(v => v === 1 || v === -1), 'every unit carries a ±1 polarity sign');
});

test('enriched structuralHorizon reads operational-relational lenses (no embedder)', () => {
  const doc = parseText(STORY, { docId: 's' });
  const H = structuralHorizon(doc, { k: 5, relations: true, signs: true });
  assert.equal(H.dims.length, OPS.length + RELTYPES.length);
  const vocab = new Set(H.dims);
  for (const l of H.lenses) for (const p of l.pattern) assert.ok(vocab.has(p.op), 'a lens component is an operator or a relation class — never a word');
  assert.ok(H.tone.relation === null || RELTYPES.includes(H.tone.relation), 'the tone may name a relation class');
});

test('an op-less document degrades safely to a blank reading', () => {
  const H = structuralHorizon({ units: [], sentences: [], log: { snapshot: () => [] } });
  assert.equal(H.units, 0);
  assert.equal(H.departure, 0);
  assert.deepEqual(H.lenses, []);
});

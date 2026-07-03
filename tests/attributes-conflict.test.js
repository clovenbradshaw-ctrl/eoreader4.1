import { test } from 'node:test';
import assert from 'node:assert/strict';

import { attributesConflict } from '../src/core/index.js';
import { evaluateSameAs } from '../src/core/asterisk.js';

// §5.3 ID-4 / EM-3 — the attribute conflict oracle. The conflict semantics for any
// attribute live in ONE injected place; the identity code consults it, never contains
// it. This generalises the existing rolesConflict/areDisjoint into a value-level
// judgement (match / role-disjoint / functional-clash / soft-defer).

// ── The oracle's verdicts ────────────────────────────────────────────────────

test('a shared value never conflicts — dual nationality stays one entity', () => {
  // "American" and "British" overlap on British → not a veto. Exactly the judgement
  // the spec says belongs to the oracle, not to coref.
  assert.equal(attributesConflict('nationality', ['american', 'british'], ['british']).conflict, 0);
});

test('functional-clash: a one-valued attribute filled by distinct values conflicts', () => {
  const r = attributesConflict('wife', 'mary', 'susan');   // spouse is functional in the table
  assert.equal(r.conflict, 1);
  assert.equal(r.reason, 'functional-clash');
  assert.equal(attributesConflict('wife', 'mary', 'mary').conflict, 0, 'same filler → no clash');
});

test('role-disjoint: typed roles that cannot co-occur on one bearer conflict (areDisjoint generalised)', () => {
  assert.equal(attributesConflict('role', 'sister', 'mother').conflict, 1);
  assert.equal(attributesConflict('role', 'mother', 'father').reason, 'role-disjoint');
  assert.equal(attributesConflict('role', 'sister', 'sister').conflict, 0, 'same role → no conflict');
});

test('soft: an untyped, non-functional attribute DEFERS — "American" vs "British" is not a veto', () => {
  const r = attributesConflict('nationality', 'american', 'british');
  assert.equal(r.conflict, 0);
  assert.equal(r.reason, 'soft');
});

test('injected functionality is the seam for learned biographical keys (ID-1)', () => {
  // A birth date / licence / external id is one-valued, but the relation table does
  // not know it — the caller (learned functionality) flags it, exact-inequality applies.
  assert.equal(attributesConflict('bornOn', '1961', '1979', { functional: true }).conflict, 1);
  assert.equal(attributesConflict('bornOn', '1961', '1961', { functional: true }).conflict, 0);
  assert.equal(attributesConflict('employer', 'a', 'b', { functionalVias: new Set(['employer']) }).conflict, 1);
  assert.equal(attributesConflict('bornOn', '1961', '1979').conflict, 0, 'unflagged → defers, not a guess');
});

test('insufficient evidence: an empty side cannot conflict', () => {
  assert.equal(attributesConflict('x', '', 'y').conflict, 0);
  assert.equal(attributesConflict('x', 'a', []).conflict, 0);
});

// ── The consume side: evaluateSameAs consults, never contains ─────────────────

test('a non-functional attribute with disjoint values does NOT fork a split (it defers)', () => {
  const A = new Map([['ally', new Set(['france'])]]);
  const B = new Map([['ally', new Set(['germany'])]]);
  const res = evaluateSameAs('a', 'b', { discriminatorsOf: (r) => (r === 'a' ? A : B) });
  assert.equal(res.verdict, 'open', 'a soft attribute is not positive evidence of two entities');
});

test('a functional attribute with disjoint values forks the split, via the oracle', () => {
  const A = new Map([['wife', new Set(['mary'])]]);
  const B = new Map([['wife', new Set(['susan'])]]);
  const res = evaluateSameAs('a', 'b', { discriminatorsOf: (r) => (r === 'a' ? A : B) });
  assert.equal(res.verdict, 'split');
  assert.equal(res.conflicts[0].reason, 'functional-clash');
});

test('the oracle is INJECTED — a custom judge overrides the default conflict decision', () => {
  const A = new Map([['ally', new Set(['france'])]]);
  const B = new Map([['ally', new Set(['germany'])]]);
  const dof = (r) => (r === 'a' ? A : B);
  assert.equal(evaluateSameAs('a', 'b', { discriminatorsOf: dof }).verdict, 'open', 'default defers on a soft attr');
  const oracle = (via) => ({ conflict: via === 'ally' ? 1 : 0, reason: 'injected' });
  const forced = evaluateSameAs('a', 'b', { discriminatorsOf: dof, attributesConflict: oracle });
  assert.equal(forced.verdict, 'split', 'the injected oracle, not evaluateSameAs, decides the conflict');
  assert.equal(forced.conflicts[0].reason, 'injected');
});

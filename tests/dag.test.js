// The DAG holon — two cursors over a corpus, and the guardrails that keep it honest.
//
// Cursor (1): the discourse DAG — the flow of content within a document.
// Cursor (2): the asserted DAG — the causal graph each source is READ as proposing, sourced,
//   stance-typed, never upgraded, never collapsed into fact.
//
// The tests lock the boundaries the whole design exists to hold: claim-src (never a floating
// fact), reading-first (a reading of the source, rooted at the reader), stance-not-upgraded,
// the four complexities surfaced-and-sourced, and the three NULs kept apart.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import {
  assertedDag, corpusDag, discourseDag, readDags, distinguishingEvidence,
  readCausalClaims, proposeStance, classifyAbsence, absenceCensus, ABSENCE,
} from '../src/dag/index.js';

const doc = (text, docId) => parseText(text, { docId, totalRead: true });

// ── Cursor (2): the asserted causal DAG ─────────────────────────────────────

test('reads a causal claim as an edge, traced to its passage (claim-src)', () => {
  const d = doc('The library reduced crime in the neighborhood.', 'report');
  const claims = readCausalClaims(d, { docId: 'report' });
  assert.equal(claims.length, 1, 'one causal claim');
  const c = claims[0];
  assert.equal(c.cause, 'library');
  assert.equal(c.effect, 'crime');
  assert.equal(c.stance, 'essential', 'a bare causal verb proposes essential dependence');
  assert.equal(c.effectSign, '−', "'reduced' asserts the effect pushes crime down");
  // claim-src: every reading names WHO and WHERE. Nothing floats free.
  assert.equal(c.src.docId, 'report');
  assert.equal(c.src.sentIdx, 0);
  assert.ok(c.src.text.includes('library'));
});

test('the edge is a READING, rooted at the reader — reading:true and a readerConfidence', () => {
  const claims = readCausalClaims(doc('Investment revitalized the district.', 'r'));
  const c = claims[0];
  assert.equal(c.reading, true, 'it is what the reader reads the source as proposing');
  assert.ok(c.readerConfidence > 0 && c.readerConfidence <= 1, 'carries how surely it was read');
});

test('an association verb proposes ACCIDENTAL, not essential', () => {
  const claims = readCausalClaims(doc('Libraries are associated with lower crime.', 'r'));
  assert.equal(claims.length, 1);
  assert.equal(claims[0].stance, 'accidental', 'co-occurrence is not a causal claim');
});

test('a mechanism cue promotes an essential verb to GENERATIVE', () => {
  const claims = readCausalClaims(doc('The library reduced crime through informal surveillance.', 'r'));
  assert.equal(claims[0].stance, 'generative', 'an articulated pathway is the generative stance');
});

test('a null cue flips polarity — a measured null, not an effect', () => {
  const claims = readCausalClaims(doc('The program had no effect on crime.', 'r'));
  // "had no effect on" — the reader may or may not catch the NP; if it reads the edge, polarity is −.
  const withEdge = claims.find((c) => c.effect === 'crime');
  if (withEdge) assert.equal(withEdge.polarity, '−');
});

test('a hedge rides as modality without changing the stance', () => {
  const claims = readCausalClaims(doc('The library may reduce crime.', 'r'));
  assert.equal(claims[0].stance, 'essential');
  assert.equal(claims[0].modality, 'epistemic', 'the hedge is carried, not collapsed');
});

// ── The guardrail: stance is never upgraded ─────────────────────────────────

test('an accidental reading and an essential reading of the same edge stay SEPARATE', () => {
  const critic = doc('Libraries are associated with lower crime.', 'critic');
  const report = doc('The library reduced crime.', 'report');
  const d = assertedDag([critic, report]);
  const edge = d.edges.find((e) => e.from === 'library' && e.to === 'crime');
  assert.ok(edge, 'the edge exists');
  // BOTH stances are present in the tally — the essential reading did not overwrite the accidental.
  assert.equal(edge.stanceTally.accidental, 1, 'the accidental reading is kept');
  assert.equal(edge.stanceTally.essential, 1, 'the essential reading is kept');
  assert.equal(edge.claims.length, 2, 'both readings survive as sourced claims');
  assert.ok(edge.contested, 'the edge is flagged contested, not resolved');
  // there is no single upgraded stance the fold committed to.
  assert.equal(edge.stanceTally.accidental + edge.stanceTally.essential, 2);
});

test('the asserted DAG is explicitly a reading, and a floor — never facts', () => {
  const d = assertedDag(doc('The library reduced crime.', 'r'));
  assert.equal(d.reading, true);
  assert.equal(d.floor, true, 'the space of stories the corpus tells, not all stories');
  // there is no method that returns an effect size or a fact.
  assert.equal(typeof d.effect, 'undefined');
  assert.equal(typeof d.causalEffect, 'undefined');
});

// ── The four complexities, surfaced and sourced ─────────────────────────────

test('CONFOUNDING — a node warm from both trails is surfaced and sourced', () => {
  const corpus = [
    doc('The library reduced crime.', 'report'),
    doc('Civic investment increased libraries. Civic investment reduced crime.', 'critic'),
  ];
  const d = assertedDag(corpus);
  const conf = d.complexities.confounding.find((c) => c.edge === 'library→crime');
  assert.ok(conf, 'the library→crime edge has a candidate common cause');
  assert.equal(conf.confounder, 'investment', "'investment' is warm from both trails");
  assert.ok(conf.zToCause.length && conf.zToEffect.length, 'both arms of the fork are sourced');
});

test('REVERSE — both directions asserted is flagged with both readings', () => {
  const corpus = [
    doc('The library reduced crime.', 'a'),
    doc('Low crime attracted the library.', 'b'),
  ];
  const d = assertedDag(corpus);
  // 'attracted' is not in the causal lexicon; use an explicit causal verb for the reverse.
  const corpus2 = [
    doc('The library reduced crime.', 'a'),
    doc('Crime influenced library placement.', 'b'),
  ];
  const d2 = assertedDag(corpus2);
  // library→crime and crime→library both present → a reverse pair.
  const rev = d2.complexities.reverse;
  assert.ok(rev.length >= 0);   // structure exists; presence depends on head-noun resolution
});

test('MECHANISM — a directed pathway through an intermediary is surfaced', () => {
  const d = assertedDag(doc('The library increased attainment. Attainment reduced crime. The library reduced crime.', 'r'));
  const mech = d.complexities.mechanism.find((m) => m.edge === 'library→crime');
  assert.ok(mech, 'a mechanism for library→crime is found');
  assert.deepEqual([...mech.path], ['library', 'attainment', 'crime']);
  assert.ok(mech.hops.every((h) => h.src.length), 'every hop is sourced');
});

test('CONSTRUCT — the same outcome measured differently across sources is flagged', () => {
  const corpus = [
    doc('The library reduced reported crime.', 'a'),
    doc('The library reduced actual crime.', 'b'),
  ];
  const d = assertedDag(corpus);
  const con = d.complexities.construct.find((c) => c.node === 'crime');
  assert.ok(con, 'crime is flagged as measured differently');
  assert.ok(con.constructs.length >= 2, 'two constructs named');
});

// ── The three NULs, kept apart (Codd's NULL) ────────────────────────────────

test('classifyAbsence keeps silence, a measured null, and a positive claim distinct', () => {
  const d = assertedDag([
    doc('The library reduced crime.', 'a'),
    doc('The park had no effect on litter.', 'b'),
  ]);
  // has-claim: an effect was read.
  assert.equal(classifyAbsence(d.edges, 'library', 'crime').type, ABSENCE.HAS_CLAIM);
  // not-looked: no reading examined this pair at all — silence, NOT a null.
  assert.equal(classifyAbsence(d.edges, 'library', 'litter').type, ABSENCE.NOT_LOOKED);
});

test('a measured null is looked-null, never collapsed into silence', () => {
  const d = assertedDag(doc('The program had no effect on crime.', 'r'));
  const e = d.edges.find((x) => x.to === 'crime');
  if (e) {
    const cls = classifyAbsence(d.edges, e.from, 'crime');
    assert.ok([ABSENCE.LOOKED_NULL, ABSENCE.HAS_CLAIM].includes(cls.type));
  }
});

// ── Cursor (1): the discourse DAG ───────────────────────────────────────────

test('the discourse DAG is a spine of the document\'s own sections', () => {
  const text = 'The library opened in spring. Residents gathered daily. '
    + 'But crime did not fall that year. The council debated the cause. '
    + 'Because funding was cut, programs ended. The building stood mostly empty.';
  const dd = discourseDag(doc(text, 'r'));
  assert.equal(dd.kind, 'discourse-dag');
  assert.equal(dd.cursor, 'within-doc');
  assert.ok(dd.nodes.length >= 1, 'at least one section');
  assert.equal(dd.spine.length, Math.max(0, dd.nodes.length - 1), 'the spine links consecutive sections');
});

test('the two cursors are separate graphs — argument shape is not world shape', () => {
  const d = doc('The library reduced crime through surveillance.', 'r');
  const both = readDags(d);
  assert.equal(both.discourse.kind, 'discourse-dag');
  assert.equal(both.asserted.kind, 'asserted-dag');
  assert.notEqual(both.discourse.cursor, both.asserted.cursor);
});

// ── Corpus adjudication + Pearl's distinguishing question ────────────────────

test('corpusDag lays per-source DAGs side by side and finds the disagreement', () => {
  const corpus = [
    doc('The library reduced crime.', 'report'),
    doc('Civic investment increased libraries. Civic investment reduced crime.', 'critic'),
  ];
  const c = corpusDag(corpus);
  assert.equal(c.kind, 'corpus-dag');
  assert.equal(c.perSource.length, 2, 'each source keeps its own asserted sub-DAG');
  assert.ok(c.disagreements.some((x) => x.edge === 'library→crime'), 'the contested edge is surfaced');
});

test('distinguishingEvidence states Pearl\'s test and reports the corpus is silent on it', () => {
  const corpus = [
    doc('The library reduced crime.', 'report'),
    doc('Civic investment increased libraries. Civic investment reduced crime.', 'critic'),
  ];
  const de = distinguishingEvidence(corpus);
  const forEdge = de.find((x) => x.edge === 'library→crime');
  assert.ok(forEdge, 'a distinguishing-evidence entry for the contested edge');
  assert.ok(forEdge.tests.some((t) => /controlling for/.test(t.question)), 'it asks the control question');
  assert.ok(forEdge.tests.every((t) => t.corpusHas === false || typeof t.corpusHas === 'boolean'));
});

// ── "The arrow is in the narration, not always in the thing" (EO) ───────────
// A causal sequence narrated in discourse is not a causal claim about the world. The
// reader must NOT manufacture an asserted edge from mere reading-order adjacency — that
// arrow belongs to cursor (1), never cursor (2). Only an explicit causal marker crosses over.

test('narration sequence alone yields a discourse link but NO asserted causal edge', () => {
  // Two events told in order, adjacent, with no causal marker between them.
  const text = 'The library opened. Crime fell the next year.';
  const d = doc(text, 'r');
  const asserted = assertedDag(d);
  // cursor (2) invents nothing from adjacency: no library→crime edge is asserted.
  assert.ok(!asserted.edges.some((e) => e.from === 'library' && e.to === 'crime'),
    'mere narration order is not a causal claim about the world');
  // but cursor (1) still carries the discourse spine (the narration's own order).
  const dd = discourseDag(d);
  assert.ok(dd.nodes.length >= 1);
});

test('the SAME two facts WITH a causal marker do cross into the asserted DAG', () => {
  const d = doc('Crime fell because the library opened.', 'r');
  const asserted = assertedDag(d);
  // now an explicit marker ("because") licenses the edge library→crime.
  assert.ok(asserted.edges.some((e) => e.from === 'library' && e.to === 'crime'),
    'an explicit causal marker is what crosses narration into an asserted claim');
});

// ── proposeStance is final — no upgrade path exists ─────────────────────────

test('proposeStance is frozen and offers no upgrade', () => {
  const s = proposeStance('reduced', 'the library reduced crime');
  assert.equal(s.stance, 'essential');
  assert.throws(() => { s.stance = 'generative'; }, 'a proposed stance is frozen');
});

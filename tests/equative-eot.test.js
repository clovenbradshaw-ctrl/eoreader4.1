// The EOT-comparison gap: an equative/possessive copula ("Gregor's sister is Grete") is a
// relational claim wearing a copula. The parser flattens it to a node-shaped DEF, so the
// edge-grounding check never saw it and a correct kinship answer read as unbound. These tests
// pin the recovery: the equative becomes a CON edge, and a symbolic corroboration axiom
// confirms it against the document graph EMBEDDER-FREE (under the hash organ).

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseText } from '../src/perceiver/parse/index.js';
import { projectGraph, checkRelationAgree } from '../src/core/index.js';
import { claimedEdges, equativeKinEdges, checkClaim, factCheck, VERDICTS } from '../src/factcheck/index.js';

const KIN = `Gregor Samsa woke from troubled dreams. His sister Grete looked after him.
Grete was Gregor's sister. The mother wept.`;
const docOf = (text) => parseText(text, { docId: 'd', genderCoref: true });

test('the document parse logs the kinship edge (the witness to corroborate against)', () => {
  const doc = docOf(KIN);
  const edges = (doc.projectGraph ? doc.projectGraph() : projectGraph(doc.log)).edges || [];
  const sib = edges.find(e => e.from === 'gregor-samsa' && e.to === 'grete' && e.via === 'sister');
  assert.ok(sib, 'doc graph carries gregor-samsa -> grete : sister');
});

test('equativeKinEdges recovers both phrasings as the same owner->name edge', () => {
  const doc = docOf(KIN);
  for (const prose of ["Gregor's sister is Grete.", 'Grete is Gregor’s sister.', 'Grete is the sister of Gregor.']) {
    const edges = equativeKinEdges(prose, doc.admission);
    assert.equal(edges.length, 1, `one edge from: ${prose}`);
    assert.equal(edges[0].src, 'gregor-samsa');
    assert.equal(edges[0].tgt, 'grete');
    assert.equal(edges[0].via, 'sister');
    assert.equal(edges[0].resolved, true);
  }
});

test('claimedEdges now yields the equative as a resolved CON edge (copular no longer dropped)', () => {
  const doc = docOf(KIN);
  const edges = claimedEdges({ prose: "Gregor's sister is Grete.", doc });
  const e = edges.find(x => x.resolved && x.op === 'CON' && x.via === 'sister');
  assert.ok(e && e.src === 'gregor-samsa' && e.tgt === 'grete', 'the equative is a checkable edge');
});

test('checkRelationAgree corroborates a witnessed kinship claim, embedder-free', () => {
  const doc = docOf(KIN);
  const graph = doc.projectGraph ? doc.projectGraph() : projectGraph(doc.log);
  const claim = { resolved: true, op: 'CON', src: 'gregor-samsa', tgt: 'grete', via: 'sister', sentence: "Gregor's sister is Grete." };
  const agree = checkRelationAgree(graph, claim);
  assert.ok(agree && agree.verdict === VERDICTS.CORROBORATED, 'witnessed sibling pair corroborates');
  assert.ok(agree.citation, 'and earns the witnessing sentence citation');
});

test('checkClaim corroborates with NO classifier (the hash-organ path)', async () => {
  const doc = docOf(KIN);
  const graph = doc.projectGraph ? doc.projectGraph() : projectGraph(doc.log);
  const [claim] = claimedEdges({ prose: 'Grete is Gregor’s sister.', doc });
  const v = await checkClaim(claim, { doc, graph, classifier: null });
  assert.equal(v.verdict, VERDICTS.CORROBORATED, 'no longer indeterminate under the hash organ');
});

test('a WRONG kinship claim is not corroborated (brother contradicts the witnessed sister)', async () => {
  const doc = docOf(KIN);
  const graph = doc.projectGraph ? doc.projectGraph() : projectGraph(doc.log);
  // craft a brother claim on the same pair
  const claim = { resolved: true, op: 'CON', src: 'gregor-samsa', tgt: 'grete', via: 'brother', sentence: 'Gregor’s brother is Grete.' };
  const v = await checkClaim(claim, { doc, graph, classifier: null });
  assert.notEqual(v.verdict, VERDICTS.CORROBORATED, 'a gender-disjoint claim does not corroborate');
});

test('factCheck over the answer prose corroborates and earns a citation', async () => {
  const doc = docOf(KIN);
  const graph = doc.projectGraph ? doc.projectGraph() : projectGraph(doc.log);
  const fc = await factCheck({ prose: "Gregor's sister is Grete.", doc, graph, classifier: null });
  assert.equal(fc.counts.corroborated, 1);
  assert.ok(fc.citations.length >= 1, 'a corroborated claim earns a citation');
});

test('a non-kin equative does not manufacture an edge (only typed relations)', () => {
  const doc = docOf(KIN);
  // "favourite" is not a relation the algebra types → no edge fabricated
  const edges = equativeKinEdges("Gregor's favourite is Grete.", doc.admission);
  assert.equal(edges.length, 0);
});

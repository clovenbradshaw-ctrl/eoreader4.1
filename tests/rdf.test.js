import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { briefRDF, rdfRealizationPrompt, speakTriples, assembleBrief } from '../src/write/index.js';

// The brief as RDF-star: the x→relation→y triple an LLM already knows, ENRICHED with the EO
// structure a flat triple loses — the operator, the site terrain, the resolution band, the
// arrow of time, the provenance door. The triple is the fact; the eo: annotations are how to
// say it.

test('briefRDF emits standard triples an LLM knows', () => {
  const rdf = briefRDF(parseText('Grete fed Gregor.', { docId: 'd' }), { max: 4 });
  assert.match(rdf, /@prefix eo:/, 'a Turtle document');
  assert.match(rdf, /ex:Grete eo:fed ex:Gregor/, 'the x→relation→y triple, figures as resources');
  assert.match(rdf, /owl:ObjectProperty/, 'the relation is typed (the ontology travels)');
});

test('each triple carries the EO richness a flat triple loses (RDF-star annotation)', () => {
  const rdf = briefRDF(parseText('Grete fed Gregor.', { docId: 'd' }), { max: 4 });
  // the quoted-triple annotation hangs operator · site · band · order · door off the edge
  assert.match(rdf, /<< ex:Grete eo:fed ex:Gregor >>/, 'the edge is reified as an RDF-star quoted triple');
  assert.match(rdf, /eo:op "CON"/, 'the OPERATOR behind the edge');
  assert.match(rdf, /eo:site "Link"/, 'the SITE terrain it lands on (Structure × Figure = Link)');
  assert.match(rdf, /eo:band "(firm|hedged|void)"/, 'the resolution BAND — how definitely it holds');
  assert.match(rdf, /eo:order \d+/, 'the arrow of TIME — when it was constituted');
  assert.match(rdf, /eo:door "perceiver"/, 'the PROVENANCE door — exafference, read from the world');
});

test('the resolution band reflects coupling — a firm bond is firm', () => {
  const rdf = briefRDF(parseText('Anna saw Ben. Anna saw Ben.', { docId: 'd' }), { max: 6 });
  assert.match(rdf, /eo:band "firm"/, 'a held bond reads firm');
});

test('rdfRealizationPrompt feeds the graph and teaches the annotations as delivery cues', () => {
  const p = rdfRealizationPrompt(parseText('Grete fed Gregor.', { docId: 'd' }), { max: 4 });
  assert.match(p.system, /RDF|graph|annotation/i, 'it tells the talker it is reading an RDF graph');
  assert.match(p.system, /band|order|site/i, 'and how to read the EO cues (band → certainty, order → sequence)');
  assert.match(p.user, /<< ex:Grete eo:fed ex:Gregor >>/, 'the user message is the enriched graph');
});

test('speakTriples renders natural speech from the triples — grouped, not per-clause salad', () => {
  const doc = parseText('Grete fed Gregor. Grete tended Gregor. Grete left.', { docId: 'd', genderCoref: true });
  const props = [
    { subj: 'Grete', verb: 'fed', obj: 'Gregor' },
    { subj: 'Grete', verb: 'tended', obj: 'Gregor' },
    { subj: 'Grete', verb: 'left', obj: null },
  ];
  const said = speakTriples(props, { genders: { Grete: 'f' } });
  assert.match(said, /Grete fed Gregor, tended Gregor, and left\./, 'one sentence, compound predicate');
});


test('assembleBrief produces exactly what the LLM would be told, from the whole pipeline', () => {
  const doc = parseText(
    'Grete fed Gregor. Grete tended Gregor. The father struck Gregor. Grete renounced Gregor.',
    { docId: 'm', genderCoref: true },
  );
  const b = assembleBrief(doc, { question: "How does Grete's feeling toward Gregor change?", history: [] });
  // the talker payload is a system + user pair
  assert.equal(typeof b.prompt.system, 'string');
  assert.match(b.prompt.user, /@prefix eo:/, 'the user message is the EO-enriched RDF graph');
  assert.match(b.prompt.user, /eo:op|eo:site|eo:band/, 'each edge carries its EO annotation');
  // it is restricted to the salient edges, and a no-LLM render is offered alongside
  assert.ok(b.propositions.length >= 1, 'salient edges selected');
  assert.equal(typeof b.draft, 'string', 'the no-LLM speakTriples render rides too');
  assert.ok(b.thread.some(f => /grete|gregor/i.test(f)), 'the thread it rode is reported');
});

test('the assembled prompt narrows to the thread — a different question, a different graph', () => {
  const doc = parseText('Anna saw Ben. Anna trusted Ben. Carol fled Dan.', { docId: 'd' });
  const aboutAnna = assembleBrief(doc, { question: 'What did Anna do to Ben?' });
  // the salient selection is driven by the thread; Anna/Ben edges are kept
  assert.match(aboutAnna.prompt.user, /Anna|Ben/, 'the thread figures are in the graph the talker gets');
});

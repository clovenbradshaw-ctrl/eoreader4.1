import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyProvenance } from '../src/ground/index.js';
import { eotDoc } from '../src/ingest/index.js';
import { runVetoes } from '../src/ground/index.js';
import { parseText } from '../src/perceiver/parse/index.js';

// A response is a sequence of propositions, each with its own grounding provenance —
// verbatim (lifted), grounded (the same figures stand in the same relation a span asserts),
// or fabricated (witnessed by nothing). The judgement is propositional MEANING, not raw-span
// word overlap, so a salad that shares words with a span but asserts nothing it holds is caught.

const SPANS = [
  'Ptolemy placed Earth at the centre.',
  'Anna trusted Ben.',
  'Saving the Appearances meant fitting the data.',
];

test('the audit salad is all fabricated — word overlap with a span does not ground it', () => {
  const c = classifyProvenance('Saving the Appearances answer question. DB ID answer question.', SPANS);
  assert.equal(c.summary.fabricated, c.propositions.length, 'every proposition fabricated');
  assert.equal(c.allFabricated, true);
  assert.equal(c.anyWitnessed, false, 'nothing in it is witnessed by what was read');
});

test('a proposition lifted from a span is verbatim', () => {
  const c = classifyProvenance('Ptolemy placed Earth.', SPANS);
  assert.equal(c.propositions[0].grounding, 'verbatim');
});

test('nothing is groundless — a fabricated proposition is grounded to the VOID', () => {
  const c = classifyProvenance('Ptolemy charted the comets.', SPANS);   // comets in no span
  const p = c.propositions[0];
  assert.equal(p.grounding, 'fabricated', 'still classified fabricated for compatibility');
  assert.equal(p.ground, 'void', 'but its GROUND is the void — the model’s training');
  assert.equal(p.witness, 'void', 'witnessed by nothing read; its witness is the void');
  assert.equal(p.witnessed, false, 'not witnessed by any read source');
  assert.equal(c.summary.void, 1, 'the summary counts the void ground');
  assert.equal(c.allVoid, true, 'every proposition rests on the void');
});

test('a span-grounded and a source-grounded claim carry their non-void grounds', () => {
  const doc = parseText('Anna saw Ben. She trusted Ben.', { docId: 's' });
  assert.equal(classifyProvenance('Anna saw Ben.', { doc }).propositions.find(p => p.via === 'saw')?.ground, 'span');
  assert.equal(classifyProvenance('Anna trusted Ben.', { doc }).propositions.find(p => p.via === 'trusted')?.ground, 'source');
});

test('GROUNDED requires the SAME relation — a different verb between the same figures is fabricated', () => {
  const doc = parseText('Anna saw Ben. She trusted Ben.', { docId: 's' });
  // "Anna trusted Ben" — the relation is in the graph (She→Anna by coref), not in any one
  // span, so it is grounded but not verbatim; a passive/reorder would ground the same way.
  assert.equal(classifyProvenance('Anna trusted Ben.', { doc }).propositions.find(p => p.via === 'trusted')?.grounding, 'grounded');
  // "Anna married Ben" — same figures, but a relation the doc never asserts → fabricated.
  // Meaning is the relation, not just who it is about: married ≠ trusted/saw.
  assert.equal(classifyProvenance('Anna married Ben.', { doc }).propositions.find(p => p.via === 'married')?.grounding, 'fabricated');
});

test('a proposition about figures nothing read mentions is fabricated', () => {
  const c = classifyProvenance('Ptolemy charted the comets.', SPANS);   // comets in no span
  assert.equal(c.propositions[0].grounding, 'fabricated');
});

test('judged against the doc GRAPH (coref intact), a graph-faithful answer is fully witnessed', () => {
  const doc = parseText('Gregor Samsa woke. Gregor Samsa saw Grete. Gregor Samsa trusted Grete.', { docId: 'm' });
  const faithful = classifyProvenance('Gregor Samsa saw Grete.', { doc });
  assert.equal(faithful.summary.fabricated, 0, 'an answer drawn from the graph fabricates nothing');
  const offGraph = classifyProvenance('Gregor Samsa met Klamm.', { doc });   // Klamm not in the doc
  assert.equal(offGraph.propositions.find(p => p.via === 'met')?.grounding, 'fabricated');
});

test('one response, mixed provenance — the fabricated part is isolated, the witnessed ride', () => {
  const c = classifyProvenance('Ptolemy placed Earth. Ptolemy charted the comets.', SPANS);
  const g = Object.fromEntries(c.propositions.map(p => [p.via, p.grounding]));
  assert.equal(g.placed, 'verbatim', 'the lifted proposition is verbatim');
  assert.equal(g.charted, 'fabricated', 'the invented proposition is isolated as fabricated');
  assert.equal(c.anyWitnessed, true, 'the response is not refused whole — the witnessed part stands');
});


test('the witness dimension: a claim grounded only by EOT notes is interpretation, not witnessed', () => {
  // EOT is the model's reafferent notes — grounded (the relation is in the reading) but NOT
  // witnessed, because nothing outside the engine's own reading attests it.
  const notes = eotDoc('Grete : Person\nGregor : Person\nGrete -> Gregor : fed');
  const c = classifyProvenance('Grete fed Gregor.', { doc: notes });
  assert.equal(c.propositions[0].witness, 'reafference', 'witnessed only by the model\'s interpretation');
  assert.equal(c.propositions[0].interpretation, true);
  assert.equal(c.onlyInterpretation, true, 'the whole answer rests on interpretation');
  assert.equal(c.anyWitnessed, false, 'nothing the world witnesses');
});

test('a claim grounded against PROSE (the world read) is witnessed by exafference', () => {
  const prose = parseText('Grete fed Gregor.', { docId: 'p' });
  const c = classifyProvenance('Grete fed Gregor.', { doc: prose });
  assert.equal(c.propositions[0].witness, 'exafference', 'the text was the world — it witnesses');
  assert.equal(c.onlyInterpretation, false);
  assert.equal(c.anyWitnessed, true);
});

test('an EXTERNAL import (real data) witnesses, even though it arrived as EOT', () => {
  const imported = eotDoc('Grete : Person\nGregor : Person\nGrete -> Gregor : fed', { door: 'perceiver' });
  const c = classifyProvenance('Grete fed Gregor.', { doc: imported });
  assert.equal(c.propositions[0].witness, 'exafference', 'imported data is exafference');
});


test('the interpretation veto fires when an answer rests only on the model\'s notes', () => {
  const notes = eotDoc('Grete : Person\nGregor : Person\nGrete -> Gregor : fed');
  const provenance = classifyProvenance('Grete fed Gregor.', { doc: notes });
  const { fired, refuse } = runVetoes({ draft: 'Grete fed Gregor.', bound: [{ citation: 's0' }], task: 'answer', provenance });
  const flag = fired.find(f => f.id === 'interpretation');
  assert.ok(flag, 'the interpretation flag fires');
  assert.equal(flag.refuses, false, 'flag-and-tell: the reading still rides, marked as interpretation');
  assert.equal(refuse, false);
});

test('a prose-grounded answer does NOT fire the interpretation veto (the text is the world)', () => {
  const prose = parseText('Grete fed Gregor.', { docId: 'p' });
  const provenance = classifyProvenance('Grete fed Gregor.', { doc: prose });
  const { fired } = runVetoes({ draft: 'Grete fed Gregor.', bound: [{ citation: 's0' }], task: 'answer', provenance });
  assert.ok(!fired.some(f => f.id === 'interpretation'), 'witnessed by exafference — no interpretation flag');
});

test('seek the witness: an interpretation the SOURCE attests is upgraded to witnessed', () => {
  const notes = eotDoc('Grete : Person\nGregor : Person\nGrete -> Gregor : fed');   // the model's reading
  // with no source, the claim rests only on the notes — interpretation.
  assert.equal(classifyProvenance('Grete fed Gregor.', { doc: notes }).propositions[0].witness, 'reafference');
  // hand it the SOURCE the notes were read from, and it attests the same relation → witnessed.
  const source = parseText('Grete fed Gregor every day.', { docId: 'src' });
  const confirmed = classifyProvenance('Grete fed Gregor.', { doc: notes, witness: source });
  assert.equal(confirmed.propositions[0].witness, 'exafference', 'the source confirms the interpretation');
  assert.equal(confirmed.onlyInterpretation, false, 'no longer interpretation-only — the world attests it');
  // a source that does NOT attest the relation leaves it interpretation (the witness is absent).
  const silent = parseText('Grete saw Gregor.', { docId: 'src2' });
  assert.equal(classifyProvenance('Grete fed Gregor.', { doc: notes, witness: silent }).onlyInterpretation, true);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { groundSpans, groundSummary, citationHolds } from '../src/ground/index.js';
import { parseText } from '../src/perceiver/parse/index.js';

// Every span of an answer is grounded: EITHER to a source (from the perceiver door — with the
// precise line it came from, so the hover can say where) OR to the void (the model's own
// words, the enactor door). groundSpans is the projection the reader hovers; it tiles the whole
// answer — no span left bare — which is what "every span needs to be grounded" means.

// The retrieved passages the answer drew on — each is a jumpable location: u (the source),
// i (its line index there), text (the verbatim line).
const PASSAGES = [
  { u: 'https://en.wikipedia.org/wiki/Dolphin', i: 12, text: 'Dolphins range in sizes from the 1.7-metre-long Maui\'s dolphin to the 9.5 m orca.' },
  { u: 'https://en.wikipedia.org/wiki/Dolphin', i: 40, text: 'Dolphins are social animals living in groups called pods.' },
];

test('a span lifted from a passage is grounded to that source, with the precise line', () => {
  const [v] = groundSpans(['Dolphins are social animals living in groups called pods.'], { passages: PASSAGES });
  assert.equal(v.kind, 'source');
  assert.equal(v.witness, 'exafference');
  assert.equal(v.source.u, 'https://en.wikipedia.org/wiki/Dolphin');
  assert.equal(v.source.idx, 40, 'the exact line index in the source — the "where precisely"');
  assert.match(v.source.text, /pods/, 'and the verbatim line, for the hover');
});

test('a substantive span nothing read carries is the MODEL ASSERTING — void, but a real claim with provenance', () => {
  const [v] = groundSpans(['Dolphins have inspired poets across many centuries of literature.'], { passages: PASSAGES });
  assert.equal(v.kind, 'llm');
  assert.equal(v.witness, 'void');
  assert.equal(v.role, 'assertion', 'the model puts this forward on its own knowledge — attributable, not a mere absence');
  assert.equal(v.source, null, 'no source location — it rests on the model\'s training');
});

test('a short connective span is the model\'s own scaffolding — void, role connective, never falsely sourced', () => {
  const [v] = groundSpans(['In addition,'], { passages: PASSAGES });
  assert.equal(v.kind, 'llm');
  assert.equal(v.role, 'connective', 'it asserts nothing — the writer joining points, not a claim');
});

test('the projection tiles the whole answer — one verdict per span, in order, none dropped', () => {
  const spans = [
    'Dolphins are social animals living in groups called pods.',      // sourced
    'They are widely considered among the most intelligent animals.', // void (in no passage)
    'Dolphins range in sizes from the Maui\'s dolphin to the orca.',   // sourced
  ];
  const v = groundSpans(spans, { passages: PASSAGES });
  assert.equal(v.length, spans.length, 'every span classified, order preserved');
  assert.deepEqual(v.map((x) => x.kind), ['source', 'llm', 'source']);
  const s = groundSummary(v);
  assert.equal(s.total, 3);
  assert.equal(s.source, 2);
  assert.equal(s.llm, 1);
  assert.equal(s.allSourced, false);
  assert.equal(s.allVoid, false);
});

test('with no passages and no doc, every span is the model\'s own — the "just the model" answer, expressed not hidden', () => {
  const v = groundSpans(['Dolphins are marine mammals.', 'They navigate the ocean by echolocation.'], {});
  assert.ok(v.every((x) => x.kind === 'llm'));
  const s = groundSummary(v);
  assert.equal(s.allModel, true, 'the whole answer is the model\'s own — the surface must express this');
  assert.equal(s.allVoid, true);
  assert.equal(s.modelAsserts, true, 'and the model is asserting real claims, not just phrasing');
});

// ── the doc guard: meaning decides source-vs-void, not raw word overlap ───────────────────

test('the doc guards a word-salad: sharing a passage\'s words but asserting nothing it holds is void', () => {
  // "answer question" shares words with the passage but stands in no relation the doc asserts —
  // classifyProvenance catches it (the provenance.js discipline), so a below-verbatim lexical
  // hit is held to the void rather than mislabelled as sourced.
  const doc = parseText('Anna trusted Ben. Ben warned Carol.', { docId: 'd' });
  const passages = [{ u: 'text:d', i: 0, text: 'Anna trusted Ben.' }];
  const [salad] = groundSpans(['Anna question answer trusted salad.'], { passages, doc, minOverlap: 0.25 });
  // low, non-verbatim overlap on a span the graph does not witness → void
  assert.equal(salad.kind, 'llm');
});

test('a claim grounded by the graph\'s coref (not lifted from one line) is still sourced, located in the doc', () => {
  // "She trusted Ben" → Anna trusted Ben by coref; the relation is in the graph though no single
  // retrieved passage was supplied. The doc witnesses the meaning → sourced, with a doc line.
  const doc = parseText('Anna saw Ben. She trusted Ben.', { docId: 'd' });
  const [v] = groundSpans(['Anna trusted Ben.'], { passages: [], doc });
  assert.equal(v.kind, 'source', 'the graph witnesses it — grounded, not void');
  assert.equal(v.witness, 'exafference');
});

test('a genuine verbatim lift stands even when the parser reads no relation out of it', () => {
  const doc = parseText('The mesolimbic pathway modulates dopaminergic tone.', { docId: 'd' });
  const passages = [{ u: 'text:d', i: 0, text: 'The mesolimbic pathway modulates dopaminergic tone.' }];
  const [v] = groundSpans(['The mesolimbic pathway modulates dopaminergic tone.'], { passages, doc });
  assert.equal(v.kind, 'source', 'a near-verbatim lift is sourced regardless of parse');
});

// ── citationHolds: the per-citation honesty gate the inline render binder reads ─────────────
// Overlap FINDS a candidate passage; citationHolds decides whether pinning a citation there is
// honest. Below the verbatim floor the passage must WITNESS the claim (same figures, same relation),
// not merely share its words — so a citation is never severed from the claim it is meant to carry.

test('citationHolds REFUSES a claim that borrows a passage\'s words but asserts a relation it never makes', () => {
  // The reported failure, verbatim: a confabulated wholesome claim ("empathy ... help other animals,
  // including humans, in distress") lexically matches a passage about SEXUAL behaviour on the shared
  // phrase "other animals, including humans" — but the passage witnesses none of what the claim says.
  const claim = 'Dolphins have been observed showing empathy and compassion towards each other, and they have even been known to help other animals, including humans, in distress.';
  const passage = 'Various species of dolphin have been known to engage in sexual behavior including copulation with dolphins of other species, and occasionally exhibit sexual behavior towards other animals, including humans.';
  assert.equal(citationHolds(claim, passage, 0.47), false, 'shared vocabulary, no witnessed proposition → the citation must not stand');
});

test('citationHolds ADMITS a near-verbatim lift with no propositional check — verbatim IS the grounding', () => {
  const claim = 'Dolphins are highly social animals living in complex fission-fusion societies, forming fluid groups that constantly change in size and composition.';
  const passage = 'Dolphins are highly social animals living in complex "fission-fusion" societies, forming fluid groups (i.e., pods) that constantly change in size and composition.';
  assert.equal(citationHolds(claim, passage, 0.74), true, 'at/above the verbatim floor the lift stands');
});

test('citationHolds ADMITS a below-verbatim reword the passage genuinely witnesses', () => {
  const claim = 'Dolphins tend to travel in pods.';
  const passage = 'Dolphins tend to travel in pods, upon which there are groups of dolphins that range from a few to many.';
  assert.equal(citationHolds(claim, passage, 0.4), true, 'the passage asserts the same relation → the citation is honest');
});

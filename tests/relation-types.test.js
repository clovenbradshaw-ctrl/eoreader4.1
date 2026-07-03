import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseText } from '../src/perceiver/parse/index.js';
import { projectGraph } from '../src/core/index.js';
import { answerConfirm } from '../src/answer/index.js';
import { factCheck, contradictionRefuses, CONTRADICTION_REFUSE_FLOOR } from '../src/factcheck/index.js';
import {
  typeOf, areDisjoint, functionalClash, isFunctional, isSymmetric,
  checkRelationConflict,
} from '../src/core/index.js';
import { structureSurface } from '../src/perceiver/index.js';
import { createPhasepostClassifier } from '../src/classify/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';

// A document where Grete is established as Gregor's sister through kinship
// apposition. Mirrors the parse-holon fixture: Grete is admitted (two bare
// sightings) before "His sister Grete", and "His" resolves to the hotter
// referent (Gregor) — so the page logs gregor-samsa -> grete : sister @s4.
const STORY =
  'Grete arrived. Grete waited. Gregor Samsa woke. Gregor stood. His sister Grete left. Klaus Berg arrived.';

// ---------------------------------------------------------------------------
// 1. The typing map — open vocab in, a closed primitive (with gender) out.

test('typeOf projects surface nouns onto primitives, recovering gender', () => {
  assert.equal(typeOf('sister').type, 'sibling');
  assert.equal(typeOf('sister').gender, 'F');
  assert.equal(typeOf('brother').gender, 'M');
  assert.equal(typeOf('mother').type, 'parent');
  assert.equal(typeOf('father').type, 'parent');           // same primitive as mother
  assert.equal(typeOf('captain').type, 'leads');           // non-kin, same machinery
  assert.equal(typeOf('friend').type, 'social');
  assert.equal(typeOf('mother-of').type, 'parent');        // the -of suffix is stripped
  assert.equal(typeOf('tends'), null);                     // an untyped verb defers
  assert.equal(typeOf('xyzzy'), null);
  assert.equal(typeOf(null), null);
});

test('functional and symmetric live on the primitive, not the noun', () => {
  assert.equal(isSymmetric('sister'), true);               // sibling is symmetric
  assert.equal(isSymmetric('mother'), false);              // parent is not
  assert.equal(isFunctional('mother'), true);              // one mother (per gender)
  assert.equal(isFunctional('sister'), false);
});

// ---------------------------------------------------------------------------
// 2. Gendered disjointness — the algebra's whole point.

test('disjointness combines the primitive table and the gender split', () => {
  assert.equal(areDisjoint('mother', 'sister'), true);     // parent ⟂ sibling (table)
  assert.equal(areDisjoint('mother', 'father'), true);     // same primitive, gender split
  assert.equal(areDisjoint('sister', 'brother'), true);    // same primitive, gender split
  assert.equal(areDisjoint('mother', 'daughter'), true);   // parent ⟂ child (table)
  assert.equal(areDisjoint('sister', 'sister'), false);    // identical role, no conflict
  assert.equal(areDisjoint('mother', 'mother'), false);
  assert.equal(areDisjoint('sister', 'tends'), false);     // one side untyped → defer
});

test('functionalClash needs a SAME, gender-matched functional role', () => {
  assert.equal(functionalClash('mother', 'mother'), true); // two mothers clash
  assert.equal(functionalClash('mother', 'father'), false);// a mother and a father do not
  assert.equal(functionalClash('wife', 'wife'), true);
  assert.equal(functionalClash('sister', 'sister'), false);// sibling is not functional
});

// ---------------------------------------------------------------------------
// 3. The symbolic verdict — embedder-free, with the provenance guard.

test('checkRelationConflict contradicts a disjoint axiom on the same pair', () => {
  const graph = { representative: (id) => id,
    edges: [{ from: 'gregor', to: 'grete', via: 'sister', sentIdx: 4 }] };
  const v = checkRelationConflict(graph, { src: 'gregor', tgt: 'grete', via: 'mother' });
  assert.equal(v.verdict, 'contradicted');
  assert.equal(v.reason, 'disjoint-axiom');
  assert.equal(v.citation, 's4');
});

test('a contradiction carries the joint typing prior, not just a boolean', () => {
  // sister (sibling, 0.9) on the doc edge vs a claimed mother (parent, 0.95):
  // the contradiction's confidence is the product of the two calibrated priors.
  const graph = { representative: (id) => id,
    edges: [{ from: 'gregor', to: 'grete', via: 'sister', sentIdx: 4 }] };
  const v = checkRelationConflict(graph, { src: 'gregor', tgt: 'grete', via: 'mother' });
  assert.ok(Math.abs(v.confidence - 0.95 * 0.9) < 1e-9, 'confidence = parent × sibling prior');

  // A functional clash carries the functional primitive's prior on both sides.
  const wifeGraph = { representative: (id) => id,
    edges: [{ from: 'x', to: 'a', via: 'wife', sentIdx: 1 }] };
  const w = checkRelationConflict(wifeGraph, { src: 'x', tgt: 'b', via: 'wife' });
  assert.ok(Math.abs(w.confidence - 0.9 * 0.9) < 1e-9, 'confidence = spouse × spouse prior');
});

test('the refusal gate is a likelihood, not a boolean — confident contradictions refuse, weak ones flag', () => {
  assert.equal(contradictionRefuses({ verdict: 'contradicted', confidence: 0.9 }), true);
  assert.equal(contradictionRefuses({ verdict: 'contradicted', confidence: 0.4 }), false);
  // No confidence → treated as certain (the geometric VOID path is embedder-gated).
  assert.equal(contradictionRefuses({ verdict: 'contradicted' }), true);
  // A non-contradiction never refuses, whatever its confidence.
  assert.equal(contradictionRefuses({ verdict: 'unsupported', confidence: 0.99 }), false);
  // Every current symbolic kinship axiom clears the floor — no regression.
  assert.ok(0.9 * 0.95 >= CONTRADICTION_REFUSE_FLOOR);
});

test('checkRelationConflict defers (null) on untyped or non-conflicting relations', () => {
  const graph = { representative: (id) => id,
    edges: [{ from: 'gregor', to: 'grete', via: 'sister', sentIdx: 4 }] };
  assert.equal(checkRelationConflict(graph, { src: 'gregor', tgt: 'grete', via: 'tends' }), null);
  assert.equal(checkRelationConflict(graph, { src: 'gregor', tgt: 'grete', via: 'sister' }), null);
  assert.equal(checkRelationConflict(graph, { src: 'gregor', tgt: 'klaus', via: 'mother' }), null);
});

test('functional refusal requires a WITNESSED filler — two derived guesses never refuse', () => {
  const claim = { src: 'x', tgt: 'b', via: 'wife' };
  const witnessed = { representative: (id) => id,
    edges: [{ from: 'x', to: 'a', via: 'wife', sentIdx: 1, derived: false }] };
  const derived = { representative: (id) => id,
    edges: [{ from: 'x', to: 'a', via: 'wife', sentIdx: 1, derived: true }] };
  assert.equal(checkRelationConflict(witnessed, claim).reason, 'functional-axiom');
  assert.equal(checkRelationConflict(derived, claim), null);   // provenance guard holds
  // and a gender-split filler is not a functional clash at all
  const husband = { representative: (id) => id,
    edges: [{ from: 'x', to: 'a', via: 'husband', sentIdx: 1 }] };
  assert.equal(checkRelationConflict(husband, claim), null);
});

// ---------------------------------------------------------------------------
// 4. The t8 fix — answerConfirm consults the graph BEFORE token overlap.

test('relational confirm refuses on a disjoint axiom, citing the role edge (the t8 fix)', () => {
  const doc = parseText(STORY, { docId: 't' });
  const a = answerConfirm(doc, 'is grete his mother?');
  assert.equal(a.route, 'confirm');
  assert.match(a.text, /^No —/);
  assert.match(a.text, /sister/);
  assert.match(a.text, /rules that out/);
  assert.deepEqual(a.sources, [4]);                         // the witnessing edge, not token overlap
});

test('relational confirm confirms a witnessed role with the edge citation', () => {
  const doc = parseText(STORY, { docId: 't' });
  const a = answerConfirm(doc, 'is grete his sister?');
  assert.equal(a.text, 'Yes [s4].');
  assert.deepEqual(a.sources, [4]);
});

test('relational confirm catches a gender split (brother vs sister)', () => {
  const doc = parseText(STORY, { docId: 't' });
  assert.match(answerConfirm(doc, 'is grete his brother?').text, /^No —.*sister.*rules that out/);
});

test('relational confirm never rubber-stamps a typed relation it cannot witness', () => {
  const doc = parseText(STORY, { docId: 't' });
  // Klaus is admitted but has no kinship role edge — honestly held, not "Yes".
  assert.equal(answerConfirm(doc, 'is Klaus his father?').text, 'The document does not say.');
});

test('a NON-relational confirm still takes the token-overlap path unchanged', () => {
  const doc = parseText('The sky is blue today.', { docId: 's' });
  assert.equal(answerConfirm(doc, 'is the sky blue?').text, 'Yes. [s0]');
  // A confirm whose subject the algebra cannot resolve falls through to the token
  // path — never the relational branch, so no fabricated "rules that out".
  const fell = answerConfirm(doc, 'is grete his mother?');
  assert.doesNotMatch(fell.text, /rules that out/);
});

test('a non-relational confirm DERIVES its Yes-line from the field, catching an overlap the blunt 0.6 would defer', () => {
  const doc = parseText([
    'The harbor master logged three ships at dawn.',
    'Rain fell steadily over the quiet market square.',
    'A grey cat slept on the warm stone wall.',
    'The old clock tower chimed nine times slowly.',
    'Children chased pigeons across the open plaza.',
    'The baker sold fresh bread to early travellers.',
    'Sailors mended torn nets beside the wooden pier.',
    'A lighthouse beam swept the dark restless sea.',
  ].join(' '), { docId: 'rich' });
  // Six content tokens; the best sentence (s0) shares three — overlap 0.50, under
  // the old 0.6 constant (a defer to the model). But 0.50 towers over THIS field's
  // own chance overlap (every other sentence ~0), so the derived Born line (~0.37)
  // confirms it cheaply, no model warmed. The floor moved off the number and onto
  // the field — the whole point.
  const a = answerConfirm(doc, 'did the harbor master log ships at the quiet market?');
  assert.equal(a.route, 'confirm');
  assert.equal(a.text, 'Yes. [s0]');
  assert.deepEqual(a.sources, [0]);
});

// ---------------------------------------------------------------------------
// 5. The veto wiring — the algebra fires end-to-end, even under the hash organ.

test('factCheck contradicts a disjoint kinship claim with NO meaning embedder (§4)', async () => {
  const doc   = parseText(STORY, { docId: 't' });
  const graph = projectGraph(doc.log);
  // The hash organ cannot measure meaning, so every GEOMETRIC verdict would hold.
  // The symbolic algebra runs first and contradicts regardless.
  const clf = createPhasepostClassifier({
    cells: [], embedder: createHashEmbedder(),
    centroids: { meta: { model: 't', construction: 'clause', dim: 4 }, vectors: {} },
  });
  const out = await factCheck({ prose: "Gregor Samsa's mother Grete waited.", doc, graph, classifier: clf });
  assert.equal(out.counts.contradicted, 1);
  assert.equal(out.claims[0].reason, 'disjoint-axiom');
  assert.equal(out.claims[0].citation, 's4');
  assert.equal(out.refuse, true);
});

// ---------------------------------------------------------------------------
// 6. structureSurface tags each relation with its primitive type (section 5).

test('structureSurface carries the primitive type beside the surface via', () => {
  const doc = parseText(STORY, { docId: 't' });
  const s = structureSurface(doc, [0, 1, 2, 3, 4, 5]);
  const sib = s.relations.find(r => r.via === 'sister');
  assert.ok(sib, 'the sister relation is present in the structure surface');
  assert.equal(sib.type, 'sibling');                       // typed, not just the string
});

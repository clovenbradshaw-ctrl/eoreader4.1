import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { writeReferring, createReaderModel, conceptToPlan, speakConcept } from '../src/write/index.js';

// Writing is reading backwards: a pronoun is emitted only where the reader's coref field
// resolves it back to the meant entity (gender conformance + γ-activation + distinctness),
// generated content carries me-ness (enactor → mine; read back → self), and the saying
// order comes from traversing the concept graph, not the source order.

test('inverse coref: first mention is a name; a warm, unambiguous referent becomes a gender-correct pronoun', () => {
  const plan = [
    { subj: { id: 'gregor', gender: 'm', name: 'Gregor' }, verb: 'woke' },
    { subj: { id: 'gregor', gender: 'm', name: 'Gregor' }, verb: 'saw', obj: 'legs' },
  ];
  const out = writeReferring(plan);
  assert.equal(out.units[0].subjForm, 'name', 'first mention must be the name — nothing to resolve to yet');
  assert.equal(out.units[1].subjForm, 'pronoun', 'now warm and unambiguous → pronoun');
  assert.match(out.text, /\bHe\b/, 'gender-conformant pronoun (he)');
});

test('distinctness: two co-active same-gender referents force the name (no ambiguous pronoun)', () => {
  const plan = [
    { subj: { id: 'gregor', gender: 'm', name: 'Gregor' }, verb: 'saw', obj: { id: 'father', gender: 'm', name: 'the father' } },
    { subj: { id: 'father', gender: 'm', name: 'the father' }, verb: 'turned' },
  ];
  const out = writeReferring(plan);
  // both are masculine and co-active → "he" would be ambiguous, so the writer keeps the name
  assert.equal(out.units[1].subjForm, 'name', 'an ambiguous pronoun is refused — the name is used');
});

test('me-ness: given is perceiver/not-mine; generated is enactor/mine; read back is self', () => {
  const doc = parseText('Gregor woke.', { docId: 's' });
  const out = writeReferring([{ subj: { id: 'gregor', gender: 'm', name: 'Gregor' }, verb: 'woke' }], { given: doc });
  assert.equal(out.given.canWitness, true, 'the given can witness (exafference)');
  assert.equal(out.given.mine, false, 'the given is not mine');
  assert.ok(out.units.every(u => u.mine), 'generated content is mine (enactor)');
  assert.ok(out.self.every(s => s.mine && s.readBackOfSelf), 'reading my output back recognises it as self');
  assert.ok(out.self.every(s => !s.canWitness), 'my own output cannot witness — the self/world line holds');
});

test('the reader model is a separate thread — it predicts the reader, not the writer\'s intent', () => {
  const r = createReaderModel({ gamma: 0.7 });
  r.note('gregor', 'm', 'Gregor');
  assert.equal(r.resolvesTo('gregor', 'm'), true, 'a lone warm male referent resolves a male pronoun');
  r.note('father', 'm', 'the father');   // a second male, now warmest
  assert.equal(r.resolvesTo('gregor', 'm'), false, 'a fresher same-gender referent would steal the pronoun');
});

test('concept → traverse → words: the saying order comes from the graph, the words are re-expressed', () => {
  const doc = parseText('Gregor saw legs. Gregor loved Grete. Grete brought Gregor milk.', { docId: 'scene' });
  const plan = conceptToPlan(doc, { genders: { Gregor: 'm', 'Gregor Samsa': 'm', Grete: 'f' } });
  assert.ok(plan.length >= 1, 'the concept graph yields a proposition plan');
  const out = speakConcept(doc, { genders: { Gregor: 'm', 'Gregor Samsa': 'm', Grete: 'f' } });
  assert.equal(typeof out.text, 'string');
  assert.ok(out.units.every(u => u.mine), 'the spoken concept is self-authored');
});

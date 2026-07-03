import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { parseProps, correspondProp, propKey } from '../src/enactor/props.js';

// The unit of grounding is the PROPOSITION, and the correspondence is RELATIONAL
// (subject id · relation type · object id), not lexical overlap. Paraphrase
// grounds because endpoints resolve through the document field; verbatim echo
// earns nothing extra; a link between figures the basis never linked is support 0.

const STORY =
  'Gregor Samsa woke transformed. His sister Grete brought a bowl of milk. ' +
  'Grete opened the window. The father drove Gregor back into the room.';

test('parseProps resolves SVO into normalized, id-bearing propositions', () => {
  const doc = parseText(STORY, { docId: 'rel' });
  const props = parseProps(STORY, doc, Infinity);
  // The sister bond resolves both endpoints to figure ids (not surface strings).
  const sister = props.find(p => p.rel === 'sister');
  assert.ok(sister, 'the kinship proposition is read');
  assert.equal(sister.subj, 'gregor-samsa');
  assert.equal(sister.obj, 'grete');
  // The action bond carries the verb lemma and a referent object.
  const opened = props.find(p => p.rel === 'opened');
  assert.ok(opened && opened.subj === 'grete', 'Grete opened … resolves Grete');
});

test('correspondence is relational — paraphrase grounds, by resolved id not string', () => {
  const doc = parseText(STORY, { docId: 'rel' });
  const basis = parseProps(STORY, doc, Infinity).map(p => ({ ...p, amplitude: 1 }));

  // A paraphrase: "She opened the window" — the pronoun resolves to Grete through
  // the field, so it corresponds to the basis prop without sharing the surface word.
  const para = parseProps('Grete opened the window.', doc, Infinity)[0];
  const m = correspondProp(para, basis);
  assert.ok(m && m.score > 0, 'the paraphrase grounds against the resolved basis');
  assert.equal(m.prop.rel, 'opened');
});

test('a fluent hallucination — a link the basis never holds — scores 0 support', () => {
  const doc = parseText(STORY, { docId: 'rel' });
  const basis = parseProps(STORY, doc, Infinity).map(p => ({ ...p, amplitude: 1 }));
  // Grete → Gregor with a relation the document never asserts between them in this
  // direction/type, AND an object that is not a basis endpoint pair.
  const halluc = { kind: 'rel', op: 'CON', subj: 'grete', rel: 'married', obj: 'stranger' };
  assert.equal(correspondProp(halluc, basis), null, 'no correspondence → no support');
});

test('propKey is order-stable for a symmetric pair (depletion bookkeeping)', () => {
  const a = { kind: 'rel', subj: 'gregor-samsa', rel: 'sister', obj: 'grete' };
  const b = { kind: 'rel', subj: 'grete', rel: 'sister', obj: 'gregor-samsa' };
  assert.equal(propKey(a), propKey(b), 'the same proposition keys identically either way');
});

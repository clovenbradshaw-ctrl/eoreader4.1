import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { applyReanalysis } from '../src/surfer/index.js';
import { writeReferring, speakConcept, inferGenders } from '../src/write/index.js';

// A reduced-relative modifier (from reanalysis) is realised as a relative clause on the
// subject. The relativizer is DERIVED from animacy — "who" for an evidenced person, "that"
// otherwise — the only closed-class scaffold; which bond subordinates is the REC's measured tag.

test('an evidenced person takes "who"', () => {
  const out = writeReferring([{ subj: { id: 'g', gender: 'm', name: 'Gregor' }, verb: 'fell', relative: { verb: 'ran' } }]);
  assert.equal(out.units[0].text, 'Gregor, who ran, fell.');
});

test('an unevidenced/inanimate referent takes the neutral "that"', () => {
  const out = writeReferring([{ subj: { id: 'b', gender: 'n', name: 'Beauty' }, verb: 'fell', relative: { verb: 'ran' } }]);
  assert.equal(out.units[0].text, 'Beauty, that ran, fell.');
});

test('no relative → no relative clause (byte-identical)', () => {
  const out = writeReferring([{ subj: { id: 'g', gender: 'm', name: 'Gregor' }, verb: 'fell' }]);
  assert.equal(out.units[0].text, 'Gregor fell.');
});

test('end to end: the garden path realises as a reduced relative', () => {
  const isVerb = (w) => ['fell', 'rose', 'ran', 'sank'].includes(w);
  const doc = parseText('Beauty ran past the barn fell.', { docId: 'g' });
  applyReanalysis(doc, { isVerb });
  const text = speakConcept(doc, { genders: inferGenders(doc) }).text;
  assert.match(text, /Beauty, that ran, fell\./, 'the orphaned verb is the main predicate; the original is a relative modifier');
});

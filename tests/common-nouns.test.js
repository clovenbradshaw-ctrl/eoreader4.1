import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { speakConcept, inferGenders } from '../src/write/index.js';

// The common-noun admission catalyst (opt-in). A recurring definite common noun that takes a
// content verb reacts into an entity node ("the soldier"); the inhibitor refuses abstract /
// temporal / quantifier heads so the graph does not flood. Off by default → byte-identical.

const SCENE = 'The soldier crossed the river. The soldier found a village. The villagers fed the soldier. The soldier thanked them.';
const entities = (doc) => [...new Set(doc.log.snapshot().filter(e => e.op === 'INS').map(e => e.label))];

test('off by default: a common-noun referent never reacts — byte-identical capitalised reading', () => {
  const doc = parseText(SCENE, { docId: 's' });
  assert.ok(!entities(doc).includes('soldier'), 'no common-noun node without the catalyst');
});

test('on: a recurring common noun that takes content verbs reacts into a node', () => {
  const doc = parseText(SCENE, { docId: 's', commonNouns: true });
  assert.ok(entities(doc).includes('soldier'), 'the reagent forms');
});

test('the reagent bonds and generates — the scene that was silent now speaks', () => {
  const doc = parseText(SCENE, { docId: 's', commonNouns: true });
  const bonds = doc.log.snapshot().filter(e => e.op === 'CON' || e.op === 'SIG');
  assert.ok(bonds.some(b => b.src === 'soldier'), 'a common-noun subject now resolves into a bond');
  assert.ok(speakConcept(doc, { genders: inferGenders(doc) }).text.length > 0, 'generation is no longer silent');
});

test('the recurrence barrier: a single sighting does not admit (raised activation energy)', () => {
  const doc = parseText('The soldier vanished.', { docId: 's', commonNouns: true });   // one sighting
  assert.ok(!entities(doc).includes('soldier'), 'one sighting is below the recurrence barrier');
});

test('the inhibitor: an abstract/temporal head never admits, however often it recurs', () => {
  const doc = parseText('The way opened. The way closed. The way turned again.', { docId: 's', commonNouns: true });
  assert.ok(!entities(doc).includes('way'), 'an abstract head is inhibited — no runaway from "the way"');
});

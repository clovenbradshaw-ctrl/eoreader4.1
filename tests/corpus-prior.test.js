import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { createConventions, corpusRelationsInherit } from '../src/core/conventions/index.js';
import { linkInventory } from '../src/surfer/index.js';
import { speakConcept } from '../src/write/index.js';

// The corpus prior is the HOW a reader brings to a new document: which verbs are relation
// predicates. It changes only the recurrence gate (a corpus-attested verb met once is held
// firm, not weak), is byte-identical without a prior, and carries no content.

const CORPUS = { relationVerbs: [
  { via: 'saw', count: 100, op: 'CON' },
  { via: 'left', count: 80, op: 'CON' },
  { via: 'gave', count: 60, op: 'CON' },
  { via: 'barely', count: 2, op: 'CON' },   // below minCount → not inherited
] };

test('corpusRelationsInherit keeps frequent relation verbs and drops rare ones', () => {
  const inh = corpusRelationsInherit(CORPUS, { minCount: 4 });
  const tokens = inh.map(e => e.token);
  assert.deepEqual(tokens.sort(), ['gave', 'left', 'saw'], 'only verbs at/above minCount');
  assert.ok(inh.every(e => e.kind === 'relation'), 'inherited as relation conventions');
});

test('isRelation is empty without a prior and populated with one', () => {
  assert.equal(createConventions().isRelation('saw'), false, 'no prior → empty, reading byte-identical');
  const c = createConventions({ inherit: corpusRelationsInherit(CORPUS, { minCount: 4 }) });
  assert.equal(c.isRelation('saw'), true);
  assert.equal(c.isRelation('barely'), false, 'a sub-threshold verb is not inherited');
});

test('a single-sighting relation verb is held weak without the prior, firm with it', () => {
  const text = 'Anna saw Ben. Ben left Anna. Anna gave Maria.';   // each verb once, entity targets
  const without = linkInventory(parseText(text, { docId: 't' }));
  assert.ok(without.links.every(l => l.coupling < 1), 'without the prior, glimpsed relations are weak');

  const inherit = corpusRelationsInherit(CORPUS, { minCount: 4 });
  const withp = linkInventory(parseText(text, { docId: 't', conventionsOpts: { inherit } }));
  assert.ok(withp.links.every(l => l.coupling >= 1), 'with the prior, corpus-attested relations are firm');
});

test('generation effect: speaking only what is held firmly is silent without the prior, full with it', () => {
  const text = 'Anna saw Ben. Ben left Anna. Anna gave Maria.';
  const genders = { Anna: 'f', Ben: 'm', Maria: 'f' };
  const inherit = corpusRelationsInherit(CORPUS, { minCount: 4 });

  const silent = speakConcept(parseText(text, { docId: 't' }), { genders, minCoupling: 0.75 });
  assert.equal(silent.text, '', 'nothing held firmly enough to say');

  const full = speakConcept(parseText(text, { docId: 't', conventionsOpts: { inherit } }), { genders, minCoupling: 0.75 });
  assert.ok(full.text.length > 0, 'the corpus prior lets the same scene be spoken');
  assert.ok(/Anna|Ben|Maria/.test(full.text));
});

test('minCoupling defaults to 0 — the generator speaks every edge (byte-identical)', () => {
  const text = 'Anna saw Ben. Ben left Anna.';
  const genders = { Anna: 'f', Ben: 'm' };
  const all = speakConcept(parseText(text, { docId: 't' }), { genders });          // no floor
  assert.ok(all.text.length > 0, 'with no floor, glimpsed relations are still spoken');
});

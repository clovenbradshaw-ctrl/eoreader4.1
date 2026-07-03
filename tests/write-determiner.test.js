import { test } from 'node:test';
import assert from 'node:assert/strict';

import { writeReferring } from '../src/write/index.js';

// Determiners are DERIVED from givenness (Gundel's hierarchy), not hand-ruled: a common-noun
// referent the reader has met is definite ("the"), a fresh one indefinite ("a"). The choice
// is the reader field's measured givenness; only the closed-class determiners are scaffold.
// Proper names and pronouns take none, so the default (proper-named) telling is unchanged.

test('a common-noun referent is indefinite when new, definite once given', () => {
  const out = writeReferring([
    { subj: { id: 's', gender: 'n', name: 'soldier' }, verb: 'crossed' },
    { subj: { id: 's', gender: 'n', name: 'soldier' }, verb: 'rested' },
  ]);
  assert.match(out.units[0].text, /^A soldier crossed\.$/, 'first mention → indefinite');
  assert.match(out.units[1].text, /^The soldier rested\.$/, 'given → definite');
});

test('vowel-initial common noun takes "an"', () => {
  const out = writeReferring([{ subj: { id: 'a', gender: 'n', name: 'archer' }, verb: 'waited' }]);
  assert.match(out.units[0].text, /^An archer waited\.$/);
});

test('a new plural common noun is bare — English has no indefinite plural article', () => {
  const out = writeReferring([{ subj: { id: 'v', gender: 'p', name: 'villagers' }, verb: 'gathered' }]);
  assert.match(out.units[0].text, /^Villagers gathered\.$/, 'no "a villagers"');
});

test('proper names take no determiner — the default telling is unchanged', () => {
  const out = writeReferring([
    { subj: { id: 'g', gender: 'm', name: 'Gregor' }, verb: 'woke' },
    { subj: { id: 'g', gender: 'm', name: 'Gregor' }, verb: 'rose' },
  ]);
  assert.match(out.units[0].text, /^Gregor woke\.$/, 'no determiner on a proper name');
  assert.equal(out.units[1].subjForm, 'pronoun', 'and pronominalisation still applies');
});

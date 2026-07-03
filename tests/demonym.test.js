import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { createConventions } from '../src/core/conventions/index.js';

// The audit case (fca5f2f9): asked "who is the musician?", the reader answered "a
// Russian jazz player." The musician is Monk, and is American; "Russian" appears only
// as Dostoevsky's nationality ("the Russian novelist", "Russian Orthodoxy"). Three
// compounding parse defects manufactured the lie, each pinned by a test here:
//   A. a demonym in attributive position was admitted as a CHARACTER, so the
//      first-person "I" could resolve to "Russian" (entities.js gravity).
//   B. existential "there is an unspeaking jazz player" read "there" as a relation
//      verb (relations.js head-verb walk).
//   C. the relative clause "…player who refuses to speak" inherited the running
//      sentence subject instead of its antecedent (relations.js / clauses.js).

const edges = (doc) => doc.log.events
  .filter(e => e.op === 'CON' || e.op === 'SIG')
  .map(e => ({ src: e.src, via: e.via, tgt: e.tgt, s: e.sentIdx }));
const figures = (doc) => new Set(doc.admission.admitted.values());

test('conventions: a seeded demonym is recognised, a name is not', () => {
  const C = createConventions();
  assert.ok(C.isDemonym('Russian'), 'Russian is a demonym');
  assert.ok(C.isDemonym('french'),  'case-insensitive');
  assert.ok(C.isDemonym('American'));
  assert.ok(!C.isDemonym('Gregor'), 'a person name is not a demonym');
});

test('A — an attributive demonym is NOT admitted as a figure', () => {
  const doc = parseText('Fyodor was the Russian novelist. The French translation arrived.', { docId: 'd' });
  const ids = figures(doc);
  assert.ok(!ids.has('russian'), 'Russian (attributive) is not a character');
  assert.ok(!ids.has('french'),  'French (attributive) is not a character');
  assert.ok(ids.has('fyodor'),   'a real name still admits');
});

test('A — the demonym guard precedes the preposition branch ("about American television")', () => {
  // "American" modifies "television"; the prep branch must not read it as the object
  // of "about" and grant it figure gravity.
  const doc = parseText('He keeps learning about American television.', { docId: 'd' });
  assert.ok(!figures(doc).has('american'), 'American (attributive) is not a character');
});

test('A — a genuinely NOMINAL demonym still admits (the guard is surgical)', () => {
  // Copula subject — "Russian" names the language, a real referent.
  const doc = parseText('Russian is a hard language. The translator studied it.', { docId: 'd' });
  assert.ok(figures(doc).has('russian'), 'a nominal demonym (copula subject) still admits');
});

test('B — existential "there is X" emits no relation on "there"', () => {
  const doc = parseText('There is an unspeaking jazz player in the room.', { docId: 'd' });
  assert.ok(!edges(doc).some(e => e.via === 'there'), 'no edge via "there" from an existential');
});

test('C — a relative clause is not pinned on the running sentence subject', () => {
  // The one refusing to speak is the pianist, never Boris.
  const doc = parseText('Boris hired a pianist who refuses to speak.', { docId: 'd' });
  const es = edges(doc);
  assert.ok(es.some(e => e.src === 'boris' && e.via === 'hired'), 'the main clause still bonds (Boris hired …)');
  assert.ok(!es.some(e => e.src === 'boris' && e.via === 'refuses'),
    'the relative clause is NOT attributed to Boris');
});

test('regression: the Monk transcript never makes the musician "Russian"', () => {
  const text = [
    'Each week I sit across from Fyodor Mikhailovich Dostoevsky, the Russian novelist.',
    'He never rid himself of his Russian Orthodoxy.',
    'I am in a room, and there is an unspeaking jazz player who refuses to speak to me.',
  ].join(' ');
  const doc = parseText(text, { docId: 'monk' });
  assert.ok(!figures(doc).has('russian'), 'no bare "Russian" figure to mis-resolve "I" onto');
  const es = edges(doc);
  assert.ok(!es.some(e => e.tgt === 'player'),
    'no subject is bonded to the jazz "player" (the existential clause)');
  assert.ok(!es.some(e => e.via === 'refuses' && e.tgt === 'speak'),
    'no subject is bonded to "refuses to speak" (the relative clause)');
});

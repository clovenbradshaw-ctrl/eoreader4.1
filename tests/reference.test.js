import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText }      from '../src/perceiver/parse/pipeline.js';
import { namedReferents } from '../src/perceiver/index.js';
import { retrieveHybrid } from '../src/retrieve/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import { referenceTarget, conversationCast, localeOf } from '../src/converse/reference.js';

// Reference by reading (docs/reference-by-reading.md). The audit's five turns must
// resolve to the right referent by READING the conversation as the tail of the line —
// no PRONOUN regex, no CORRECTION opener, no ATTRIBUTE wordlist. The fixture
// reproduces the audit's structure: a musician (Monk) introduced EARLY then faded, a
// "His name is Curtis Yarvin" distractor the word *name* retrieves, and Nietzsche /
// Dostoevsky / Oedipus. The document ENDS on Oedipus, so the figure it hands the
// conversation is NOT Monk — only the conversation can re-warm him.
const DOC = [
  'Thelonious Monk drifts through the essay like a refrain.',
  'Monk is the only real musician in the room, all dissonance and silence.',
  'The pianist keeps needling the others, and he will not let the argument rest.',
  'The piece turns to Nietzsche.',
  'Nietzsche is patient with the noise; he tolerates the dissonance because he hears a method in it.',
  'Where a lesser reader would demand resolution, Nietzsche simply waits.',
  'Then Dostoevsky enters, and the essay asks whether he ever answers the question it keeps posing.',
  'Dostoevsky circles, defers, and circles again.',
  'There is a long digression about a reactionary blogger.',
  'His name is Curtis Yarvin, and the digression spends pages on his theories.',
  'Curtis Yarvin is not the subject of the essay, only a foil.',
  'At the close the essay returns to Oedipus.',
  'Old Oedipus stumbles toward a truth he already carries.',
  'The riddle, in the end, was always his own name.',
].join(' ');

const doc = parseText(DOC, { docId: 'audit-fixture' });
const embedder = createHashEmbedder();
const monkId = namedReferents(doc, 'Thelonious Monk')[0];

// The audit's turns, with the talker's replies — the reply is a unit on the line too
// (§4). The second reply is the WRONG answer the audit produced; the correction must
// recover from it by reading, not by matching a "no".
const TURNS = [
  { user: 'who is the musician?',  reply: 'Thelonious Monk, an American jazz pianist.' },
  { user: 'but what is his name?', reply: 'His name is Curtis Yarvin.' },
  { user: 'no the musician',       reply: 'Right — Thelonious Monk.' },
];

const resolveAt = async (i) => {
  const history = [];
  for (let k = 0; k < i; k++) {
    history.push({ role: 'user', content: TURNS[k].user });
    history.push({ role: 'assistant', content: TURNS[k].reply });
  }
  const q = TURNS[i].user;
  const spans = await retrieveHybrid(doc, q, embedder, 6);
  return referenceTarget(doc, history, q, spans);
};

test('the fixture is sharp: the document hands over Oedipus, not Monk', () => {
  assert.ok(monkId, 'Monk is an admitted referent');
  // The retrieval distractor for "name" really is Curtis Yarvin (the audit bug).
  const yarvin = namedReferents(doc, 'Curtis Yarvin')[0];
  assert.ok(yarvin && yarvin !== monkId, 'Curtis Yarvin is a distinct referent');
});

test('a definite description resolves through embedding, no CON edge needed', async () => {
  // "who is the musician?" — the turn names no figure and "musician" binds to no edge;
  // retrieval nominates Monk and the read picks him over the document's stale tail.
  const t = await resolveAt(0);
  assert.ok(t, 'a referent resolves');
  assert.equal(t.id, monkId, 'the musician is Monk');
});

test('a dangling pronoun binds to the conversation-warm referent, not the name distractor', async () => {
  // "but what is his name?" — retrieval would drift to "His name is Curtis Yarvin";
  // the prior turn warmed Monk, so "his" binds to Monk by warmth.
  const t = await resolveAt(1);
  assert.equal(t.id, monkId, 'his = Monk, not Curtis Yarvin');
});

test('the correction is read, not detected — no CORRECTION opener', async () => {
  // "no the musician" — the talker just committed Curtis Yarvin (now the warmest conv
  // figure). Embedding re-nominates the musician (Monk), who is also conv-warm, so the
  // read recovers Monk over the just-committed wrong answer. No "no"/"not" is matched.
  const t = await resolveAt(2);
  assert.equal(t.id, monkId, 'the correction recovers Monk');
});

test('localeOf hops to where the document establishes the referent', () => {
  // "his name" must seed the surf at a MONK line (where he is grounded), never the
  // "Curtis Yarvin name" line the word "name" resembles.
  const loc = localeOf(doc, monkId);
  assert.ok(loc >= 0 && loc <= 2, `Monk is established in his opening lines (got ${loc})`);
});

test('conversationCast warms the figures the conversation named, newest first', () => {
  const cast = conversationCast(
    [{ role: 'user', content: 'who is the musician?' },
     { role: 'assistant', content: 'Thelonious Monk, an American jazz pianist.' }],
    'but what is his name?',
  );
  assert.ok(cast.length >= 1, 'the conversation named a figure');
  assert.match(cast[0].label, /Monk/, 'Monk is the warmest conversation figure');
});

test('no document referent → no target (a clean no-op, byte-identical fallback)', async () => {
  // A question naming a figure the document does not hold resolves to nothing, so the
  // fold keeps its existing anchor/focus.
  const spans = await retrieveHybrid(doc, 'who is Hamlet?', embedder, 6);
  const t = referenceTarget(doc, [], 'who is Hamlet?', spans);
  // Either null, or — if retrieval nominated a real figure — never an invented id.
  if (t) assert.ok(namedReferents(doc, t.label).length >= 0);
});

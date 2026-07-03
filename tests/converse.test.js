import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCorefField } from '../src/perceiver/parse/coref.js';
import { parseText } from '../src/perceiver/parse/index.js';
import { readingAt } from '../src/perceiver/index.js';
import {
  TALKER, SPAN, CONVERSATIONAL_CAP,
  conversationalEvent, witnessOf, isCitableAsDocument,
  depositConversational, commitSurvives,
} from '../src/converse/index.js';

test('the field is two-channel: total warmth vs grounded-only', () => {
  const f = createCorefField();
  f.note('a', 0);                 // grounded sighting
  f.noteConversational('a', 0);   // talker warmth on the same referent
  const [cand] = f.field(0);
  assert.equal(cand.id, 'a');
  assert.ok(cand.grounded > 0, 'has grounded mass');
  assert.ok(cand.conversational > 0, 'and tagged conversational mass');
  // grounded-only carries no conversational mass
  const g = f.fieldGrounded(0);
  assert.equal(g[0].id, 'a');
  assert.equal(g.length, 1);
});

test('a conversational deposit is capped at the model reader ceiling', () => {
  const f = createCorefField();
  f.noteConversational('x', 0, 5);          // ask for far more than the cap
  const [c] = f.field(0);
  assert.ok(Math.abs(c.conversational - CONVERSATIONAL_CAP) < 1e-9, `got ${c.conversational}`);
  assert.equal(c.grounded, 0, 'a talker mention adds no grounded mass');
});

test('reinforce — the redrawn door — deposits conversational mass, never grounded', () => {
  const f = createCorefField();
  f.reinforce('x', 5, 0);                   // the model "nudge"
  assert.ok(f.field(0).some(c => c.id === 'x'), 'warms the total field');
  assert.ok(!f.fieldGrounded(0).some(c => c.id === 'x'), 'but never enters grounded mass');
  assert.ok(Math.abs(f.field(0)[0].conversational - CONVERSATIONAL_CAP) < 1e-9, 'capped');
});

test('grounded mass is invariant under talker warmth (survives subtraction unchanged)', () => {
  const f = createCorefField();
  f.note('home', 0); f.note('home', 1); f.note('away', 1);
  const before = f.fieldGrounded(2);
  for (let i = 0; i < 20; i++) f.noteConversational('echo', 2);  // a flood of talker warmth
  f.noteConversational('home', 2);
  const after = f.fieldGrounded(2);
  // The talker-only referent never appears in grounded; the grounded winner and
  // its weight are unchanged. The document reading does not move.
  assert.ok(!after.some(c => c.id === 'echo'));
  assert.equal(before[0].id, after[0].id);
  assert.ok(Math.abs(before[0].w - after[0].w) < 1e-9);
  assert.equal(before.length, after.length);
});

test('echo test: a relation on talker mass alone never survives subtraction', () => {
  const f = createCorefField();
  // The document grounds the true reading.
  f.note('home', 0); f.note('home', 1); f.note('home', 2);
  // The talker repeats a false relation to `usa` across several turns.
  for (let turn = 0; turn < 6; turn++) f.noteConversational('usa', 2);

  // Total warmth carries the conversational salience — the talker warmed `usa`.
  assert.ok(f.field(2).some(c => c.id === 'usa'), 'talker warmth is real salience');
  // But grounded-only never saw `usa` on the page.
  assert.ok(!f.fieldGrounded(2).some(c => c.id === 'usa'));
  assert.equal(f.fieldGrounded(2)[0].id, 'home');

  // The line where warmth would become evidence: refused.
  assert.equal(f.survivesSubtraction('usa', 2, 0.1), false, 'echo does not clear the floor on grounded mass');
  assert.equal(f.survivesSubtraction('home', 2, 0.1), true, 'the grounded reading stands');
  assert.equal(commitSurvives(f, 'usa', 2, 0.1), false);   // converse helper agrees
});

test('the conversational-provenance event is witnessed by the talker', () => {
  const ev = conversationalEvent({ text: 'X is in the USA', cursor: 3, turn: 2, referents: ['x', 'usa', 'x'] });
  assert.equal(ev.kind, 'conversational');
  assert.equal(ev.witness, TALKER);
  assert.equal(ev.cursor, 3);
  assert.deepEqual([...ev.referents], ['x', 'usa']);   // deduped
});

test('witness-type firewall: talker events are structurally uncitable as document provenance', () => {
  const talker = conversationalEvent({ text: 'said it', referents: ['x'] });
  assert.equal(isCitableAsDocument(talker), false);
  // A document/parse event (no explicit witness) sits on a span → citable.
  assert.equal(isCitableAsDocument({ op: 'INS', id: 'x', sentIdx: 0 }), true);
  assert.equal(witnessOf({}), SPAN);
  assert.equal(witnessOf(talker), TALKER);
});

test('depositConversational reads a talker event into the field; ignores non-talker witnesses', () => {
  const f = createCorefField();
  depositConversational(f, conversationalEvent({ text: '...', cursor: 0, referents: ['a', 'b'] }));
  assert.ok(f.field(0).some(c => c.id === 'a' && c.conversational > 0));
  assert.ok(f.field(0).some(c => c.id === 'b' && c.conversational > 0));
  // a span-witnessed "event" does not warm the conversational channel here
  depositConversational(f, { witness: SPAN, cursor: 0, referents: ['z'] });
  assert.ok(!f.field(0).some(c => c.id === 'z'));
});

test('expect door (reading mode) is capped and surfaced as tagged conversational prior', () => {
  const doc = parseText('Grete Vale entered. Grete sat. Grete read. Gregor Pike arrived.', { docId: 'e' });
  const base = readingAt(doc, 3);
  assert.equal(base.conversationalPrior, 0, 'no expect door used → no conversational prior');

  const warmed = readingAt(doc, 3, {
    expect: (id, label) => (String(label).includes('Grete') ? 5 : 0),  // ask for 5× the cap
  });
  assert.ok(Math.abs(warmed.conversationalPrior - CONVERSATIONAL_CAP) < 1e-9,
    `capped at ${CONVERSATIONAL_CAP}, got ${warmed.conversationalPrior}`);
});

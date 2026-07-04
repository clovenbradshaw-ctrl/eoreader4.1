import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';

// The vocative is the argument position gravity admission used to miss. A name you
// speak TO — set off by commas ("Because learning, Friedrich, but of late") — is as
// referential as a subject, yet `sightingGravity` reads `prev`/`next` as the adjacent
// WORD and a comma stops that read cold, so a comma-inset name fell through to zero
// gravity and never admitted. The screenshot audit (the Monk transcript) showed it:
// "Friedrich" is addressed twice and never became a figure. The fix grants the floor
// to a name inset by punctuation on BOTH sides — high-precision, so a clause-opener,
// a heading, or a bare stray capital (none of which sit between two commas) stays out.

const figures = (doc) => new Set(doc.admission.admitted.values());

test('a comma-inset vocative admits — the name is spoken TO', () => {
  const doc = parseText('Because learning, Friedrich, but of late I concluded.', { docId: 'v' });
  assert.ok(figures(doc).has('friedrich'), 'a name between two commas is a referent (direct address)');
});

test('a vocative at the clause end admits — comma before, terminal after', () => {
  const doc = parseText('He always asks the same question, Friedrich.', { docId: 'v' });
  assert.ok(figures(doc).has('friedrich'), 'a trailing set-off name is direct address, not a stray capital');
});

test('a comma-separated roster admits its inset members (a genealogy list)', () => {
  // No content verb ties each name — only the commas do. The inset members earn the
  // floor as set-off referents; this is the roster the recurrence-free list used to lose.
  const doc = parseText('Adam, Seth, Enosh, Kenan, Mahalaleel begat many.', { docId: 'v' });
  const ids = figures(doc);
  for (const name of ['seth', 'enosh', 'kenan', 'mahalaleel'])
    assert.ok(ids.has(name), `${name} admits as a roster member`);
});

test('a clause-opener set off by a comma stays refused (starter strip precedes gravity)', () => {
  // "Behold," / "Lo," / "Verily," are starters — cleanLabel removes them before a
  // candidate reaches gravity, so the vocative rule never sees them.
  const doc = parseText('And it came to pass. Behold, the man walked. Behold, the man spoke.', { docId: 'v' });
  assert.ok(!figures(doc).has('behold'), 'a KJV clause-opener is not a vocative figure');
});

test('a demonym set off by commas STAYS refused (the demonym denial fires first)', () => {
  const doc = parseText('He was, Russian, to the core. Truly, Russian, he remained.', { docId: 'v' });
  assert.ok(!figures(doc).has('russian'), 'a comma-inset nationality is still not a character');
});

test('a calendar token set off by commas STAYS refused (the calendar denial fires first)', () => {
  const doc = parseText('We reconvene, Monday, at noon. Again, Monday, we gather.', { docId: 'v' });
  assert.ok(!figures(doc).has('monday'), 'a comma-inset weekday is still a date, not a figure');
});

test('the Monk transcript now admits Friedrich, and still no bare "Russian"', () => {
  // The screenshot audit, end to end: the addressed name becomes a figure; the
  // attributive nationality the demonym guard protects does not (it must stay out so
  // the first-person "I" cannot resolve onto it — the fca5f2f9 defect).
  const text = [
    'He asks me, Professor Nietzsche, do you think we are in hell?',
    'Because learning, Friedrich, but of late I have come to another conclusion.',
    'He never rid himself of his insufferable Russian orthodoxy.',
  ].join(' ');
  const doc = parseText(text, { docId: 'monk' });
  const ids = figures(doc);
  assert.ok(ids.has('friedrich'), 'the addressed name admits');
  assert.ok(!ids.has('russian'), 'the attributive demonym still does not');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createConventions } from '../src/core/conventions/index.js';
import { segmentSentences } from '../src/perceiver/parse/sentences.js';
import { headVerb } from '../src/perceiver/parse/relations.js';
import { parseText } from '../src/perceiver/parse/index.js';

// The ledger is the home for the language-specific stuff: speech, abbreviations,
// copulas, modifiers — each seeded (DEF) and learnable (REC).
test('the conventions ledger holds every language register, seeded', () => {
  const c = createConventions();
  assert.ok(c.isAttributionVerb('said') && c.isAttributionVerb('declared'));
  assert.ok(c.isAbbreviation('Mr') && c.isAbbreviation('mrs.'));
  assert.ok(c.isCopula('am') && c.isCopula('is'), 'am is a copula (the eoreader4 gap)');
  assert.ok(c.isModifier('much') && c.isModifier('more') && c.isModifier('quite'));
  assert.ok(!c.isModifier('walked'), 'a content verb is not a modifier');
});

test('a learned convention is a REC; export is the language spec (DEF seed + REC learned)', () => {
  const c = createConventions();
  c.learnAbbreviation('Inst');
  assert.ok(c.isAbbreviation('inst'), 'the document taught a new abbreviation');
  const lines = c.exportJSONL().split('\n').map(s => JSON.parse(s));
  assert.ok(lines.some(l => l.kind === 'abbreviation' && l.token === 'inst' && l.op === 'REC'), 'learned → REC');
  assert.ok(lines.some(l => l.kind === 'copula' && l.token === 'is' && l.op === 'DEF'), 'seed → DEF');
});

// The splitter reads abbreviations from the ledger — no list of its own.
test('the splitter honours abbreviations (no Mr. fragment)', () => {
  const c = createConventions();
  const out = segmentSentences('Mr. Bingley met Mrs. Bennet. He bowed.', { isAbbreviation: c.isAbbreviation });
  assert.deepEqual(out, ['Mr. Bingley met Mrs. Bennet.', 'He bowed.']);
});

// The verb guard, move 1: skip modifiers, route copulas to DEF, reject
// prepositions. (Rejecting an adjective head like "rational" needs a lexicon or
// the recurrence gate — move 3/4 — not this layer, so it is not asserted here.)
test('the verb guard skips modifiers and routes copulas to DEF', () => {
  const c = createConventions();
  const opts = { isCopula: c.isCopula, isModifier: c.isModifier };
  assert.equal(headVerb(' am sure of it', opts).copular, true, 'am → copular (DEF branch), the eoreader4 gap');
  assert.equal(headVerb(' much more rational', opts).verb, 'rational', 'steps over the intensifiers much, more');
  assert.equal(headVerb(' quietly walked off', opts).verb, 'walked', 'steps over the adverb to the real verb');
  assert.equal(headVerb(' by the window', opts), null, 'a preposition is not a head — no bond');
});

// Move 3 — the recurrence gate: a recurrent verb is trusted (full coupling) and
// learned into the ledger; a one-off is held weak, not dropped (recall preserved).
test('the recurrence gate trusts recurrent verbs and holds one-offs weak', () => {
  const doc = parseText('Anna Stone met Bob Vale. Anna Stone met Bob Vale. Anna Stone praised Bob Vale.', { docId: 'r' });
  const edges = doc.log.events.filter(e => e.op === 'CON');
  const met = edges.find(e => e.via === 'met');
  const praised = edges.find(e => e.via === 'praised');
  assert.ok(met && (met.w == null || met.w > 0.5), 'a recurrent verb keeps full coupling');
  assert.ok(praised && praised.w != null && praised.w <= 0.5, 'a one-off verb is held weak, not dropped');
  const rels = doc.conventions.exportJSONL().split('\n').map(s => JSON.parse(s)).filter(l => l.kind === 'relation');
  assert.ok(rels.some(r => r.token === 'met'), 'the recurrent verb is learned into the ledger');
  assert.ok(!rels.some(r => r.token === 'praised'), 'the one-off is not learned');
});

// End to end: a copular/modifier-led clause yields no CON edge.
test('parseText emits no copula/modifier bonds', () => {
  const doc = parseText('Lydia Bennet is here. Lydia Bennet is here. Kitty Bennet much rather Lydia Bennet.', { docId: 'g' });
  const bonds = doc.log.events.filter(e => (e.op === 'CON' || e.op === 'SIG'));
  assert.ok(!bonds.some(e => ['is', 'am', 'much', 'more', 'rather'].includes(e.via)),
    'no bond is headed by a copula or modifier');
});

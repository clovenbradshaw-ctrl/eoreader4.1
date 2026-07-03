import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { think, everyThoughtIsMine, worthSayingAloud, resolveVoids, inquire } from '../src/write/index.js';
import { retrieveLexical } from '../src/retrieve/index.js';
import { READ_BACK } from '../src/core/index.js';

// Thinking = impressionistic talking turned inward. Voice an impression, hear it back,
// let the hearing re-focus, voice again — grounded, firewalled, self-terminating.

const DOC = () => parseText(
  'Gregor saw Grete. Grete trusted the father. The father struck Gregor. Gregor loved Grete.',
  { docId: 'm' },
);

test('a train of thought wanders the graph from a starting focus', () => {
  const t = think(DOC(), { cursor: 'Gregor', genders: { Gregor: 'm', Grete: 'f' }, maxThoughts: 8 });
  assert.ok(t.train.length >= 1, 'it thinks at least one thought');
  assert.equal(t.train[0].focus, 'Gregor', 'the train starts where the cursor was set');
  assert.ok(t.voiced.length > 0, 'the inner monologue has words');
  // the focus migrates — more than one figure is thought from (association along the graph)
  assert.ok(t.focusReached.length >= 2, 'attention moves to figures the utterances reached');
});

test('every thought is mine and cannot witness — the firewall (no rumination → fact)', () => {
  const t = think(DOC(), { cursor: 'Gregor', genders: { Gregor: 'm', Grete: 'f' } });
  assert.equal(everyThoughtIsMine(t.train), true, 'no thought can be witnessed as world');
  for (const th of t.train) {
    assert.equal(th.classified, READ_BACK, 'each thought is read-back-of-prior-self');
    assert.equal(th.canWitness, false, 'a thought never anchors — it only steers attention');
  }
});

test('it is self-terminating — quiesces when no fresh figure is reached, not by the backstop', () => {
  const t = think(DOC(), { cursor: 'Gregor', genders: { Gregor: 'm', Grete: 'f' }, maxThoughts: 64 });
  assert.equal(t.quiesced, true, 'the train stops on its own, before the hard bound');
  assert.ok(t.train.length < 64, 'it does not spin to the backstop');
  // no figure is thought from twice — attention only ever moves to fresh ground
  const lc = t.focusReached.map((f) => String(f).toLowerCase());
  assert.equal(new Set(lc).size, lc.length, 'each figure is a focus at most once');
});

test('thinking is grounded — every voiced proposition is one the graph holds', () => {
  const t = think(DOC(), { cursor: 'Gregor', genders: { Gregor: 'm', Grete: 'f' } });
  const said = t.train.flatMap((th) => th.propositions.map((p) => p.verb));
  // the relations thought are the doc's own verbs; nothing invented
  for (const v of said) assert.match(v, /saw|trusted|struck|loved/, `${v} is a relation the scene holds`);
});

test('the wander surfaces open questions — a figure heard about but never acting is a void', () => {
  // Klamm is reached (Gregor sought Klamm) but never acts — appeared, not characterized.
  const doc = parseText('Gregor saw Grete. Gregor sought Klamm. Grete trusted Gregor.', { docId: 'k' });
  const t = think(doc, { cursor: 'Gregor', genders: { Gregor: 'm', Grete: 'f' } });
  assert.ok(t.voids.some((v) => /klamm/i.test(v.figure)), 'Klamm — heard about, never acts — is an open void');
  assert.ok(t.voids.every((v) => v.band === 'void'), 'each is the open-Resolution void band');
  // a figure that DOES act (Grete trusts) is characterized — not a void
  assert.ok(!t.voids.some((v) => /grete/i.test(v.figure)), 'Grete acts, so she is characterized, not open');
});

test('thinking hands its findings to speaking — the loudest silence becomes a question', () => {
  const doc = parseText('Gregor saw Grete. Gregor sought Klamm. Gregor feared Klamm.', { docId: 'k' });
  const t = think(doc, { cursor: 'Gregor', genders: { Gregor: 'm' } });
  const aloud = worthSayingAloud(t);
  assert.ok(aloud.length >= 1, 'the train surfaces something worth opening your mouth about');
  assert.match(aloud[0].question, /What of/, 'the open void becomes a question to say out loud');
  assert.match(aloud[0].figure, /klamm/i, 'and it is the figure the train kept circling, never resolving');
});

test('only the world closes an open question — a fresh doc that makes the figure act resolves it', () => {
  const t = think(parseText('Gregor sought Klamm. Gregor feared Klamm.', { docId: 'a' }), { cursor: 'Gregor' });
  assert.ok(t.voids.some((v) => /klamm/i.test(v.figure)), 'Klamm is open after the first reading');
  // a new document arrives in which Klamm ACTS — exafference, which can witness (unlike a thought)
  const arrives = parseText('Klamm summoned Gregor.', { docId: 'b' });
  const r = resolveVoids(t, arrives);
  assert.ok(r.closed.some((v) => /klamm/i.test(v.figure)), 'the world characterized Klamm — the question is closed');
  assert.equal(r.resolved, 1);
  // a doc that does NOT touch the open figure leaves it open
  const irrelevant = parseText('Grete left.', { docId: 'c' });
  assert.equal(resolveVoids(t, irrelevant).open, t.voids.length, 'an unrelated doc resolves nothing');
});

test('inquire: the engine reads more of the source to answer its OWN open question', () => {
  // The full source. The seed reading is only the first two sentences — Klamm is sought and
  // feared but, in what has been read, never acts. The rest of the source says what Klamm does.
  const source = parseText(
    'Gregor sought Klamm. Gregor feared Klamm. Klamm summoned Gregor. Klamm ruled the village.',
    { docId: 'src' },
  );
  const seed = parseText('Gregor sought Klamm. Gregor feared Klamm.', { docId: 'seed' });

  const out = inquire(seed, {
    retrieve: (q) => retrieveLexical(source, q, 8),   // embedder-free retrieval over the source
    parse: (text) => parseText(text, { docId: 'reading' }),
    cursor: 'Gregor',
    maxSteps: 4,
  });

  // it asked its own question and read on it
  assert.ok(out.trail.some((s) => /Klamm/i.test(s.asked || '')), 'it asked what it could not resolve');
  assert.ok(out.trail.some((s) => (s.read || 0) > 0), 'and read more of the source to answer it');
  // the grown reading now contains what Klamm does — the question is answered
  assert.match(out.reading, /Klamm summoned|Klamm ruled/, 'the reading grew toward the open figure');
  const closedKlamm = out.trail.some((s) => (s.closed || []).some((f) => /klamm/i.test(f)));
  assert.ok(closedKlamm, 'reading on its own question characterized Klamm — the void closed');
});

test('inquire terminates when the source is silent — it does not spin on an unanswerable question', () => {
  const source = parseText('Gregor sought Klamm. Gregor feared Klamm.', { docId: 'src' });   // Klamm never acts, anywhere
  const seed = parseText('Gregor sought Klamm. Gregor feared Klamm.', { docId: 'seed' });
  const out = inquire(seed, {
    retrieve: (q) => retrieveLexical(source, q, 8),
    parse: (text) => parseText(text, { docId: 'reading' }),
    cursor: 'Gregor', maxSteps: 8,
  });
  assert.ok(out.trail.length <= 8, 'it does not spin to the backstop');
  assert.ok(out.trail.some((s) => s.stuck) || out.trail.some((s) => s.resolved),
    'it stops honestly — either the source had nothing to add, or nothing stayed open');
});

test('a doc with no relations yields no thoughts — nothing to think about', () => {
  const t = think(parseText('Light.', { docId: 'e' }), {});
  assert.equal(t.train.length, 0, 'no scene, no inner speech');
  assert.equal(t.quiesced, true);
});

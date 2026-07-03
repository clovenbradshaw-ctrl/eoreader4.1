import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { parseRelations } from '../src/perceiver/parse/relations.js';
import { serializeEOT } from '../src/perceiver/index.js';
import { answerRelation, answerWho } from '../src/answer/mechanical.js';
import { editWithin, fuzzyMatches, fuzzCeiling } from '../src/perceiver/parse/fuzzy.js';

// A relational "who" is a one-hop graph surf, not a definition lookup. The document
// logs the kinship as a typed CON edge (Gregor -> Grete : sister); the answer is the
// node on the other end. These pin the surf — and that it never mis-binds the phrase
// to the bare name inside it, the confidently-wrong path the old `answerWho` took.

const STORY =
  'Gregor Samsa woke transformed. His sister Grete brought a bowl of milk. ' +
  'Grete opened the window. The father drove Gregor back into the room.';

const apos = String.fromCharCode(39);

test('answerRelation surfs "who is X’s sister" to the graph edge, not X', () => {
  const doc = parseText(STORY, { docId: 'rel' });
  const a = answerRelation(doc, `who is gregor${apos}s sister`);
  assert.ok(a, 'a relational answer is produced');
  assert.equal(a.route, 'who');
  assert.match(a.text, /Grete/, 'the answer is the sister, Grete');
  assert.doesNotMatch(a.text, /salesman|transformed/, 'it is not Gregor’s own predicate');
  assert.ok(a.sources.length > 0 && Number.isInteger(a.sources[0]), 'the witnessing line is cited');
});

test('answerRelation reads the "sister of X" form too', () => {
  const doc = parseText(STORY, { docId: 'rel' });
  const a = answerRelation(doc, 'who is the sister of gregor');
  assert.ok(a && /Grete/.test(a.text), 'of-form resolves to Grete');
});

test('a CONJOINED relational who still surfs to the sister, not the bare name', () => {
  // The audit case: "who is gregor's sister AND what does she do in the story?" used to
  // fail answerRelation's end-anchored regex, fall through to answerWho, and bind the
  // whole phrase to Gregor (it CONTAINS "gregor") — answering with his own predicate.
  // The relation noun may now be followed by a conjoined clause; the surf fires.
  const doc = parseText(STORY, { docId: 'rel' });
  const a = answerRelation(doc, `who is gregor${apos}s sister and what does she do in the story?`);
  assert.ok(a, 'the conjoined question still produces a relational answer');
  assert.match(a.text, /Grete/, 'it surfs to the sister, Grete');
  assert.doesNotMatch(a.text, /transformed|salesman|milk/, 'never Gregor’s own predicate');
  // The of-form takes a trailing clause too, without truncating a multi-word owner.
  const b = answerRelation(doc, 'who is the sister of gregor and what does she do?');
  assert.ok(b && /Grete/.test(b.text), 'of-form + trailing clause resolves to Grete');
});

test('answerWho defers a possessive or run-on phrase instead of mis-binding the name inside it', () => {
  const doc = parseText(STORY, { docId: 'rel' });
  // answerWho is a BARE-NAME lookup. A possessive ("gregor's sister") and a long
  // run-on both merely contain an admitted name; binding the phrase to that name is the
  // confidently-wrong path. Both must defer (null) so the turn surfs or grounds instead.
  assert.equal(answerWho(doc, `who is gregor${apos}s sister and what does she do in the story?`), null);
  assert.equal(answerWho(doc, `who is gregor${apos}s sister`), null, 'a bare possessive is not a name');
});

test('answerRelation honours the gender split — a sister query never returns a brother', () => {
  const doc = parseText(STORY, { docId: 'rel' });
  // The document has only a sister edge; asking for a brother must defer (null),
  // not hand back Grete.
  assert.equal(answerRelation(doc, `who is gregor${apos}s brother`), null);
});

test('answerRelation reads a SYMMETRIC primitive in reverse for a genderless query', () => {
  const doc = parseText(STORY, { docId: 'rel' });
  // The edge is logged Gregor -> Grete : sister; sibling is symmetric, so Grete's
  // sibling is recoverable from the reverse, but only genderless (the noun on the
  // edge describes the owner, not the answer).
  const a = answerRelation(doc, `who is grete${apos}s sibling`);
  assert.ok(a && /Gregor/.test(a.text), 'symmetric reverse finds Gregor');
  // The gendered reverse cannot be verified and must defer.
  assert.equal(answerRelation(doc, `who is grete${apos}s brother`), null);
});

test('answerRelation defers on a non-relational who (let answerWho handle it)', () => {
  const doc = parseText('Gregor Samsa is a travelling salesman. Gregor waited.', { docId: 'rel' });
  assert.equal(answerRelation(doc, 'who is gregor'), null, 'plain who is not intercepted');
  assert.equal(answerRelation(doc, 'who is gregor samsa'), null);
  // And the plain-who path still answers it from the predicate.
  const w = answerWho(doc, 'who is gregor');
  assert.ok(w && /salesman/.test(w.text));
});

test('answerWho answers a clean nominal definition but defers on a copula-state fragment', () => {
  // A predicate nominative ("is a violinist") is a real "who is X" answer.
  const clean = parseText('Grete is a violinist. Grete practised daily. Grete smiled warmly.', { docId: 'wd1' });
  const w = answerWho(clean, 'who is grete');
  assert.ok(w && /violinist/.test(w.text), 'a predicate nominative answers mechanically');

  // But a transient state the copula happened to introduce ("was sleeping", "was
  // talking") is not a definition — answerWho defers (null) so the turn falls through
  // to the grounded, referent-centred reading instead of answering with a state.
  const messy = parseText('Grete entered quietly. Grete was sleeping in the cold. Grete was talking softly.', { docId: 'wd2' });
  assert.equal(answerWho(messy, 'who is grete'), null, 'a state fragment is not a definition — defer to grounded');
});

test('answerRelation defers on an untyped relation (outside the algebra)', () => {
  const doc = parseText(STORY, { docId: 'rel' });
  assert.equal(answerRelation(doc, `who is gregor${apos}s landlord`), null);
});

// ── the fuzzy primitive ────────────────────────────────────────────────────

test('editWithin is bounded and exact within the ceiling', () => {
  assert.equal(editWithin('greta', 'grete', 1), 1, 'one substitution');
  assert.equal(editWithin('zebras', 'apples', 1), 2, 'far apart → past the ceiling (maxDist+1)');
  assert.equal(editWithin('cat', 'cat', 0), 0, 'identical at ceiling 0');
});

test('fuzzCeiling keeps short tokens exact and lets longer ones drift', () => {
  assert.equal(fuzzCeiling(3), 0);
  assert.equal(fuzzCeiling(5), 1);
  assert.equal(fuzzCeiling(9), 2);
});

test('fuzzyMatches rescues an out-of-vocabulary term onto its near neighbour', () => {
  const vocab = new Set(['grete', 'gregor', 'milk', 'window']);
  assert.deepEqual(fuzzyMatches('grete', vocab), [{ token: 'grete', dist: 0 }], 'exact short-circuits');
  const greta = fuzzyMatches('greta', vocab);
  assert.deepEqual(greta, [{ token: 'grete', dist: 1 }], 'greta → grete at distance 1');
  assert.deepEqual(fuzzyMatches('zzzzz', vocab), [], 'nothing near → no phantom match');
});

// Passive voice → typed active edge (the meaning-graph richness for real prose). A copular
// "<patient> was/is [being] <participle> by <AGENT>" used to flatten into a DEF that buried the
// agent; now it emits AGENT -> patient : participle when the agent is an admitted named entity.
test('passive with a named agent becomes a typed edge (created/written/produced by)', () => {
  const doc = parseText('The Metamorphosis was written by Kafka. Gregor was created by Kafka.', { docId: 'pv' });
  const rels = [];
  for (const sent of (doc.sentences || doc.units)) rels.push(...parseRelations(sent, doc.admission, {}, { referents: true }));
  const edges = rels.filter(r => r.op === 'CON').map(r => `${r.src} -> ${r.tgt} : ${r.via}`);
  assert.ok(edges.includes('kafka -> metamorphosis : written'), `expected the written-by edge, got ${JSON.stringify(edges)}`);
  assert.ok(edges.includes('kafka -> gregor : created'), `expected the created-by edge, got ${JSON.stringify(edges)}`);
  // It is a CON relation, not a flat "X: was written by …" DEF.
  assert.ok(!rels.some(r => r.op === 'DEF' && /written by/i.test(r.value || '')), 'no flat copular DEF for the passive');
});

test('a copular non-passive still defines, and a passive with no named agent stays a DEF', () => {
  const doc = parseText('Kafka was a writer. Gregor was transformed by the curse.', { docId: 'pv2' });
  const rels = [];
  for (const sent of (doc.sentences || doc.units)) rels.push(...parseRelations(sent, doc.admission, {}, { referents: true }));
  assert.ok(rels.some(r => r.op === 'DEF' && /a writer/.test(r.value || '')), 'the copula predicate is still a DEF');
  // "the curse" is not an admitted named entity → no spurious CON, stays a DEF.
  assert.ok(!rels.some(r => r.op === 'CON' && r.via === 'transformed'), 'no edge to an unnamed agent');
});

// The PROGRESSIVE auxiliary (was/were + V-ing) is the verb, not a copula. The t2 audit
// shape — "Ryan Coogler was developing a new reboot" — produced no Coogler edge at all,
// because "was" read as a copula and the participle was never reached; the graph reached
// the realizer Coogler-less and it answered "Carter" off the bare "per series creator
// Chris Carter" attribution. The progressive now hands the participle through as the head.
test('a progressive "was developing" yields the active verb edge, not a copula DEF', () => {
  const doc = parseText('Ryan Coogler was developing a new reboot.', { docId: 'prog' });
  const rels = [];
  for (const sent of (doc.sentences || doc.units)) rels.push(...parseRelations(sent, doc.admission, {}, { referents: true }));
  const edges = rels.filter(r => r.op === 'CON').map(r => `${r.src} -> ${r.tgt} : ${r.via}`);   // EOT LINK shape
  assert.ok(edges.includes('ryan-coogler -> reboot : developing'), `expected the progressive edge, got ${JSON.stringify(edges)}`);

  // The copula DEF path is untouched: a determiner after the copula is NOT a progressive
  // ("is a violinist"), and a bare copula stays a DEF, never a CON verb.
  const d = parseText('Grete is a violinist.', { docId: 'cop' });
  const drels = [];
  for (const sent of (d.sentences || d.units)) drels.push(...parseRelations(sent, d.admission, {}, { referents: true }));
  assert.ok(drels.some(r => r.op === 'DEF'), 'the copula predicate is still a DEF');
  assert.ok(!drels.some(r => r.op === 'CON' && r.via === 'is'), 'a copula does not become a CON verb');
});

// ATTRIBUTION — "per X" / "according to X" names the SOURCE a claim is reported from, not
// a participant in it. The t2 audit's "…Ryan Coogler was developing a new reboot, per series
// creator Chris Carter" answered "Carter is making it" two ways: Carter was grabbed as the
// PATIENT of "developing" (a named object outranks the NP head), and otherwise floated free
// for the realizer to seize. Now the object scope stops at the opener (so the NP head
// "reboot" wins the agent edge) and Carter is recorded as a SIG attribution source.
test('"per X" attribution: the source is a SIG, the agent edge keeps the real object', () => {
  const doc = parseText('Ryan Coogler was developing a new reboot, per series creator Chris Carter.', { docId: 'attr' });
  const rels = [];
  for (const sent of (doc.sentences || doc.units)) rels.push(...parseRelations(sent, doc.admission, {}, { referents: true }));

  const con = rels.filter(r => r.op === 'CON').map(r => `${r.src} -> ${r.tgt} : ${r.via}`);
  assert.ok(con.includes('ryan-coogler -> reboot : developing'), `agent edge keeps the NP object, got ${JSON.stringify(con)}`);
  assert.ok(!rels.some(r => r.op === 'CON' && r.tgt === 'chris-carter'), 'the attribution source is never a patient');

  const sig = rels.find(r => r.op === 'SIG' && r.src === 'chris-carter');
  assert.ok(sig, 'the attribution source is recorded as a SIG');
  assert.equal(sig.via, 'per');

  // Guard: a distributive "per" with no named source never fires.
  const g = parseText('The show lost ten per cent of its viewers.', { docId: 'pc' });
  const grels = [];
  for (const sent of (g.sentences || g.units)) grels.push(...parseRelations(sent, g.admission, {}, { referents: true }));
  assert.ok(!grels.some(r => r.op === 'SIG' && /^(per|according-to|as-per)$/.test(r.via || '')), 'no attribution without a named source');
});

// EOT serialization of the meaning graph (docs/eot-surface-syntax.md): relations render as
// LINK triples (A -> B : rel) and predicates as IS-A (A : value) — the notes fed to the model.
test('serializeEOT renders the graph as EOT triples (LINK + IS-A), negation preserved', () => {
  const structure = {
    relations: [
      { src: { id: 'coogler', label: 'Ryan Coogler' }, tgt: { id: 'room', label: 'room' }, via: 'leads', polarity: '+' },
      { src: { id: 'g', label: 'Gregor' }, tgt: { id: 'w', label: 'words' }, via: 'understand', polarity: '−' },
    ],
    defs: [{ id: 'cc', label: 'Chris Carter', value: 'an executive producer' }],
  };
  assert.deepEqual(serializeEOT(structure), [
    'Ryan Coogler -> room : leads',
    'Gregor -> words : not-understand',
    'Chris Carter : an executive producer',
  ]);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseText, positionElements, argumentSpansHold, SVO_EXTRACTOR,
} from '../src/perceiver/parse/index.js';
import { projectGraph, propositionOfEdge } from '../src/core/index.js';

const argspans = (doc) => doc.log.filter(e => e.op === 'SEG' && e.kind === 'argspan');
const cons     = (doc) => doc.log.filter(e => e.op === 'CON');

// §3, §8 — argument-span extraction emits a logged clause SEG BEFORE the bond.
test('the SVO parse logs an argument-span SEG before the CON', () => {
  const doc = parseText('Grete Vale greeted Gregor Pike.', { docId: 'p' });
  const seg = argspans(doc);
  assert.equal(seg.length, 1, 'one argument-span SEG for the one bond');
  const con = cons(doc).find(c => c.src === 'grete-vale' && c.tgt === 'gregor-pike');
  assert.ok(con, 'the bond still fires');
  assert.equal(con.via, 'greeted');
  assert.equal(con.seq, seg[0].seq + 1, 'the SEG is written before the bond');
  assert.equal(con.argspan, seg[0].seq, 'the bond references the SEG it was read from');
});

// §3 — the argument-span SEG is a perception: witnessed by the extractor, with confidence.
test('the argument-span SEG is a perception — reader and confidence, not a fact', () => {
  const doc = parseText('Grete Vale greeted Gregor Pike.', { docId: 'p' });
  const seg = argspans(doc)[0];
  assert.equal(seg.kind, 'argspan');
  assert.equal(seg.reader, SVO_EXTRACTOR, 'witnessed by the extractor that produced it');
  assert.ok(typeof seg.confidence === 'number' && seg.confidence > 0, 'carries the extractor confidence');
  assert.equal(seg.depicts, 'CON', 'records the bond it feeds');
});

// §3, §8 — the spans walk back to the verbatim text by offset (the witness chain).
test('the argument spans walk back to the verbatim text by offset', () => {
  const doc = parseText('Grete Vale greeted Gregor Pike.', { docId: 'p' });
  const seg = argspans(doc)[0];
  const sentence = doc.sentences[seg.sentIdx];
  assert.equal(sentence.slice(seg.subject.start, seg.subject.end), 'Grete Vale');
  assert.equal(sentence.slice(seg.verb.start, seg.verb.end), 'greeted');
  assert.equal(sentence.slice(seg.object.start, seg.object.end), 'Gregor Pike');
  assert.ok(argumentSpansHold(seg, sentence), 'every span slices to its stored text');
  // Tamper with an offset and the chain no longer holds.
  assert.ok(!argumentSpansHold({ ...seg, subject: { ...seg.subject, end: seg.subject.end + 3 } }, sentence));
});

// §1, §8 — the two senses of span are distinct: an argument span is sub-clause.
test('an argument span is a sub-clause stretch, not the whole sentence', () => {
  const doc = parseText('Grete Vale greeted Gregor Pike.', { docId: 'p' });
  const seg = argspans(doc)[0];
  const len = doc.sentences[seg.sentIdx].length;
  assert.ok(seg.object.start > 0 && seg.object.end <= len, 'the object span is interior to the sentence');
  assert.ok(seg.subject.end < seg.object.start, 'subject and object are disjoint stretches');
  assert.ok(seg.object.end - seg.object.start < len, 'the argument span is shorter than the retrieval unit');
});

// §4 Step C, §5, §8 — positioning is the information-structure role reading; the
// operator-grain cells are a separate axis, held at no-commit.
test('positionElements maps subject→Ground, object→Figure, verb→Pattern', () => {
  const doc = parseText('Grete Vale greeted Gregor Pike.', { docId: 'p' });
  const seg = argspans(doc)[0];
  const p = positionElements(seg);
  assert.equal(p.assigned_by, 'information-structure', 'role under given/new/relation, not measurement');
  assert.deepEqual(p.ground.elements.map(e => e.id), ['grete-vale'], 'the subject is the given (Ground)');
  assert.deepEqual(p.figure.elements.map(e => e.id), ['gregor-pike'],
    'the object is the new, picked out and tested (Figure)');
  assert.equal(p.pattern.elements[0].text, 'greeted', 'the verb is the relation that binds them (Pattern)');
  // The lane: every cell is held at no-commit — geometry names them only when live.
  for (const pos of [p.ground, p.figure, p.pattern]) {
    assert.equal(pos.cell, null, 'cell-naming is meaning-only — no-commit under the hash organ');
  }
});

// §8 — speech routes to SIG and still logs its argument spans.
test('a speech verb logs an argument-span SEG depicting SIG', () => {
  const doc = parseText('Grete Vale told Gregor Pike.', { docId: 'p' });
  const seg = argspans(doc)[0];
  assert.ok(seg, 'speech still cuts argument spans');
  assert.equal(seg.depicts, 'SIG', 'the bond it feeds is an attribution');
  assert.equal(seg.verb.text, 'told');
});

// §2 (scope) — a copular DEF is node-shaped, not S-V-O; it logs no argument-span SEG.
test('a copular DEF is not an SVO bond and logs no argument-span SEG', () => {
  const doc = parseText('Grete Vale is here. Grete Vale is here.', { docId: 'p' });
  assert.ok(doc.log.filter(e => e.op === 'DEF' && e.key === 'predicate').length >= 1, 'the DEF fires');
  assert.equal(argspans(doc).length, 0, 'no argument-span SEG for a node-shaped assertion');
});

// §8 — the logged SEG is inert to the projection: it adds no edge and retracts nothing.
test('the argument-span SEG does not perturb the graph projection', () => {
  const doc = parseText('Grete Vale greeted Gregor Pike.', { docId: 'p' });
  const g = projectGraph(doc.log, {});
  assert.equal(g.edges.length, 1, 'one bond, the SEG adds no edge');
  assert.ok(g.entities.has('grete-vale') && g.entities.has('gregor-pike'),
    'both endpoints survive — the SEG retracts nothing');
});

// Negation must survive the edge → proposition bridge under every sign the engine
// carries it: the parser writes U+2212 '−' (relations.js), other paths write ASCII
// '-' or the word 'negative'. Dropping any of them flips a negated claim positive —
// "Google won't launch ChatGPT" read as "Google launch ChatGPT".
test('propositionOfEdge normalizes every negative polarity sign to "-"', () => {
  for (const sign of ['−', '-', 'negative']) {
    const p = propositionOfEdge({ src: 'google', via: 'launch', tgt: 'chatgpt', polarity: sign });
    assert.equal(p.polarity, '-', `polarity ${JSON.stringify(sign)} reads as negated`);
  }
  // Absent / affirmative stays positive — the realis default.
  assert.equal(propositionOfEdge({ src: 'a', via: 'r', tgt: 'b' }).polarity, '+');
  assert.equal(propositionOfEdge({ src: 'a', via: 'r', tgt: 'b', polarity: '+' }).polarity, '+');
});

// The headVerb offset extension stays backward-compatible for its other consumer.
test('headVerb still reports verb/rest/copular and now the offsets too', async () => {
  const { headVerb } = await import('../src/perceiver/parse/relations.js');
  const h = headVerb(' greeted Gregor Pike.');
  assert.equal(h.verb, 'greeted');
  assert.equal(h.copular, false);
  assert.equal(' greeted Gregor Pike.'.slice(h.at, h.restStart), 'greeted', 'at/restStart frame the verb');
});

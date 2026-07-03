import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { parseRelations, CONFIDENCE } from '../src/perceiver/parse/relations.js';
import { createEntityAdmission } from '../src/perceiver/parse/entities.js';
import { projectGraph } from '../src/core/index.js';

// The Total Read (§1–§9). Every apprehended proposition becomes a graded edge: the
// reader widens which RELATIONS it reads (clause trees, not just main clauses) and
// carries a confidence on each, while NEVER widening which ENTITIES it conjures. The
// read is gated (`totalRead`) so the simple SVO path is byte-identical (§9 parity); on,
// it only ever ADDS propositions, each graded by how surely it was apprehended.

const edges = (doc) => doc.log.filter(e => e.op === 'CON' || e.op === 'SIG');
const defs  = (doc) => doc.log.filter(e => e.op === 'DEF' && e.key === 'predicate');
const triple = (e) => `${e.src ?? e.id}|${e.via ?? 'is'}|${e.tgt ?? e.value}`;

// ── §9 golden parity on the simple path ─────────────────────────────────────
test('a simple SVO passage parses to the SAME edges with the total read on (§9)', () => {
  const text = 'Grete Vale greeted Gregor Pike. Alice met Bob.';
  const off = parseText(text, { docId: 's' });
  const on  = parseText(text, { docId: 's', totalRead: true });
  // The bonds (src · via · tgt) are identical — the total read adds a number, it never
  // changes the proposition the simple scan already read correctly.
  assert.deepEqual(edges(on).map(triple), edges(off).map(triple));
  assert.equal(edges(on).length, edges(off).length, 'no extra edge on a clause with no sub-clause');
  // and OFF, no edge carries a confidence (byte-identical default shape).
  assert.ok(edges(off).every(e => e.confidence === undefined), 'default scan stamps no confidence');
});

// ── §4 confidence is carried, never dropped ─────────────────────────────────
test('every edge carries a confidence under the total read (§4)', () => {
  const doc = parseText('Grete Vale greeted Gregor Pike. Gregor Pike crawled over the wall.',
    { docId: 'c', totalRead: true });
  for (const e of [...edges(doc), ...defs(doc)])
    assert.ok(typeof e.confidence === 'number' && e.confidence > 0 && e.confidence <= 1,
      `edge ${triple(e)} carries a confidence in (0,1], got ${e.confidence}`);
});

test('confidence is honest — a clean SVO reads near-1, a nominalized relation never does (§9)', () => {
  const clean = parseText('Grete Vale greeted Gregor Pike.', { docId: 'h', totalRead: true });
  const svo = edges(clean).find(e => e.via === 'greeted');
  assert.ok(svo.confidence >= 0.9, `a clean SVO main clause reads near-1, got ${svo.confidence}`);

  const nom = parseText('Animals suffer. The captivity of intelligent animals is wrong.',
    { docId: 'h2', totalRead: true });
  const of = edges(nom).find(e => e.via === 'of');
  assert.ok(of, 'the nominalized relation is read');
  assert.ok(of.confidence < 0.6, `a relation buried in a noun phrase never reads near-1, got ${of.confidence}`);
  assert.ok(of.confidence < svo.confidence, 'the hard construction reads lower than the clean one');
});

// ── §2 every clause and sub-clause is a proposition site ─────────────────────
test('coordinated predicates are read as separate propositions, all conjuncts (§2)', () => {
  // "intelligent, social, and emotional" is THREE predicates, not one — including the
  // oxford-comma conjunct the clause splitter shears onto its own clause.
  const doc = parseText('Dolphins are clever. Dolphins are intelligent, social, and emotional.',
    { docId: 'cp', totalRead: true });
  const vals = defs(doc).filter(d => d.id === 'dolphins').map(d => d.value);
  for (const v of ['intelligent', 'social', 'emotional'])
    assert.ok(vals.includes(v), `the conjunct "${v}" is its own proposition (got ${JSON.stringify(vals)})`);
});

test('a relative clause binds its antecedent and reads as a full proposition (§2)', () => {
  // "…, who greeted Grete Vale, …" — the one greeting is Gregor (the antecedent the
  // splitter dropped), not the running narrator. Off the total read this fails to silence.
  const text = 'Gregor Samsa woke. Grete Vale arrived. Gregor Samsa, who greeted Grete Vale, smiled.';
  const off = parseText(text, { docId: 'rc' });
  const on  = parseText(text, { docId: 'rc', totalRead: true });
  assert.ok(!edges(off).some(e => e.via === 'greeted'), 'the relative clause is silent without the total read');
  const rel = edges(on).find(e => e.via === 'greeted');
  assert.ok(rel, 'the relative clause now fires');
  assert.equal(rel.src, 'gregor-samsa', 'bound to the antecedent, not the narrator');
  assert.equal(rel.tgt, 'grete-vale');
  assert.ok(rel.confidence < 0.7, 'a relative-clause read carries its own lower number');
});

test('general apposition is read as an is-a DEF (§2)', () => {
  const doc = parseText('Gregor Samsa woke early. Gregor Samsa, a travelling salesman, slept.',
    { docId: 'ap', totalRead: true });
  const d = defs(doc).find(e => e.id === 'gregor-samsa' && /travelling salesman/.test(e.value));
  assert.ok(d, 'the apposition renames Gregor as a salesman');
  assert.ok(Math.abs(d.confidence - CONFIDENCE.apposition) < 1e-9, 'graded by the apposition prior');
});

// ── §3 inter-proposition links are first-class edges ────────────────────────
test('a subordinator becomes a typed edge between reified propositions (§3)', () => {
  // "Gregor fled the room when Grete entered the kitchen" — a sequence link between two
  // propositions, an object-to-object bond, not just two spokes off a topic.
  const doc = parseText('Gregor Samsa woke. Grete Vale waited. Gregor Samsa fled the room when Grete Vale entered the kitchen.',
    { docId: 'ip', totalRead: true });
  const link = edges(doc).find(e => e.linkKind === 'inter-proposition');
  assert.ok(link, 'the subordinator produced an inter-proposition edge');
  assert.equal(link.via, 'sequence', 'typed by the subordinator (when → sequence)');
  assert.equal(link.connective, 'when');
  assert.equal(link.srcKind, 'prop');
  assert.equal(link.tgtKind, 'prop');
  // both endpoints are reified PROPOSITIONS, not figures — the object-to-object bond §3 adds.
  assert.match(link.src, /^prop:/);
  assert.match(link.tgt, /^prop:/);
});

// ── §5 distinct figures stay distinct ───────────────────────────────────────
test('each clause resolves its own subject — figures are not collapsed onto one (§5)', () => {
  const doc = parseText('Gregor Samsa woke. Gregor Samsa crawled over the wall, and Grete Samsa opened the door.',
    { docId: 'fg', totalRead: true });
  const srcs = new Set(edges(doc).filter(e => e.srcKind !== 'prop').map(e => e.src));
  assert.ok(srcs.has('gregor-samsa') && srcs.has('grete-samsa'), 'both figures own their own propositions');
  // and no cross-clause false bond chaining Grete onto Gregor's verb.
  assert.ok(!edges(doc).some(e => e.src === 'gregor-samsa' && e.tgt === 'grete-samsa'),
    'no collapsed cross-clause bond');
});

// ── §6 the reader apprehends; it does not invent a node ─────────────────────
test('no invented node — every endpoint is admitted, an NP referent, or a reified proposition (§1, §6)', () => {
  const doc = parseText(
    'Gregor Samsa woke. Grete Vale arrived. Gregor Samsa crawled over the wall when Grete Vale entered the kitchen, ' +
    'and the captivity of intelligent animals is wrong.',
    { docId: 'inv', totalRead: true });
  const g = projectGraph(doc.log);
  const figures = new Set(g.entities.keys());
  const ok = (id, kind) => kind === 'np' || kind === 'prop' || figures.has(id);
  for (const e of edges(doc)) {
    assert.ok(ok(e.src, e.srcKind), `src ${e.src} traces to a figure / np / prop`);
    assert.ok(ok(e.tgt, e.tgtKind), `tgt ${e.tgt} traces to a figure / np / prop`);
  }
  // the never-invent rule: the NP referent never enters the FIGURE set.
  assert.ok(!figures.has('wall') && !figures.has('animals'), 'an NP referent is not promoted to a figure');
});

// ── §7 the read is idempotent and ordered ───────────────────────────────────
test('two reads of the same text under the same ledger produce identical edge sets (§7)', () => {
  const text = 'Gregor Samsa fled the room when Grete Vale entered. The captivity of animals is wrong.';
  const a = parseText(text, { docId: 'id', totalRead: true });
  const b = parseText(text, { docId: 'id', totalRead: true });
  const shape = (doc) => [...edges(doc), ...defs(doc)].map(e =>
    `${e.op}|${triple(e)}|${e.confidence}|${e.linkKind || ''}`);
  assert.deepEqual(shape(a), shape(b), 'the total read is a pure function of the text and the conventions');
});

// ── the never-invent rule holds in the talker-claim veto path too ───────────
test('parseRelations grades edges only when asked; the veto path is untouched', () => {
  const a = createEntityAdmission();
  a.observe('Grete Vale greeted Gregor Pike.', 0);
  // no totalRead opt (the veto's call shape) → no confidence, byte-identical.
  const veto = parseRelations('Grete Vale greeted Gregor Pike.', a, {}, { referents: true });
  assert.ok(veto.every(r => r.confidence === undefined), 'the veto path stays unnumbered');
  // with the opt, the same bond carries its number.
  const total = parseRelations('Grete Vale greeted Gregor Pike.', a, {}, { referents: true, totalRead: true });
  assert.ok(total.find(r => r.via === 'greeted').confidence >= 0.9);
});

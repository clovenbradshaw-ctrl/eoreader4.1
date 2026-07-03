import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseText, segmentClauses, argumentSpansHold,
} from '../src/perceiver/parse/index.js';
import { parseRelations } from '../src/perceiver/parse/relations.js';
import { createEntityAdmission } from '../src/perceiver/parse/entities.js';
import { createConventions } from '../src/core/conventions/index.js';
import { projectGraph } from '../src/core/index.js';

const cons = (doc) => doc.log.filter(e => e.op === 'CON');
const sigs = (doc) => doc.log.filter(e => e.op === 'SIG');
const argspans = (doc) => doc.log.filter(e => e.op === 'SEG' && e.kind === 'argspan');

// Admit a multi-word name (admitted on first sighting) so parseRelations can be
// driven directly, the way correspond.js drives it.
const admit = (sentence) => {
  const a = createEntityAdmission();
  a.observe(sentence, 0);
  return a;
};

// ---------------------------------------------------------------------------
// Move 1 — clause segmentation (the §8 carve-limit fix).

test('segmentClauses cuts on a coordinator and a subordinator, offsets exact', () => {
  const s = 'Gregor woke, and Grete slept.';
  const cl = segmentClauses(s);
  // Whitespace and the connective are trimmed; sentence punctuation stays on the clause.
  assert.deepEqual(cl.map(c => c.text), ['Gregor woke', 'Grete slept.']);
  // Every clause is an exact substring of the sentence at its offset — the witness
  // chain the argument-span SEG depends on.
  for (const c of cl) assert.equal(s.slice(c.offset, c.offset + c.text.length), c.text);

  const w = segmentClauses('Gregor crawled while Grete waited.');
  assert.deepEqual(w.map(c => c.text), ['Gregor crawled', 'Grete waited.']);
});

test('a single-clause sentence is one span at offset 0 (byte-identical to the old scan)', () => {
  const cl = segmentClauses('Grete Vale greeted Gregor Pike.');
  assert.equal(cl.length, 1);
  assert.equal(cl[0].offset, 0);
  assert.equal(cl[0].text, 'Grete Vale greeted Gregor Pike.');
});

test('a phrasal verb is never split — "looks after" stays one clause', () => {
  // The regression that ', after ' as a boundary would have caused: shearing the
  // object off its verb. The high-precision boundary set excludes preposition-like
  // markers, so "looks after the cat" is one clause.
  assert.equal(segmentClauses('Grete looks after the cat.').length, 1);
  assert.equal(segmentClauses('Gregor waited until noon.').length, 1);
});

test('a mid-sentence subject now bonds — the carve limit is lifted', () => {
  // Before: only the sentence-head subject (Gregor) reached the field; Grete in the
  // second clause never did, so her bond never fired. Now each clause head resolves.
  const doc = parseText(
    'Gregor Samsa woke. Gregor Samsa crawled, and Grete Samsa opened the door.',
    { docId: 'carve' });
  const greteBond = cons(doc).find(e => e.src === 'grete-samsa');
  assert.ok(greteBond, 'the second-clause subject Grete produced a bond');
  assert.equal(greteBond.via, 'opened');
  assert.equal(greteBond.tgt, 'door');
});

test('a lowercase clause-head pronoun resolves — Move 1\'s two halves, wired', () => {
  // Clause splitting yields lowercase-initial clauses ("…, and he opened…"); the
  // capitalised-only pronoun match dropped every one, so the split produced clauses
  // its own resolver could not read. Case-insensitive now: the split-off "he"
  // resolves through the prior field to the protagonist and bonds.
  const doc = parseText(
    'Gregor Samsa woke. Gregor Samsa crawled, and he opened the door.',
    { docId: 'lowercase-pron' });
  const bond = cons(doc).find(e => e.via === 'opened' && e.tgt === 'door');
  assert.ok(bond, 'the lowercase second-clause pronoun "he" now resolves and bonds');
  assert.equal(bond.src, 'gregor-samsa', 'it resolves through the coref field to Gregor');
});

// ---------------------------------------------------------------------------
// Move 2 — the NP referent object slot.

test('the spot-check: "Gregor crawled over the wall" → gregor -> wall(np) : motion(crawled)', () => {
  const doc = parseText(
    'Gregor Samsa crawled over the wall. Gregor Samsa crawled over the wall.',
    { docId: 'spot' });
  const e = cons(doc).find(c => c.src === 'gregor-samsa' && c.tgt === 'wall');
  assert.ok(e, 'the proposition that produced NOTHING before now fires');
  assert.equal(e.via, 'crawled');
  assert.equal(e.tgtKind, 'np', 'the wall is a referent node, not a figure');
  assert.equal(e.relType, 'motion', 'the predicate is typed');
  // The wall is NOT promoted to a figure — admission stays the gate.
  const g = projectGraph(doc.log);
  assert.ok(!g.entities.has('wall'), 'the NP referent never enters the figure set');
  assert.ok(g.edges.some(x => x.from === 'gregor-samsa' && x.to === 'wall'),
    'but it IS an endpoint that fills the graph');
});

test('the NP referent rides the recurrence gate — recurrent full, once-seen weak, never dropped', () => {
  const doc = parseText(
    'Gregor Samsa crawled over the wall. Gregor Samsa crawled over the wall. ' +
    'Gregor Samsa entered the cellar.',
    { docId: 'rec' });
  const wall   = cons(doc).find(c => c.tgt === 'wall');     // wall ×2, crawled ×2
  const cellar = cons(doc).find(c => c.tgt === 'cellar');   // cellar ×1, entered ×1
  assert.ok(wall && (wall.w == null), 'a recurrent referent keeps full coupling');
  assert.ok(cellar && cellar.w != null && cellar.w < 1,
    'a once-seen referent is held weak, not dropped (recall preserved)');
});

test('a named patient is never shadowed by an incidental noun', () => {
  // "greeted Gregor Pike" has a figure object; the NP slot stays silent so the
  // graph carries the figure bond, not a spurious common-noun one.
  const doc = parseText('Grete Vale greeted Gregor Pike. Grete Vale greeted Gregor Pike.',
    { docId: 'fig' });
  const e = cons(doc).find(c => c.src === 'grete-vale');
  assert.equal(e.tgt, 'gregor-pike');
  assert.ok(!e.tgtKind, 'the figure object carries no np tag');
  assert.equal(cons(doc).filter(c => c.tgtKind === 'np').length, 0, 'no np edge competes');
});

test('the NP slot is gated to the page — the talker-claim veto stays figure-only', () => {
  const a = admit('Gregor Samsa crawled over the wall.');
  // No `referents` opt (how correspond.js calls it): a common-noun object yields no
  // resolved edge, so the veto holds it as an unresolved endpoint, as before.
  const veto = parseRelations('Gregor Samsa crawled over the wall.', a, {}, {});
  assert.equal(veto.filter(r => r.op === 'CON').length, 0, 'figure-only: no np edge');
  // With the opt (how the pipeline calls it) the referent endpoint appears.
  const page = parseRelations('Gregor Samsa crawled over the wall.', a, {}, { referents: true });
  const np = page.find(r => r.op === 'CON' && r.tgt === 'wall');
  assert.ok(np && np.tgtKind === 'np', 'the page gets the referent proposition');
});

// ---------------------------------------------------------------------------
// Move 3 — relation typing (additive: a type beside the verb, never a drop).

test('relationType maps the closed vocab and defers (null) outside it', () => {
  const c = createConventions();
  assert.equal(c.relationType('crawled'), 'motion');
  assert.equal(c.relationType('saw'), 'perception');
  assert.equal(c.relationType('held'), 'possession');
  assert.equal(c.relationType('said'), 'speech');     // the attribution register
  assert.equal(c.relationType('sister'), 'kinship');
  assert.equal(c.relationType('greeted'), 'communication');
  assert.equal(c.relationType('praised'), null);      // a real verb, honestly untyped
  assert.equal(c.relationType('probably'), null);
});

test('the edge carries the type beside the verb, and an untyped verb still projects', () => {
  const doc = parseText(
    'Anna Stone told Bob Vale. Anna Stone told Bob Vale. Anna Stone praised Bob Vale.',
    { docId: 'type' });
  const told = sigs(doc).find(e => e.via === 'told');
  assert.equal(told.relType, 'speech', 'a typed predicate is stamped');
  const praised = cons(doc).find(e => e.via === 'praised');
  assert.ok(praised, 'an untyped verb is NOT dropped — typing is additive');
  assert.equal(praised.relType, undefined, 'it simply carries no type');
});

// ---------------------------------------------------------------------------
// The whole pipeline: density without losing the witness chain or the notes contract.

test('a multi-clause, object-rich passage fills the graph where the old scan was barren', () => {
  const doc = parseText(
    'Gregor Samsa woke. ' +
    'Gregor Samsa crawled over the wall, and Grete Samsa opened the door. ' +
    'Gregor Samsa crawled over the wall. ' +
    'Grete Samsa shut the window.',
    { docId: 'dense' });
  const g = projectGraph(doc.log);
  // wall(×2) + door + window = four propositions, none of which the name-to-name
  // rule on the sentence head could ever have reached.
  assert.ok(g.edges.length >= 4, `the graph fills in (got ${g.edges.length})`);
  // and the false bond the old sentence-level scan made — Gregor "crawled" all the
  // way to "Grete Samsa" sitting in the second clause — is gone.
  assert.ok(!g.edges.some(e => e.from === 'gregor-samsa' && e.to === 'grete-samsa'),
    'no cross-clause false bond');
});

test('an NP bond in a non-initial clause still walks back to the verbatim text (§3)', () => {
  const doc = parseText(
    'Gregor Samsa crawled, and Grete Samsa opened the door.', { docId: 'walk' });
  const seg = argspans(doc).find(s => s.object && s.object.text === 'door');
  assert.ok(seg, 'the second-clause NP bond logged an argument-span SEG');
  const sentence = doc.sentences[seg.sentIdx];
  assert.equal(sentence.slice(seg.subject.start, seg.subject.end), 'Grete Samsa');
  assert.equal(sentence.slice(seg.object.start, seg.object.end), 'door');
  assert.ok(argumentSpansHold(seg, sentence), 'every span slices to its stored text');
});

test('the arrows stay plain language — an NP referent reads as its lemma, no codes', () => {
  // The read layer renders an NP endpoint by its lemma (label || id), so the notes
  // contract (A -> B : rel, no operator codes, no [sN]) holds with referents present.
  const doc = parseText(
    'Gregor Samsa crawled over the wall. Gregor Samsa crawled over the wall.',
    { docId: 'arrow' });
  const g = projectGraph(doc.log);
  const e = g.edges.find(x => x.to === 'wall');
  assert.equal(e.via, 'crawled', 'the arrow label is the plain verb, not the type');
});

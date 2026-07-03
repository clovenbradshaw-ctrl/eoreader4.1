import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { createCorefField } from '../src/perceiver/parse/coref.js';
import { readingAt, structureSurface, figureSurface, namedReferents, consciousness, siteRoles, predictNext } from '../src/perceiver/index.js';
import { foldNote } from '../src/fold/index.js';

test('coref field is a normalised distribution, strongest first', () => {
  const f = createCorefField();
  f.note('a', 0); f.note('a', 1); f.note('b', 1);
  const fld = f.field(2);
  assert.equal(fld[0].id, 'a');                       // more mass → ranked first
  const sum = fld.reduce((s, c) => s + c.w, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, 'weights sum to 1');
});

const STORY = 'Grete Vale entered. Grete sat. Grete read. Gregor Pike arrived. Gregor coughed. Gregor waited.';

test('significance: the opening cannot be surprising (no prior)', () => {
  const doc = parseText(STORY, { docId: 'r' });
  assert.equal(readingAt(doc, 0).surprise, 0);
});

test('significance: a new figure raises surprisal, tagged INS', () => {
  const doc = parseText(STORY, { docId: 'r' });
  const r = readingAt(doc, 3); // "Gregor Pike arrived"
  assert.ok(r.surprise > 0, 'an unexpected figure is surprising');
  assert.ok(r.surprisalBits > 0);
  assert.ok(r.surprises.some(s => s.op === 'INS'));
  assert.ok(r.predicted.figures.includes('Grete Vale'), 'predicted from prior mass');
});

test('structure surface reports the figures a window turns on', () => {
  const doc = parseText(STORY, { docId: 'r' });
  const s = structureSurface(doc, [3, 4, 5]);
  assert.ok(s.figures.some(f => f.id === 'gregor-pike'));
});

// A referent is an identity (the projection root), not a name; a message that
// NAMES it resolves to that identity, with aliases collapsed onto it.
const TWOFIG = 'Alice met Carol. Alice met Carol. Alice trusted Carol. Bob feared Dave. Bob feared Dave. Bob chased Dave.';

test('namedReferents resolves a named figure to its referent identity (aliases collapsed)', () => {
  const doc = parseText('Gregor Samsa woke. Gregor Samsa worked hard. Gregor left home.', { docId: 'n' });
  assert.deepEqual(namedReferents(doc, 'Gregor'), ['gregor-samsa']);   // the alias folds to the identity
  assert.deepEqual(namedReferents(doc, 'what happened next'), []);     // names no admitted figure → nothing
});

test('figureSurface centres on the named referent — its bonds, not a neighbour’s', () => {
  const doc = parseText(TWOFIG, { docId: 'f' });
  const s = figureSurface(doc, ['alice']);
  assert.ok(s.relations.length > 0, 'the referent has bonds');
  for (const r of s.relations)                                         // every bond touches Alice
    assert.ok(r.src.id === 'alice' || r.tgt.id === 'alice', `off-centre bond: ${r.src.id} ${r.via} ${r.tgt.id}`);
  assert.ok(!s.relations.some(r => r.src.id === 'bob' || r.tgt.id === 'bob'),
    'a disjoint figure’s bonds are excluded');
  assert.equal(s.figures[0].id, 'alice', 'the focus referent leads the figures');
  assert.equal(s.figures[0].label, 'Alice', 'with its canonical display name');
});

test('consciousness turns the structured reading onto a named referent (focus), else the window', () => {
  const doc = parseText(TWOFIG, { docId: 'c3' });
  const spans = [0, 1, 2, 3, 4, 5].map(idx => ({ idx, text: doc.sentences[idx], score: 1 }));
  // Focus on Alice → every structured bond touches Alice, even though the window spans Bob.
  const focused = consciousness(doc, spans, null, ['alice']);
  assert.ok(focused.levels.structure.relations.length > 0);
  for (const r of focused.levels.structure.relations)
    assert.ok(r.src.id === 'alice' || r.tgt.id === 'alice', 'focus structure is referent-centred');
  assert.doesNotMatch(focused.text, /Bob/, 'a neighbour the message did not name stays out of the notes');
  // No focus → the window structure, which here genuinely turns on Bob too.
  const windowed = consciousness(doc, spans, null, []);
  assert.ok(windowed.levels.structure.relations.some(r => r.src.id === 'bob' || r.tgt.id === 'bob'),
    'with no named referent the reading is the window — Bob included');
});

test('the consciousness folds three levels into the EOT lines, indices held off the talker', () => {
  const doc = parseText('Alice met Bob. Alice met Bob. Alice trusted Bob.', { docId: 'c' });
  const spans = [0, 1, 2].map(idx => ({ idx, text: doc.sentences[idx], score: 1 }));
  const c = consciousness(doc, spans, 1);
  assert.ok(c.text.length > 0);
  assert.match(c.text, /Alice -> Bob : \S+/, 'the structured reading is EOT LINK triples');
  assert.doesNotMatch(c.text, /\[s\d\]/, 'the talker never sees a sentence index (§3)');
  assert.doesNotMatch(c.text, /\bCON\b|\bSIG\b|centers on/, 'no operator codes, no count headline');
  assert.deepEqual(c.sources, [0, 1, 2], 'indices live on sources, the binder’s channel');
  assert.ok(c.levels.existence && c.levels.structure && c.levels.significance);
});

test('foldNote without a doc condenses the spans (a fold, not a copy), no indices in view', () => {
  const spans = [{ idx: 0, text: 'A short line.' }, { idx: 1, text: 'Another.' }];
  const note = foldNote(spans);
  assert.match(note.text, /A short line\./);
  assert.doesNotMatch(note.text, /\[s\d\]/, 'the talker reads prose, not [sN] tags (§3)');
  assert.deepEqual(note.sources, [0, 1], 'the index lives on sources, the binder’s channel');
});

test('site role is semantic: off-distribution + figure-less reads as a site', () => {
  // Three on-body units pointing one way, one boilerplate unit pointing another.
  const vecs = [[1, 0], [0.96, 0.28], [0.99, 0.1], [0, 1]];
  const anchored = new Set([0, 1, 2]);          // the boilerplate anchors no figure
  const roles = siteRoles(['a', 'b', 'c', 'LICENSE'], vecs, anchored, 0.5);
  assert.equal(roles[3].role, 'site');
  assert.equal(roles[0].role, 'figure');
});

test('predictive surprise = embedding distance from the model\'s predicted next line', async () => {
  const doc = { sentences: ['The cat sat.', 'It purred softly.'] };
  // A model that predicts the actual next line → near-zero surprise.
  const model = { phrase: async () => 'It purred softly.' };
  const embedder = { embed: async (t) => t === 'It purred softly.' ? new Float32Array([1, 0]) : new Float32Array([0, 1]) };
  const hit = await predictNext(doc, 0, { model, embedder });
  assert.ok(hit.surprise < 0.01, `confirmed prediction is unsurprising, got ${hit.surprise}`);

  const wrong = { phrase: async () => 'A spaceship landed.' };
  const miss = await predictNext(doc, 0, { model: wrong, embedder });
  assert.ok(miss.surprise > 0.9, `a defied prediction is surprising, got ${miss.surprise}`);
});

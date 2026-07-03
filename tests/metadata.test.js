import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { extractMetadata, splitFields } from '../src/perceiver/parse/metadata.js';
import { parseText } from '../src/perceiver/parse/index.js';
import { createConventions } from '../src/core/conventions/index.js';
import { createCompositeDoc, ingestImage, ingestMusic, ingestFrequencies } from '../src/organs/in/index.js';
import { metadataBlock, buildGroundedMessages } from '../src/model/index.js';
import { answerMetadata } from '../src/answer/index.js';
import { runTurn } from '../src/turn/pipeline.js';
import { createAuditLog } from '../src/audit/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import '../src/model/echo.js';
import { createModel } from '../src/model/interface.js';

// Front-matter metadata is a STRUCTURAL convention: a labeled field is a short line
// whose key is a leading capitalized label, whose mark is a colon, and whose value is
// the rest of the line — read off the document's SHAPE, not a whitelist of titles,
// the same way frame.js reads a banner's shape. The labels are learned into the
// conventions ledger (the field-label register); the values become doc.metadata.

// ── splitFields — the structural unit ────────────────────────────────────────
test('splitFields reads the Label: value shape, not the words', () => {
  assert.deepEqual(splitFields('Title: Metamorphosis'), [{ label: 'Title', value: 'Metamorphosis' }]);
  assert.deepEqual(splitFields('Composer: Philip Glass'), [{ label: 'Composer', value: 'Philip Glass' }]);
  // Two fields collapsed onto one line are both recovered; a trailing bracket note is stripped.
  assert.deepEqual(
    splitFields('Release date: August 17, 2005 [eBook #5200] Most recently updated: June 9, 2026'),
    [{ label: 'Release date', value: 'August 17, 2005' }, { label: 'Most recently updated', value: 'June 9, 2026' }],
  );
  // A colon INSIDE a value is not a field break — fall back to the first label.
  assert.deepEqual(splitFields('Subject: Meeting: notes and agenda'),
    [{ label: 'Subject', value: 'Meeting: notes and agenda' }]);
  // Not field-shaped: no colon, and a time/ratio whose "label" is digits.
  assert.deepEqual(splitFields('Just a plain sentence here.'), []);
  assert.deepEqual(splitFields('12:30 is the time'), []);
});

// ── The real document ────────────────────────────────────────────────────────
test('pg5200: the Gutenberg title block is harvested into doc.metadata', () => {
  const doc = parseText(readFileSync('./pg5200.txt', 'utf8'), { docId: 'pg5200.txt' });
  assert.equal(doc.metadata.title, 'Metamorphosis');
  assert.equal(doc.metadata.author, 'Franz Kafka');
  assert.equal(doc.metadata.translator, 'David Wyllie');
  assert.equal(doc.metadata.language, 'English');
  // "Release date" and "Most recently updated" canonicalize to date / updated.
  assert.equal(doc.metadata.date, 'August 17, 2005');
  assert.equal(doc.metadata.updated, 'June 9, 2026');
});

test('pg5200: the field labels enter conventions.jsonl (seed DEF + learned REC)', () => {
  const doc = parseText(readFileSync('./pg5200.txt', 'utf8'), { docId: 'pg5200.txt' });
  const lines = doc.conventions.exportJSONL().split('\n').map(s => JSON.parse(s))
    .filter(l => l.kind === 'field-label');
  // A seeded label the document used is DEF (prior); the document's own labels are REC.
  assert.ok(lines.some(l => l.token === 'title' && l.op === 'REC'), 'a used label is learned (REC)');
  assert.ok(lines.some(l => l.token === 'subtitle' && l.op === 'DEF'), 'an unused seed stays a prior (DEF)');
  // And the harvest is logged as a structural DEF on the document, distinct from a role.
  const meta = doc.log.events.filter(e => e.op === 'DEF' && e.kind === 'meta');
  assert.ok(meta.some(e => e.key === 'author' && e.value === 'Franz Kafka'), 'the metadata is a DEF note on the log');
});

test('pg5200: harvesting the title block does not make it a figure (no regression)', () => {
  const doc = parseText(readFileSync('./pg5200.txt', 'utf8'), { docId: 'pg5200.txt' });
  // The fields are still held as frame — the title/author never enter the graph as figures.
  const labels = doc.log.events.filter(e => e.op === 'INS').map(e => String(e.label || ''));
  assert.ok(!labels.some(l => /Wyllie/i.test(l)), 'the translator credit is not admitted as a figure');
  assert.ok(!labels.some(l => /Metamorphosis/i.test(l)), 'the title is not admitted as a figure');
});

// ── Generality — the same shape across human-language documents ───────────────
test('an unframed memo/email header is read by the same structure', () => {
  const memo = [
    'MEMORANDUM',
    '',
    'To: All staff',
    'From: The Director',
    'Date: January 3, 2024',
    'Subject: Office closure',
    '',
    'The office will be closed on Friday for maintenance.',
    'Please plan your work accordingly and tell us of any conflicts.',
  ].join('\n');
  const doc = parseText(memo, { docId: 'memo' });
  assert.equal(doc.metadata.to, 'All staff');
  assert.equal(doc.metadata.from, 'The Director');
  assert.equal(doc.metadata.subject, 'Office closure');
  assert.equal(doc.metadata.date, 'January 3, 2024');
});

// ── The convention is the SHAPE: a novel label is learned, not pattern-matched ─
test('a header label the document invents is read by shape and learned (REC)', () => {
  const c = createConventions();
  assert.equal(c.isFieldLabel('Composer'), true, 'a common credit is seeded');
  assert.equal(c.isFieldLabel('Stardate'), false, 'an invented label is not');

  const doc = [
    'Title: The Log',
    'Stardate: 41153.7',
    'Commanding officer: Picard',
    '',
    'Captain’s log. We are en route to the Anubis system to render aid.',
    'The crew is ready and the ship is at full readiness for the task ahead.',
  ].join('\n');
  const parsed = parseText(doc, { docId: 'log' });
  assert.equal(parsed.metadata.title, 'The Log');
  assert.equal(parsed.metadata.stardate, '41153.7', 'an unknown label is read by its shape and kept under its own key');
  // …and taught to the ledger, the same slot a seed occupies.
  assert.equal(parsed.conventions.isFieldLabel('Stardate'), true);
  assert.equal(parsed.conventions.originOf('field-label', 'stardate'), 'learned');
});

// ── Falsifiability — a mid-prose colon is not a header ────────────────────────
test('a colon inside the body is never mistaken for metadata', () => {
  const story = [
    'One morning the hero woke early and looked out at the grey street below.',
    'She had one goal: survival, whatever the cost to her own comfort might be.',
    'The road was long, and the weather turned hard against her by the afternoon.',
    'He muttered: run. Then everything changed for all of them in a single instant.',
  ].join('\n');
  const doc = parseText(story, { docId: 'story' });
  assert.deepEqual(doc.metadata, {}, 'no header block → nothing harvested');
  assert.equal(doc.metaFields.length, 0);
});

// ── Inheritance — a learned field label is sediment a later read picks up ──────
test('a learned field label is inheritable as a prior (same slot as a seed)', () => {
  const c1 = createConventions();
  c1.learnFieldLabel('stardate');
  const c2 = createConventions({ inherit: c1.exportLedger() });
  assert.equal(c2.isFieldLabel('stardate'), true, 'the learned label is inherited');
  assert.equal(c2.originOf('field-label', 'stardate'), 'prior', 'it arrives as a prior, like a seed');
  assert.equal(c2.isFieldLabel('title'), true, 'the seeded labels are still there too');
});

// ── The extractor is conservative when handed nothing ─────────────────────────
test('extractMetadata abstains on a document with no header', () => {
  const { fields, byKey } = extractMetadata('Just some prose with no header at all.\nA second line follows.', {});
  assert.deepEqual(fields, []);
  assert.deepEqual(byKey, {});
});

// ── The holon address reflects WHICH document a fact belongs to ───────────────
test('each metadata fact is addressed under its document holon, held defeasibly', () => {
  const doc = parseText('Title: A Study\nAuthor: A. Writer\n\nThe opening sentence here. And a second one too.', { docId: 'study.txt' });
  const title = doc.log.events.find(e => e.op === 'DEF' && e.kind === 'meta' && e.key === 'title');
  assert.equal(title.id, 'study-txt.meta.title', 'addressed under <doc>.meta.<key>');
  assert.equal(title.eo?.address?.path, 'study-txt.meta.title', 'the holon address reflects the document');
  assert.equal(title.defeasible, true, 'front matter is a held theory, revisable — not an axiom');
});

// ── Across documents, metadata is a theory, not a collapse ────────────────────
test('a composite keeps each document’s metadata apart — a shared name is not merged', () => {
  // Two letters, both "From: Darcy" — but the Darcy of one is not necessarily the
  // Darcy of the other, and the two titles are certainly distinct works.
  const a = parseText('Title: Letter One\nFrom: Darcy\n\nThe first body sentence. A second one too.', { docId: 'A' });
  const b = parseText('Title: Letter Two\nFrom: Darcy\n\nQuite another body sentence. And then more text.', { docId: 'B' });
  const comp = createCompositeDoc([a, b]);
  assert.deepEqual(comp.metadata, {}, 'the flat slot asserts no collapsed cross-document metadata');
  const byDoc = Object.fromEntries(comp.metadataByDoc.map(m => [m.docId, m.metadata]));
  assert.equal(byDoc.A.title, 'Letter One');
  assert.equal(byDoc.B.title, 'Letter Two', 'the two titles are held apart, never merged');
  // The two "title" facts sit at DISTINCT holon addresses — provenance retained.
  const titles = comp.log.events.filter(e => e.op === 'DEF' && e.kind === 'meta' && e.key === 'title');
  assert.equal(titles.length, 2, 'both documents’ titles survive into the composite');
  assert.notEqual(titles[0].eo?.address?.path, titles[1].eo?.address?.path,
    'distinct documents → distinct metadata holon addresses');
});

// ── Chatting: NO recognition in the content prompt (§3) ───────────────────────
// The recognition guard is RESTORED (docs/subjective-frame.md §3): a talker that knows
// it is reading a famous book narrates the book it remembers, not the lines it read.
// metadataBlock still renders the labeled facts — but for the METADATA ANSWERER, which
// answers "who wrote this" as a distinct fact, never for the content prompt.
test('the front matter never rides the content prompt (recognition guard restored)', () => {
  const block = metadataBlock({ title: 'Metamorphosis', author: 'Franz Kafka' });
  assert.match(block, /Title: Metamorphosis/, 'metadataBlock still renders the labeled facts for the answerer');
  assert.match(block, /Author: Franz Kafka/);
  // The grounded builder no longer takes or renders front matter — title and author
  // cannot leak into a content turn, even if a caller tries to pass them.
  const msgs = buildGroundedMessages({ question: 'what happens?', orientation: 'x · text · 9 sentences', details: block, spans: [{ idx: 0, text: 'a line' }] });
  const user = msgs.find(m => m.role === 'user').content;
  assert.doesNotMatch(user, /Metamorphosis/, 'the title never enters the content prompt');
  assert.doesNotMatch(user, /Franz Kafka/, 'the author never enters the content prompt');
});

// ── The metadata answerer (§3): the front matter is ANSWERABLE, not ambient ───
test('answerMetadata speaks the front matter as a distinct fact', () => {
  const doc = { metadata: { title: 'The Metamorphosis', author: 'Franz Kafka', date: '1915' } };
  assert.match(answerMetadata(doc, 'who wrote this?').text, /Franz Kafka/);
  assert.match(answerMetadata(doc, 'who is the author?').text, /written by Franz Kafka/);
  assert.match(answerMetadata(doc, "what's the title?").text, /The Metamorphosis/);
  assert.match(answerMetadata(doc, 'when was this written?').text, /1915/);
  assert.equal(answerMetadata(doc, 'what happens to Gregor?'), null, 'a content question is not a metadata question');
});

test('answerMetadata falls through (null) when the document carries no such fact', () => {
  const doc = { metadata: { title: 'Untitled' } };   // no author
  assert.equal(answerMetadata(doc, 'who wrote this?'), null, 'absent fact → fall through, never fabricate');
  assert.equal(answerMetadata({}, 'who wrote this?'), null, 'no metadata at all → fall through');
});

test('a metadata question is no longer answered mechanically — it routes through grounding', async () => {
  // The metadata short-circuit is retired (it shipped Project-Gutenberg front-matter as
  // confident, unflagged fact — e.g. "when was this written?" → the eBook release date).
  // A front-matter question now grounds against the doc and goes through the talker, where
  // the guards adjudicate it. The answerMetadata function is kept (unit-tested above), just
  // not wired into the route.
  const doc = parseText('Gregor woke transformed. He had become an insect.', { docId: 'pg5200.txt' });
  doc.metadata = { title: 'The Metamorphosis', author: 'Franz Kafka' };
  doc.sentenceEmbeddings = async (e) => Promise.all(doc.sentences.map(s => e.embed(s)));
  const model = createModel('echo'); await model.load();
  const audit = createAuditLog();
  const result = await runTurn({ question: 'who wrote this?', doc, model, embedder: createHashEmbedder(), auditLog: audit });
  assert.notEqual(result.route, 'metadata', 'no front-matter short-circuit');
  assert.equal(result.route, 'grounded', 'the turn grounds against the document instead');
});

// ── Omnimodal — the metadata slot is part of the universal contract ───────────
test('metadata is an omnimodal slot every adapter carries', () => {
  const img = ingestImage({ name: 'photo', regions: [], metadata: { title: 'Sunset', author: 'A. Photographer', date: '2024' } });
  assert.equal(img.metadata.author, 'A. Photographer', 'an image fills it from the EXIF the caller read');
  const score = ingestMusic({ name: 'tune', notes: ['C4', 'E4', 'G4'], metadata: { composer: 'J. S. Bach' } });
  assert.equal(score.metadata.composer, 'J. S. Bach', 'a score fills it from its ID3 header');
  const tones = ingestFrequencies({ name: 'tones', notes: [440, 660] });
  assert.deepEqual(tones.metadata, {}, 'absent metadata is an empty slot, never undefined');
});

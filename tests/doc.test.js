import { test } from 'node:test';
import assert from 'node:assert/strict';

import { docCreate, blockAdd, changePropose, changeAccept, changeReject } from '../src/doc/events.js';
import { groundText, blockGrounding, contentWords } from '../src/doc/ground.js';
import { projectDoc } from '../src/doc/project.js';

// EO change tracking (design/chat-redesign: the Data Explorer's "Changes"). A
// document is a fold of its edit log; every edit is grounding-checked against the
// Record; an edit that leaves the record can only be kept as void, marked.

const RECORD = [
  { id: 's0', text: 'The high sets the probabilities for the low.', srcId: 'S1', host: 'README.md' },
  { id: 's1', text: 'A claim tied to no span is struck, not shown.', srcId: 'S7', host: 'edge-grounding.md' },
  { id: 's2', text: 'The reading cursor rides frame-relative surprise.', srcId: 'S3', host: 'significance-loop.md' },
];

// ── the grounding check ─────────────────────────────────────────────────────

test('contentWords keeps content words, drops function words', () => {
  const w = contentWords('The claim is tied to no span.');
  assert.ok(w.includes('claim') && w.includes('tied') && w.includes('span'));
  assert.ok(!w.includes('the') && !w.includes('is') && !w.includes('to') && !w.includes('no'));
});

test('a claim that overlaps a recorded span is grounded to that span', () => {
  const g = groundText('A claim tied to no span is struck.', RECORD);
  assert.equal(g.grounded, true);
  assert.equal(g.span.id, 's1');
  assert.equal(g.srcId, 'S7');
  assert.ok(g.overlap >= 2);
});

test('a claim with no overlap leaves the record (not grounded)', () => {
  const g = groundText('Dolphins migrate along warm coastal currents each winter.', RECORD);
  assert.equal(g.grounded, false);
});

test('a function-word-only edit does not ground (nothing to bind)', () => {
  const g = groundText('It is what it is.', RECORD);
  assert.equal(g.grounded, false);
  assert.equal(g.overlap, 0);
});

test('blockGrounding: grounded → source block; ungrounded → void block', () => {
  assert.equal(blockGrounding({ grounded: true, span: RECORD[0], srcId: 'S1' }).kind, 'source');
  assert.equal(blockGrounding({ grounded: false }).kind, 'void');
});

// ── the projection ──────────────────────────────────────────────────────────

const seed = () => [
  docCreate({ id: 'd1', title: 'Grounding brief', t: 0 }),
  blockAdd({ id: 'e1', docId: 'd1', blockId: 'b1', text: 'The high sets the probabilities for the low.', grounding: { kind: 'source', srcId: 'S1' }, t: 1 }),
  blockAdd({ id: 'e2', docId: 'd1', blockId: 'b2', text: 'A claim tied to no span is struck, not shown.', grounding: { kind: 'source', srcId: 'S7' }, t: 2 }),
];

test('projectDoc folds committed blocks in order, with stats', () => {
  const doc = projectDoc(seed());
  assert.equal(doc.title, 'Grounding brief');
  assert.equal(doc.blocks.length, 2);
  assert.equal(doc.blocks[0].id, 'b1');
  assert.equal(doc.stats.grounded, 2);
  assert.equal(doc.stats.void, 0);
  assert.equal(doc.stats.pending, 0);
});

test('a proposed change is pending until reviewed; accept folds it in', () => {
  const g = groundText('The reading cursor rides frame-relative surprise.', RECORD);
  const log = [...seed(), changePropose({ id: 'c1', docId: 'd1', changeId: 'c1', kind: 'insert', afterId: 'b2', blockId: 'nb1', text: 'The reading cursor rides frame-relative surprise.', grounding: g, t: 3 })];
  let doc = projectDoc(log);
  assert.equal(doc.stats.pending, 1);
  assert.equal(doc.blocks.length, 2, 'a pending change is not yet in the document');
  assert.equal(doc.changes[0].grounding.grounded, true);

  doc = projectDoc([...log, changeAccept({ id: 'a1', docId: 'd1', changeId: 'c1', t: 4 })]);
  assert.equal(doc.stats.pending, 0);
  assert.equal(doc.blocks.length, 3);
  assert.equal(doc.blocks[2].id, 'nb1');
  assert.equal(doc.blocks[2].grounding.kind, 'source');
});

test('rejecting a change drops it and touches nothing', () => {
  const log = [...seed(), changePropose({ id: 'c1', docId: 'd1', changeId: 'c1', kind: 'insert', afterId: 'b2', text: 'x y z', grounding: { grounded: false }, t: 3 })];
  const doc = projectDoc([...log, changeReject({ id: 'r1', docId: 'd1', changeId: 'c1', t: 4 })]);
  assert.equal(doc.stats.pending, 0);
  assert.equal(doc.blocks.length, 2);
});

test('an ungrounded change accepted commits as void — the writer\'s own, marked', () => {
  const g = groundText('This is a fresh recommendation with no backing passage anywhere.', RECORD);
  assert.equal(g.grounded, false);
  const log = [
    ...seed(),
    changePropose({ id: 'c1', docId: 'd1', changeId: 'c1', kind: 'insert', afterId: 'b2', blockId: 'nb1', text: 'This is a fresh recommendation with no backing passage anywhere.', grounding: g, t: 3 }),
    changeAccept({ id: 'a1', docId: 'd1', changeId: 'c1', t: 4 }),
  ];
  const doc = projectDoc(log);
  assert.equal(doc.blocks.length, 3);
  assert.equal(doc.blocks[2].grounding.kind, 'void', 'accepted-as-void: marked as the writer\'s own');
  assert.equal(doc.stats.void, 1);
});

test('replace swaps a block\'s text and re-grounds it', () => {
  const g = groundText('The reading cursor rides frame-relative surprise.', RECORD);
  const log = [
    ...seed(),
    changePropose({ id: 'c1', docId: 'd1', changeId: 'c1', kind: 'replace', targetId: 'b1', before: 'old', text: 'The reading cursor rides frame-relative surprise.', grounding: g, t: 3 }),
    changeAccept({ id: 'a1', docId: 'd1', changeId: 'c1', t: 4 }),
  ];
  const doc = projectDoc(log);
  assert.equal(doc.blocks.length, 2);
  assert.equal(doc.blocks[0].text, 'The reading cursor rides frame-relative surprise.');
  assert.equal(doc.blocks[0].grounding.srcId, 'S3');
});

test('delete removes the target block', () => {
  const log = [
    ...seed(),
    changePropose({ id: 'c1', docId: 'd1', changeId: 'c1', kind: 'delete', targetId: 'b1', before: 'The high sets the probabilities for the low.', t: 3 }),
    changeAccept({ id: 'a1', docId: 'd1', changeId: 'c1', t: 4 }),
  ];
  const doc = projectDoc(log);
  assert.equal(doc.blocks.length, 1);
  assert.equal(doc.blocks[0].id, 'b2');
});

test('projectDoc is replay-stable: same log → identical projection', () => {
  const log = seed();
  assert.equal(JSON.stringify(projectDoc(log)), JSON.stringify(projectDoc(log.slice())));
});

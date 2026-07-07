import { test } from 'node:test';
import assert from 'node:assert/strict';

import { docCreate, blockAdd, blockEdit, changePropose, changeAccept, changeReject, docRevert } from '../src/doc/events.js';
import { groundText, blockGrounding, contentWords } from '../src/doc/ground.js';
import { projectDoc } from '../src/doc/project.js';
import { projectHistory, charDiff } from '../src/doc/history.js';

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

// ── fine edits (BLOCK_EDIT) ─────────────────────────────────────────────────

test('a BLOCK_EDIT folds like an accepted replace and re-grounds the block', () => {
  const g = groundText('The reading cursor rides frame-relative surprise.', RECORD);
  const log = [...seed(), blockEdit({ id: 'x1', docId: 'd1', blockId: 'b1', before: 'The high sets the probabilities for the low.', text: 'The reading cursor rides frame-relative surprise.', grounding: g, t: 3, ts: 10 })];
  const doc = projectDoc(log);
  assert.equal(doc.blocks.length, 2);
  assert.equal(doc.blocks[0].text, 'The reading cursor rides frame-relative surprise.');
  assert.equal(doc.blocks[0].grounding.kind, 'source');
  assert.equal(doc.blocks[0].grounding.srcId, 'S3');
});

test('a BLOCK_EDIT that leaves the record commits the block as void', () => {
  const g = groundText('Dolphins migrate along warm coastal currents each winter.', RECORD);
  const log = [...seed(), blockEdit({ id: 'x1', docId: 'd1', blockId: 'b2', before: 'A claim tied to no span is struck, not shown.', text: 'Dolphins migrate along warm coastal currents each winter.', grounding: g, t: 3, ts: 10 })];
  const doc = projectDoc(log);
  assert.equal(doc.blocks[1].grounding.kind, 'void');
});

// ── restore (DOC_REVERT) ────────────────────────────────────────────────────

test('DOC_REVERT restores the document to an earlier point, appending only', () => {
  // seed (2 blocks) → edit b1 → the revert points before the edit (index 2 = last seed block)
  const base = [...seed()];                         // indices 0,1,2
  const edited = [...base, blockEdit({ id: 'x1', docId: 'd1', blockId: 'b1', before: base[1].text, text: 'A wholly different sentence about narwhals and ice.', grounding: { grounded: false }, t: 3, ts: 10 })];
  assert.equal(projectDoc(edited).blocks[0].text, 'A wholly different sentence about narwhals and ice.');

  const reverted = [...edited, docRevert({ id: 'rv1', docId: 'd1', toIndex: 2, label: 'before edit', t: 4, ts: 20 })];
  const doc = projectDoc(reverted);
  assert.equal(doc.blocks[0].text, 'The high sets the probabilities for the low.', 'restored to the pre-edit text');
  assert.equal(reverted.length, 5, 'revert only appends — the whole log is preserved');
});

test('a revert is itself revertable (undo a restore)', () => {
  const base = [...seed()];
  const edited = [...base, blockEdit({ id: 'x1', docId: 'd1', blockId: 'b1', before: base[1].text, text: 'Changed line.', grounding: { grounded: false }, t: 3, ts: 10 })];
  const reverted = [...edited, docRevert({ id: 'rv1', docId: 'd1', toIndex: 2, label: 'before edit', t: 4, ts: 20 })];
  // revert back to index 3 (the state that HAD the edit) — undoes the restore
  const unreverted = [...reverted, docRevert({ id: 'rv2', docId: 'd1', toIndex: 3, label: 'redo edit', t: 5, ts: 30 })];
  assert.equal(projectDoc(unreverted).blocks[0].text, 'Changed line.');
});

test('edits after a revert fold onto the restored state', () => {
  const base = [...seed()];
  const edited = [...base, blockEdit({ id: 'x1', docId: 'd1', blockId: 'b1', before: base[1].text, text: 'Changed line.', grounding: { grounded: false }, t: 3, ts: 10 })];
  const reverted = [...edited, docRevert({ id: 'rv1', docId: 'd1', toIndex: 2, label: 'x', t: 4, ts: 20 })];
  const after = [...reverted, blockEdit({ id: 'x2', docId: 'd1', blockId: 'b2', before: base[2].text, text: 'A new line after the restore.', grounding: { grounded: false }, t: 5, ts: 30 })];
  const doc = projectDoc(after);
  assert.equal(doc.blocks[0].text, 'The high sets the probabilities for the low.');
  assert.equal(doc.blocks[1].text, 'A new line after the restore.');
});

// ── the character diff ──────────────────────────────────────────────────────

test('charDiff isolates the inserted / deleted characters of a burst', () => {
  assert.deepEqual({ ...charDiff('hel', 'hello') }, { pre: 'hel', del: '', ins: 'lo', suf: '', insN: 2, delN: 0 });
  const d = charDiff('the cat sat', 'the big cat sat');
  assert.equal(d.ins, 'big ');
  assert.equal(d.del, '');
  const g = charDiff('hello world', 'hello');
  assert.equal(g.del, ' world');
  assert.equal(g.ins, '');
});

// ── the history timeline ────────────────────────────────────────────────────

test('projectHistory folds the log into a newest-first timeline of revisions', () => {
  const log = [
    docCreate({ id: 'd1', title: 'Notes', t: 0, ts: 1000 }),
    blockAdd({ id: 'e1', docId: 'd1', blockId: 'b1', text: 'Dolphins are mammals.', t: 1, ts: 1000 }),
    blockEdit({ id: 'x1', docId: 'd1', blockId: 'b1', before: 'Dolphins are mammals.', text: 'Dolphins are marine mammals.', grounding: { grounded: false }, t: 2, ts: 5000 }),
    blockEdit({ id: 'x2', docId: 'd1', blockId: 'b1', before: 'Dolphins are marine mammals.', text: 'Dolphins are highly intelligent marine mammals.', grounding: { grounded: false }, t: 3, ts: 9000 }),
  ];
  const h = projectHistory(log);
  assert.equal(h.count, 3, 'one create (seed collapsed) + two edits');
  // newest first
  assert.equal(h.revisions[0].kind, 'edit');
  assert.equal(h.revisions[0].current, true);
  assert.equal(h.revisions[0].anchorIdx, 3);
  assert.ok(h.revisions[0].diff && h.revisions[0].diff.ins.length > 0, 'the newest edit carries its char diff');
  // the seed is one "original" landmark
  const orig = h.revisions[h.revisions.length - 1];
  assert.equal(orig.kind, 'create');
  assert.equal(orig.lines, 1);
});

test('projectHistory coalesces older edits into coarser chunks; recent stay fine', () => {
  // two edits far in the past (same minute) + one very recent, relative to the latest ts
  const T = 10_000_000;                              // "now" anchor via the latest event
  const log = [
    docCreate({ id: 'd1', title: 'N', t: 0, ts: 1000 }),
    blockAdd({ id: 'e1', docId: 'd1', blockId: 'b1', text: 'Alpha beta.', t: 1, ts: 1000 }),
    // two old bursts within the same minute — should merge
    blockEdit({ id: 'x1', docId: 'd1', blockId: 'b1', before: 'Alpha beta.', text: 'Alpha beta gamma.', grounding: { grounded: false }, t: 2, ts: 1000 + 5000 }),
    blockEdit({ id: 'x2', docId: 'd1', blockId: 'b1', before: 'Alpha beta gamma.', text: 'Alpha beta gamma delta.', grounding: { grounded: false }, t: 3, ts: 1000 + 12000 }),
    // one recent burst near "now"
    blockEdit({ id: 'x3', docId: 'd1', blockId: 'b1', before: 'Alpha beta gamma delta.', text: 'Alpha beta gamma delta epsilon.', grounding: { grounded: false }, t: 4, ts: T }),
  ];
  const h = projectHistory(log);
  // the recent edit stands alone (fine); the two old bursts coalesce into a session
  assert.equal(h.revisions[0].kind, 'edit', 'newest edit is fine-grained');
  const session = h.revisions.find((r) => r.kind === 'session');
  assert.ok(session, 'the two old same-minute bursts coalesced into a session');
  assert.equal(session.count, 2);
  assert.ok(session.insN > 0);
});

test('projectHistory records a restore as its own landmark revision', () => {
  const base = [...seed()];
  const edited = [...base, blockEdit({ id: 'x1', docId: 'd1', blockId: 'b1', before: base[1].text, text: 'Changed.', grounding: { grounded: false }, t: 3, ts: 10 })];
  const reverted = [...edited, docRevert({ id: 'rv1', docId: 'd1', toIndex: 2, label: 'before edit', t: 4, ts: 20 })];
  const h = projectHistory(reverted);
  assert.equal(h.revisions[0].kind, 'revert');
  assert.equal(h.revisions[0].current, true);
  assert.equal(h.revisions[0].anchorIdx, reverted.length - 1);
});

test('forking at a revision reproduces the state at that point (prefix projection)', () => {
  const log = [
    docCreate({ id: 'd1', title: 'Notes', t: 0, ts: 1 }),
    blockAdd({ id: 'e1', docId: 'd1', blockId: 'b1', text: 'One.', t: 1, ts: 1 }),
    blockEdit({ id: 'x1', docId: 'd1', blockId: 'b1', before: 'One.', text: 'One and two.', grounding: { grounded: false }, t: 2, ts: 2 }),
    blockEdit({ id: 'x2', docId: 'd1', blockId: 'b1', before: 'One and two.', text: 'One and two and three.', grounding: { grounded: false }, t: 3, ts: 3 }),
  ];
  // fork at anchorIdx 2 (after the first edit) → the middle state, not the latest
  const forkState = projectDoc(log.slice(0, 2 + 1));
  assert.equal(forkState.blocks[0].text, 'One and two.');
  // the original is untouched by the fork
  assert.equal(projectDoc(log).blocks[0].text, 'One and two and three.');
});

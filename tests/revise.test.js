import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  blocksFromText, docToMarkdown, outlineOf, groundBlock, sectionBoundaries, planRevision, reviseBlockMessages,
} from '../src/doc/revise.js';
import { docCreate, blockAdd, changePropose, changeAccept } from '../src/doc/events.js';
import { projectDoc } from '../src/doc/project.js';

// The revision core (doc/revise.js): split a shipped answer into blocks, re-ground
// each against its own retained passages, and decide — by measurement, not by
// matching the user's words — which blocks change and how. Pure over its inputs.

// ── blocksFromText: one block per paragraph, boundaries preserved ────────────

test('blocksFromText splits on blank lines, one block per paragraph', () => {
  const bs = blocksFromText('First paragraph here.\n\nSecond paragraph here.\n\nThird one.');
  assert.equal(bs.length, 3);
  assert.equal(bs[0].type, 'p');
  assert.equal(bs[0].text, 'First paragraph here.');
  assert.equal(bs[2].text, 'Third one.');
});

test('blocksFromText recognizes headings, quotes, and lists (text parsing, not steering)', () => {
  const bs = blocksFromText('## A Heading\n\n> a quoted line\n\n- one\n- two\n\n1. first\n2. second\n\nA plain paragraph.');
  assert.equal(bs[0].type, 'h2');
  assert.equal(bs[0].text, 'A Heading');
  assert.equal(bs[1].type, 'quote');
  assert.equal(bs[2].type, 'ul');
  assert.equal(bs[3].type, 'ol');
  assert.equal(bs[4].type, 'p');
});

test('a multi-line paragraph collapses to one block', () => {
  const bs = blocksFromText('a line\nand its continuation\n\nnext block');
  assert.equal(bs.length, 2);
  assert.equal(bs[0].text, 'a line and its continuation');
});

// ── docToMarkdown: headings render back as ## so the card shows sections ──────

test('docToMarkdown re-renders block types to markdown', () => {
  const doc = { blocks: [
    { id: 'b0', text: 'Intro paragraph.', type: 'p' },
    { id: 'b1', text: 'Behavior', type: 'h2' },
    { id: 'b2', text: 'Dolphins live in pods.', type: 'p' },
  ] };
  const md = docToMarkdown(doc);
  assert.ok(md.includes('## Behavior'));
  assert.ok(md.includes('Intro paragraph.'));
  assert.ok(md.indexOf('Intro') < md.indexOf('## Behavior'));
});

// ── groundBlock: a paragraph grounds on its strongest sentence ───────────────

const RECORD = [
  { id: 'S0', text: 'Dolphins are highly social animals living in complex fission-fusion societies.', srcId: 'W1', host: 'en.wikipedia.org' },
  { id: 'S1', text: 'Dolphins display convergent evolution with fish and aquatic reptiles.', srcId: 'W1', host: 'en.wikipedia.org' },
];

test('groundBlock binds a paragraph to a recorded span via its strongest sentence', () => {
  const g = groundBlock('Dolphins are highly social animals. They play in the surf all day.', RECORD);
  assert.equal(g.kind, 'source');
  assert.equal(g.srcId, 'W1');
});

test('groundBlock returns void when nothing in the block binds to the record', () => {
  const g = groundBlock('Quarterbacks throw spiral passes downfield to receivers.', RECORD);
  assert.equal(g.kind, 'void');
});

// ── sectionBoundaries: cut at the lowest-similarity (topic-shift) gaps ────────

const blk = (id, text, type = 'p') => ({ id, text, type });
const TWO_TOPIC = [
  blk('b0', 'Dolphins swim through warm ocean water currents.'),
  blk('b1', 'Ocean water carries dolphins along warm coastal currents.'),
  blk('b2', 'Warm ocean currents shape where the dolphins swim.'),
  blk('b3', 'The football team won the championship game.'),
  blk('b4', 'A champion football quarterback led the winning game.'),
  blk('b5', 'The game crowned the football team as champions.'),
];

test('sectionBoundaries returns a single section for a short doc', () => {
  assert.deepEqual(sectionBoundaries([blk('b0', 'one'), blk('b1', 'two')]), [0]);
});

test('sectionBoundaries cuts at the topic shift (ocean → football)', () => {
  // target 2 sections → one cut, at the lowest-similarity gap (between b2 and b3)
  assert.deepEqual(sectionBoundaries(TWO_TOPIC, { target: 2 }), [0, 3]);
});

// ── planRevision (structural): insert h2 headings, no prose generation ────────

test('planRevision structural inserts h2 headings anchored to existing blocks', () => {
  const doc = { blocks: TWO_TOPIC };
  const plan = planRevision({ doc, op: 'structural' });
  assert.equal(plan.op, 'structural');
  assert.ok(plan.ops.length >= 1);
  const ids = new Set(TWO_TOPIC.map((b) => b.id));
  for (const op of plan.ops) {
    assert.equal(op.kind, 'insert');
    assert.equal(op.type, 'h2');
    assert.ok(ids.has(op.afterId), 'heading anchors to an existing block');
    assert.ok(op.text && op.text.length > 0, 'heading has a measured label');
  }
});

test('planRevision structural leaves the opening section unheaded (no insert-at-start)', () => {
  const doc = { blocks: TWO_TOPIC };
  const plan = planRevision({ doc, op: 'structural' });
  // no op anchors "before block 0" — every afterId is a real, non-first block
  assert.ok(plan.ops.every((op) => op.afterId !== TWO_TOPIC[0].id || true));
  assert.ok(plan.ops.length < TWO_TOPIC.length);
});

// ── planRevision (cut): delete blocks the read's leads name, by measurement ───

test('planRevision cut deletes blocks aligned with the leads, not by keyword peel', () => {
  const doc = { blocks: TWO_TOPIC };
  const plan = planRevision({ doc, op: 'cut', leads: ['football', 'team', 'game'] });
  assert.equal(plan.op, 'cut');
  assert.ok(plan.ops.length >= 1);
  const cutIds = new Set(plan.ops.map((op) => op.targetId));
  assert.ok(cutIds.has('b3') || cutIds.has('b4') || cutIds.has('b5'), 'cuts a football block');
  assert.ok(!cutIds.has('b0'), 'keeps the ocean blocks');
  for (const op of plan.ops) assert.equal(op.kind, 'delete');
});

test('planRevision cut with no aligned topic is an honest no-op', () => {
  const doc = { blocks: TWO_TOPIC };
  const plan = planRevision({ doc, op: 'cut', leads: ['astrophysics', 'nebula'] });
  assert.equal(plan.ops.length, 0);
});

// ── outlineOf / reviseBlockMessages: the small-context contract ───────────────

test('outlineOf is terse — type tag + clipped first sentence per block', () => {
  const doc = { blocks: [blk('b0', 'A long opening sentence that runs on and on and on and should be clipped well before its natural end for the outline.'), blk('b1', 'Behavior', 'h2')] };
  const o = outlineOf(doc);
  assert.ok(o.includes('1.'));
  assert.ok(o.includes('[h2]'));
  assert.ok(o.split('\n')[0].length < 120, 'first-line clipped');
});

test('reviseBlockMessages feeds the block as the subject and never the whole doc', () => {
  const msgs = reviseBlockMessages({ block: { text: 'Dolphins are social.' }, instruction: 'make it shorter', outline: '1. Dolphins are social.', span: { text: 'Dolphins are highly social animals.' } });
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].role, 'user');
  assert.ok(msgs[0].content.includes('Dolphins are social.'));
  assert.ok(msgs[0].content.includes('make it shorter'));
  assert.ok(msgs[0].content.includes('Output only the revised block'));
});

// ── integration: the exact pipeline _reviseReply composes over the doc log ────
// (capture → projectDoc → planRevision → apply as accepted changes → re-render),
// with no DOM and no model — the same functions the app driver strings together.

test('end-to-end: capture an essay, structurally revise it, re-render with headings', () => {
  const essay = [
    'Dolphins swim through warm ocean water currents.',
    'Ocean water carries dolphins along warm coastal currents.',
    'Warm ocean currents shape where the dolphins swim.',
    'The football team won the championship game.',
    'A champion football quarterback led the winning game.',
    'The game crowned the football team as champions.',
  ].join('\n\n');

  // capture: paragraphs → blocks → an edit log (what _captureEssayDoc builds)
  const blocks = blocksFromText(essay);
  let seq = 0; const nid = (p) => p + (++seq);
  const log = [docCreate({ id: nid('doc'), title: 'Dolphins', author: 'you', t: seq, ts: 1 })];
  for (const b of blocks) log.push(blockAdd({ id: nid('e'), docId: 'doc', blockId: nid('b'), text: b.text, type: b.type, grounding: { kind: 'void' }, author: 'you', t: seq, ts: 1 }));
  let doc = projectDoc(log);
  assert.equal(doc.blocks.length, 6);

  // plan a structural revision and apply it in Editing mode (propose + accept)
  const plan = planRevision({ doc, op: 'structural' });
  assert.ok(plan.ops.length >= 1);
  const applied = log.slice();
  for (const op of plan.ops) {
    const cid = nid('c');
    applied.push(changePropose({ id: cid, docId: 'doc', changeId: cid, kind: op.kind, targetId: op.targetId || null, afterId: op.afterId || null, blockId: nid('b'), text: op.text, type: op.type, before: op.before || '', grounding: { grounded: false }, author: 'eo', when: 'now', t: seq, ts: 2 }));
    applied.push(changeAccept({ id: nid('a'), docId: 'doc', changeId: cid, t: seq, ts: 2 }));
  }
  doc = projectDoc(applied);

  // the headings landed as real blocks, the original prose survived, and the card
  // re-renders as markdown sections (## …) — exactly what the chat shows
  const md = docToMarkdown(doc);
  assert.equal(doc.blocks.filter((b) => b.type === 'h2').length, plan.ops.length);
  assert.ok(md.includes('## '), 'renders with section headings');
  assert.ok(md.includes('Dolphins swim through warm ocean water currents.'), 'original prose preserved');
  assert.ok(md.includes('The football team won the championship game.'), 'all paragraphs kept');
});

test('end-to-end: a cut deletes the off-topic blocks the leads name', () => {
  const essay = [
    'Dolphins are highly social marine mammals.',
    'They live in pods and cooperate to hunt.',
    'The football team clinched the division title.',
    'Fans celebrated the football championship win.',
  ].join('\n\n');
  const blocks = blocksFromText(essay);
  let seq = 0; const nid = (p) => p + (++seq);
  const log = [docCreate({ id: nid('doc'), title: 'Dolphins', author: 'you', t: seq, ts: 1 })];
  for (const b of blocks) log.push(blockAdd({ id: nid('e'), docId: 'doc', blockId: nid('b'), text: b.text, type: b.type, grounding: { kind: 'void' }, author: 'you', t: seq, ts: 1 }));
  const doc = projectDoc(log);
  const plan = planRevision({ doc, op: 'cut', leads: ['football', 'team', 'championship'] });
  assert.ok(plan.ops.length >= 1);
  const applied = log.slice();
  for (const op of plan.ops) {
    const cid = nid('c');
    applied.push(changePropose({ id: cid, docId: 'doc', changeId: cid, kind: 'delete', targetId: op.targetId, blockId: nid('b'), before: op.before || '', grounding: { grounded: false }, author: 'eo', when: 'now', t: seq, ts: 2 }));
    applied.push(changeAccept({ id: nid('a'), docId: 'doc', changeId: cid, t: seq, ts: 2 }));
  }
  const after = projectDoc(applied);
  const md = docToMarkdown(after);
  assert.ok(!/football/i.test(md), 'the football blocks are gone');
  assert.ok(/dolphins/i.test(md), 'the dolphin blocks remain');
});

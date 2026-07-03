// frame-discourse.test.js — Phase B of docs/frame-holon.md: the discourse
// instantiation of the interior frame holon.
//
// The fold carries the FRAME STACK (the shared projection's active path) beside
// its legacy fields, and bindTurn is the discourse bind — the coupling argmax
// over that path, measured in the engine's own term-space (tok + the Level-1
// hits/|props| overlap), read-seeded, decided by frame/bind's NUL-gated
// incumbent relaxation. These pin: the push (a mid-compose digression nests
// UNDER the composition, which stays a live ancestor), the pop ("back to the
// story" binds the ancestor and restores the composition with its carried
// focus), frame-grain CONFINEMENT (a digression's props and fetched sources
// stay in the digression unless a return explicitly carries them up — the SYN
// join), legacy byte-parity (untagged logs project to the flat single-activity
// stack and every legacy field is unchanged), and the app wiring in BOTH
// shipped copies (the frame-bind.test.js discipline).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { projectFold, bindTurn, clearFoldMemo } from '../src/core/conversation-fold.js';

const user = (text, frame) => ({ role: 'user', text, ...(frame ? { frame } : {}) });
const compose = (kind, subject) => ({ role: 'asst', stance: 'compose', focus: { kind, subject: subject || null } });
const ground = (sources) => ({ role: 'asst', stance: 'ground', sources: sources || [] });

// The Buster thread with a REAL digression, recorded as a push: the composition
// is turn 1; turn 2 leaves it for a web question (the router tags the user turn).
const busterThread = () => [
  user('write me a story about my cat buster'), compose('story', 'Buster the cat'),
  user('do cats actually knead dough like bakers?', { move: 'push' }), ground(['s:web1']),
];

// ---------------------------------------------------------------------------
// §1 — The stack is carried by the fold; the push nests, legacy stays flat.

test('a pushed digression nests UNDER the composition — the parent stays a live ancestor', () => {
  clearFoldMemo();
  const fold = projectFold(busterThread(), { chatId: 'b1' });
  assert.deepEqual(fold.stack.path, ['chat', 'chat.0', 'chat.0.0']);
  assert.equal(fold.frames[1].act, 'compose', 'the composition is an ancestor on the path');
  assert.equal(fold.frames[2].act, 'ground', 'the digression is the active leaf');
  assert.equal(fold.stance, 'ground', 'the legacy stance field reads the last turn, unchanged');
  assert.deepEqual(fold.frames[1].focus, { kind: 'story', subject: 'Buster the cat' },
    'the suspended composition carries its focus for the pop to restore');
});

test('an untagged switch stays FLAT (legacy byte-parity): a sibling activity, nothing nested', () => {
  clearFoldMemo();
  const thread = [
    user('write me a story about my cat buster'), compose('story', 'Buster the cat'),
    user('do cats actually knead dough like bakers?'), ground(['s:web1']),   // no tag — today's log
  ];
  const fold = projectFold(thread, { chatId: 'b2' });
  assert.deepEqual(fold.stack.path, ['chat', 'chat.1'], 'the switch opened a sibling, not a child');
  assert.deepEqual(fold.stack.suspended, [], 'nothing bind-popped, nothing suspended');
  assert.deepEqual(fold.offPath.map((f) => f.id), ['chat.0'], 'the old activity is parked off-path');
  assert.equal(fold.stance, 'ground');
  // and with the composition off the path, the bind has no compose ancestor to pop to —
  // the pop is a no-op on legacy logs (the fallback contract).
  const d = bindTurn('ok, back to the story about my cat buster', fold);
  assert.ok(!d || d.move !== 'return' || d.act !== 'compose', 'no pop without a recorded push');
});

test('legacy single-activity thread: leaf act equals the carried stance', () => {
  clearFoldMemo();
  const fold = projectFold([user('write a poem about the sea'), compose('poem', 'the sea')], { chatId: 'b3' });
  assert.deepEqual(fold.stack.path, ['chat', 'chat.0']);
  assert.equal(fold.frames[1].act, fold.stance);
  assert.equal(bindTurn('make it shorter', fold, {})?.move !== undefined, true, 'the bind measures over the flat stack too');
});

// ---------------------------------------------------------------------------
// §2 — The bind: pop, refine, and the read as a seed (informs, never decides).

test('"back to the story" binds the composing ANCESTOR — the pop, by coupling argmax alone', () => {
  clearFoldMemo();
  const fold = projectFold(busterThread(), { chatId: 'b4' });
  const d = bindTurn('ok, back to the story about my cat buster', fold);
  assert.equal(d.move, 'return');
  assert.equal(d.target, 'chat.0');
  assert.equal(d.act, 'compose');
  assert.deepEqual(d.focus, { kind: 'story', subject: 'Buster the cat' }, 'the pop hands back the carried focus');
});

test('a digression follow-up REFINES the digression leaf, not the story', () => {
  clearFoldMemo();
  const fold = projectFold(busterThread(), { chatId: 'b5' });
  const d = bindTurn('and how do bakers knead the dough?', fold);
  assert.equal(d.move, 'refine');
  assert.equal(d.target, 'chat.0.0');
  assert.equal(d.act, 'ground');
});

test('the read SEEDS a live channel: cross-level coref pops on a compose-settling read', () => {
  clearFoldMemo();
  const fold = projectFold(busterThread(), { chatId: 'b6' });
  // "his name is buster" — props {name, buster}: the ancestor coupling (buster → 0.5) ties the
  // novelty channel (name → 0.5). The metacognition's compose-settling read seeds the LIVE
  // ancestor channel and the pop wins decisively — the read informs, the coupling decides.
  const read = { route: 'compose', abstained: false };
  const d = bindTurn('his name is buster', fold, { read });
  assert.equal(d.move, 'return');
  assert.equal(d.target, 'chat.0', 'pops to the frame that owns Buster');
});

test('a seed never resurrects a DEAD channel: compose read + zero coupling ≠ pop', () => {
  clearFoldMemo();
  const fold = projectFold(busterThread(), { chatId: 'b7' });
  // Nothing in this message couples to the composition (or anything in scope); a
  // compose-settling read alone must not manufacture a return out of a dead channel.
  const d = bindTurn('what temperature should the oven be?', fold, { read: { route: 'compose', abstained: false } });
  assert.ok(d.move !== 'return' || d.act !== 'compose', 'no pop without a real coupling');
});

test('after the enacted pop, the digression is SUSPENDED and the composition is active again', () => {
  clearFoldMemo();
  const thread = [
    ...busterThread(),
    user('ok, back to the story about my cat buster', { move: 'return', target: 'chat.0' }),
    compose('story', 'Buster the cat'),
  ];
  const fold = projectFold(thread, { chatId: 'b8' });
  assert.deepEqual(fold.stack.path, ['chat', 'chat.0'], 'the composition is the active leaf again');
  assert.deepEqual(fold.stack.suspended, ['chat.0.0'], 'the digression is parked, not closed');
  assert.equal(fold.stance, 'compose', 'the legacy stance follows the enacted turn');
});

// ---------------------------------------------------------------------------
// §3 — Confinement at the frame grain (docs/holonic-token-confinement.md, discourse side).

test('a digression\'s props and fetched sources stay CONFINED to the digression frame', () => {
  clearFoldMemo();
  const fold = projectFold(busterThread(), { chatId: 'b9' });
  const story = fold.frames[1], dig = fold.frames[2];
  assert.ok(dig.subject.includes('dough') && dig.subject.includes('bakers'));
  assert.ok(!story.subject.includes('dough') && !story.subject.includes('bakers'),
    'the sub-question\'s content does not enter the parent\'s subject set');
  assert.deepEqual(dig.sources, ['s:web1']);
  assert.deepEqual(story.sources, [], 'fetched pages stay in the child holon');
  // the GLOBAL warm channel is untouched by confinement (legacy parity — scope still unions it)
  assert.deepEqual(fold.warm.map((w) => w.ref), ['s:web1']);
});

test('a return with `carry` SYNs the named props up into the parent — the explicit join', () => {
  clearFoldMemo();
  const thread = [
    ...busterThread(),
    user('back to the story — and now buster kneads dough too', { move: 'return', target: 'chat.0', carry: ['dough'] }),
    compose('story', 'Buster the cat'),
  ];
  const fold = projectFold(thread, { chatId: 'b10' });
  const story = fold.frames[1];
  assert.ok(story.subject.includes('dough'), 'the carried prop joined the composition');
  assert.ok(!story.subject.includes('bakers'), 'everything NOT carried stays confined');
});

// ---------------------------------------------------------------------------
// §4 — Replay stability: the stack is a projection; re-folding recovers it.

test('re-projecting the same thread recovers the identical stack (persistence)', () => {
  const a = (clearFoldMemo(), projectFold(busterThread(), { chatId: 'b11' }));
  const b = (clearFoldMemo(), projectFold(busterThread(), { chatId: 'b11' }));
  assert.deepEqual(
    { path: a.stack.path, suspended: a.stack.suspended, frames: a.frames },
    { path: b.stack.path, suspended: b.stack.suspended, frames: b.frames },
  );
});

// ---------------------------------------------------------------------------
// §5 — The app wiring, pinned in BOTH shipped copies (the frame-bind.test.js discipline).

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

for (const page of ['src/reader/app.dc.js', 'index.html']) {
  const src = readFileSync(join(root, page), 'utf8');

  test(`${page}: the pop and the push are wired through the fold's stack`, () => {
    // the pop: sendChat consults the bind before the compose fork and re-enters the composition
    assert.match(src, /this\._bindReturn\(q,fold,read\)/, `${page} does not consult the bind for the pop`);
    assert.match(src, /_tagUserFrame\(id,\{move:'return',target:pop\.id\}\)/, `${page} does not record the enacted return`);
    // the push: leaving a composing thread records the digression frame instead of losing the stance
    assert.match(src, /if\(fold\.stance==='compose'\)this\._tagUserFrame\(id,\{move:'push'\}\)/,
      `${page} does not record the push when a turn leaves compose`);
    // the pop re-enters with the popped frame's carried focus, reusing the one bubble
    assert.match(src, /this\.composeArtifact\(q,rfold,\{reuseId:id,focus:pop\.focus\|\|undefined\}\)/,
      `${page} does not re-enter compose on the pop with the carried focus`);
  });
}

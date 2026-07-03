import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseText } from '../src/perceiver/parse/index.js';
import { trajectory, threadBasis, surfFold } from '../src/surfer/index.js';
import {
  turnWeights, arcGravity, speakArc, arcLines, connectiveLeash, talkThenVerify, phraserBrief, assembleBrief,
} from '../src/write/index.js';
import { buildGroundedMessages } from '../src/model/index.js';
import { stages } from '../src/turn/stages.js';

// The weight of the turn (write/gravity.js): the surf computes a reading's dynamics —
// where it was rewritten, how hard, how much each stop matters to the thread — and used
// to discard them at the cell boundary. These tests hold the broadcast to its own law:
// a turn is rendered only where a REC actually fired, the heaviest form goes only to the
// strongest turn, a connective the arc does not license is flagged, and with no turn on
// the log every surface is byte-identical to the flat one.

// A synthetic operator log with a real arc: two phases split at order 2 (the turn).
// Same shape trajectory.test.js proves omnimodal — no parse needed, the arc is the log's.
const ARC_DOC = () => ({
  log: { snapshot: () => [
    { op: 'INS', id: 1, label: 'Grete' },
    { op: 'INS', id: 2, label: 'Gregor' },
    { op: 'CON', src: 1, tgt: 2, via: 'fed', sentIdx: 0 },
    { op: 'CON', src: 1, tgt: 2, via: 'tended', sentIdx: 1 },
    { op: 'CON', src: 1, tgt: 2, via: 'renounced', sentIdx: 3 },
  ] },
});

// The surf reading behind it: one REC at cursor 2, where the surprise spikes.
const ARC_SURF = () => ({
  recCursors: [2],
  field: [
    { idx: 0, bayes: 0.10 }, { idx: 1, bayes: 0.12 },
    { idx: 2, bayes: 0.90 }, { idx: 3, bayes: 0.15 },
  ],
});

const ARC = () => arcGravity(
  trajectory(ARC_DOC(), { focus: 'Grete', segments: [2] }),
  { surf: ARC_SURF() },
);

// ── move 4: the rewrite magnitude ─────────────────────────────────────────────

test('turnWeights reads the rewrite magnitude off the surf field — heaviest at the spike', () => {
  const w = turnWeights({
    recCursors: [2, 5],
    field: [
      { idx: 0, bayes: 0.1 }, { idx: 1, bayes: 0.1 }, { idx: 2, bayes: 0.9 },
      { idx: 3, bayes: 0.1 }, { idx: 4, bayes: 0.1 }, { idx: 5, bayes: 0.3 },
    ],
  });
  assert.equal(w.length, 2);
  const at2 = w.find(t => t.cursor === 2);
  const at5 = w.find(t => t.cursor === 5);
  assert.equal(at2.weight, 1, 'the strongest turn weighs 1 (normalised)');
  assert.ok(at5.weight > 0 && at5.weight < at2.weight, 'the lighter turn weighs less — gravity is a distribution');
});

test('turnWeights with no field (the EOT path) keeps the turns, unweighted', () => {
  const w = turnWeights({ recCursors: [2], field: [] });
  assert.equal(w.length, 1);
  assert.equal(w[0].weight, 0, 'a turn with no measured field is real but carries no magnitude');
});

// ── move 1: the arc lifted ────────────────────────────────────────────────────

test('arcGravity lifts the trajectory into a weighted arc and finds the heaviest turn', () => {
  const arc = ARC();
  assert.equal(arc.focus, 'Grete');
  assert.equal(arc.phases.length, 2, 'two phases, split at the REC');
  assert.equal(arc.heaviest, 2, 'the heaviest turn is the surprise spike');
  assert.equal(arc.turns[0].weight, 1);
});

test('arcGravity subordinates off-thread relations below the thread — marked, never erased', () => {
  const doc = {
    log: { snapshot: () => [
      { op: 'INS', id: 1, label: 'Grete' },
      { op: 'INS', id: 2, label: 'Gregor' },
      { op: 'INS', id: 3, label: 'Klamm' },
      { op: 'CON', src: 1, tgt: 2, via: 'fed', sentIdx: 0 },
      { op: 'CON', src: 1, tgt: 3, via: 'greeted', sentIdx: 1 },
      { op: 'CON', src: 1, tgt: 2, via: 'renounced', sentIdx: 3 },
    ] },
  };
  const traj = trajectory(doc, { focus: 'Grete', segments: [2] });
  const thread = { figures: new Set(['grete', 'gregor']) };   // the live conversation is about these two
  const arc = arcGravity(traj, { surf: { recCursors: [2], field: [] }, thread });
  const flat = arc.phases.flatMap(ph => ph.relations);
  const offThread = flat.find(r => r.other === 'Klamm');
  const onThread = flat.find(r => r.via === 'fed');
  assert.equal(offThread.subordinate, true, 'the Klamm bond lies off the thread — subordinated');
  assert.equal(onThread.subordinate, false, 'the Gregor bond lies along it — spoken');
  assert.ok(arc.subordinated >= 1, 'the subordination is on the record, not silent');
});

// ── move 2: the turn voiced ───────────────────────────────────────────────────

test('speakArc voices the turn as a turn, carrying the superseded reading forward', () => {
  const said = speakArc(ARC(), { genders: { Grete: 'f' } });
  assert.match(said, /^At first, Grete fed Gregor and tended Gregor\./, 'the first phase opens the arc');
  assert.match(said, /Then, where she had (fed|tended) Gregor, she renounced Gregor\./,
    'the heaviest turn gets the supersession form — the abandoned reading carried forward as what the new one rose out of');
});

test('a lighter turn gets plain sequence — the heavy form is reserved for the strongest', () => {
  // three phases, two turns: the spike at 2 is the heavy one, the turn at 5 is light.
  const doc = {
    log: { snapshot: () => [
      { op: 'INS', id: 1, label: 'Grete' },
      { op: 'INS', id: 2, label: 'Gregor' },
      { op: 'CON', src: 1, tgt: 2, via: 'fed', sentIdx: 0 },
      { op: 'CON', src: 1, tgt: 2, via: 'renounced', sentIdx: 3 },
      { op: 'CON', src: 1, tgt: 2, via: 'mourned', sentIdx: 6 },
    ] },
  };
  const surf = {
    recCursors: [2, 5],
    field: [
      { idx: 0, bayes: 0.1 }, { idx: 1, bayes: 0.1 }, { idx: 2, bayes: 0.9 },
      { idx: 3, bayes: 0.1 }, { idx: 4, bayes: 0.1 }, { idx: 5, bayes: 0.3 }, { idx: 6, bayes: 0.1 },
    ],
  };
  const arc = arcGravity(trajectory(doc, { focus: 'Grete', segments: [2, 5] }), { surf });
  const said = speakArc(arc, { genders: { Grete: 'f' } });
  assert.match(said, /Then, where she had fed Gregor, she renounced Gregor\./, 'the strong turn carries the weight');
  assert.match(said, /Then she mourned Gregor\./, 'the light turn takes plain sequence — not everything is heavy');
});

test('with no turn on the log speakArc is silent — a turn is only rendered where a REC fired', () => {
  const doc = ARC_DOC();
  const traj = trajectory(doc, { focus: 'Grete', segments: [] });   // no REC → one phase
  assert.equal(speakArc(arcGravity(traj, {}), {}), null, 'no movement to voice; the flat surface stands');
});

test('the supersession form is an eva convention: past its breath it breaks to the safe surface', () => {
  // the turn phase carries FIVE predicates — past the read-back cap, the compound cannot
  // be held in one breath, so the rule breaks and the renderer falls back to plain sequence.
  const events = [
    { op: 'INS', id: 1, label: 'Grete' },
    { op: 'INS', id: 2, label: 'Gregor' },
    { op: 'CON', src: 1, tgt: 2, via: 'fed', sentIdx: 0 },
    ...['renounced', 'denounced', 'shunned', 'avoided', 'dismissed']
      .map((via, i) => ({ op: 'CON', src: 1, tgt: 2, via, sentIdx: 3 + i })),
  ];
  const doc = { log: { snapshot: () => events } };
  const arc = arcGravity(trajectory(doc, { focus: 'Grete', segments: [2] }), {
    surf: { recCursors: [2], field: [{ idx: 0, bayes: 0.1 }, { idx: 2, bayes: 0.9 }] },
  });
  const said = speakArc(arc, { genders: { Grete: 'f' } });
  assert.doesNotMatch(said, /where she had/, 'the heavy form did not commit — the read-back broke it');
  assert.match(said, /Then she renounced Gregor/, 'the safe surface: plain sequence, no claimed weight');
});

// ── the prompt block ──────────────────────────────────────────────────────────

test('arcLines renders the arc as a plain-language block with weighted turns — no codes', () => {
  const block = arcLines(ARC());
  assert.match(block, /How the reading moved on Grete/, 'the block names the focus in surface words');
  assert.match(block, /fed Gregor, tended Gregor/, 'the first phase relations');
  assert.match(block, /the strongest — weight 1\.00/, 'the turn carries its measured weight');
  assert.match(block, /renounced Gregor/, 'the later phase');
  assert.doesNotMatch(block, /CON|REC|sentIdx/, 'no operator codes reach the talker (surface discipline)');
});

test('arcLines is empty with no turn — the byte-identical default', () => {
  const traj = trajectory(ARC_DOC(), { focus: 'Grete', segments: [] });
  assert.equal(arcLines(arcGravity(traj, {})), '');
});

// ── move 3: the connective leash ──────────────────────────────────────────────

test('connectiveLeash licenses contrast and sequence against the arc, never cause', () => {
  const arc = ARC();
  const leash = connectiveLeash(
    'At first Grete fed Gregor, but then she renounced him. Therefore she never loved him.', arc);
  const byKind = (k) => leash.claims.filter(c => c.kind === k);
  assert.ok(byKind('contrast').every(c => c.licensed), 'a contrast is licensed — a turn is on the log');
  assert.ok(byKind('sequence').every(c => c.licensed), 'a sequence is licensed — the arc holds an order');
  const cause = byKind('cause');
  assert.ok(cause.length >= 1 && cause.every(c => !c.licensed),
    'a therefore is a claimed edge the arc never holds — flagged');
  assert.equal(leash.clean, false);
});

test('a contrast with no turn behind it is an unbound claim', () => {
  const turnless = arcGravity(trajectory(ARC_DOC(), { focus: 'Grete', segments: [] }), {});
  const leash = connectiveLeash('Grete fed Gregor, but she renounced him.', turnless);
  assert.ok(leash.unlicensed.some(c => c.connective === 'but'),
    'a rendered "but" with no REC on the log does not correspond to anything the reading did');
});

test('talkThenVerify runs the leash when an arc is in hand — unearned gravity is caught', async () => {
  const doc = parseText('Grete fed Gregor. Grete renounced Gregor.', { docId: 'g' });
  const brief = phraserBrief(doc, {});
  const arc = ARC();
  const honest = { async phrase() { return 'At first Grete fed Gregor; then she renounced him.'; } };
  const grandiose = { async phrase() { return 'Grete fed Gregor, and therefore she renounced him.'; } };
  const h = await talkThenVerify(brief, honest, { doc, arc });
  assert.equal(h.connectives.clean, true, 'at-first/then is the arc, rendered — licensed');
  const g = await talkThenVerify(brief, grandiose, { doc, arc });
  assert.equal(g.connectives.clean, false, 'the therefore is unlicensed');
  assert.equal(g.clean, false, 'and it costs the verdict');
});

// ── the broadcast, end to end ─────────────────────────────────────────────────

test('assembleBrief broadcasts the arc: the draft voices the movement, the prompt carries the block', () => {
  const doc = parseText(readFileSync('data/metamorphosis.txt', 'utf8'), { docId: 'm', genderCoref: true });
  const b = assembleBrief(doc, { question: "How does Grete's feeling toward Gregor change?", history: [] });
  assert.ok(b.arc, 'the lifted arc rides the brief');
  assert.ok(b.arc.turns.length >= 1, 'with turns from the surf');
  assert.match(b.draft, /^At first,/, 'the no-LLM draft opens with the arriving-at, not a flat list');
  assert.match(b.prompt.user, /How the reading moved/, 'the talker prompt carries the arc block');
  assert.match(b.prompt.system, /at first…, then…|at first/i, 'and the system prompt teaches turn-rendering');
  assert.match(b.prompt.system, /never causes/, 'with the leash stated: order and turns, never causes');
});

test('with no focus or no turn, assembleBrief is the flat brief it always was', () => {
  const doc = parseText('Anna saw Ben. Anna trusted Ben.', { docId: 'd' });
  const b = assembleBrief(doc, {});
  assert.doesNotMatch(b.draft, /^At first,/, 'no turn on the log → no rendered turn');
  assert.doesNotMatch(b.prompt.user, /How the reading moved/, 'no arc block');
});

test('buildGroundedMessages carries the arc block opt-in and is byte-identical without it', () => {
  const args = { question: 'How does she change?', spans: [{ idx: 0, text: 'Grete fed Gregor.' }] };
  const bare = buildGroundedMessages(args);
  const withArc = buildGroundedMessages({ ...args, arc: arcLines(ARC()) });
  assert.match(withArc[1].content, /How the reading moved on Grete/, 'the arc rides the window');
  assert.match(withArc[1].content, /never causes/, 'with the leash cue beside it');
  assert.deepEqual(buildGroundedMessages(args), bare, 'no arc → byte-identical');
  assert.doesNotMatch(bare[1].content, /How the reading moved/);
});

test('the prompt stage broadcasts the arc only behind the flag (byte-identical off)', async () => {
  const doc = parseText(readFileSync('data/metamorphosis.txt', 'utf8'), { docId: 'm', genderCoref: true });
  const surf = surfFold(doc, 11, {
    reach: 'adaptive',
    thread: threadBasis({ query: "How does Grete's feeling toward Gregor change?", doc }),
  });
  const base = {
    route: 'grounded', question: "How does Grete's feeling toward Gregor change?",
    doc, surf, spans: [], history: [], task: 'answer', grounding: 'auto',
  };
  const off = await stages.prompt({ ...base });
  const on  = await stages.prompt({ ...base, broadcastArc: true });
  assert.doesNotMatch(off.promptText, /How the reading moved/, 'flag off → the window is untouched');
  assert.match(on.promptText, /How the reading moved/, 'flag on → the surf dynamics reach the talker');
  assert.equal(on.arcBlock.length > 0, true, 'and the audit can see the block rode');
});

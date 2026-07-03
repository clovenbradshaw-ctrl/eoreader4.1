// essay-backwards — the SELF register decouples essay length from span exhaustion.
//
// Working backwards from a real essay (docs/essay-backwards.md) showed ~75% of its
// atoms consume no fresh external span: they operate on prior atoms. The resolver
// before could only spend ground, so an edge op with the pool spent returned null and
// the loop stopped with `ground-exhausted`. These tests pin the fix: with the SELF
// register on, an edge op resolves against the accepted units, inheriting their ground
// and adding no new coverage — and the default (register off) behavior is untouched.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveProposition, STANCE, EDGE_OPS, predictDirection } from '../src/longgen/index.js';
import { propositionInstruction, fieldStrain, runContinuation } from '../src/longgen/index.js';
import { createModel } from '../src/model/interface.js';
import '../src/model/echo.js';

// A three-span ground pool, and a run of accepted units that already fired on it — the
// SELF the edge ops operate on. Each unit carries the source idxs it cited (its ground).
const groundOf = () => ([
  { idx: 0, score: 0.9, text: 'A small model is fluent past its knowledge.' },
  { idx: 1, score: 0.7, text: 'Handed a gap, it fills the gap.' },
  { idx: 2, score: 0.5, text: 'The fill is confident and often wrong.' },
]);
const unitsOf = () => ([
  { i: 0, move: 'DEF', subClaim: 'a small model is fluent past its knowledge', sources: [0], boundFraction: 1 },
  { i: 1, move: 'CON', subClaim: 'handed a gap it fills the gap', sources: [1], boundFraction: 1 },
  { i: 2, move: 'CON', subClaim: 'the fill is confident and often wrong', sources: [2], boundFraction: 0.4 },
]);
const ALL_COVERED = new Set([0, 1, 2]);

// ── The decoupling: an edge op resolves with the external pool fully spent ─────

test('EVA with the pool spent: OFF → ground-exhausted (null); ON → a self-op', () => {
  const ground = groundOf();
  const units = unitsOf();

  // The old behavior — every span covered, an EVA has no fresh span, so null. This is
  // exactly the `ground-exhausted` stop the loop reads ~3 atoms into an essay.
  const off = resolveProposition({ move: 'EVA', ground, covered: ALL_COVERED, units });
  assert.equal(off, null, 'without the self register, a spent pool yields no proposition');

  // The fix — the EVA resolves against the SELF, inheriting the last atom's ground.
  const on = resolveProposition({ move: 'EVA', ground, covered: ALL_COVERED, units, selfRegister: true });
  assert.ok(on, 'with the self register, the edge op still resolves');
  assert.equal(on.selfOp, true);
  assert.equal(on.move, 'EVA');
  assert.equal(on.stance, STANCE.EVA);
  assert.ok(on.against, 'an EVA tests the last claim against the frame the opening set');
});

test('a self-op inherits already-covered spans and adds no new coverage', () => {
  const ground = groundOf();
  const units = unitsOf();
  const p = resolveProposition({ move: 'EVA', ground, covered: ALL_COVERED, units, selfRegister: true });
  // Its spanSet is inherited from the atom it operates on (idx 2, the last unit) and is
  // ALREADY covered — so adding it to `covered` in the loop advances coverage by nothing.
  assert.deepEqual(p.spanSet, [2]);
  for (const idx of p.spanSet) assert.ok(ALL_COVERED.has(idx), 'inherited spans are already covered');
});

test('REC recasts the most-strained atom (the weld) against the frame', () => {
  const ground = groundOf();
  const units = unitsOf();                       // unit 2 has boundFraction 0.4 — the strained one
  const p = resolveProposition({ move: 'REC', ground, covered: ALL_COVERED, units, selfRegister: true });
  assert.equal(p.selfOp, true);
  assert.equal(p.move, 'REC');
  assert.equal(p.recast, true);
  assert.equal(p.spanSet[0], 2, 'the recast turns on the atom that drifted');
  // The prompt names a RELATION between two ideas, not one fresh fact.
  const suffix = propositionInstruction(p);
  assert.match(suffix, /recasting/);
});

test('SYN closes over the self — the union of the fired atoms\' spans, no new coverage', () => {
  const ground = groundOf();
  const units = unitsOf();
  const p = resolveProposition({ move: 'SYN', ground, covered: ALL_COVERED, units, selfRegister: true });
  assert.equal(p.selfOp, true);
  assert.equal(p.closes, true, 'a SYN over the self lands the arc');
  assert.ok(p.spanSet.length >= 2, 'it closes over at least two constituents');
  for (const idx of p.spanSet) assert.ok(ALL_COVERED.has(idx));
});

test('EDGE_OPS is exactly the self register alphabet', () => {
  assert.deepEqual([...EDGE_OPS].sort(), ['EVA', 'NUL', 'REC', 'SYN']);
});

// ── The default is untouched: register off ⇒ span-walk, byte-for-byte ─────────

test('register OFF preserves the existing contract: EVA consumes the next uncovered span', () => {
  const ground = groundOf();
  const covered = new Set([0]);                   // span 0 has fired; 1 and 2 are free
  const p = resolveProposition({ move: 'EVA', ground, covered });   // no selfRegister
  assert.equal(p.selfOp, undefined, 'the default resolution is not a self-op');
  assert.equal(p.spanSet[0], 1, 'it still grabs the next uncovered span, as before');
  assert.ok(p.against, 'and still carries a prior term to test against');
});

// ── The self-fold: semantic strain licenses REC on CLEAN-binding prose ────────
//
// The weld before read strain only off the floor's bind verdict (1 − boundFraction).
// But the floor drops or re-binds drift, so every APPENDED unit binds ~1.0 and strain
// is ~0 — REC (the argument's turn) could never fire in the live loop. The self-fold
// reads a second strain: how far the grounded material has moved from its frame. A
// clean-binding EVA that opens a NEW direction must raise REC mass over one that
// restates the frame — and the OLD path (no self-fold) must be blind to the difference.

const recMass = (units, opts) =>
  Object.fromEntries(predictDirection(units, opts).posterior).REC;

test('self-fold: a clean EVA that turns raises REC mass; restating it does not', () => {
  // Both runs bind perfectly clean (boundFraction 1) — the floor sees nothing wrong.
  const restating = [
    { move: 'DEF', boundFraction: 1, sources: [0], text: 'alpha beta gamma frame terms' },
    { move: 'EVA', boundFraction: 1, sources: [0], text: 'alpha beta gamma again restated' },
  ];
  const turning = [
    { move: 'DEF', boundFraction: 1, sources: [0], text: 'alpha beta gamma frame terms' },
    { move: 'EVA', boundFraction: 1, sources: [1], text: 'delta epsilon zeta wholly other direction' },
  ];

  // With the self-fold ON, the turning EVA strains the frame → more REC mass.
  const turnRec = recMass(turning, { semanticStrain: true });
  const stayRec = recMass(restating, { semanticStrain: true });
  assert.ok(turnRec > stayRec, 'the self-fold licenses REC where the argument turns');

  // With the self-fold OFF, both bind clean → identical strain (0) → identical REC.
  // This is the failure the self-fold fixes: the old path is blind to a clean turn.
  const turnRecOff = recMass(turning, {});
  const stayRecOff = recMass(restating, {});
  assert.equal(turnRecOff, stayRecOff, 'without the self-fold, a clean turn is invisible');
});

// ── The field read: the turn (REC) as a boundary in the generated field ───────
//
// generation-by-field-reading.md — read the accepted atoms back as a density field and
// find the turn where the field rotates (atmosphere/paradigm cleared by the Born void),
// gated by the geography abstention. This is the principled form of the lexical self-fold.
// A clean embedder that tags atoms by topic isolates the DETECTOR from the weak hash
// organ: a genuine A|B turn must fire a boundary at the turn; a flat field must abstain.

const topicEmbed = async (t) => {                 // e0 for topic A, e1 for topic B
  const v = new Array(16).fill(0);
  v[/beta|two|second|planner|ground/.test(t) ? 1 : 0] = 1;
  return v;
};

test('fieldStrain locates a turn: an A|B field boundary lands at the turn, not the frontier', async () => {
  const A = ['alpha one', 'alpha first term', 'alpha again here', 'alpha still'];
  const B = ['beta two', 'beta second term', 'beta other way', 'beta onward'];
  const units = [...A, ...B].map((t, i) => ({ text: t, sources: [i], boundFraction: 1, move: 'CON' }));
  const f = await fieldStrain(units, { embed: topicEmbed, window: 3 });
  assert.ok(f.boundaries.length >= 1, 'the turn is detected');
  // the cut sits at the A|B seam (cursor 4), not spuriously at the rank-1 frontier
  assert.ok(f.boundaries.some((b) => Math.abs(b - 4) <= 1), `boundary near the seam, got ${JSON.stringify(f.boundaries)}`);
});

test('fieldStrain abstains on a flat field: no turn, geography reads one reading', async () => {
  const units = Array.from({ length: 8 }, (_, i) => ({ text: 'alpha one same', sources: [i], boundFraction: 1, move: 'CON' }));
  const f = await fieldStrain(units, { embed: topicEmbed, window: 3 });
  assert.equal(f.boundaries.length, 0, 'a flat field turns nowhere');
  assert.equal(f.abstain, true, 'and the geography abstains (the principled quiesce)');
});

test('the field read closes the loop: a turning ground fires a REC and lands a SYN', async () => {
  const model = createModel('echo');
  await model.load();
  const ground = [
    { idx: 0, score: 0.95, text: 'a small model is fluent past its knowledge' },
    { idx: 1, score: 0.90, text: 'handed a gap the model will fill the gap' },
    { idx: 2, score: 0.85, text: 'the fill is fluent and often wrong' },
    { idx: 3, score: 0.80, text: 'a planner decides every structural move first' },
    { idx: 4, score: 0.75, text: 'the planner grounds each claim on a span' },
    { idx: 5, score: 0.70, text: 'a floor truncates whatever fails to bind' },
    { idx: 6, score: 0.65, text: 'across messages the state persists and resumes' },
    { idx: 7, score: 0.60, text: 'the resumed session widens the running fold' },
  ];
  const res = await runContinuation({
    ground, model, arc: true, temperature: 1, maxSteps: 40,
    selfRegister: true, fieldRead: true, embed: topicEmbed, interleave: true,
  });
  const moves = res.units.map((u) => u.move);
  assert.ok(moves.includes('REC'), `a turn fires where the field rotates: ${moves.join(' ')}`);
  // the REC is a self-op restructure, and it comes after a develop (an EVA), per the schedule
  const ri = moves.indexOf('REC');
  assert.equal(moves[ri - 1], 'EVA', 'the turn lands right after a develop beat');
});

test('a node op never self-resolves, even with the register on', () => {
  const ground = groundOf();
  const units = unitsOf();
  // CON is a node op — with the pool spent it is honestly ground-exhausted even ON,
  // because a node op introduces fresh external material and there is none left.
  const p = resolveProposition({ move: 'CON', ground, covered: ALL_COVERED, units, selfRegister: true });
  assert.equal(p, null, 'the self register frees the EDGE ops only; node ops still spend the pool');
});

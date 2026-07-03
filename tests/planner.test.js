import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  runContinuation, resolveProposition, STANCE,
  classifyWantedType, groundSupplies, answerabilityGate, refusalAtom,
  developableRegions, followUpOffer,
  arcPhase, phaseBias, applyPhaseBias, shouldCollapse,
  atomPrompt, stablePrefix, prefixCacheKey, readWindow, propositionInstruction, speculateNext,
  generate, plainPath, compareModes, predictDirection,
} from '../src/longgen/index.js';
import { groundSaturation } from '../src/arc/index.js';
import { createModel } from '../src/model/interface.js';
import '../src/model/echo.js';

// A ground pool of ranked spans — the planner's supply. Echo phrases a section back
// as its span text verbatim, so each grounded unit binds cleanly against its span.
const groundOf = () => ([
  { idx: 0, score: 0.9, text: 'The orchard keeper waters the apple trees at dawn each morning.' },
  { idx: 1, score: 0.7, text: 'A cyclist repairs the broken wheel beside the country road.' },
  { idx: 2, score: 0.5, text: 'The telescope reveals a faint galaxy near the horizon at night.' },
]);

// ── §4.2 Site face: the resolver HONORS the operator ─────────────────────────

test('resolveProposition honors the operator: EVA evaluates a particular against a prior term', () => {
  const ground = groundOf();
  const covered = new Set([0]);                 // span 0 has already fired
  const p = resolveProposition({ move: 'EVA', ground, covered });
  assert.equal(p.move, 'EVA');
  assert.equal(p.stance, STANCE.EVA, 'the stance is the evaluation stance, not a bare assert');
  assert.equal(p.band, 'firm');
  assert.ok(p.against, 'an EVA tests against a term the frame already set');
  assert.equal(p.spanSet[0], 1, 'the particular is the next uncovered span');
});

test('resolveProposition: SYN closes a holon over the constituents that have fired', () => {
  const ground = groundOf();
  const covered = new Set([0, 1]);              // two constituents have fired
  const p = resolveProposition({ move: 'SYN', ground, covered });
  assert.equal(p.stance, STANCE.SYN);
  assert.equal(p.closes, true, 'a SYN with constituents to close over lands the arc');
  assert.deepEqual(p.spanSet.sort(), [0, 1], 'it cites the fired constituents, not a fresh span');
});

test('VOID is a SITE, not a stop: resolving VOID is a deposit with band=void (spec §2)', () => {
  const ground = groundOf();
  const p = resolveProposition({ move: 'VOID', ground, covered: new Set() });
  assert.ok(p, 'VOID resolves to a proposition — it is a deposit, never a refusal');
  assert.equal(p.band, 'void', 'a void-site deposit carries the void band so a synthesis over it hedges');
  assert.equal(p.stance, STANCE.VOID);
  assert.match(p.subClaim, /^whether /, 'it asserts the absence rather than fixing it');
});

test('resolveProposition stays back-compatible: CON takes the strongest unspent edge', () => {
  const p = resolveProposition({ move: 'CON', ground: groundOf(), covered: new Set() });
  assert.equal(p.spanSet[0], 0);
  assert.equal(p.band, 'firm');
  assert.ok(p.ceiling >= p.floor);
});

// ── §3 the answerability gate: the walk is licensed, not assumed ──────────────

test('classifyWantedType reads what the question wants', () => {
  assert.equal(classifyWantedType('How do I get to the trailhead?'), 'route');
  assert.equal(classifyWantedType('What is photosynthesis?'), 'definition');
  assert.equal(classifyWantedType('Compare the two reports.'), 'comparison');
  assert.equal(classifyWantedType('Summarize this document.'), 'summary');
  assert.equal(classifyWantedType('List the ingredients.'), 'list');
  assert.equal(classifyWantedType('Who wrote it?'), 'fact');
});

// The worked failure (spec §3): a directions question against a corpus that holds an
// address, a "seven miles out by a trail" sentence, and a map link — but NO route.
const directionsGround = () => ([
  { idx: 0, score: 0.8, text: 'The preserve is located at 4120 Canyon Road.' },
  { idx: 1, score: 0.6, text: 'It lies about seven miles out and is reachable by a forest trail.' },
  { idx: 2, score: 0.5, text: 'A map of the area is available at example.org/map.' },
]);

test('the gate refuses a directions question the ground cannot answer in shape', () => {
  const gate = answerabilityGate({ question: 'How do I drive there?', ground: directionsGround() });
  assert.equal(gate.licensed, false, 'no route in the ground → the walk is not licensed');
  assert.equal(gate.wantedType, 'route');
  assert.equal(gate.reason, 'no-route');
  assert.match(gate.refusal.text, /do not contain/);
  assert.match(gate.refusal.text, /directions or a route/);
  assert.ok(gate.refusal.sources.length, 'the refusal still cites what the ground DOES hold');
});

test('the inflated sectioned answer does not reproduce under the gate (spec §13)', async () => {
  const model = createModel('echo'); await model.load();
  const res = await runContinuation({
    ground: directionsGround(), model, arc: true,
    question: 'How do I drive there?',
  });
  assert.equal(res.stop, 'unanswerable');
  assert.equal(res.units.length, 1, 'one refusal atom and nothing more — not three sections');
  assert.equal(res.followUp, '', 'no follow-up offer to confabulate next turn');
});

test('groundSupplies licenses a route when the ground holds movement steps', () => {
  const routeGround = [
    { idx: 0, score: 0.8, text: 'Turn left onto Highway 9 and continue two miles past the river.' },
    { idx: 1, score: 0.7, text: 'Head north toward the ridge until you reach the trailhead road.' },
  ];
  assert.deepEqual(groundSupplies('route', routeGround), { ok: true, reason: null });
  assert.equal(groundSupplies('route', directionsGround()).ok, false);
});

test('the follow-up offer names only developable regions, none when all are thin', () => {
  const thin = [{ idx: 0, score: 0.1, text: 'short' }];
  assert.equal(followUpOffer(thin, new Set()), '', 'a thin region is not offered — that would invite confabulation');
  const rich = groundOf();
  const offer = followUpOffer(rich, new Set([0]));
  assert.match(offer, /go deeper/);
  assert.equal(developableRegions(rich, new Set([0])).every(r => r.idx !== 0), true, 'covered regions are not re-offered');
});

// ── §8 the significance arc ──────────────────────────────────────────────────

test('arcPhase reads open → develop → land off the state, not a shelf', () => {
  assert.equal(arcPhase({ stepIndex: 0, units: [], remainingFrac: 1 }), 'open');
  assert.equal(arcPhase({ stepIndex: 1, units: [{}], remainingFrac: 0.6 }), 'develop');
  assert.equal(arcPhase({ stepIndex: 3, units: [{}, {}], remainingFrac: 0.1 }), 'land');
});

test('applyPhaseBias leans the posterior toward the phase and renormalises', () => {
  const post = [['CON', 0.3], ['EVA', 0.2], ['SYN', 0.1], ['DEF', 0.1], ['INS', 0.1],
    ['SIG', 0.1], ['REC', 0.05], ['NUL', 0.03], ['SEG', 0.01], ['VOID', 0.01]];
  const landed = applyPhaseBias(post, phaseBias('land'));
  const sum = landed.reduce((s, [, p]) => s + p, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, 'a real distribution after the lean');
  const synRank = landed.findIndex(([op]) => op === 'SYN');
  const synBase = post.findIndex(([op]) => op === 'SYN');
  assert.ok(synRank < synBase, 'the land phase ranks SYN up');
});

test('a thin answer collapses to one atom (the arc floor on thin ground, spec §8/§13)', async () => {
  const model = createModel('echo'); await model.load();
  const oneSpan = [{ idx: 0, score: 0.9, text: 'The single fact the document records about the matter.' }];
  const res = await runContinuation({ ground: oneSpan, model, arc: true });
  assert.equal(res.units.length, 1, 'nothing to develop → one atom, no padding');
  assert.equal(shouldCollapse({ units: res.units, remainingFrac: 0 }), true);
});

// ── §10 the saturation threshold — the one knob that sets shape ───────────────

test('groundSaturation measures the uncovered budget off the ranked pool', () => {
  const ground = groundOf();                              // total mass 2.1
  assert.equal(groundSaturation(ground, new Set()).saturated, false);
  const sat = groundSaturation(ground, new Set([0, 1]));  // 1.6 covered, 0.5 left
  assert.ok(Math.abs(sat.remainingFrac - (0.5 / 2.1)) < 1e-9);
});

test('saturation stops the walk before it re-cites the dregs (spec §10)', async () => {
  const model = createModel('echo'); await model.load();
  // One heavy span, two negligible ones: after the heavy span the uncovered mass is
  // below EPSILON, so the walk stops rather than padding with the dregs.
  const ground = [
    { idx: 0, score: 10, text: 'The principal finding the report sets out in its opening.' },
    { idx: 1, score: 0.1, text: 'a negligible aside of no real weight here' },
    { idx: 2, score: 0.1, text: 'another negligible aside carrying nothing' },
  ];
  const res = await runContinuation({ ground, model });
  assert.equal(res.stop, 'saturated', 'the budget knob, not a token count, ended it');
  assert.equal(res.units.length, 1);
});

// ── §6/§9 the prompt contract and speculation ────────────────────────────────

test('atomPrompt puts the proposition LAST and keeps the prefix stable (the caching constraint)', () => {
  const fold = { notes: 'They asked about the orchard; we established it is tended at dawn.' };
  const propA = resolveProposition({ move: 'CON', ground: groundOf(), covered: new Set() });
  const propB = resolveProposition({ move: 'CON', ground: groundOf(), covered: new Set([0]) });
  const a = atomPrompt({ fold, units: [], proposition: propA });
  const b = atomPrompt({ fold, units: [{ text: 'first atom.' }], proposition: propB });
  assert.equal(a.cacheKey, b.cacheKey, 'the stable prefix does not move between atoms → the prefill caches');
  assert.notEqual(prefixCacheKey(stablePrefix({ fold })), prefixCacheKey(stablePrefix({ fold: { notes: 'different' } })));
  assert.match(a.suffix, /Write one sentence/, 'the volatile suffix is the one proposition');
});

test('propositionInstruction renders a void-site atom as held-open, not asserted', () => {
  const voidProp = resolveProposition({ move: 'VOID', ground: groundOf(), covered: new Set() });
  const instr = propositionInstruction(voidProp);
  assert.match(instr, /holds open/);
  assert.match(instr, /do not assert it/);
});

test('readWindow returns the prose tail for the seam, witnessed not re-bound', () => {
  const win = readWindow([{ text: 'one.' }, { text: 'two.' }, { text: 'three.' }], 2);
  assert.equal(win, 'two. three.');
});

test('speculateNext pre-resolves the next move on a clean-verdict assumption (parity with the loop)', () => {
  const ground = groundOf();
  const prop0 = resolveProposition({ move: 'CON', ground, covered: new Set() });   // step 0 deposit
  const spec = speculateNext({ units: [], proposition: prop0, ground, covered: new Set() });
  // The real loop, after a clean step 0, would draw from [the clean unit 0] and resolve.
  const cleanUnit0 = { move: prop0.move, boundFraction: 1, sources: prop0.spanSet };
  const realDir = predictDirection([cleanUnit0]);
  const realNext = resolveProposition({ move: realDir.move, ground, covered: new Set(prop0.spanSet) });
  assert.equal(spec.move, realDir.move, 'the speculated move matches the move the loop will draw');
  assert.deepEqual(spec.proposition.spanSet, realNext.spanSet, 'and the speculated proposition matches');
});

// ── §11 the settings toggle, and its measurement ─────────────────────────────

test('generate dispatches planner ON (multi-prompt) vs OFF (plain path)', async () => {
  const model = createModel('echo'); await model.load();
  const on = await generate({ planner: true, ground: groundOf(), model });
  assert.equal(on.mode, 'planner');
  assert.ok(on.units.length >= 1);

  const off = await generate({ planner: false, ground: groundOf(), model });
  assert.equal(off.mode, 'plain');
  assert.equal(off.units.length, 1, 'one free generation, not an atom walk');
  assert.ok(off.answer.length > 0);
});

test('the plain path keeps the void gate underneath — it still refuses an unanswerable type', async () => {
  const model = createModel('echo'); await model.load();
  const res = await plainPath({ ground: directionsGround(), model, question: 'How do I drive there?' });
  assert.equal(res.stop, 'unanswerable', 'planner OFF is not a licence to confabulate a shape the ground lacks');
});

test('compareModes runs the side-by-side: planner is at least as faithful (spec §11)', async () => {
  const model = createModel('echo'); await model.load();
  const cmp = await compareModes({ ground: groundOf(), model });
  assert.ok(cmp.planner && cmp.plain, 'both modes ran');
  assert.equal(typeof cmp.faithfulnessDelta, 'number');
  assert.equal(cmp.plannerAtLeastAsFaithful, true, 'every planner claim is witnessed');
});

// ── the run never emits the old conflated stop label (spec §2 regression guard) ──

test('the loop never stops with the old void:no-expectation label (renamed to quiesce)', async () => {
  const model = createModel('echo'); await model.load();
  const honest = new Set(['ground-exhausted', 'saturated', 'quiesce', 'arc-closed', 'drift', 'aborted', 'max-steps', 'unanswerable']);
  for (const arc of [false, true]) {
    const res = await runContinuation({ ground: groundOf(), model, arc });
    assert.notEqual(res.stop, 'void:no-expectation');
    assert.ok(honest.has(res.stop), `stop is an honest label, got ${res.stop}`);
    for (const t of res.trace) assert.notEqual(t.kind, 'void', 'no trace entry uses the conflated void kind');
  }
});

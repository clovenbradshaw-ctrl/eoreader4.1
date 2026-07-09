// tests/reason-walk.test.js — the reasoning walk's four load-bearing properties, proved on the
// echo path: no model, no network, no weights. Deterministic, like the rest of the core suite.
//
//   1. CONTINUITY BY ACCUMULATION — a later step sites a figure an earlier WALK step minted.
//      The walk builds on its own committed output (read back off the log), not on a re-parsed
//      string. (result.steps has a step with builtOnSelf === true.)
//   2. NO LAUNDERING BY TYPE — every committed step is reafference: canWitness === false, by the
//      provenance type law, not a flag. A step that built on the walk's own output is STILL
//      never `grounded`. The chain grows; the grounding never launders upward.
//   3. IT REACHES, MARKED — the walk emits structure past the corpus (idle- and
//      warranted-ungrounded), rather than refusing it (VOID) or passing it off as grounded.
//      groundedFraction is 0 here (nothing emitted was in the source), and ungrounded emissions
//      are present and graded.
//   4. TERMINATION BY SATURATION — the walk quiesces before the hard backstop; the field, not a
//      token budget, ends it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLog } from '../src/core/log.js';
import { walkReasoning, seedCorpus, noStepLaunders } from '../src/reason/index.js';
import { canWitness, classify, EXAFFERENCE } from '../src/core/provenance.js';

// A small corpus. Two pairs share the `employs` relation (so a rule is learnable → warranted),
// plus a partnership edge for structure. Laid down through the PERCEIVER door (exafference).
const CORPUS = [
  { op: 'INS', id: 'a', label: 'Acme' },
  { op: 'INS', id: 'b', label: 'Bob' },
  { op: 'INS', id: 'c', label: 'Corp' },
  { op: 'INS', id: 'd', label: 'Dana' },
  { op: 'INS', id: 'e', label: 'Eve' },
  { op: 'CON', src: 'a', dst: 'b', via: 'employs' },
  { op: 'CON', src: 'c', dst: 'd', via: 'employs' },
  { op: 'CON', src: 'a', dst: 'c', via: 'partners' },
];

const freshWalk = async (opts = {}) => {
  const log = createLog({ docId: 'reason-test' });
  seedCorpus(log, CORPUS);
  const corpusLen = log.length;
  const result = await walkReasoning(log, { epsilon: 0.02, maxSteps: 24, ...opts });
  return { log, corpusLen, result };
};

test('the corpus can witness; the walk cannot (the type law, pre-walk)', async () => {
  const log = createLog({ docId: 't' });
  seedCorpus(log, CORPUS);
  for (const e of log.snapshot()) {
    assert.equal(classify(e.prov), EXAFFERENCE, 'a corpus event is exafference');
    assert.equal(canWitness(e.prov), true, 'a corpus event can witness');
  }
});

test('the walk commits steps onto the same log', async () => {
  const { log, corpusLen, result } = await freshWalk();
  assert.ok(result.steps.length > 0, 'the walk took at least one step');
  assert.equal(log.length, corpusLen + result.steps.length, 'each step is appended to the log');
});

test('property 2 — no laundering by type: every committed step is reafference', async () => {
  const { result } = await freshWalk();
  assert.equal(result.everyStepIsMine, true, 'no step can witness anything as world');
  for (const s of result.steps) {
    assert.equal(s.canWitness, false, `step ${s.i} (${s.op}) must not be able to witness`);
    assert.notEqual(classify(s.prov), EXAFFERENCE, 'a committed step is never exafference');
  }
  assert.equal(noStepLaunders(result), true, 'the type-law guarantee holds');
});

test('property 1 — continuity by accumulation: a step builds on the walk’s own minted figure', async () => {
  const { result } = await freshWalk();
  const built = result.steps.filter((s) => s.builtOnSelf);
  assert.ok(built.length >= 1, 'at least one step sited a figure a prior WALK step minted');
});

test('the crux — a step that built on self is STILL never grounded', async () => {
  const { result } = await freshWalk();
  for (const s of result.steps) {
    if (s.builtOnSelf) {
      assert.notEqual(s.grade, 'grounded', 'building on your own output can never be grounded');
      assert.equal(s.canWitness, false, 'and it still cannot witness');
    }
  }
});

test('property 3 — it reaches, marked: ungrounded emissions present, none laundered to grounded', async () => {
  const { result } = await freshWalk();
  const idle = result.gradeCounts['idle-ungrounded'] || 0;
  const warranted = result.gradeCounts['warranted-ungrounded'] || 0;
  const grounded = result.gradeCounts['grounded'] || 0;
  assert.ok(idle + warranted > 0, 'the walk emitted structure past the corpus, marked ungrounded');
  assert.ok(warranted >= 1, 'a rule was learned from the repeated relation → a warranted grade');
  assert.equal(grounded, 0, 'nothing the walk invented was in the source, so nothing is grounded');
  assert.equal(result.groundedFraction, 0, 'the two-tone ratio reports the honest 0 grounded');
});

test('property 4 — termination by saturation, not the backstop', async () => {
  const { result } = await freshWalk({ maxSteps: 24 });
  assert.equal(result.quiesced, true, 'the walk quiesced on a flat field');
  assert.ok(result.steps.length < 24, 'it stopped well before the hard backstop');
  const last = result.saturationTrace.at(-1);
  assert.ok(['saturated', 'ground-covered', 'no-admissible-move'].includes(last.reason),
    `stopped for a saturation reason, got: ${last.reason}`);
});

test('adversarial proposer cannot mint a grounded step', async () => {
  // A proposer that always prefers a SYN or CON (a reach past the source) still cannot produce a
  // `grounded` grade, because the grade is read off the witness type, never elected.
  const prefersToReach = (menu) =>
    menu.find((c) => c.op === 'SYN') || menu.find((c) => c.op === 'CON') || menu[0];
  const { result } = await freshWalk({ propose: prefersToReach });
  assert.equal(result.gradeCounts['grounded'] || 0, 0, 'a proposer cannot launder a reach into grounded');
  assert.equal(result.everyStepIsMine, true, 'and every step is still reafference');
});

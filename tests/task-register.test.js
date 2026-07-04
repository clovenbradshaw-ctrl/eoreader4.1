import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTaskRegister, taskOf, TASK_EXEMPLARS } from '../src/turn/intent.js';

// ---------------------------------------------------------------------------
// The task register as PHYSICS (turn/intent.js). The regex cliff is demoted to a
// seed: each task owns an exemplar basis, the question's Born weight against it is
// gated by a crosstalk null, and the surviving currents relax winner-take-all with
// `answer` as the resting default. tests/intent.test.js pins that the baseline is
// preserved; this file pins what the measurement ADDS and the DEF·EVA·REC loop
// that governs it. Tended like every other basis, not patched per audit failure.

test('the measurement catches paraphrases no regex cue fires on', () => {
  const r = createTaskRegister();
  for (const [q, want] of [
    ['what is this document mainly about', 'summary'],   // "mainly" splits the doc-noun regex
    ['condense the whole piece — what is the entire document about', 'summary'],
    ['unpack the reasoning behind that decision', 'explain'],
  ]) {
    const m = r.measure(q);
    assert.equal(m.task, want, q);
    assert.equal(m.abstained, false, `${q} — the physics decided`);
    assert.equal(m.cue, null, `${q} — no regex fired; the measurement carried it alone`);
  }
});

test('a fired cue informs an alive measurement; the terse forms fall back to it', () => {
  const r = createTaskRegister();
  // alive AND cued: both agree, the cue folds in at seed weight
  const alive = r.measure('name each and every member of the family');
  assert.equal(alive.abstained, false);
  assert.equal(alive.cue, 'list');
  assert.equal(alive.task, 'list');
  // terse: too little lexical signal to clear any null → the cue baseline rules
  const terse = r.measure('tldr');
  assert.equal(terse.abstained, true);
  assert.equal(terse.cue, 'summary');
  assert.equal(terse.task, 'summary');
});

test('the answer contrast holds the pointed lookups apart — gated, never a current', () => {
  const r = createTaskRegister();
  for (const q of [
    'what about the ending',       // shares what+about with the identity basis
    'what happened to him',
    'the name of the king',        // shares "name" with the list basis
  ]) {
    const m = r.measure(q);
    assert.equal(m.task, 'answer', q);
    assert.equal(m.abstained, true, `${q} — every whole-document current sits under its null`);
  }
});

test('the meta grain runs the same physics: paraphrase reach, contrast-gated negatives', () => {
  const r = createTaskRegister();
  // no META_CONV branch matches this — the measurement alone carries it
  const reach = r.measureMeta('remind me what came up earlier between us');
  assert.equal(reach.meta, true);
  assert.equal(reach.abstained, false);
  assert.equal(reach.cue, null);
  // the known impostors sit in the doc contrast and stay under the null
  for (const q of ['what happened earlier in the story?', 'what would you say is the main theme?']) {
    const m = r.measureMeta(q);
    assert.equal(m.meta, false, q);
    assert.equal(m.abstained, true, q);
  }
});

// ---------------------------------------------------------------------------
// The DEF·EVA·REC loop — every exemplar and every regex cue is a defeasible
// convention, the same shape as the conventions ledger (core/conventions/ledger.js)
// and the write-side grammar rules (write/eva.js).

test('DEF — a misrouted phrasing is taught into a basis, not patched into a regex', () => {
  const r = createTaskRegister();
  assert.equal(r.measure('pull the highlights together').task, 'answer');
  r.def('summary', 'pull the highlights together for me', 2);
  r.def('summary', 'pull all the highlights of it together', 2);
  const m = r.measure('pull the highlights together');
  assert.equal(m.task, 'summary');
  assert.equal(m.cue, null, 'no regex was added — the taught basis carries it');
  assert.equal(r.originOf('summary', 'pull the highlights together for me'), 'learned');
});

test('EVA — a hold reinforces the carriers, a break accrues strain', () => {
  const r = createTaskRegister();
  const before = r.supportOf('summary', 'what is this about');
  r.eva('what is this all about then', 'summary', true);
  assert.equal(r.supportOf('summary', 'what is this about'), before + 1, 'contact reinforces');
  r.eva('what is this all about then', 'summary', false);
  assert.equal(r.strainOf('summary', 'what is this about'), 1, 'a break accrues strain');
  // no contact, no touch
  const untouched = r.supportOf('explain', 'explain how it works');
  r.eva('what is this all about then', 'explain', false);
  assert.equal(r.supportOf('explain', 'explain how it works'), untouched);
  assert.equal(r.strainOf('explain', 'explain how it works'), 0);
});

test('REC — strain overtaking support defeats the convention and it leaves the basis', () => {
  const r = createTaskRegister();
  r.def('summary', 'pull the highlights together for me', 2);
  r.def('summary', 'pull all the highlights of it together', 2);
  assert.equal(r.measure('pull the highlights together').task, 'summary');
  // the taught read keeps misleading: strain past the learned support
  for (let i = 0; i < 3; i++) r.eva('pull the highlights together', 'summary', false);
  assert.equal(r.isDefeated('summary', 'pull the highlights together for me'), true);
  assert.equal(r.measure('pull the highlights together').task, 'answer', 'the defeated exemplars left the basis');
  assert.ok(r.rules.some((l) => l.op === 'REC' && l.defeat), 'the defeat is a REC line on the log');
});

test('a PRIOR can lose — the regex seed itself is defeated by enough breaks', () => {
  const r = createTaskRegister();
  assert.equal(r.measure('tldr').task, 'summary');
  assert.equal(r.cueState('summary').on, true);
  // support is pre-baked (a head start, not an exemption): more breaks than a
  // fresh convention would take, then the cue toggles off
  for (let i = 0; i < 4; i++) r.eva('tldr', 'summary', false);
  assert.equal(r.cueState('summary').on, false);
  assert.equal(r.measure('tldr').task, 'answer', 'the defeated seed stops being consulted');
});

test('reinstate — a later run of holds brings a defeated convention back', () => {
  const r = createTaskRegister();
  for (let i = 0; i < 4; i++) r.eva('tldr', 'summary', false);
  assert.equal(r.measure('tldr').task, 'answer');
  r.reinstateCue('summary');
  r.rec('summary', 'the tldr — a tl;dr of the whole text', { reinstate: true });
  assert.equal(r.measure('tldr').task, 'summary');
});

test('priors OFF — the register is still total, and teachable from nothing', () => {
  const r = createTaskRegister({ priors: false });
  // nothing hard-coded true: every question abstains to the total default
  assert.equal(r.measure('summarize the document').task, 'answer');
  assert.equal(r.measure('list every character').task, 'answer');
  assert.equal(r.isMeta('what did you say earlier?'), false);
  // learned sediment occupies the same slot the seeds would have
  r.def('summary', 'summarize the whole document for me');
  r.def('summary', 'a summary of the entire document');
  r.def('answer', 'what is this word');   // a contrast can be taught too
  assert.equal(r.measure('summarize the entire document').task, 'summary');
});

test('the exported ledger carries the strain-history — inheritable sediment', () => {
  const r = createTaskRegister();
  r.def('summary', 'pull the highlights together for me');
  r.eva('tldr', 'summary', false);
  const ledger = r.exportLedger();
  const learned = ledger.find((e) => e.phrase === 'pull the highlights together for me');
  assert.equal(learned.origin, 'learned');
  const cue = ledger.find((e) => e.cue === 'summary');
  assert.equal(cue.strain, 1);
  const prior = ledger.find((e) => e.phrase === TASK_EXEMPLARS.summary[0]);
  assert.equal(prior.origin, 'prior');
  assert.ok(prior.support >= 3, 'a prior carries pre-baked support');
});

test('taskOf rides the measurement audit into the turn context', () => {
  const reg = taskOf('what is this document mainly about');
  assert.equal(reg.task, 'summary');
  assert.equal(reg.taskMeasure.abstained, false);
  assert.equal(reg.taskMeasure.cue, null);
  assert.ok(reg.taskMeasure.weights.summary > 0);
  // the cube placement is unchanged by the new mechanics
  assert.equal(reg.grain, 'Pattern');
  assert.equal(reg.terrain, 'Paradigm');
});

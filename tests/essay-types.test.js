import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ESSAY_TYPES, essayTypeOf, emptyProfile, foldEssay, steerFrom,
  profileToJSON, profileFromJSON, ESSAY_PROFILE_SCHEMA,
} from '../src/organs/out/essay-types.js';
import { composeEssay, planMessages, sectionMessages } from '../src/organs/out/essay.js';
import { essayTypes } from '../src/organs/out/index.js';

// A deterministic talker for the steered walk (mirrors essay-organ.test.js): the planner call
// gets an outline, every section call gets `wordsPerSection` words of filler keyed to the
// heading so each section carries DISTINCT content (else the novelty gate drops the repeats).
let stubCalls = 0;
const stubTalker = (wordsPerSection = 200, record = null) => async (messages, opts = {}) => {
  stubCalls += 1;
  const sys = messages.find((m) => m.role === 'system')?.content || '';
  const usr = messages.find((m) => m.role === 'user')?.content || '';
  const isPlan = /planning a long-form essay/i.test(sys);
  record?.push({ isPlan, sys, user: usr, opts });
  if (isPlan) return 'TITLE: On Tides\n1. Introduction\n2. The pull of the moon\n3. Conclusion';
  const heading = (usr.match(/heading: "([^"]+)"/) || [])[1] || `s${stubCalls}`;
  const slug = (heading.toLowerCase().replace(/[^a-z]+/g, '') || `sec${stubCalls}`) + stubCalls;
  return Array.from({ length: wordsPerSection }, (_, i) => `${slug}tok${i}`).join(' ') + '.';
};

// A composeEssay-shaped result to fold, without running a walk.
const fakeRun = (headings, wordsEach = 300, title = 'T') => ({
  title,
  aborted: false,
  sections: headings.map((heading) => ({ heading, role: 'develop', words: wordsEach, text: 'x '.repeat(wordsEach) })),
});

// ── the registry ──────────────────────────────────────────────────────────────

test('the type registry ships five types, each with a cue and a seed arc', () => {
  assert.ok(ESSAY_TYPES.length >= 5);
  for (const t of ESSAY_TYPES) {
    assert.ok(t.id && t.label, 'a type has an id and a label');
    assert.ok(t.cue.length > 20, 'a type has a real voice cue');
    assert.ok(t.seedArc.length >= 4, 'a type has a seed arc to steer from before it has learned');
  }
  assert.equal(essayTypeOf('argument').label, 'Argument');
  assert.equal(essayTypeOf('nonesuch'), null);
});

// ── learning: the fold ────────────────────────────────────────────────────────

test('foldEssay folds a completed run into the profile', () => {
  const p0 = emptyProfile('argument');
  const p1 = foldEssay(p0, fakeRun(['The claim', 'Why it survives'], 320, 'On Tax'));
  assert.equal(p1.runs, 1);
  assert.equal(p1.headings['The claim'].n, 1);
  assert.equal(p1.sectionWords.n, 2);
  assert.equal(p1.sectionWords.mean, 320);
  assert.deepEqual(p1.titles, ['On Tax']);
  // fold again — counts accumulate, the mean is a running mean
  const p2 = foldEssay(p1, fakeRun(['The claim'], 400, 'On Law'));
  assert.equal(p2.runs, 2);
  assert.equal(p2.headings['The claim'].n, 2);
  assert.ok(Math.abs(p2.sectionWords.mean - (320 + 320 + 400) / 3) < 0.2);
  assert.deepEqual(p2.titles, ['On Law', 'On Tax']);
});

test('an aborted or thin run teaches nothing (same profile back)', () => {
  const p = foldEssay(emptyProfile('review'), fakeRun(['A'], 300));
  assert.equal(foldEssay(p, { ...fakeRun(['B'], 300), aborted: true }), p, 'aborted → unchanged');
  assert.equal(foldEssay(p, fakeRun(['Stub'], 10)), p, 'a stalled section is below the teaching floor');
});

// ── learning: the steer ───────────────────────────────────────────────────────

test('run one steers from the seed arc; learned headings then lead', () => {
  const t = essayTypeOf('explainer');
  const fresh = steerFrom(emptyProfile('explainer'), 'explainer');
  assert.equal(fresh.cue, t.cue);
  assert.deepEqual(fresh.planHints, t.seedArc.slice(0, 6), 'nothing learned → the seed arc is the hint set');
  assert.equal(fresh.targetPerSection, 380, 'the default word target before enough is seen');

  let p = emptyProfile('explainer');
  p = foldEssay(p, fakeRun(['How the trick works', 'A worked example'], 450));
  p = foldEssay(p, fakeRun(['How the trick works', 'The edge cases', 'A worked example'], 450));
  const steer = steerFrom(p, 'explainer');
  assert.equal(steer.planHints[0], 'How the trick works', 'the most-used learned heading leads');
  assert.ok(steer.planHints.length <= 6);
  assert.equal(steer.targetPerSection, 450, 'the word target drifts to what the type actually writes');
});

test('the word-target drift is clamped and generic headings never become hints', () => {
  let p = emptyProfile('argument');
  p = foldEssay(p, fakeRun(['Introduction', 'Conclusion', 'A vast sprawl', 'Another sprawl', 'Sprawl three'], 900));
  const steer = steerFrom(p, 'argument');
  assert.equal(steer.targetPerSection, 500, 'the target is clamped at the ceiling');
  assert.ok(!steer.planHints.some((h) => /^(introduction|conclusion)$/i.test(h)), 'organ-supplied generics are excluded');
});

test('an unknown type steers to nothing (the unsteered organ)', () => {
  const steer = steerFrom(emptyProfile('nonesuch'), 'nonesuch');
  assert.equal(steer.cue, null);
  assert.equal(steer.planHints, null);
});

// ── persistence ───────────────────────────────────────────────────────────────

test('a profile round-trips through JSON; a malformed or wrong-schema store is dropped', () => {
  let p = emptyProfile('narrative');
  p = foldEssay(p, fakeRun(['The turn'], 350, 'A Story'));
  const back = profileFromJSON(profileToJSON(p));
  assert.deepEqual(back, p);
  assert.equal(profileFromJSON('{not json'), null);
  assert.equal(profileFromJSON(JSON.stringify({ ...p, schema: ESSAY_PROFILE_SCHEMA + 1 })), null);
  assert.equal(profileFromJSON(JSON.stringify({ schema: ESSAY_PROFILE_SCHEMA })), null, 'a profile without a type is malformed');
});

// ── the steer seam in the organ ───────────────────────────────────────────────

test('the cue rides the plan and every section system prompt; hints ride the plan', () => {
  const plan = planMessages('the sea', { cue: 'THE CUE.', hints: ['A move', 'Another move'] });
  assert.match(plan[0].content, /THE CUE\./);
  assert.match(plan[1].content, /A move · Another move/);
  assert.match(plan[1].content, /use, adapt, or ignore/i, 'hints are offered, never imposed');
  const section = sectionMessages({ topic: 't', title: 'T', heading: 'H', cue: 'THE CUE.' });
  assert.match(section[0].content, /THE CUE\./);
});

test('without a steer the prompts are byte-identical to the unsteered organ', () => {
  assert.deepEqual(planMessages('the sea'), planMessages('the sea', { cue: null, hints: null }));
  assert.deepEqual(
    sectionMessages({ topic: 't', title: 'T', heading: 'H' }),
    sectionMessages({ topic: 't', title: 'T', heading: 'H', cue: null }));
});

test('composeEssay carries a type steer through the whole walk and lands cleanly', async () => {
  const record = [];
  const steer = steerFrom(emptyProfile('argument'), 'argument');
  const res = await composeEssay({
    topic: 'a tax on land',
    talker: stubTalker(150, record),
    cue: steer.cue,
    planHints: steer.planHints,
    targetPerSection: steer.targetPerSection,
  });
  assert.equal(res.aborted, false);
  assert.equal(res.sections.at(-1).role, 'land', 'the steered walk lands on a conclusion');
  const planCall = record.find((c) => c.isPlan);
  assert.match(planCall.sys, /ARGUMENTATIVE/, 'the type cue reaches the planner');
  assert.match(planCall.user, /The claim/, 'the seed-arc hints reach the planner');
  const sectionCalls = record.filter((c) => !c.isPlan);
  assert.ok(sectionCalls.length > 1);
  assert.ok(sectionCalls.every((c) => /ARGUMENTATIVE/.test(c.sys)), 'the cue rides every section pass');
});

test('the types module is re-exported as a namespace off organs/out', () => {
  assert.equal(typeof essayTypes.foldEssay, 'function');
  assert.equal(essayTypes.ESSAY_TYPES.length, ESSAY_TYPES.length);
});

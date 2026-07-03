import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/pipeline.js';
import { composeEssayGrounded } from '../src/organs/out/essay.js';
import { emptyProfile, foldEssay } from '../src/organs/out/essay-types.js';

// The essay routed through the reading's own physics: the plan read off the surfer's
// arrests (never authored by a model call), sections opened at the trajectory's phases,
// every beat witnessed and leashed, the talker at the very end. The hook surface is
// composeEssay's own, so the UI walks both paths identically.

const STORY = 'Grete fed Gregor. Grete watched Gregor. Grete pitied Gregor. ' +
              'The father struck Gregor. Gregor weakened. Grete renounced Gregor. ' +
              'Grete opened the window. The family left the flat.';

// A stub talker long enough that a kept section clears the type-fold's teaching floor
// (60 words) — the walk's own gates never see it (they are composeEssay's, not the walk's).
const LONG = ('The passage holds this plainly and the reading carries it forward without ' +
  'invention, staying inside what the sentences themselves witness and repeat. ').repeat(4).trim();
const talker = async (_messages, opts = {}) => {
  if (typeof opts.onToken === 'function') for (const w of LONG.split(/(?<= )/)) opts.onToken(w);
  return LONG;
};

test('the grounded walk plans off the physics and emits the composeEssay hook surface in order', async () => {
  const doc = parseText(STORY, { docId: 'm' });
  const events = [];
  const res = await composeEssayGrounded({
    doc, topic: 'what happened to Gregor', talker,
    hooks: {
      onPhase: (p) => events.push(['phase', p]),
      onPlan: ({ title, outline, beats }) => events.push(['plan', title, outline.length, beats]),
      onSection: ({ heading, index }) => events.push(['section', index, heading]),
      onSectionEnd: ({ index, words }) => events.push(['end', index, words]),
      onToken: () => {},
    },
  });
  assert.ok(res, 'a plan resolved off the physics');
  assert.equal(events[0][0], 'phase');
  assert.equal(events[0][1], 'planning');
  const plan = events.find((e) => e[0] === 'plan');
  assert.ok(plan, 'onPlan fired');
  assert.ok(plan[2] >= 1, 'the outline carries the planned arc');
  const sectionEvents = events.filter((e) => e[0] === 'section');
  const endEvents = events.filter((e) => e[0] === 'end');
  assert.equal(sectionEvents.length, endEvents.length, 'every opened section closes');
  assert.equal(sectionEvents.length, res.sections.length, 'the hooks and the result agree');
  assert.deepEqual(sectionEvents.map((e) => e[1]), sectionEvents.map((_, i) => i), 'sections open in order');
  assert.ok(events.some((e) => e[0] === 'phase' && e[1] === 'done'), 'the walk lands');
});

test('the result teaches the essay type — foldEssay advances on a grounded run', async () => {
  const doc = parseText(STORY, { docId: 'm' });
  const res = await composeEssayGrounded({ doc, topic: 'gregor', talker });
  assert.ok(res, 'a plan resolved');
  assert.equal(res.aborted, false);
  assert.ok(res.grounded, 'the run wears the grounded register');
  for (const s of res.sections) {
    assert.ok(s.heading && typeof s.words === 'number' && s.role, 'foldEssay\'s section shape holds');
  }
  assert.equal(res.sections[res.sections.length - 1].role, 'land', 'the last section lands');
  const p0 = emptyProfile('t');
  const p1 = foldEssay(p0, res);
  assert.notEqual(p1, p0, 'a completed grounded run teaches the type');
  assert.equal(p1.runs, 1);
});

test('the text reassembles from exactly what the hooks emitted — title, headings, beats', async () => {
  const doc = parseText(STORY, { docId: 'm' });
  let acc = '';
  const res = await composeEssayGrounded({
    doc, topic: 'gregor', talker,
    hooks: {
      onPlan: ({ title }) => { acc += '# ' + title + '\n\n'; },
      onSection: ({ heading, index }) => { acc += (index ? '\n\n' : '') + '## ' + heading + '\n\n'; },
      onToken: (piece) => { acc += piece; },
    },
  });
  assert.ok(res, 'a plan resolved');
  const squash = (s) => s.replace(/\s+/g, ' ').trim();
  assert.equal(squash(acc), squash(res.text),
    'the streamed surface and the returned text are the same piece — finish() repaints, never rewrites');
});

test('null on a doc with nothing to plan — the caller falls back to the flat walk', async () => {
  const res = await composeEssayGrounded({
    doc: { sentences: [], log: { snapshot: () => [], events: [] } },
    topic: 'anything', talker,
  });
  assert.equal(res, null);
});

test('a dead talker reads as a FAILED walk (null), never as "Done — 0 words"', async () => {
  const doc = parseText(STORY, { docId: 'm' });
  const dead = async () => '   ';           // every beat comes back blank
  const res = await composeEssayGrounded({ doc, topic: 'gregor', talker: dead });
  assert.equal(res, null, 'empty sections are dropped and an all-empty walk returns null so the caller falls back');
});

test('the honest numbers ride the result — sources counted, claims kept vs retracted', async () => {
  const doc = parseText(STORY, { docId: 'm' });
  const res = await composeEssayGrounded({ doc, topic: 'gregor', talker });
  assert.ok(res, 'a plan resolved');
  assert.ok(res.sourceCount >= 1, 'the beats stood on real source spans');
  assert.ok(res.boundFraction === null || (res.boundFraction >= 0 && res.boundFraction <= 1),
    'boundFraction is a fraction or honestly absent');
  assert.ok(Array.isArray(res.beats) && res.beats.length >= 1, 'the per-beat audit rides along');
});

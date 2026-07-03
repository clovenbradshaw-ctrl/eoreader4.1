// frame-predict.test.js — Phase C of docs/frame-holon.md: the prediction edge
// names the shared interior holon, so the eager ≡ reactive invariance is pinned
// in CI instead of true by inspection.
//
// predictionTaskGraph DECLARES the piece → phrase → note tree top-down (a
// planner's `decompose`, the generation side); predictionFrameLog DISCOVERS the
// same structure as the stream arrives (`open` + `bind`, the reactive side —
// a SEG boundary pushes a phrase frame, each note binds the open phrase, the
// next boundary pops). The shared projection (frame/project.js) derives the
// same nesting either way — one holon, entered from two edges.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestMusic } from '../src/organs/in/music.js';
import {
  predictGrained, predictionTaskGraph, predictionFrameLog, predictionFrameStack,
} from '../src/predict/index.js';
import { KIND, projectFrameStack } from '../src/frame/index.js';

const tune = (notes) => ingestMusic({ name: 't', notes });

const NOTES = ['C4', 'D4', 'E4', 'C4', 'C4', 'D4', 'E4', 'C4', 'E4', 'F4', 'G4', 'E4', 'F4', 'G4'];
const BOUNDARIES = [0, 4, 8, 11];

test('eager ≡ reactive: the declared task graph and the discovered frame log project the same nesting', async () => {
  const doc = tune(NOTES);
  const pred = predictGrained(doc, { order: 2, boundaries: BOUNDARIES });
  const stack = predictionFrameStack(pred);
  const { graph, incoherent } = await predictionTaskGraph(doc, { order: 2, boundaries: BOUNDARIES });

  // one phrase frame per phrase branch, in order
  assert.equal(stack.root.id, 'piece');
  assert.equal(stack.root.children.length, graph.root.children.length, 'same phrase count');
  assert.equal(stack.root.children.length, BOUNDARIES.length);

  // each phrase's EXTENT matches: the reactive side binds one event per note where
  // the eager side declares one leaf per note — the same grain, two entries.
  const log = predictionFrameLog(pred);
  const bindsOf = (id) => log.filter((e) => e.kind === KIND.BIND && e.id === id).length;
  for (let i = 0; i < stack.root.children.length; i++) {
    assert.equal(bindsOf(`piece.${i}`), graph.root.children[i].children.length,
      `phrase ${i}: one bind per declared note leaf`);
  }

  // the boundary is the SAME event on both edges: a 'novelty' bind (the push, the
  // SEG cut) on the reactive side, a Pattern-declared leaf flagged incoherent (a
  // Figure-maker handed a Pattern goal) on the eager side. One count.
  const pushes = log.filter((e) => e.kind === KIND.BIND && e.channel === 'novelty').length;
  assert.equal(pushes, incoherent.length, 'every SEG boundary appears once on each edge');
  assert.equal(pushes, BOUNDARIES.length);
});

test('a phrase frame\'s subject is its pitch-set — the props the phrase-repeat overlap measures', () => {
  const pred = predictGrained(tune(NOTES), { order: 2, boundaries: BOUNDARIES });
  const stack = predictionFrameStack(pred);
  const [p0, p1] = stack.root.children;
  assert.deepEqual(p0.subject, [...new Set(pred.phrases[0])]);
  // the repeated phrase (C D E C · C D E C) founds ONE equivalence class: identical subjects,
  // the same set overlap that discovers octave equivalence and coreference.
  assert.deepEqual(p0.subject, p1.subject, 'a phrase repeat is subject-identical across frames');
});

test('the reactive walk ends inside the LAST phrase: the active path is the open frame', () => {
  const pred = predictGrained(tune(NOTES), { order: 2, boundaries: BOUNDARIES });
  const stack = predictionFrameStack(pred);
  assert.deepEqual(stack.path, ['piece', `piece.${BOUNDARIES.length - 1}`]);
});

test('the frame log is replay-stable: same prediction, identical projection', () => {
  const pred = predictGrained(tune(NOTES), { order: 2, boundaries: BOUNDARIES });
  const a = projectFrameStack(predictionFrameLog(pred));
  const b = projectFrameStack(predictionFrameLog(pred));
  assert.deepEqual(a.root, b.root);
  assert.deepEqual(a.path, b.path);
});

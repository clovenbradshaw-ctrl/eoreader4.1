import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readTask, taskOf, cubeOf, TASK_MAX_TOKENS } from '../src/turn/intent.js';
import { terrainOf, GRAINS, DOMAINS } from '../src/core/index.js';

// ---------------------------------------------------------------------------
// The task register (docs/prompt-assembly.md, "The task register"). Read off the
// question mechanically — no model — to set the prompt register and the token ceiling.

test('the summary words route to the summary task', () => {
  for (const q of [
    'summarize the document', 'summarise this', 'give me a summary',
    'tldr', 'tl;dr please', 'recap', 'what is the gist', 'an overview please',
  ]) assert.equal(readTask(q), 'summary', q);
});

test('the whole-document IDENTITY question routes to summary, not a pointed lookup', () => {
  for (const q of [
    'what is this about', 'what is this mainly about', "what's it about",
    'what is this document?', 'what is this document about?',
    'what is this text', 'what is this story about',
    'what is this?', 'what is this',          // the bare identity question
  ]) assert.equal(readTask(q), 'summary', q);
});

test('pointed "what is this X" lookups are NOT swallowed by the summary route', () => {
  for (const q of [
    'what is this word?', 'what is this number', "what is this character's name?",
    'what is this place called', 'what is this made of',
  ]) assert.notEqual(readTask(q), 'summary', q);
});

// The audit's t2: after a "summarize", the user pushed back "that's just the top part,
// what about the rest?" — a request to cover the WHOLE document, which the bare `answer`
// task read as a pointed lookup. A coverage continuation is a whole-document task.
test('a coverage continuation ("what about the rest?") routes to summary', () => {
  for (const q of [
    "that's just the top part, what about the rest?",
    'what about the rest', 'tell me the rest', 'the rest of it',
    'what about the rest of the document', 'summarize the whole thing',
    'everything else', 'what else is in here',
  ]) assert.equal(readTask(q), 'summary', q);
});

// A pointed "what about X" naming a real subject must NOT be swallowed by the coverage cue.
test('a pointed "what about X" is not a coverage continuation', () => {
  for (const q of [
    'what about Gregor', 'what about the ending', 'what about chapter two',
  ]) assert.notEqual(readTask(q), 'summary', q);
});

test('list and explain route on their own cues, and default is answer', () => {
  assert.equal(readTask('list every character'), 'list');
  assert.equal(readTask('what are the themes'), 'list');
  assert.equal(readTask('explain the ending'), 'explain');
  assert.equal(readTask('why did he leave'), 'explain');
  assert.equal(readTask('who is Gregor'), 'answer');
  assert.equal(readTask('what does he turn into'), 'answer');
  assert.equal(readTask('what happened to him'), 'answer');
});

test('taskOf carries the per-task token ceiling — the real length bound', () => {
  assert.equal(taskOf('summarize this').task, 'summary');
  assert.equal(taskOf('summarize this').maxTokens, TASK_MAX_TOKENS.summary);
  assert.equal(taskOf('what is this document?').maxTokens, TASK_MAX_TOKENS.summary);
  assert.equal(taskOf('who is Gregor').task, 'answer');
  assert.equal(taskOf('who is Gregor').maxTokens, TASK_MAX_TOKENS.answer);
});

// ---------------------------------------------------------------------------
// The cube register (docs/cube.md, docs/reading-levels.md): each task names the
// DOMAIN (reading level) and GRAIN (Object axis) it operates at, and the Site-face
// TERRAIN the two land on. The task understander is cube-aware and grain-aware.

test('every task places on a real cube cell — domain, grain, and a derived terrain', () => {
  for (const task of ['answer', 'summary', 'list', 'explain']) {
    const c = cubeOf(task);
    assert.ok(DOMAINS.includes(c.domain), `${task} domain on the cube`);
    assert.ok(GRAINS.includes(c.grain), `${task} grain on the cube`);
    // the terrain is the cube authority's Site-face cell for (domain, grain), not hardcoded
    assert.equal(c.terrain, terrainOf(c.domain, c.grain), `${task} terrain is the real cell`);
    assert.ok(c.terrain, `${task} lands on a named terrain`);
  }
});

test('the grain distinguishes a pointed lookup from a whole-document question', () => {
  // The whole reason summary must not be answered as a lookup: different grain.
  assert.equal(cubeOf('answer').grain,  'Figure');   // a fact at one location
  assert.equal(cubeOf('summary').grain, 'Pattern');  // the document as one frame
  assert.notEqual(cubeOf('answer').grain, cubeOf('summary').grain);
});

test('the canonical task placements and reading levels', () => {
  assert.deepEqual(cubeOf('answer'),  { domain: 'Existence',      grain: 'Figure',  terrain: 'Entity',   level: 1 });
  assert.deepEqual(cubeOf('summary'), { domain: 'Interpretation', grain: 'Pattern', terrain: 'Paradigm', level: 3 });
  assert.deepEqual(cubeOf('list'),    { domain: 'Structure',      grain: 'Pattern', terrain: 'Network',  level: 2 });
  assert.deepEqual(cubeOf('explain'), { domain: 'Interpretation', grain: 'Figure',  terrain: 'Lens',     level: 3 });
});

test('taskOf rides the cube placement into the register, for the turn context', () => {
  const reg = taskOf('what is this about');
  assert.equal(reg.task, 'summary');
  assert.equal(reg.grain, 'Pattern');
  assert.equal(reg.domain, 'Interpretation');
  assert.equal(reg.terrain, 'Paradigm');
  assert.equal(reg.level, 3);
});

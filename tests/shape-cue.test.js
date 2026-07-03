import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGroundedMessages, shapeForScope, STRUCTURE_CUE } from '../src/model/prompt.js';

// The answer-first / sectioned SHAPE cue. A broad question gets the lead-then-sections layout
// the chat body renders as headings + bold; a pointed lookup answers straight. The cue is opt-in
// — an empty `shape` leaves the grounded prompt byte-identical, so the golden prompt tests stand.

test('shapeForScope fires for broad questions, stays silent for pointed ones', () => {
  assert.equal(shapeForScope('how did he see out of the plane'), STRUCTURE_CUE);
  assert.equal(shapeForScope('compare the two engines'), STRUCTURE_CUE);
  assert.equal(shapeForScope('what are the exceptions'), STRUCTURE_CUE);
  assert.equal(shapeForScope('summarize the obligations'), STRUCTURE_CUE);
  assert.equal(shapeForScope('what does clause 4 say'), '');
  assert.equal(shapeForScope('who signed it'), '');
});

test('a tight length budget forces a straight answer (quick lookup)', () => {
  assert.equal(shapeForScope('compare the two engines', { sentences: 2 }), '');
  assert.equal(shapeForScope('compare the two engines', { sentences: 6 }), STRUCTURE_CUE);
});

test('buildGroundedMessages is byte-identical without a shape cue', () => {
  const base = { question: 'how did he see', spans: [{ text: 'A line.' }] };
  const a = buildGroundedMessages(base);
  const b = buildGroundedMessages({ ...base, shape: '' });
  assert.equal(a[1].content, b[1].content);
  assert.doesNotMatch(a[1].content, /## Heading/);
});

test('a shape cue rides in the user block, but never alongside a length budget', () => {
  const withShape = buildGroundedMessages({ question: 'how did he see', spans: [{ text: 'A line.' }], shape: STRUCTURE_CUE });
  assert.match(withShape[1].content, /open with a direct two- or three-sentence answer/);
  assert.match(withShape[1].content, /## Heading/);
  // the cue must not introduce any of the words the subjective-frame guards forbid
  assert.doesNotMatch(withShape[1].content, /-->/);

  const budgeted = buildGroundedMessages({ question: 'how did he see', spans: [{ text: 'A line.' }], shape: STRUCTURE_CUE, budget: { sentences: 2 } });
  assert.doesNotMatch(budgeted[1].content, /## Heading/);
});

test('the shape cue never touches the system message', () => {
  const a = buildGroundedMessages({ question: 'how did he see', spans: [{ text: 'A line.' }] });
  const b = buildGroundedMessages({ question: 'how did he see', spans: [{ text: 'A line.' }], shape: STRUCTURE_CUE });
  assert.equal(a[0].content, b[0].content);
});

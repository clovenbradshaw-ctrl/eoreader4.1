import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as prompt from '../src/model/prompt.js';
import { buildGroundedMessages } from '../src/model/prompt.js';

// THE SHAPE CUE IS RETIRED. A broad question no longer trips a keyword regex (shapeForScope)
// that stamps a visible answer-first/sectioned TEMPLATE (STRUCTURE_CUE) onto the talker's
// prompt. How a reply is shaped is now the discourse metacognition's call, carried invisibly by
// the steer (app.dc.js _steerLine, a "don't quote it" brief). These tests pin the retirement and
// the steer channel that replaced the template.

test('the keyword shape cue is fully retired — no STRUCTURE_CUE / shapeForScope export', () => {
  assert.equal(prompt.STRUCTURE_CUE, undefined);
  assert.equal(prompt.shapeForScope, undefined);
});

test('a bare grounded prompt carries no layout template', () => {
  const a = buildGroundedMessages({ question: 'how did he see', spans: [{ text: 'A line.' }] });
  assert.doesNotMatch(a[1].content, /##\s*Heading/i);
  assert.doesNotMatch(a[1].content, /Want me to go deeper/i);
  assert.doesNotMatch(a[1].content, /Shape your answer like this/i);
});

test('buildGroundedMessages is byte-identical without a steer or shape', () => {
  const base = { question: 'how did he see', spans: [{ text: 'A line.' }] };
  const a = buildGroundedMessages(base);
  const b = buildGroundedMessages({ ...base, shape: '', steer: '' });
  assert.equal(a[1].content, b[1].content);
});

test('the steer rides in the user block, never the system message', () => {
  const steer = 'What this turn is really for — read it as your brief: an overview. Aim the answer squarely at that.';
  const bare = buildGroundedMessages({ question: 'tell me about X', spans: [{ text: 'A line.' }] });
  const steered = buildGroundedMessages({ question: 'tell me about X', spans: [{ text: 'A line.' }], steer });
  assert.equal(bare[0].content, steered[0].content);              // system message untouched
  assert.match(steered[1].content, /Aim the answer squarely at that/);  // steer lands in the user block
  assert.doesNotMatch(steered[1].content, /-->/);                  // introduces none of the forbidden marks
});

test('the register bundle (shape slot) never rides alongside a length budget', () => {
  const budgeted = buildGroundedMessages({
    question: 'how did he see', spans: [{ text: 'A line.' }],
    shape: 'REGISTER_BUNDLE_MARKER', budget: { sentences: 2 },
  });
  assert.doesNotMatch(budgeted[1].content, /REGISTER_BUNDLE_MARKER/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildGroundedMessages, buildChatMessages } from '../src/model/prompt.js';
import { buildPicoPrompt, extractGroundedInput } from '../src/model/pleias.js';
import { buildOnnxInput, readOnnxOutput } from '../src/model/onnx.js';
import { availableBackends } from '../src/model/interface.js';

// ---------------------------------------------------------------------------
// The ONNX (transformers.js) talkers register alongside the others. These load
// the onnx-community / HuggingFaceTB ONNX builds on first use; here we only
// assert the roster and the pure prompt-in / prose-out mapping (no model fetch).

test('onnx backends are registered alongside the others', () => {
  const names = availableBackends();
  for (const id of [
    'smollm2-360m',
    'pleias-pico-onnx', 'pleias-350m-onnx', 'pleias-1.2b-onnx', 'pleias-nano-onnx',
  ]) {
    assert.ok(names.includes(id), `missing backend: ${id}`);
  }
});

// ---------------------------------------------------------------------------
// buildOnnxInput — the format fork.

test('buildOnnxInput rebuilds the native Pleias schema for the grounded format', () => {
  const messages = buildGroundedMessages({
    question: 'Where did the fire start?',
    spans: [{ text: 'The fire started in the kitchen.' }],
    orientation: 'doc.txt · text · 3 sentences',
  });
  const input = buildOnnxInput('pleias', messages);
  assert.equal(typeof input, 'string');
  assert.equal(input, buildPicoPrompt(extractGroundedInput(messages)));
  assert.match(input, /^<\|query_start\|>Where did the fire start\?<\|query_end\|>/);
  assert.ok(input.endsWith('<|source_analysis_start|>'));
});

test('buildOnnxInput passes the messages array through unchanged for the chat format', () => {
  const messages = buildChatMessages({ question: 'What is your name?' });
  const input = buildOnnxInput('chat', messages);
  assert.equal(input, messages);                 // same array reference — the pipeline templates it
  assert.equal(input.at(-1).content, 'What is your name?');
});

// ---------------------------------------------------------------------------
// readOnnxOutput — pulling clean prose out of each completion shape.

test('readOnnxOutput strips Pleias scaffolding from a string completion', () => {
  const out = [{ generated_text:
    '<|source_analysis_start|>both sources agree<|source_analysis_end|>' +
    '<|answer_start|>The fire started in the kitchen.<|answer_end|>' }];
  assert.equal(readOnnxOutput('pleias', out), 'The fire started in the kitchen.');
});

test('readOnnxOutput takes the last assistant turn from a chat message array', () => {
  const out = [{ generated_text: [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'Hello there.' },
  ] }];
  assert.equal(readOnnxOutput('chat', out), 'Hello there.');
});

test('readOnnxOutput is defensive against an empty or malformed completion', () => {
  assert.equal(readOnnxOutput('pleias', []), '');
  assert.equal(readOnnxOutput('chat', undefined), '');
});

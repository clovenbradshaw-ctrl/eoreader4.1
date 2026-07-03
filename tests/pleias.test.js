import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildGroundedMessages, buildChatMessages } from '../src/model/prompt.js';
import {
  extractGroundedInput, sourceId, buildPicoPrompt, buildRagPrompt,
  stripRefs, extractPleiasAnswer,
} from '../src/model/pleias.js';
import { availableBackends } from '../src/model/interface.js';

// ---------------------------------------------------------------------------
// The Pleias backends register and load the same way as wllama (GGUF by URL).

test('pleias backends are registered alongside the others', () => {
  const names = availableBackends();
  assert.ok(names.includes('pleias-pico'));
  assert.ok(names.includes('pleias-rag'));
});

// ---------------------------------------------------------------------------
// Rebuilding Pleias's structured input from the grounded prompt.

test('extractGroundedInput recovers the question and the verbatim sources', () => {
  const messages = buildGroundedMessages({
    question: 'Where did the fire start?',
    spans: [{ text: 'The fire started in the kitchen.' }, { text: 'It spread to the hall.' }],
    notes: 'fire -> kitchen : started-in',
    orientation: 'pg5200.txt · text · 12 sentences',
  });
  const { query, sources } = extractGroundedInput(messages);
  assert.equal(query, 'Where did the fire start?');
  assert.deepEqual(sources, [
    'The fire started in the kitchen.',
    'It spread to the hall.',
  ]);
});

test('extractGroundedInput falls back to the bare question with no excerpts (chat path)', () => {
  const messages = buildChatMessages({ question: 'What is your name?' });
  const { query, sources } = extractGroundedInput(messages);
  assert.equal(query, 'What is your name?');
  assert.deepEqual(sources, []);
});

// ---------------------------------------------------------------------------
// Source ids — deterministic 16-hex-char hashes.

test('sourceId is a stable 16-hex-char hash', () => {
  const a = sourceId('The fire started in the kitchen.');
  const b = sourceId('The fire started in the kitchen.');
  const c = sourceId('It spread to the hall.');
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.equal(a, b);
  assert.notEqual(a, c);
});

// ---------------------------------------------------------------------------
// The two schemas.

test('buildPicoPrompt frames query + sources and primes source analysis', () => {
  const prompt = buildPicoPrompt({ query: 'Q?', sources: ['S one.', 'S two.'] });
  assert.match(prompt, /^<\|query_start\|>Q\?<\|query_end\|>/);
  assert.ok(prompt.includes(`<|source_start|><|source_id_start|>${sourceId('S one.')}<|source_id_end|>S one.<|source_end|>`));
  assert.ok(prompt.endsWith('<|source_analysis_start|>'));
});

test('buildRagPrompt numbers the sources and primes the reasoning pipeline', () => {
  const prompt = buildRagPrompt({ query: 'Q?', sources: ['S one.', 'S two.'] });
  assert.match(prompt, /^<\|query_start\|>Q\?<\|query_end\|>/);
  assert.ok(prompt.includes('<|source_start|><|source_id|>1 S one.<|source_end|>'));
  assert.ok(prompt.includes('<|source_start|><|source_id|>2 S two.<|source_end|>'));
  assert.ok(prompt.endsWith('<|language_start|>'));
});

// ---------------------------------------------------------------------------
// Stripping the scaffolding back off — the binder must see clean prose.

test('stripRefs keeps the cited text and drops the ref tag', () => {
  assert.equal(
    stripRefs('The fire began <ref name="|source_id|1">in the kitchen</ref>.'),
    'The fire began in the kitchen.',
  );
  assert.equal(stripRefs('loose </ref> tag'), 'loose  tag');
});

test('extractPleiasAnswer pulls the answer span and removes all special tokens', () => {
  const raw =
    '<|language_start|>English<|language_end|>' +
    '<|source_analysis_start|>both sources agree<|source_analysis_end|>' +
    '<|draft_start|>draft text<|draft_end|>' +
    '<|answer_start|>The fire <ref name="|source_id|1">started in the kitchen</ref>.<|answer_end|>';
  assert.equal(extractPleiasAnswer(raw), 'The fire started in the kitchen.');
});

test('extractPleiasAnswer falls back to the draft, then to stripped prose', () => {
  const draftOnly =
    '<|source_analysis_start|>x<|source_analysis_end|><|draft_start|>just the draft<|draft_end|>';
  assert.equal(extractPleiasAnswer(draftOnly), 'just the draft');

  const noSections = '<|source_analysis_start|>bare prose with no answer block';
  assert.equal(extractPleiasAnswer(noSections), 'bare prose with no answer block');
});

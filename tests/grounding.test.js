import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGroundedMessages, buildChatMessages, SYSTEM_GROUND_STRICT, SYSTEM_FREE, SYSTEM_GROUND,
} from '../src/model/prompt.js';
import { parseText } from '../src/perceiver/parse/pipeline.js';
import { runTurn } from '../src/turn/pipeline.js';
import { createAuditLog } from '../src/audit/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import '../src/model/echo.js';
import { createModel } from '../src/model/interface.js';

const setup = (text) => {
  const doc = parseText(text, { docId: 'doc.txt' });
  let p = null;
  doc.sentenceEmbeddings = async (e) => (p ||= Promise.all(doc.sentences.map(s => e.embed(s))));
  return doc;
};
const echo = async () => { const m = createModel('echo'); await m.load(); return m; };
// A degenerate embedder so semantic retrieval contributes nothing — used to force the
// empty-retrieval branch deterministically (mirrors tests/turn.test.js).
const coldEmbedder = { isWarm: () => false, embed: async () => new Float32Array(64), warm: async () => {} };

// ---------------------------------------------------------------------------
// The grounding register, in the prompt builders (the chip's three modes).

test('Chat-with-document (strict) uses the strict register — answers from the lines first, but the outside-knowledge restriction is lifted', () => {
  const [system] = buildGroundedMessages({ question: 'q', spans: [{ idx: 0, text: 'x' }], strict: true });
  assert.equal(system.content, SYSTEM_GROUND_STRICT);
  assert.match(system.content, /Answer from those lines/i);
  // the "only from the document / don't use general knowledge" restriction was removed
  assert.doesNotMatch(system.content, /ONLY from what you read/i);
  assert.match(system.content, /you may answer from your general knowledge/i);
});

test('strict mode with nothing retrieved names the absence, then invites a general-knowledge answer (not a refusal)', () => {
  const [, user] = buildGroundedMessages({ question: 'q', spans: [], strict: true });
  assert.match(user.content, /not covered by what you read/i);
  assert.match(user.content, /answer from general knowledge/i);
  assert.doesNotMatch(user.content, /do not answer from outside knowledge/i);
});

test('the default (Auto) grounded register is unchanged — not strict', () => {
  const [system] = buildGroundedMessages({ question: 'q', spans: [{ idx: 0, text: 'x' }] });
  assert.equal(system.content, SYSTEM_GROUND);
  assert.doesNotMatch(system.content, /ONLY from the document/i);
});

test('Free-form chat uses the general-knowledge register, not the conversation-only one', () => {
  const [free] = buildChatMessages({ question: 'q', free: true });
  assert.equal(free.content, SYSTEM_FREE);
  assert.match(free.content, /general knowledge/i);
  const [plain] = buildChatMessages({ question: 'q' });
  assert.notEqual(plain.content, SYSTEM_FREE, 'the default chat register is unchanged');
});

// ---------------------------------------------------------------------------
// The grounding register, in the pipeline route.

test('Free-form mode routes to chat even with a document loaded — the doc is ignored', async () => {
  const doc = setup('Alice loves apples. Bob hates broccoli.');
  const audit = createAuditLog();
  const result = await runTurn({
    question: 'apples', doc, model: await echo(), embedder: createHashEmbedder(),
    auditLog: audit, grounding: 'free',
  });
  assert.equal(result.turn.route, 'chat', 'free-form ignores the doc and chats');
  assert.equal(result.sources.length, 0, 'no document citations in free-form');
  assert.doesNotMatch(result.turn.prompt || '', /Excerpts from the document/, 'no excerpts fed in free-form');
});

test('Chat-with-document (grounded) stays grounded on empty retrieval — never falls through to chat', async () => {
  // Auto falls through to chat when nothing matches; grounded must hold the route so the
  // strict refusal answers the absence rather than reaching for general knowledge.
  const doc = setup('Alice loves apples. Bob hates broccoli.');
  const audit = createAuditLog();
  const result = await runTurn({
    question: 'unrelated-zebra-question', doc, model: await echo(), embedder: coldEmbedder,
    auditLog: audit, grounding: 'grounded',
  });
  assert.equal(result.turn.route, 'grounded', 'strict grounded never degrades to chat');
});

// ---------------------------------------------------------------------------
// Reliability: a post-answer (annotation) stage failure must not discard the answer.

test('a fact-check failure rides as a flag — the bound answer is never collapsed to an error', async () => {
  const doc = setup('Gregor Pike loved Klaus Berg. Gregor Pike loved Klaus Berg.');
  const audit = createAuditLog();
  // A classifier whose classify() throws — the transient onnxruntime backend fault the
  // audit caught inside factcheck. The turn must salvage the answer formed at bind.
  const boom = {
    classify: async () => { throw new Error("Cannot read properties of null (reading 'registerBackend')"); },
    adjacency: { adjacent: () => null },
  };
  const result = await runTurn({
    question: 'what did Gregor Pike do?', doc, model: await echo(),
    embedder: createHashEmbedder(), classifier: boom, auditLog: audit,
  });
  assert.notEqual(result.turn.route, 'error', 'the turn is not collapsed to an error');
  assert.ok(result.answer && result.answer.length > 0, 'the bound answer rides');
  assert.ok(result.flags.some(f => f.id === 'grounding-incomplete'),
    'the failed grounding check is surfaced as a flag');
  const errStep = result.turn.steps.find(s => s.name === 'error');
  assert.ok(errStep && errStep.data.fatal === false && errStep.data.stage === 'factcheck',
    'the non-fatal stage error is recorded in the trail');
  // and the answer-bearing stages still completed
  assert.ok(result.turn.steps.find(s => s.name === 'bind'), 'bind ran');
  assert.ok(result.turn.steps.find(s => s.name === 'veto'), 'veto still ran after the fault');
});

test('a pre-answer failure is still fatal — there is no answer to salvage', async () => {
  const doc = setup('Alice loves apples.');
  const audit = createAuditLog();
  // A model whose phrase() throws: the llm stage runs before bind, so no answer exists.
  const brokenModel = { id: 'broken', kind: 'local', isLoaded: () => true, async load() {}, async phrase() { throw new Error('backend exploded'); } };
  const result = await runTurn({
    question: 'apples', doc, model: brokenModel, embedder: createHashEmbedder(), auditLog: audit,
  });
  assert.equal(result.turn.route, 'error', 'a failure before the answer exists is fatal');
  assert.match(result.answer, /backend exploded/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isMetaConversational } from '../src/turn/intent.js';
import { buildGroundedMessages } from '../src/model/prompt.js';
import { parseText } from '../src/perceiver/parse/index.js';
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

// ---------------------------------------------------------------------------
// The detector (turn/intent.js): a question ABOUT the conversation itself.

test('questions that invoke the conversation are meta-conversational', () => {
  for (const q of [
    "which topic we've discussed is in the same country as the Eiffel Tower?",
    'which topic is in the same country as the Eiffel Tower?',   // IMPLICIT — no "we", still about the discussed set
    'of the topics, which is the oldest?',                        // "of the topics" without a we/you/I
    'which of those subjects came up first?',
    'of the topics we discussed, which is the oldest?',
    'what did you say earlier?',
    'you mentioned a river — which one?',
    'you told me about three cities, which is the capital?',
    'what was my first question?',          // "my … question" → topic/question noun + I
    'of the things we covered, which is biggest?',
    'in this conversation, what came up first?',
    'summarize our conversation so far',
    "we talked about two authors — who wrote more?",
  ]) assert.equal(isMetaConversational(q), true, q);
});

test('ordinary document questions are NOT meta-conversational', () => {
  for (const q of [
    'who is Gregor?',
    'what is the capital of France?',
    'what happened earlier in the story?',  // "earlier" without a we/you/I conversing verb
    'what would you say is the main theme?', // polite "you say" — not a past conversing reference
    'tell me about the Eiffel Tower',
    'explain photosynthesis',
    'what does he turn into?',
    'who did she talk to in chapter two?',   // "she talk" — third person, the document's content
  ]) assert.equal(isMetaConversational(q), false, q);
});

// ---------------------------------------------------------------------------
// The prompt builder (model/prompt.js): meta opens the both-role thread as the SUBJECT.

test('a meta-conversational grounded prompt frames the conversation as the subject, both sides', () => {
  const [, user] = buildGroundedMessages({
    question: 'which topic have we discussed that is in France?',
    spans: [{ idx: 0, text: 'The Eiffel Tower stands in Paris.' }],
    meta: true,
    conversation: {
      notes: '#0 You: tell me about photosynthesis',
      pastTurns: ['You: what is the capital of Australia?', 'Me: Canberra is the capital of Australia.'],
    },
  });
  // both the user's questions AND the talker's prior answer are present
  assert.match(user.content, /photosynthesis/);
  assert.match(user.content, /Canberra/, 'the assistant side is opened for a meta turn');
  // framed as the subject, not as context-to-skip
  assert.match(user.content, /ABOUT this conversation/i);
  assert.doesNotMatch(user.content, /answer just their latest question/i);
});

test('a NON-meta grounded prompt is unchanged — user thread only, framed as context-to-skip', () => {
  const [, user] = buildGroundedMessages({
    question: 'what colour is it?',
    spans: [{ idx: 0, text: 'The tower is brown.' }],
    conversation: { notes: 'You asked: what is the tower' },  // groundedConversation shape
  });
  assert.match(user.content, /for context only; answer just their latest question/i);
  assert.doesNotMatch(user.content, /ABOUT this conversation/i);
});

test('meta with no history yet falls back to the plain answer clause (byte-identical to a fresh turn)', () => {
  const metaEmpty  = buildGroundedMessages({ question: 'q', spans: [{ idx: 0, text: 'x' }], meta: true, conversation: {} });
  const plainEmpty = buildGroundedMessages({ question: 'q', spans: [{ idx: 0, text: 'x' }] });
  assert.equal(metaEmpty[1].content, plainEmpty[1].content);
});

// ---------------------------------------------------------------------------
// End to end through the pipeline (turn/stages.js, turn/pipeline.js).

test('the route stage tags a meta-conversational turn, and the prompt opens the assistant side', async () => {
  const doc = setup('The Eiffel Tower stands in Paris, France. The Louvre is also in Paris.');
  const audit = createAuditLog();
  const history = [
    { role: 'user', content: 'tell me about photosynthesis' },
    { role: 'assistant', content: 'Photosynthesis converts light into chemical energy in plants.' },
    { role: 'user', content: 'what is the capital of Australia?' },
    { role: 'assistant', content: 'The capital of Australia is Canberra.' },
  ];
  const result = await runTurn({
    question: "which topic we've discussed is in the same country as the Eiffel Tower?",
    doc, model: await echo(), embedder: createHashEmbedder(), auditLog: audit, history,
  });
  const routeStep = result.turn.steps.find(s => s.name === 'route');
  assert.equal(routeStep.data.meta, true, 'the route step records the meta register');
  assert.equal(result.turn.route, 'grounded', 'a meta turn still grounds on the document');
  // the prompt carries the prior topics from BOTH sides of the conversation
  assert.match(result.turn.prompt || '', /photosynthesis/, 'a prior user topic rode into the prompt');
  assert.match(result.turn.prompt || '', /Canberra/, 'a prior assistant answer rode into the prompt');
  assert.match(result.turn.prompt || '', /ABOUT this conversation/i, 'framed as the subject');
});

test('a normal grounded turn does NOT open the assistant side (the poisoning firewall holds)', async () => {
  const doc = setup('The Eiffel Tower stands in Paris, France.');
  const audit = createAuditLog();
  const history = [
    { role: 'user', content: 'where is the Eiffel Tower?' },
    { role: 'assistant', content: 'A made-up wrong answer about Berlin.' },
  ];
  const result = await runTurn({
    question: 'what country is it in?', doc, model: await echo(),
    embedder: createHashEmbedder(), auditLog: audit, history,
  });
  const routeStep = result.turn.steps.find(s => s.name === 'route');
  assert.notEqual(routeStep.data.meta, true, 'an ordinary follow-up is not meta');
  assert.doesNotMatch(result.turn.prompt || '', /made-up wrong answer about Berlin/,
    'the talker\'s prior answer stays withheld on a non-meta grounded turn');
});

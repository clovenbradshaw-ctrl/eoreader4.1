import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyTurn, dialogueState, resolveQuery, discourseFrame, groundedThread, isReferentialStall, OP }
  from '../src/converse/dialogue-state.js';

// These lock in the EO-operator reading of the audit conversation that drifted:
//   t1  who is the mayor of nashville?              EVA  → answered (common ground)
//   t2  what do you mean first round?               NUL  (confusion on the prior answer)
//   t3  how has he been criticized for surveillance EVA  with an open CON ("he") → answered
//                                                        with an ABSENCE, so it stays OPEN
//   t4  find what i'm talking about                 NUL  pure stall → resolves to t3, NOT songs

test('classifyTurn reads each turn as one operator', () => {
  assert.equal(classifyTurn('who is the mayor of nashville?').op, OP.EVA);
  assert.equal(classifyTurn('what do you mean first round?').op, OP.NUL); // confusion on prior
  // a standalone topic that leads with an unbound pronoun is an EVA with an open CON
  const t3 = classifyTurn('how has he been criticized for surveillance expansion?');
  assert.equal(t3.op, OP.EVA);
  assert.equal(t3.needsReferent, true, '"he" points back into the cast');
  assert.deepEqual(t3.topic, ['criticized', 'surveillance', 'expansion']);
  // the turn that killed the conversation: a pure deictic stall, no Figure of its own
  assert.equal(classifyTurn('find what i\'m talking about').op, OP.NUL);
});

test('isReferentialStall: a turn whose only content is reference verbs + deictics', () => {
  assert.equal(isReferentialStall('find what i\'m talking about'), true);
  assert.equal(isReferentialStall('show me that'), true);
  assert.equal(isReferentialStall('you know what i mean'), true);
  // a turn with a real topic noun is NOT a stall, even with a reference verb
  assert.equal(isReferentialStall('find the surveillance report'), false);
  assert.equal(isReferentialStall('what is gregor\'s job?'), false);
});

test('classifyTurn: corrections re-split (SEG), attribute-pronoun is SIG', () => {
  assert.equal(classifyTurn('no, the musician').op, OP.SEG);
  assert.equal(classifyTurn('what is his name?').op, OP.SIG);
  assert.equal(classifyTurn('prove it').op, OP.NUL);
});

test('open intent stays open when the system answer is an ABSENCE', () => {
  const history = [
    { role: 'user',      content: 'who is the mayor of nashville?' },
    { role: 'assistant', content: 'The current mayor of Nashville is Freddie O\'Connell.' },
    { role: 'user',      content: 'how has he been criticized for surveillance expansion?' },
    { role: 'assistant', content: 'I couldn\'t find any information from the reading that addresses this.' },
  ];
  const st = dialogueState(history, 'find what i\'m talking about');
  // the mayor question was answered → common ground; the surveillance question was an
  // absence → it is the live OPEN intent
  assert.ok(st.commonGround.some(i => i.topic.includes('mayor')), 'mayor identity is settled');
  assert.ok(st.openIntents.some(i => i.topic.includes('surveillance')), 'surveillance stays open');
  assert.equal(st.openIntents[st.openIntents.length - 1].topic.includes('surveillance'), true);
});

test('a NUL stall resolves to the open intent, not its own deictic words', () => {
  const history = [
    { role: 'user',      content: 'who is the mayor of nashville?' },
    { role: 'assistant', content: 'The current mayor of Nashville is Freddie O\'Connell.' },
    { role: 'user',      content: 'how has he been criticized for surveillance expansion?' },
    { role: 'assistant', content: 'I couldn\'t find any information from the reading.' },
  ];
  const q = resolveQuery('find what i\'m talking about', history);
  // the bug was: "find what i'm talking about" retrieved on find/talking → "Find a Song by
  // Lyrics". The fix carries the open surveillance intent into the query instead.
  assert.match(q, /surveillance/, 'the stall is resolved to the open intent');
  assert.doesNotMatch(q.replace(/find what i'm talking about/i, ''), /\bsong\b/i);
});

test('a self-standing question passes through; an unbound pronoun is anchored', () => {
  // no history, fully self-contained → untouched (never pollute a strong query)
  assert.equal(resolveQuery('who is the mayor of nashville?', []), 'who is the mayor of nashville?');
  // with a warm referent, the pronoun turn keeps its topic AND gains an anchor
  const history = [
    { role: 'user',      content: 'who is the mayor of nashville?' },
    { role: 'assistant', content: 'The current mayor of Nashville is Freddie O\'Connell.' },
  ];
  const q = resolveQuery('how has he been criticized for surveillance expansion?', history);
  assert.match(q, /surveillance/, 'keeps its own topic');
  assert.ok(q.length > 'how has he been criticized for surveillance expansion?'.length,
    'gains a conversational anchor for the dangling "he"');
});

test('discourseFrame packages the anchored query, subject in focus, and open intent for prompt builders', () => {
  const history = [
    { role: 'user',      content: 'who is the mayor of nashville?' },
    { role: 'assistant', content: 'The current mayor of Nashville is Freddie O\'Connell.' },
    { role: 'user',      content: 'how has he been criticized for surveillance expansion?' },
    { role: 'assistant', content: 'I couldn\'t find any information from the reading.' },
  ];
  const f = discourseFrame('find what i\'m talking about', history);
  assert.match(f.resolved, /surveillance/, 'resolved query carries the open discourse intent');
  assert.match(f.open, /surveillance/i, 'the open intent is surfaced for the prompt frame');
  assert.ok(typeof f.subject === 'string', 'subject is a string (the warm referent label, may be empty)');
  // Degenerate input never throws, and a self-standing turn is not polluted.
  assert.deepEqual(discourseFrame('', []), { resolved: '', subject: '', open: '' });
  assert.equal(discourseFrame('who is the mayor of nashville?', []).resolved, 'who is the mayor of nashville?');
});

// ─────────────────────────────────────────────────────────────────────────────
// Broader operator coverage — the genome must place every shape of turn.
// ─────────────────────────────────────────────────────────────────────────────

test('classifyTurn: imperatives are EVA requests, not DEF assertions', () => {
  assert.equal(classifyTurn('summarize the document').op, OP.EVA);
  assert.equal(classifyTurn('explain the resolution spectrum').op, OP.EVA);
  assert.equal(classifyTurn('list the nine operators').op, OP.EVA);
  assert.equal(classifyTurn('compare the two readings').op, OP.EVA);
});

test('classifyTurn: a genuine assertion is a DEF on the user side', () => {
  assert.equal(classifyTurn('i think the mayor is corrupt').op, OP.DEF);
  assert.equal(classifyTurn('the mayor is a former software engineer').op, OP.DEF);
  assert.equal(classifyTurn('in my opinion the mayor overreached').op, OP.DEF);
  // a bare fragment is NOT confidently a claim — default to EVA (a request), never DEF
  assert.equal(classifyTurn('operators').op, OP.EVA);
});

test('classifyTurn: continuation / confusion / evidence all read as NUL holds', () => {
  for (const q of ['now?', 'go on', 'huh?', 'wait, what?', 'how so?', 'prove it', 'back it up']) {
    assert.equal(classifyTurn(q).op, OP.NUL, `"${q}" is a hold`);
  }
});

test('classifyTurn: a pronoun beside a real topic is an EVA with an open CON', () => {
  const c = classifyTurn('is his surveillance policy controversial?');
  assert.equal(c.op, OP.EVA);
  assert.equal(c.needsReferent, true);
});

test('classifyTurn never throws on degenerate input', () => {
  for (const q of ['', '   ', '???', '...', null, undefined, 42, {}]) {
    assert.doesNotThrow(() => classifyTurn(q));
    assert.ok(Object.values(OP).includes(classifyTurn(q).op));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// dialogueState — settled vs open, the firewall, robustness.
// ─────────────────────────────────────────────────────────────────────────────

const audit = [
  { role: 'user',      content: 'who is the mayor of nashville?' },
  { role: 'assistant', content: "The current mayor of Nashville is Freddie O'Connell." },
  { role: 'user',      content: 'what do you mean first round?' },
  { role: 'assistant', content: 'He led the first round of the 2023 election.' },
  { role: 'user',      content: 'how has he been criticized for surveillance expansion?' },
  { role: 'assistant', content: "I couldn't find any information from the reading on that.", unbound: true },
];

test('dialogueState: the audit conversation, read into operator state', () => {
  const st = dialogueState(audit, 'find what i\'m talking about');
  // the mayor question (answered) is settled; the surveillance question (absence) is open
  assert.ok(st.commonGround.some(i => i.topic.includes('mayor')));
  assert.ok(st.openIntents.some(i => i.topic.includes('surveillance')));
  assert.ok(!st.commonGround.some(i => i.topic.includes('surveillance')), 'an absence answer never settles');
  // the live turn is a stall pointing back at the open surveillance intent
  assert.equal(st.current.op, OP.NUL);
  assert.equal(st.delta.kind, 'stall');
  assert.ok(st.delta.intent.topic.includes('surveillance'));
});

test('dialogueState: an unbound-tagged reply leaves the intent open', () => {
  const h = [
    { role: 'user', content: 'who funds the surveillance program?' },
    { role: 'assistant', content: 'A confident-sounding but ungrounded reply.', unbound: true },
  ];
  const st = dialogueState(h, 'and?');
  assert.equal(st.openIntents.length, 1, 'unbound → not settled');
  assert.equal(st.commonGround.length, 0);
});

test('dialogueState: a DEF user turn becomes common ground regardless of the reply', () => {
  const h = [{ role: 'user', content: 'the mayor is a former engineer' }];
  const st = dialogueState(h, 'is that relevant?');
  assert.ok(st.commonGround.some(i => i.op === OP.DEF));
});

test('dialogueState: empty / assistant-only / malformed histories are safe', () => {
  for (const h of [[], null, undefined, [{ role: 'assistant', content: 'hi' }], [{ role: 'user' }], [null]]) {
    const st = dialogueState(h, 'who is the mayor?');
    assert.ok(Array.isArray(st.openIntents) && Array.isArray(st.commonGround));
    assert.ok(st.current && Object.values(OP).includes(st.current.op));
  }
});

test('dialogueState: the most recent open intent wins the stall', () => {
  const h = [
    { role: 'user', content: 'who funds surveillance?' },
    { role: 'assistant', content: "I couldn't find that." },
    { role: 'user', content: 'what about the zoning board?' },
    { role: 'assistant', content: "Not covered in the reading." },
  ];
  const st = dialogueState(h, 'find what i mean');
  assert.ok(st.delta.intent.topic.includes('zoning'), 'the newest open intent is the target');
});

// ─────────────────────────────────────────────────────────────────────────────
// groundedThread — the prompt block, and the firewall (no answer text leaks).
// ─────────────────────────────────────────────────────────────────────────────

test('groundedThread: settled holds answered questions, open holds absence-answered', () => {
  const { settled, open } = groundedThread(audit, 'find what i\'m talking about');
  assert.ok(settled.some(s => /mayor/i.test(s)), 'mayor question is settled');
  assert.ok(open.some(s => /surveillance/i.test(s)), 'surveillance question is open');
});

test('groundedThread: the firewall holds — no assistant answer text appears', () => {
  const { settled, open } = groundedThread(audit, 'and?');
  const all = [...settled, ...open].join(' | ');
  assert.doesNotMatch(all, /Freddie|O'Connell|led the first round|couldn't find/i,
    'only the user questions ride, never the talker answers');
});

test('groundedThread: dedupes repeated questions and caps recency', () => {
  const h = [];
  for (let i = 0; i < 8; i++) {
    h.push({ role: 'user', content: 'who is the mayor?' });
    h.push({ role: 'assistant', content: 'Freddie O\'Connell.' });
  }
  const { settled } = groundedThread(h, 'now?');
  assert.equal(settled.length, 1, 'identical settled questions collapse to one');
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveQuery — invariants across turn shapes.
// ─────────────────────────────────────────────────────────────────────────────

test('resolveQuery: the original question is always preserved verbatim', () => {
  const cases = [
    ['who is the mayor of nashville?', []],
    ['find what i\'m talking about', audit],
    ['prove it', audit],
    ['no, the other one', audit],
    ['now?', audit],
  ];
  for (const [q, h] of cases) assert.ok(resolveQuery(q, h).includes(q), `"${q}" kept`);
});

test('resolveQuery: a thin continuation falls back to the conversation focus terms', () => {
  const h = [
    { role: 'user', content: 'who is the mayor of nashville?' },
    { role: 'assistant', content: 'Freddie O\'Connell.' },
  ];
  const q = resolveQuery('now?', h);
  assert.ok(/mayor|nashville/.test(q), 'a bare "now?" rides the prior topic, not the word "now"');
});

test('resolveQuery: a SEG correction is anchored, not retrieved on its opener', () => {
  const h = [
    { role: 'user', content: 'who plays at the venue?' },
    { role: 'assistant', content: "I couldn't find that." },
  ];
  const q = resolveQuery('no, the musician', h);
  assert.ok(q.length > 'no, the musician'.length, 'a correction leans on the open intent / referent');
});

test('resolveQuery: never injects the talker\'s prior answer into the query', () => {
  const q = resolveQuery('find what i\'m talking about', audit);
  assert.doesNotMatch(q.replace(/find what i'm talking about/i, ''),
    /Freddie|O'Connell|led the first round/i, 'the answer channel stays out of retrieval');
});

// ─────────────────────────────────────────────────────────────────────────────
// The progression invariant — common ground only grows; an absence reopens nothing.
// ─────────────────────────────────────────────────────────────────────────────

test('dialogueState: walking the audit turn by turn, common ground grows monotonically', () => {
  const steps = [];
  const h = [];
  const push = (role, content, extra = {}) => h.push({ role, content, ...extra });
  push('user', 'who is the mayor of nashville?');
  steps.push(dialogueState(h, '').commonGround.length);          // 0 — not yet answered
  push('assistant', "It's Freddie O'Connell.");
  steps.push(dialogueState(h, '').commonGround.length);          // 1 — settled
  push('user', 'how has he been criticized for surveillance expansion?');
  push('assistant', "I couldn't find any information.", { unbound: true });
  steps.push(dialogueState(h, '').commonGround.length);          // still 1 — absence ≠ settled
  assert.deepEqual(steps, [0, 1, 1]);
});

// ─────────────────────────────────────────────────────────────────────────────
// The grounded prompt carries the common-ground cue (suppress restatement) and
// keeps the firewall closed — the settled QUESTION rides, never the answer.
// ─────────────────────────────────────────────────────────────────────────────

import { buildGroundedMessages } from '../src/model/prompt.js';

test('buildGroundedMessages renders the settled block; absent → byte-identical', () => {
  const [, withSettled] = buildGroundedMessages({
    question: 'how has he been criticized for surveillance expansion?',
    spans: [{ idx: 0, text: 'x' }],
    conversation: { notes: 'You asked: who is the mayor of nashville?', settled: ['who is the mayor of nashville?'] },
  });
  assert.match(withSettled.content, /Already settled with them/);
  assert.match(withSettled.content, /build on them, don't restate them/);
  assert.match(withSettled.content, /- who is the mayor of nashville\?/);

  // No settled slot → the block is simply absent (the byte-identical default).
  const [, none] = buildGroundedMessages({
    question: 'q', spans: [{ idx: 0, text: 'x' }],
    conversation: { notes: 'You asked: who is the mayor?' },
  });
  assert.doesNotMatch(none.content, /Already settled/);
});

test('the settled block never carries the talker\'s prior answer (firewall)', () => {
  // groundedThread only ever emits the user QUESTION text; feed it straight to the prompt.
  const { settled } = groundedThread(audit, 'and?');
  const [, msg] = buildGroundedMessages({
    question: 'and?', spans: [{ idx: 0, text: 'x' }], conversation: { settled },
  });
  assert.doesNotMatch(msg.content, /Freddie|O'Connell|led the first round/i,
    'a settled fact is named by its question, never by the answer the model would anchor on');
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration — the fix in situ, through retrieval and through the full turn.
// ─────────────────────────────────────────────────────────────────────────────

import { retrieveHybrid } from '../src/retrieve/index.js';
import { parseText } from '../src/perceiver/parse/pipeline.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import { runTurn } from '../src/turn/pipeline.js';
import '../src/model/echo.js';
import { createModel } from '../src/model/interface.js';
import { createAuditLog } from '../src/audit/index.js';

// A document that holds BOTH the topic the conversation is pursuing and the literal-token
// distractor the audit fell into — the source list there included "Find a Song by Lyrics".
const DISTRACTOR_DOC =
  "Mayor O'Connell expanded the city police surveillance camera network across downtown. " +
  "Critics say the surveillance expansion threatens privacy and civil liberties. " +
  "The harbor ferry schedule changed in spring. " +
  "A new bakery opened on Fifth Avenue last month. " +
  "Find a Song by Lyrics is a tool that finds any song from a few remembered words. " +
  "The city council meets on Tuesdays. " +
  "Local weather has been mild this season. " +
  "The library extended its weekend hours.";

const SURVEILLANCE_HISTORY = [
  { role: 'user',      content: 'who is the mayor of nashville?' },
  { role: 'assistant', content: "The mayor is Freddie O'Connell." },
  { role: 'user',      content: 'how has he been criticized for surveillance expansion?' },
  { role: 'assistant', content: "I couldn't find any information on that.", unbound: true },
];

test('retrieval before/after: the literal stall hits the song line; the resolved stall hits the topic', async () => {
  const doc = parseText(DISTRACTOR_DOC, { docId: 't' });
  const e = createHashEmbedder();
  const stall = 'find what i\'m talking about';

  // BEFORE — retrieving on the literal words lands on the "Find a Song by Lyrics" line.
  const literal = await retrieveHybrid(doc, stall, e, 1);
  assert.match(literal[0].text, /Find a Song by Lyrics/i, 'the literal stall matches the distractor');

  // AFTER — the resolved query carries the open surveillance intent and lands on the topic.
  const resolved = await retrieveHybrid(doc, resolveQuery(stall, SURVEILLANCE_HISTORY), e, 1);
  assert.match(resolved[0].text, /surveillance/i, 'the resolved stall lands on the open intent');
  assert.doesNotMatch(resolved[0].text, /Find a Song by Lyrics/i);
});

test('full turn: a stalled follow-up retrieves the open intent into the talker prompt', async () => {
  const doc = parseText(DISTRACTOR_DOC, { docId: 't' });
  doc.sentenceEmbeddings = async (em) => Promise.all(doc.sentences.map(s => em.embed(s)));
  const model = createModel('echo'); await model.load();
  const audit = createAuditLog();
  await runTurn({
    question: 'find what i\'m talking about', doc, model,
    embedder: createHashEmbedder(), auditLog: audit, history: SURVEILLANCE_HISTORY,
  });
  const t = audit.turns[0];
  const excerpts = t.prompt.slice(t.prompt.indexOf('What I found reading it:'));
  assert.match(excerpts, /surveillance/i, 'the open intent reached the talker, not the song line');
});

test('full turn: a settled fact rides as common ground, suppressing restatement', async () => {
  const doc = parseText(DISTRACTOR_DOC, { docId: 't' });
  doc.sentenceEmbeddings = async (em) => Promise.all(doc.sentences.map(s => em.embed(s)));
  const model = createModel('echo'); await model.load();
  const audit = createAuditLog();
  await runTurn({
    question: 'how has he been criticized for surveillance expansion?', doc, model,
    embedder: createHashEmbedder(), auditLog: audit,
    history: [
      { role: 'user',      content: 'who is the mayor of nashville?' },
      { role: 'assistant', content: "The mayor is Freddie O'Connell." },
    ],
  });
  const t = audit.turns[0];
  assert.match(t.prompt, /Already settled with them/, 'the settled mayor fact is named as common ground');
  assert.match(t.prompt, /don't restate them/);
  // the firewall still holds end to end — the prior ANSWER never reaches the prompt
  assert.doesNotMatch(t.prompt, /Freddie/, 'the talker never sees its own prior answer');
});

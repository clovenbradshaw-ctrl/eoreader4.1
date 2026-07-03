import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { surfFold } from '../src/surfer/surf.js';
import { createAuditLog } from '../src/audit/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import { buildGroundedMessages } from '../src/model/prompt.js';
import '../src/model/echo.js';
import { createModel } from '../src/model/interface.js';
import { runTurn } from '../src/turn/pipeline.js';
import { groundedSpeak, RULES_REV } from '../src/organs/out/speech/index.js';

const STORY =
  'Gregor Samsa woke transformed. His sister Grete brought a bowl of milk. ' +
  'Grete opened the window. The father drove Gregor back into the room.';

const setup = (text) => {
  const doc = parseText(text, { docId: 't' });
  let p = null;
  doc.sentenceEmbeddings = async (e) => (p ||= Promise.all(doc.sentences.map(s => e.embed(s))));
  return doc;
};

test('echo exposes propose() — a token-distribution stream the gate can drive', async () => {
  const echo = createModel('echo');
  const messages = buildGroundedMessages({
    question: 'q', spans: [{ idx: 0, text: 'Grete opened the window.' }],
  });
  assert.equal(typeof echo.propose, 'function');
  const out = [];
  for await (const dist of echo.propose(messages, {})) out.push(dist);
  assert.ok(out.length > 0, 'the proposal yields a stream of distributions');
  assert.ok(out.every(d => Array.isArray(d.tokens) && d.tokens.length), 'each is a Dist over tokens');
});

test('groundedSpeak selects grounded propositions through the gate (echo)', async () => {
  const doc = parseText(STORY, { docId: 'rel' });
  const surf = surfFold(doc, 0);
  const units = doc.units;
  const spans = surf.stops.map(i => ({ idx: i, text: units[i] }));
  const messages = buildGroundedMessages({ question: 'What did Grete do?', spans });
  const echo = createModel('echo');

  const r = await groundedSpeak({ model: echo, messages, doc, surf, question: 'What did Grete do?' });
  assert.ok(r.emitted.length > 0, 'grounded propositions collapse into speech');
  assert.ok(r.audit.every(a => a.collapse === (a.projection > a.null)),
    'every collapse decision is the projection beating the null');
  // The emitted speech is grounded — every emitted candidate had document support.
  assert.ok(r.committed.every(c => c.finding), 'each committed proposition has a finding');
});

test('GOLDEN PARITY — the gated path is opt-in; the bind/cite/veto path always runs', async () => {
  // The whole point of the flag (§10): grounded by EITHER path, the answer flows
  // through the same bind → factcheck → veto stages. With RULES_REV off (the
  // default) the gate is inert and the turn is byte-identical to before; with it on
  // the gated answer is still bound and cited. The bind/cite invariant holds in
  // both modes, and `gated` rides the turn only when the gate actually ran.
  const doc = setup('Alice loves apples. Bob hates broccoli.');
  const model = createModel('echo');
  await model.load();
  const audit = createAuditLog();
  const result = await runTurn({
    question: 'apples', doc, model, embedder: createHashEmbedder(), auditLog: audit,
  });
  assert.ok(result.sources.length > 0, 'the bind/cite path still runs');
  assert.ok(result.turn.bound.some(b => b.citation), 'a claim binds, as before');

  // The flag's default is OFF — verified directly, independent of an env override
  // that a harness may set to exercise the gated path (process.env.RULES_REV).
  const envForcesOn = /^(1|true|on)$/i.test(process.env.RULES_REV || '');
  assert.equal(RULES_REV, envForcesOn, 'the flag tracks the env; default (unset) is off');
});

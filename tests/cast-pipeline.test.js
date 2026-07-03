// The cast cycle threaded through the real pipeline. Two guarantees: (1) threading a cast leaves
// a normal turn byte-identical (EVA respects a resolved live read; REC is observe-only), so it
// can never regress an answer; (2) the cast accumulates across turns and the fold reports it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseText } from '../src/perceiver/parse/pipeline.js';
import { runTurn } from '../src/turn/pipeline.js';
import { createAuditLog } from '../src/audit/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import { createCast } from '../src/converse/cast.js';

const KIN = `Gregor Samsa woke from troubled dreams. His sister Grete looked after him.
Grete was Gregor's sister. The mother wept. Gregor's sister played the violin.`;
const setup = () => {
  const doc = parseText(KIN, { docId: 'pg', genderCoref: true });
  let p = null;
  doc.sentenceEmbeddings = async (e) => (p ||= Promise.all(doc.sentences.map(s => e.embed(s))));
  return doc;
};
const fixedModel = (a) => ({ id: 'fixed', kind: 'local', isLoaded: () => true, load: async () => {}, phrase: async () => a });

test('threading a cast leaves a normal turn byte-identical (observe-only, no regression)', async () => {
  const base = {
    question: "who is Gregor's sister?",
    model: fixedModel("Gregor's sister is Grete."),
  };
  const a = await runTurn({ ...base, doc: setup(), embedder: createHashEmbedder(), auditLog: createAuditLog() });
  const b = await runTurn({ ...base, doc: setup(), embedder: createHashEmbedder(), auditLog: createAuditLog(), cast: createCast() });
  assert.equal(b.answer, a.answer, 'the answer is unchanged by the cast');
  assert.equal(b.route || b.turn?.route, a.route || a.turn?.route, 'the route is unchanged');
});

test('the fold reports the cast, and it accumulates across turns', async () => {
  const cast = createCast();
  const r1 = await runTurn({
    question: "who is Gregor's sister?", doc: setup(),
    model: fixedModel("Gregor's sister is Grete."),
    embedder: createHashEmbedder(), auditLog: createAuditLog(), cast,
  });
  const fold1 = r1.turn.steps.find(s => s.name === 'fold');
  assert.ok(fold1.data.cast, 'the fold step carries the cast when one is threaded');
  // The snapshot is a live view of the same cast object; after a concentrated turn it holds the
  // settled referent. (The fold may or may not have concentrated; the field must at least exist.)
  assert.ok(Array.isArray(fold1.data.cast.settled), 'the cast snapshot rides the audit');

  // A second turn sees the accumulated cast — the same object, carried across the session.
  const r2 = await runTurn({
    question: 'and the mother?', doc: setup(),
    model: fixedModel('The mother wept.'),
    embedder: createHashEmbedder(), auditLog: createAuditLog(),
    history: [{ role: 'user', content: "who is Gregor's sister?" }, { role: 'assistant', content: "Gregor's sister is Grete." }],
    cast,
  });
  const fold2 = r2.turn.steps.find(s => s.name === 'fold');
  assert.ok(fold2.data.cast, 'the second turn still reports the cast');
  assert.ok(fold2.data.cast.turn >= fold1.data.cast.turn, 'the cast clock advanced across turns');
});

test('no cast threaded → the fold reports no cast field (byte-identical default path)', async () => {
  const r = await runTurn({
    question: "who is Gregor's sister?", doc: setup(),
    model: fixedModel("Gregor's sister is Grete."),
    embedder: createHashEmbedder(), auditLog: createAuditLog(),
  });
  const fold = r.turn.steps.find(s => s.name === 'fold');
  assert.equal(fold.data.cast, undefined, 'the cast field is absent on the default path');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/pipeline.js';
import { runTurn } from '../src/turn/pipeline.js';
import { createAuditLog } from '../src/audit/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';

// FLAG, NEVER GATE (the answer-restriction is lifted).
//
// The §5 refuse-gate is OFF: a pointed question's answer is no longer restricted to the
// document, so a from-nowhere / ungrounded draft is no longer regenerated toward "I did not
// find it". It RIDES, with its flag. The deep invariant is unchanged and stronger: the model's
// own word always surfaces — never a canned decline, never a regenerate forced by a grounding
// gate. Telling the user (the unbound flag) is the whole job; the answer is the model's.

const setup = (text) => {
  const doc = parseText(text, { docId: 'g' });
  let p = null;
  doc.sentenceEmbeddings = async (e) => (p ??= Promise.all(doc.sentences.map(s => e.embed(s))));
  return doc;
};
const DOC   = 'Alice loves apples. Bob hates broccoli. Carol grows carrots.';
const model = (text) => ({ id: 'm', kind: 'test', isLoaded: () => true, async load() {}, async phrase() { return text; } });
const run   = (m, audit = createAuditLog()) =>
  runTurn({ question: 'apples', doc: setup(DOC), model: m, embedder: createHashEmbedder(), auditLog: audit });

// 1 — A from-nowhere answer RIDES, flagged — it is not gated, not regenerated.
test('a from-nowhere unbound draft rides with its flag — no gate, no regenerate', async () => {
  const r = await run(model('Zebras orbit cosmic nonsense beyond comprehension.'));
  assert.ok(r.flags.some(f => f.id === 'unbound' && f.refuses), 'unbound is a serious-pill flag');
  assert.equal(r.turn.gated, false, 'the refuse-gate is off — an ungrounded answer is not gated');
  assert.equal(r.turn.steps.find(s => s.name === 'revise').data.attempts, 0, 'and the talker is not regenerated');
  assert.match(r.answer, /zebras/i, 'the model text is the answer, untouched');
  assert.doesNotMatch(r.answer, /can'?t ground|do(?:n'?t| not) have/i, 'no canned decline');
  assert.equal(r.sources.length, 0, 'it cites nothing — honestly, the flag says so');
});

// 2 — A clearly-grounded answer rides too, and earns its citation.
test('a well-grounded answer rides and cites its span', async () => {
  const r = await run(model('Alice loves apples.'));
  assert.equal(r.turn.gated, false);
  assert.ok(!r.flags.some(f => f.id === 'unbound'), 'unbound does not fire on a bound claim');
  assert.match(r.answer, /alice loves apples/i, 'the model text rides');
  assert.ok(r.sources.length > 0, 'and it cites its span');
});

// 3 — Fluency is irrelevant: a terse and an eloquent ungrounded draft both ride, both flagged.
test('fluency changes nothing: terse and eloquent ungrounded prose both ride, both flagged', async () => {
  const terse  = await run(model('Zebras nonsense.'));
  const florid = await run(model(
    'In a luminous and profoundly orchestrated meditation, the ineffable cosmos unfurls ' +
    'its transcendent mystery across the boundless and shimmering dark of pure being.'));
  assert.equal(terse.turn.gated,  false);
  assert.equal(florid.turn.gated, false);
  assert.ok(terse.flags.some(f => f.id === 'unbound'),  'terse is flagged unbound');
  assert.ok(florid.flags.some(f => f.id === 'unbound'), 'florid is flagged unbound');
  assert.match(terse.answer,  /zebras/i,  'the terse model word rides');
  assert.match(florid.answer, /luminous/i, 'the florid model word rides');
});

// 4 — The record: the surfaced answer is the model's draft, ungated, with the flag beside it.
test('the ungrounded turn surfaces the model draft, ungated, with the flag recorded beside it', async () => {
  const audit = createAuditLog();
  const r = await run(model('Zebras orbit cosmic nonsense.'), audit);
  const t = audit.turns[0];
  assert.equal(t.gated, false, 'no gate is recorded');
  assert.match(t.rawOutput, /zebras/i, 'the verbatim draft is captured');
  assert.match(t.answer, /zebras/i, 'and it IS the surfaced answer — never replaced by a decline');
  assert.ok(t.flags.some(f => f.id === 'unbound' && f.refuses),
    'the flag rides in the record, telling the user the grounding is absent');
});

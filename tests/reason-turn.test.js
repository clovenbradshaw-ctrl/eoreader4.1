// tests/reason-turn.test.js — the reasoning walk in its real socket: a stage of the turn
// (turn/stages.js `reason`, between `gate` and `prompt`), proved on the echo path against the
// real parser and the real pipeline. Two pins lock the intent gate in place:
//
//   1. AN OPEN TURN REACHES — an `explain` question runs the walk: real SYN/CON/REC events are
//      committed to the document's own log through the ENACTOR door before the prompt is built,
//      every step cannot-witness (the firewall), every step graded, and the turn still answers
//      with citations. The warranted grades double as the parser-shape pin: the walk can only
//      learn a rule if it READ the corpus bonds, and the live parser writes them as `tgt`.
//   2. A POINTED TURN NEVER REACHES — an `answer` (fact-lookup) question leaves the log
//      byte-identical, deposits no reasoning, and the answerability stage (`answerVoid`)
//      still runs exactly as it does today. A later change that quietly let the reach leak
//      into fact-lookups fails here.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/pipeline.js';
import { runTurn } from '../src/turn/pipeline.js';
import { createAuditLog } from '../src/audit/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import '../src/model/echo.js';
import { createModel } from '../src/model/interface.js';
import { taskOf } from '../src/turn/intent.js';
import { canWitness } from '../src/core/provenance.js';

// A corpus with a learnable regularity (two `employs` pairs) plus structure around it, laid
// down by the REAL parser — the walk reads whatever parse deposited, exactly as in production.
const TEXT = 'Acme employs Bob. Corp employs Dana. Acme partners with Corp. ' +
             'Bob builds widgets in the factory. Dana signs the contracts.';

const setup = () => {
  const doc = parseText(TEXT, { docId: 't' });
  let p = null;
  doc.sentenceEmbeddings = async (e) => {
    if (p) return p;
    p = Promise.all(doc.sentences.map(s => e.embed(s)));
    return p;
  };
  return doc;
};

const drive = async (question) => {
  const doc = setup();
  const before = doc.log.length;
  const model = createModel('echo');
  await model.load();
  const captured = {};
  const result = await runTurn({
    question, doc, model, embedder: createHashEmbedder(), auditLog: createAuditLog(),
    onStep: (name, ctx) => { captured[name] = ctx; },
  });
  return { doc, before, after: doc.log.length, captured, result };
};

test('an explain turn runs the walk: committed to the doc log, enactor-door, graded, still answering', async () => {
  const question = 'why does Acme employ Bob?';
  // The premise, guarded: if the task register ever stops reading this as `explain`, fail
  // HERE (the premise), not silently downstream as a walk that never ran.
  assert.equal(taskOf(question).task, 'explain', 'the question classifies as the open task');

  const { doc, before, after, captured, result } = await drive(question);

  // The walk COMMITTED — the log grew before the prompt was built, and step N+1 of anything
  // downstream reads a graph that includes the walk's events.
  assert.ok(after > before, 'the walk appended real events to the document log');
  const appended = doc.log.snapshot().slice(before);
  for (const e of appended) {
    assert.equal(e.prov?.door, 'enactor', `a walk event goes through the enactor door (${e.op})`);
    assert.equal(canWitness(e.prov), false, 'and can never witness — the firewall, by type');
  }

  // The stage deposited the walk's result on the context, every step graded off the log.
  const r = captured.reason?.reasoning;
  assert.ok(r, 'the reason stage ran and deposited the walk result');
  assert.equal(r.steps.length, appended.length, 'one committed event per step');
  assert.equal(r.everyStepIsMine, true, 'no step can witness anything as world');
  const LATTICE = ['grounded', 'warranted-ungrounded', 'idle-ungrounded'];
  for (const s of r.steps) assert.ok(LATTICE.includes(s.grade), `step ${s.i} carries a grade`);
  const ungrounded = (r.gradeCounts['warranted-ungrounded'] || 0) + (r.gradeCounts['idle-ungrounded'] || 0);
  assert.ok(ungrounded > 0, 'the walk reached past the corpus, marked ungrounded');
  // A warranted grade is only reachable through a learned rule, and a rule is only learnable
  // from bonds the walk actually READ — the live parser writes them as `tgt`, so this is the
  // pin that the walk sees the real corpus (with `dst` it would see zero bonds).
  assert.ok((r.gradeCounts['warranted-ungrounded'] || 0) >= 1, 'a rule was learned from the parsed corpus');

  // The turn is intact around the walk: audit trail records the stage, the answer still binds.
  const step = result.turn.steps.find(s => s.name === 'reason');
  assert.ok(step && step.data.steps === r.steps.length, 'the audit trail records the walk');
  assert.equal(step.data.mine, true, 'and the firewall reading rides in the trail');
  assert.ok(result.answer && /\[s\d+\]/.test(result.answer), 'the turn still answers with citations');
});

test('an answer turn never reaches: the log is untouched and the answerability gate is as today', async () => {
  const question = 'who employs Bob?';
  assert.equal(taskOf(question).task, 'answer', 'the question classifies as the pointed task');

  const { before, after, captured, result } = await drive(question);

  // No reach on a fact-lookup: not one event appended, nothing deposited, nothing recorded.
  assert.equal(after, before, 'the document log is byte-identical — the walk never ran');
  assert.equal(captured.reason?.reasoning, undefined, 'no reasoning rode the context');
  const step = result.turn.steps.find(s => s.name === 'reason');
  assert.ok(step && step.data.steps === undefined, 'the audit records the stage as a pass-through');

  // answerVoid still holds the pointed path exactly as it does today: the answerable stage
  // ran (it is only skipped for non-answer tasks or missing docs), and the turn answered
  // from the document, citations bound.
  assert.ok(result.turn.steps.find(s => s.name === 'answerable'), 'the answerability stage still runs');
  assert.ok(result.answer && /\[s\d+\]/.test(result.answer), 'the pointed answer binds as before');
});

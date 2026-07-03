import { test } from 'node:test';
import assert from 'node:assert/strict';

import { expectAnswer, answerConstraintErrors, answerPredictionError, isProperName, SLOT } from '../src/turn/expect.js';
import { runVetoes } from '../src/ground/veto.js';
import { stages } from '../src/turn/stages.js';
import { parseText } from '../src/perceiver/parse/index.js';

// The prompt read as a PREDICTION of its own answer (docs/answer-expectation.md). A good
// answer satisfies the constraints the prompt opened; a miss leaves a prediction error the
// engine should catch — stop, and begin again, visibly. The deciding axis is CHECKABILITY:
// mechanical constraints (name, length, order) gate a restart; soft ones (form) flag; an
// open-ended prompt yields no constraint at all, so the engine just answers.

const idsOf = (q) => expectAnswer(q).constraints.map((c) => c.id);

// ── The prediction: read the prompt's constraints ────────────────────────────

test('a name question predicts a high-precision, gating name constraint', () => {
  for (const q of ['what is her name?', "what's his name", 'what is the name of the clerk',
                   'what is she called?']) {
    assert.deepEqual(idsOf(q), ['name'], `“${q}” → a name constraint`);
    assert.ok(expectAnswer(q).gates);
  }
});

test('a length bound is predicted and gates — in N words / sentences', () => {
  assert.deepEqual(expectAnswer('summarize in one word').constraints.map((c) => [c.dim, c.params.unit, c.params.max]),
    [['length', 'word', 1]]);
  assert.equal(expectAnswer('tell it in three sentences').constraints[0].params.max, 3);
  assert.equal(expectAnswer('answer in 50 words').constraints[0].params.max, 50);
  assert.ok(expectAnswer('in two sentences please').gates);
});

test('an order/transform is predicted — backwards vs in order', () => {
  assert.equal(expectAnswer('say the story backwards').constraints[0].dim, 'order');
  assert.equal(expectAnswer('say the story backwards').constraints[0].params.dir, 'desc');
  assert.equal(expectAnswer('retell it in order').constraints[0].params.dir, 'asc');
});

test('an open-ended or taste prompt yields NO constraint — the engine just answers', () => {
  for (const q of ['write a poem about his loneliness', 'summarize', 'sumarize',
                   'what is this about?', 'explain the ending', 'how does he feel?']) {
    const e = expectAnswer(q);
    // a poem prompt carries only a SOFT (non-gating) form constraint; the rest carry none
    assert.ok(!e.gates, `“${q}” must not gate`);
  }
  assert.deepEqual(idsOf('summarize'), []);                       // pure open → nothing to check
  assert.deepEqual(idsOf('write a poem'), ['form-poem']);         // a soft, non-gating form hint
  assert.equal(expectAnswer('write a poem').constraints[0].gates, false);
});

test('a proper name is told from a description', () => {
  assert.ok(isProperName('Grete') && isProperName('Gregor Samsa'));
  assert.ok(!isProperName('his sister') && !isProperName('the chief clerk') && !isProperName('her'));
});

// ── The error signal: which constraints did the answer miss? ──────────────────

test('a name miss fires when the reading knows the name but the answer withholds it', () => {
  const expect = expectAnswer('what is her name?');
  const referent = { id: 1, label: 'Grete' };
  const errs = answerConstraintErrors(expect, 'Gregor’s sister is a kind and caring person.', { referent });
  assert.equal(errs.length, 1);
  assert.equal(errs[0].dim, 'name');
  assert.equal(errs[0].expectedName, 'Grete');
  // giving the name clears it; an honest abstention also fills the slot
  assert.deepEqual(answerConstraintErrors(expect, 'Her name is Grete.', { referent }), []);
  assert.deepEqual(answerConstraintErrors(expect, 'I did not find her name in what I read.', { referent }), []);
});

test('a length miss fires on overrun and clears when short enough', () => {
  const expect = expectAnswer('answer in one word');
  assert.equal(answerConstraintErrors(expect, 'Her name is Grete.').length, 1);   // 4 words > 1
  assert.deepEqual(answerConstraintErrors(expect, 'Grete.'), []);                  // 1 word
  assert.deepEqual(answerConstraintErrors(expectAnswer('in two sentences'),
    'He woke transformed. His family despaired.'), []);                            // 2 ≤ 2
  assert.equal(answerConstraintErrors(expectAnswer('in two sentences'),
    'A. B. C.').length, 1);                                                        // 3 > 2
});

test('an order miss fires when the cited source order runs the wrong way', () => {
  const expect = expectAnswer('say the story backwards');
  const forwards  = [{ citation: 's1' }, { citation: 's3' }, { citation: 's5' }];   // ascending
  const backwards = [{ citation: 's5' }, { citation: 's3' }, { citation: 's1' }];   // descending
  assert.equal(answerConstraintErrors(expect, 'told forwards', { bound: forwards }).length, 1);
  assert.deepEqual(answerConstraintErrors(expect, 'told backwards', { bound: backwards }), []);
  // too few cited claims to judge → don't gate
  assert.deepEqual(answerConstraintErrors(expect, 'x', { bound: [{ citation: 's2' }] }), []);
});

// ── The predictor: the engine's own grounded draft as the prior ──────────────

test('the mechanical-draft divergence fires when the answer drops the figure it centers on', () => {
  // The grounded reading centers on Grete and settled (concentrated) → the answer should
  // name her. An answer that never does is an under-answer; gating because the reading is
  // confident. We read CONTENT (the primary name), not the clumsy mechanical surface.
  const prediction = { draft: 'Grete brought milk', entities: ['Grete'], primaryName: 'Grete', confident: true };
  const miss = answerPredictionError(prediction, 'She is gentle and patient.');
  assert.ok(miss && miss.dim === 'coverage' && miss.gates, 'a dropped focus figure is a gating miss');
  assert.equal(miss.expectedName, 'Grete');
  // naming her clears it; an honest abstention fills it
  assert.equal(answerPredictionError(prediction, 'Her name is Grete.'), null);
  assert.equal(answerPredictionError(prediction, 'I did not find that in what I read.'), null);
});

test('the predictor only flags (never gates) when the reading did not settle', () => {
  const loose = { draft: '…', entities: ['Gregor'], primaryName: 'Gregor', confident: false };
  const e = answerPredictionError(loose, 'a character endures a long ordeal');
  assert.ok(e && !e.gates, 'an unconcentrated reading flags, does not force a restart');
});

// ── The residual flag: an unmet constraint is told, not hidden ───────────────

test('the veto battery flags a gating miss loud, and a soft form miss quietly', () => {
  const nameErr = answerConstraintErrors(expectAnswer('what is her name?'),
    'She is kind and caring.', { referent: { id: 1, label: 'Grete' } });
  const v1 = runVetoes({ draft: 'She is kind and caring.', bound: [], question: 'what is her name?',
    task: 'answer', constraintErrors: nameErr });
  assert.ok(v1.fired.some((f) => f.id === 'answer-shape' && f.refuses), 'gating miss → loud');

  const formErr = answerConstraintErrors(expectAnswer('write a poem'), 'A single prose blob with no line breaks.', {});
  const v2 = runVetoes({ draft: 'A single prose blob.', bound: [], question: 'write a poem',
    task: 'answer', constraintErrors: formErr });
  assert.ok(v2.fired.some((f) => f.id === 'answer-shape-weak' && !f.refuses), 'soft form miss → quiet flag');
  assert.ok(!v2.fired.some((f) => f.id === 'answer-shape'), 'and never the loud one');
});

// ── The loop: start, stop when off, begin again — visibly ────────────────────

test('revise catches a name miss, restarts, and records the superseded draft beside its reason', async () => {
  const doc = parseText('His sister Grete brought him fresh milk. Gregor watched her leave.', { docId: 'a' });
  const spans = [{ idx: 0, text: 'His sister Grete brought him fresh milk.', score: 1, via: 'lex' }];
  const model = { phrase: async () => 'Her name is Grete.' };

  const ctx = {
    question: 'what is her name?', expectation: expectAnswer('what is her name?'),
    refTarget: { id: 1, label: 'Grete' }, doc, spans, model, task: 'answer', history: [],
    rawOutput: 'Gregor’s sister is a kind and caring person.', bound: [], edgeVerdicts: [],
  };

  const out = await stages.revise(ctx);
  assert.equal(out.revised.attempts, 1, 'it stopped and answered again once');
  assert.ok(out.revised.resolved, 'the restart filled the slot');
  assert.equal(out.revisions.length, 1);
  assert.match(out.revisions[0].draft, /kind and caring/, 'the superseded draft is preserved');
  assert.match(out.revisions[0].replacedBy, /Grete/, 'the truer answer names her');
  assert.match(out.revisions[0].why, /name/i, 'the trail records WHY it began again');
  assert.match(out.answer, /Grete/);
});

test('revise is a no-op when the answer already satisfies every constraint', async () => {
  const doc = parseText('His sister Grete brought him fresh milk.', { docId: 'a' });
  const spans = [{ idx: 0, text: 'His sister Grete brought him fresh milk.', score: 1, via: 'lex' }];
  let called = 0;
  const model = { phrase: async () => { called++; return 'unused'; } };
  const ctx = {
    question: 'what is her name?', expectation: expectAnswer('what is her name?'),
    refTarget: { id: 1, label: 'Grete' }, doc, spans, model, task: 'answer', history: [],
    rawOutput: 'Her name is Grete.', bound: [{ claim: 'Her name is Grete.', citation: 's0' }],
    edgeVerdicts: [],
  };
  const out = await stages.revise(ctx);
  assert.equal(called, 0, 'no restart — the answer already fits');
  assert.equal(out, ctx, 'the context passes through untouched');
});

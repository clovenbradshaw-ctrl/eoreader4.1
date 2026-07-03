import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/pipeline.js';
import { runTurn } from '../src/turn/pipeline.js';
import { stages } from '../src/turn/stages.js';
import { runVetoes } from '../src/ground/veto.js';
import { createAuditLog } from '../src/audit/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import '../src/model/echo.js';
import { createModel } from '../src/model/interface.js';
import { eotDoc } from '../src/ingest/index.js';

const setup = (text) => {
  const doc = parseText(text, { docId: 't' });
  let p = null;
  doc.sentenceEmbeddings = async (e) => {
    if (p) return p;
    p = Promise.all(doc.sentences.map(s => e.embed(s)));
    return p;
  };
  return doc;
};

test('math short-circuits at the route — math.js answers, the talker never warms', async () => {
  // Math is the one model-free short-circuit kept live (answer/math.js): the answer is
  // provably correct and document-independent, so it terminates at the route and the llm
  // stage never runs — even with a document loaded. The smalltalk/metadata short-circuits
  // stay retired (those shipped ungrounded claims past the guards).
  const doc = setup('Anything.');
  const model = createModel('echo');
  await model.load();
  const audit = createAuditLog();
  const result = await runTurn({
    question: 'What is 2 + 2?',
    doc, model, embedder: createHashEmbedder(), auditLog: audit,
  });
  assert.equal(result.turn.route, 'math', 'arithmetic answered mechanically at the route');
  assert.equal(result.answer, '2 + 2 = 4', 'the evaluated expression rides as the answer');
  assert.ok(!result.turn.steps.find(s => s.name === 'llm'), 'the talker never warms');
});

test('a real question with a number in it is NOT captured by the math gate', async () => {
  // The gate is strict: a question carrying real words falls through to the grounded turn,
  // even though it contains a numeral. Nothing short-circuits to math here.
  const doc = setup('Widgets are small machines. They spin in factories.');
  const model = createModel('echo');
  await model.load();
  const audit = createAuditLog();
  const result = await runTurn({
    question: 'what are the 2 widgets?',
    doc, model, embedder: createHashEmbedder(), auditLog: audit,
  });
  assert.notEqual(result.turn.route, 'math', 'a worded question is not arithmetic');
  assert.ok(result.turn.steps.find(s => s.name === 'llm'), 'the talker runs');
});

test('the Stop button halts the turn — an aborted decode short-circuits to a stopped, partial answer', async () => {
  // The llm stage hands the turn's AbortSignal to the backend. A backend that stops on it
  // returns the partial beat; the stage then marks the turn `stopped` and terminates the
  // pipeline (no bind/factcheck/veto over a half-sentence). The partial text rides as the answer.
  const doc = setup('Widgets are small machines. They spin in factories.');
  const ctl = new AbortController();
  // A signal-aware streaming backend: emits two tokens, the second trips the abort.
  const model = {
    id: 'stub', kind: 'local', isLoaded: () => true, async load() {},
    async phrase(_m, opts) {
      let text = '';
      for (const p of ['Widgets ', 'spin.']) {
        text += p; opts.onToken?.(p);
        ctl.abort();                      // the user presses Stop mid-decode
        if (opts.signal?.aborted) break;
      }
      return text.trim();
    },
  };
  const audit = createAuditLog();
  const result = await runTurn({
    question: 'what are widgets?', doc, model, embedder: createHashEmbedder(),
    auditLog: audit, onToken: () => {}, signal: ctl.signal,
  });
  assert.equal(result.stopped, true, 'the turn is flagged stopped');
  assert.equal(result.answer, 'Widgets', 'the answer is the partial decode, ungroundedly bound');
  assert.deepEqual(result.sources, [], 'a stopped turn binds no citations');
  // The pipeline short-circuited at llm — the post-answer annotation stages did not run.
  assert.ok(!result.turn.steps.find(s => s.name === 'bind'), 'bind was skipped');
});

test('a summary meta-query reads the document skeleton, not fuzzy-matched fragments', async () => {
  // The audit's t1 failure: "summarize" has no lexical contact with the page, so the
  // hybrid path fuzzy-matched it onto arbitrary lines. The whole-doc meta-query now
  // routes to structural retrieval — the opening + headings + a spread.
  const doc = setup('# Topic\nThis document is about widgets. Widgets are small machines.\n## Uses\nThey are used in factories. Each widget spins.');
  const model = createModel('echo');
  await model.load();
  const audit = createAuditLog();
  const result = await runTurn({
    question: 'summarize', doc, model, embedder: createHashEmbedder(), auditLog: audit,
  });
  const retrieve = result.turn.steps.find(s => s.name === 'retrieve');
  assert.equal(retrieve.data.mode, 'structural', 'the meta-query routed to a structural read');
  assert.ok(retrieve.data.n > 0, 'the structural read found material');
  assert.equal(result.turn.route, 'grounded', 'it stays grounded — never falls through to chat');
});

test('a targeted whole-doc question still retrieves lexically (the strong t6 path is untouched)', async () => {
  const doc = setup('# Topic\nThis document is about widgets. Widgets are small machines.\n## Uses\nThey are used in factories.');
  const model = createModel('echo');
  await model.load();
  const audit = createAuditLog();
  const result = await runTurn({
    question: 'what are the widgets', doc, model, embedder: createHashEmbedder(), auditLog: audit,
  });
  const retrieve = result.turn.steps.find(s => s.name === 'retrieve');
  assert.notEqual(retrieve.data.mode, 'structural', '"widgets" is on the page — it stays on the lexical path');
});

test('grounded path produces an answer with citations', async () => {
  const doc = setup('Alice loves apples. Bob hates broccoli.');
  const model = createModel('echo');
  await model.load();
  const audit = createAuditLog();
  const result = await runTurn({
    question: 'apples',
    doc, model, embedder: createHashEmbedder(), auditLog: audit,
  });
  assert.ok(result.sources.length > 0);
  assert.equal(audit.turns.length, 1);
  assert.ok(result.turn.bound.some(b => b.citation), 'at least one claim must bind');
});

test('audit captures the verbatim prompt and raw output for grounded turns', async () => {
  const doc = setup('Alice loves apples. Bob hates broccoli.');
  const model = createModel('echo');
  await model.load();
  const audit = createAuditLog();
  await runTurn({
    question: 'apples?',
    doc, model, embedder: createHashEmbedder(), auditLog: audit,
  });
  const t = audit.turns[0];
  assert.ok(t.prompt);
  assert.ok(t.rawOutput);
  assert.ok(t.steps.find(s => s.name === 'llm'));
  assert.ok(t.steps.find(s => s.name === 'bind'));
  assert.ok(t.steps.find(s => s.name === 'veto'));
});

test('a measured void no longer pre-empts the talker — it rides as terrain (P0.2)', async () => {
  // Doc open, the question lands nowhere on the page. Under P0 the void no longer
  // auto-answers and terminates the turn — the talker speaks for every turn, and the
  // measured void RIDES as terrain context (`voidMeasure`) for the diagonal guard to
  // adjudicate what the talker then asserts. So the route is NOT 'void', the llm stage
  // runs, and the answerable step records the void as terrain (not as the answer).
  const doc = setup('Alice loves apples.');
  const model = createModel('echo');
  await model.load();
  const audit = createAuditLog();
  const result = await runTurn({
    question: 'unrelated-zebra-question',
    doc, model, embedder: { isWarm: () => false, embed: async () => new Float32Array(64), warm: async () => {} },
    auditLog: audit,
  });
  assert.notEqual(result.turn.route, 'void', 'the void never short-circuits the talker now');
  // The talker is reached for every turn now (here via chat, retrieval being empty).
  assert.ok(result.turn.steps.find(s => s.name === 'llm'), 'the talker is warmed — the void no longer pre-empts it');
  // And the measurement rides: the answerable step records the void as terrain context.
  const able = result.turn.steps.find(s => s.name === 'answerable');
  assert.equal(able?.data?.terrain, 'void', 'the void rides as terrain context on the answerable step');
  assert.equal(able?.data?.kind, 'never-set');
});

test('a whole-document summary request is never voided — it reaches the talker', async () => {
  // "summarize this" points at no location, so weak retrieval is not an absence.
  // The answerability gate must exempt whole-document tasks (docs/answerability.md).
  const doc = setup('Alice loves apples. Bob hates broccoli. Carol grows carrots. Dan dislikes dill.');
  const model = createModel('echo');
  await model.load();
  const audit = createAuditLog();
  const result = await runTurn({
    question: 'summarize this', doc, model, embedder: createHashEmbedder(), auditLog: audit,
  });
  assert.notEqual(result.turn.route, 'void');
});

test('runs without a doc — chat mode, no veto noise', async () => {
  const model = createModel('echo');
  await model.load();
  const audit = createAuditLog();
  const result = await runTurn({
    question: 'hello there',
    doc: null,
    model,
    embedder: createHashEmbedder(),
    auditLog: audit,
  });
  assert.equal(result.turn.route, 'chat');
  assert.equal(result.sources.length, 0);
  assert.equal(result.flags.length, 0);
  assert.ok(result.answer);
  // The model still ran — chat mode reaches the llm stage.
  assert.ok(result.turn.steps.find(s => s.name === 'llm'));
});

test('math without a doc short-circuits to math.js — answered with or without a document', async () => {
  const model = createModel('echo');
  await model.load();
  const audit = createAuditLog();
  const result = await runTurn({
    question: 'What is 7 * 6?',
    doc: null,
    model,
    embedder: createHashEmbedder(),
    auditLog: audit,
  });
  assert.equal(result.turn.route, 'math', 'arithmetic answered mechanically, no doc needed');
  assert.equal(result.answer, '7 * 6 = 42', 'the evaluated expression rides as the answer');
  assert.ok(!result.turn.steps.find(s => s.name === 'llm'), 'the talker never warms');
});

// The flag-and-tell sentinel — that a veto rides ALONGSIDE the model's answer and never
// substitutes it (an ungrounded draft is surfaced with its flag, not swapped for a decline)
// — lives in its own file, tests/gate.test.js, because it is the load-bearing invariant:
// we trust the talker, surface what it said, and tell the user where the grounding is thin.

test('a grounded turn carries the reader’s referential confidence to the result', async () => {
  const doc = setup('Alice loves apples. Bob hates broccoli.');
  const model = createModel('echo');
  await model.load();
  const audit = createAuditLog();
  const result = await runTurn({
    question: 'apples', doc, model, embedder: createHashEmbedder(), auditLog: audit,
  });
  // The coref posterior at the answer cursor is no longer discarded — it rides
  // the turn as a measured confidence (id + concentration), not thrown away.
  assert.ok(result.referential, 'the turn surfaces a referential confidence');
  assert.equal(typeof result.referential.concentrated, 'boolean');
  assert.ok(result.referential.w >= 0 && result.referential.w <= 1);
});

test('onStep callback fires once per executed stage', async () => {
  const doc = setup('Alice loves apples.');
  const model = createModel('echo');
  await model.load();
  const audit = createAuditLog();
  const seen = [];
  await runTurn({
    question: 'apples',
    doc, model, embedder: createHashEmbedder(), auditLog: audit,
    onStep: (name) => seen.push(name),
  });
  assert.ok(seen.includes('route'));
  assert.ok(seen.includes('llm'));
  assert.ok(seen.includes('bind'));
});

test('a greeting now reaches the talker — the smalltalk short-circuit is retired', async () => {
  const doc = setup('Alice loves apples. Bob hates broccoli.');
  const model = createModel('echo');
  await model.load();
  const audit = createAuditLog();
  const result = await runTurn({
    question: 'hi', doc, model, embedder: createHashEmbedder(), auditLog: audit,
  });
  assert.notEqual(result.turn.route, 'smalltalk', 'no mechanical smalltalk short-circuit');
  assert.ok(result.turn.steps.find(s => s.name === 'llm'), 'the talker runs');
});

test('who-is now reaches the talker — the mechanical document short-circuit is retired (P0.1)', async () => {
  // The confirm/relation/who document lookups no longer answer at the route; "who is
  // gregor?" goes through the talker, grounded on the excerpts, where the guards
  // adjudicate it. The llm stage runs and the answer still grounds (cites a span).
  const doc = setup('Gregor Samsa is a travelling salesman. Gregor waited. Gregor left.');
  const model = createModel('echo');
  await model.load();
  const audit = createAuditLog();
  const result = await runTurn({
    question: 'who is gregor?', doc, model, embedder: createHashEmbedder(), auditLog: audit,
  });
  assert.equal(result.turn.route, 'grounded', 'no longer the mechanical "who" route');
  assert.ok(result.turn.steps.find(s => s.name === 'llm'), 'the talker is warmed');
  assert.ok(/salesman/i.test(result.answer), 'the echo talker speaks the grounding excerpt');
  assert.ok(result.sources.length > 0, 'the grounder still cites a span');
});

test('revise rewrites a figure-at-a-void; a clean rewrite replaces it, a stubborn one ships tagged (P1)', async () => {
  // The confabulation guard caught a specific connection asserted where the reading
  // measured a void. The revise stage gives the talker one corrective pass on the same
  // excerpts; rewrite-then-tag is the whole behaviour, exercised at the stage so the
  // void/grounded/confabulate combination is deterministic.
  const doc = setup('Gregor Pike waited at home. Klaus Berg arrived later.');
  const spans = doc.sentences.map((t, i) => ({ idx: i, text: t, score: 1 }));
  const base = {
    doc, spans, question: 'did Gregor harm Klaus?', task: 'answer', maxTokens: 384,
    voidMeasure: { kind: 'never-set' }, surf: { peak: 0 },   // the measured void rides as terrain
  };
  // Seed a first draft that confabulates a specific connection at the void.
  const seeded = await stages.factcheck(await stages.bind({ ...base, rawOutput: 'Gregor Pike harmed Klaus Berg.' }));
  assert.ok(seeded.edgeVerdicts.some(v => v.verdict === 'off_diagonal' && v.void), 'the guard caught the figure-at-a-void');

  // A talker that abstains on the rewrite → the confabulation is cleared and replaced.
  const cleanModel = { async phrase() { return 'The document does not say.'; } };
  const cleaned = await stages.revise({ ...seeded, model: cleanModel });
  assert.equal(cleaned.revised.attempts, 1);
  assert.equal(cleaned.revised.resolved, true);
  assert.ok(!cleaned.edgeVerdicts.some(v => v.verdict === 'off_diagonal' && v.void), 'the flag cleared after the rewrite');
  assert.match(cleaned.answer, /does not say/i, 'the clean draft replaces the confabulation');
  // … but the false draft is NOT laundered — it is preserved beside its replacement,
  // with the verdict that condemned it. Correction lives next to error, both visible.
  assert.ok(Array.isArray(cleaned.revisions) && cleaned.revisions.length === 1, 'a revision is recorded');
  assert.match(cleaned.revisions[0].draft, /harmed Klaus Berg/, 'the original confabulation is kept verbatim');
  assert.ok(cleaned.revisions[0].offDiagonal.length > 0, 'the off-diagonal verdict travels with the superseded draft');
  assert.match(cleaned.revisions[0].replacedBy, /does not say/i, 'and the truer word it was replaced by');

  // A talker that keeps confabulating → put through, the span still tagged (flag-only).
  const stubborn = { async phrase() { return 'Gregor Pike harmed Klaus Berg.'; } };
  const tagged = await stages.revise({ ...seeded, model: stubborn });
  assert.equal(tagged.revised.resolved, false);
  assert.ok(tagged.edgeVerdicts.some(v => v.verdict === 'off_diagonal' && v.void), 'the surviving confabulation ships tagged');
  // And the veto surfaces it as a flag, never a refusal — the answer rides.
  const fired = runVetoes({ draft: tagged.answer, question: base.question, bound: tagged.bound, edgeVerdicts: tagged.edgeVerdicts });
  assert.ok(fired.fired.some(f => f.id === 'off-diagonal-void' && !f.refuses));
  assert.equal(fired.refuse, false);
});

test('audit exports JSONL one record per turn', async () => {
  const doc = setup('Alice loves apples.');
  const model = createModel('echo');
  await model.load();
  const audit = createAuditLog();
  await runTurn({ question: 'What is 1 + 1?', doc, model, embedder: createHashEmbedder(), auditLog: audit });
  await runTurn({ question: 'apples',          doc, model, embedder: createHashEmbedder(), auditLog: audit });
  const lines = audit.exportJSONL().split('\n');
  assert.equal(lines.length, 2);
  for (const line of lines) {
    const obj = JSON.parse(line);
    assert.equal(obj.schema, 'eo-audit/1');
  }
});

test('self-directed inquiry (opt-in): the engine reads another pass on its OWN open question', async () => {
  // The first reading (the spans handed in) has Klamm sought and feared but never acting —
  // an open figure. The full document DOES say what Klamm does, on lines the first pass
  // missed. With inquiry on, the stage asks "What of Klamm?" and folds those lines in as
  // citable spans (real indices). Driven at the stage directly so the first-pass spans are
  // controlled, not subject to hybrid-retrieval noise.
  const doc = setup('Gregor sought Klamm. Gregor feared Klamm. Klamm ruled the village. Klamm summoned the council.');
  const firstPass = [
    { idx: 0, text: 'Gregor sought Klamm.', score: 1, kind: 'lex' },
    { idx: 1, text: 'Gregor feared Klamm.', score: 1, kind: 'lex' },
  ];
  const out = await stages.inquire({ doc, spans: firstPass, task: 'answer', inquire: true });
  assert.ok((out.inquiry?.asked || []).some(a => /Klamm/i.test(a.q)), 'it asked its own open question');
  const added = (out.spans || []).filter(s => s.via === 'inquire');
  assert.ok(added.length > 0, 'it folded the answering lines in');
  assert.ok(added.every(s => Number.isFinite(s.idx)), 'each added span carries a real document index — it is citable');
  assert.ok(added.some(s => /Klamm (ruled|summoned)/.test(s.text)), 'and they are the lines where Klamm acts');
});

test('inquiry stops honestly when the source is silent on its question — no spin', async () => {
  const doc = setup('Gregor sought Klamm. Gregor feared Klamm.');   // Klamm never acts anywhere
  const firstPass = [
    { idx: 0, text: 'Gregor sought Klamm.', score: 1, kind: 'lex' },
    { idx: 1, text: 'Gregor feared Klamm.', score: 1, kind: 'lex' },
  ];
  const out = await stages.inquire({ doc, spans: firstPass, task: 'answer', inquire: true });
  assert.equal((out.spans || []).filter(s => s.via === 'inquire').length, 0, 'nothing fresh to add');
});

test('inquiry is off by default — the turn is byte-identical without the flag', async () => {
  const doc = setup('Gregor sought Klamm. Gregor feared Klamm. Klamm summoned Gregor.');
  const model = createModel('echo');
  await model.load();
  const audit = createAuditLog();
  const result = await runTurn({ question: 'Klamm', doc, model, embedder: createHashEmbedder(), auditLog: audit });
  const step = result.turn.steps.find(s => s.name === 'inquire');
  // the stage is in the pipeline but returns the context untouched → no asked questions, no added spans
  assert.ok(!step || ((step.data.asked || []).length === 0 && (step.data.added || 0) === 0), 'no inquiry without the flag');
});


test('the veto actively SEEKS the witness — confirms an interpretation against the source', async () => {
  // The grounding doc is the model's own EOT notes (reafference). The answer rests only on
  // them, so without help it is interpretation. With a source corpus available, the veto stage
  // fetches the spans about the claim's figures and re-checks.
  const notes = eotDoc('Grete : Person\nGregor : Person\nGrete -> Gregor : fed');
  const base = { doc: notes, rawOutput: 'Grete fed Gregor.', spans: [{ idx: 0, text: 'x' }], bound: [{ citation: 's0' }], task: 'answer' };

  const alone = await stages.veto({ ...base });
  assert.ok(alone.vetoes.some(v => v.id === 'interpretation'), 'rests only on the notes → interpretation flag');
  assert.equal(alone.witnessSought, null, 'nothing sought without a source');

  const source = parseText('Grete fed Gregor every morning.', { docId: 'src' });
  const sought = await stages.veto({ ...base, witnessSource: source });
  assert.equal(sought.witnessSought.confirmed, true, 'the source attests it — confirmed');
  assert.ok(!sought.vetoes.some(v => v.id === 'interpretation'), 'the interpretation flag clears — now witnessed');

  const silent = parseText('Grete saw Gregor.', { docId: 'src2' });
  const unconfirmed = await stages.veto({ ...base, witnessSource: silent });
  assert.equal(unconfirmed.witnessSought.confirmed, false, 'a silent source confirms nothing');
  assert.ok(unconfirmed.vetoes.some(v => v.id === 'interpretation'), 'still interpretation — the witness is absent');
});

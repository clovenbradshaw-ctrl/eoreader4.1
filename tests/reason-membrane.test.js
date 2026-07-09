// tests/reason-membrane.test.js — the grade SURVIVES the membrane, and the walk cannot launder
// through the fact-check. Three pins, on the echo path (no model, no network):
//
//   1. THE GRADE RIDES THE PROMPT — on an open turn the walk's reaches enter the talker's
//      window as a marked inference block (warranted steps marked as pattern-following, idle
//      steps as conjecture) with the hedge instruction, SEPARATE from the asserted excerpts.
//      This is invariant I2's generation side: the reach is offered hedged, never flattened
//      into confident prose.
//   2. NO LAUNDERING THROUGH THE FACT-CHECK — an enactor-door edge (the walk's committed
//      reach) can never CORROBORATE the talker's claim; the claim is annotated `reach` and
//      the battery surfaces `marked-reach`. The same claim against a world-witnessed edge
//      still corroborates and earns its citation — the type law splits them, by door.
//   3. BIND-OR-MARK AT THE VETO — a `reach` claim does not fire `edge-unsupported` (it is
//      not a grounding failure); a plain unwitnessed claim still does.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/pipeline.js';
import { runTurn } from '../src/turn/pipeline.js';
import { createAuditLog } from '../src/audit/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import '../src/model/echo.js';
import { createModel } from '../src/model/interface.js';
import { factCheck } from '../src/factcheck/index.js';
import { projectGraph } from '../src/core/index.js';
import { fromEnactor } from '../src/core/provenance.js';
import { runVetoes } from '../src/ground/veto.js';

const CORPUS = 'Acme employs Bob. Corp employs Dana. Acme partners with Corp. ' +
               'Bob builds widgets in the factory. Dana signs the contracts.';

const setup = (text, docId = 't') => {
  const doc = parseText(text, { docId });
  let p = null;
  doc.sentenceEmbeddings = async (e) => (p ||= Promise.all(doc.sentences.map(s => e.embed(s))));
  return doc;
};

test('the grade rides the prompt: reaches enter the window marked and hedged, apart from the excerpts', async () => {
  const doc = setup(CORPUS);
  const model = createModel('echo');
  await model.load();
  const captured = {};
  await runTurn({
    question: 'why does Acme employ Bob?',   // → explain: the open task, the walk runs
    doc, model, embedder: createHashEmbedder(), auditLog: createAuditLog(),
    onStep: (name, ctx) => { captured[name] = ctx; },
  });
  const prompt = captured.prompt?.promptText || '';
  assert.ok(prompt.includes('Reaching past the lines'), 'the inference block rides the window');
  assert.ok(prompt.includes('your own inferences, not lines you read'), 'the hedge instruction rides with it');
  assert.ok(prompt.includes('follows a pattern in what you read'), 'a warranted reach carries the pattern mark');
  assert.ok(prompt.includes('your own conjecture'), 'an idle reach carries the conjecture mark');
  assert.ok(!prompt.includes('undefined'), 'every voiced reach names admitted figures only');
  // The block sits apart from the asserted channel: the excerpts header still leads the lines.
  assert.ok(prompt.includes('What I found reading it:'), 'the asserted excerpts channel is intact');
});

test('the type law at the witness: a walk edge cannot corroborate; a world edge can', async () => {
  // The walk's committed reach — an enactor-door kinship edge the corpus never stated.
  const docA = setup('Anna met Bob at the station. They talked for hours.', 'a');
  const anna = docA.admission.idOf('Anna'), bob = docA.admission.idOf('Bob');
  assert.ok(anna && bob, 'both figures admitted');
  docA.log.append({ op: 'CON', src: bob, tgt: anna, via: 'sister', prov: fromEnactor('reason') });
  const fcA = await factCheck({ prose: "Anna is Bob's sister.", doc: docA, graph: projectGraph(docA.log) });
  const claimA = fcA.claims.find(c => c.via === 'sister');
  assert.ok(claimA, 'the kinship claim resolved');
  assert.notEqual(claimA.verdict, 'corroborated', 'the walk’s own edge can NEVER witness the claim');
  assert.equal(claimA.reach, true, 'the claim is annotated as a marked reach');
  assert.ok(fcA.fired.some(f => f.id === 'marked-reach'), 'the battery surfaces the mark');
  assert.ok(!fcA.fired.some(f => f.id === 'edge-unsupported'), 'a marked reach is not a grounding failure');
  assert.ok(fcA.edgeVerdicts.some(v => v.reach), 'the reach mark rides the flat verdict list the veto reads');

  // The control: the same edge witnessed by the WORLD (a prov-less parser-shaped event —
  // exafference by the type law) corroborates and earns its citation.
  const docB = setup('Anna met Bob at the station. They talked for hours.', 'b');
  docB.log.append({ op: 'CON', src: docB.admission.idOf('Bob'), tgt: docB.admission.idOf('Anna'), via: 'sister', sentIdx: 0 });
  const fcB = await factCheck({ prose: "Anna is Bob's sister.", doc: docB, graph: projectGraph(docB.log) });
  const claimB = fcB.claims.find(c => c.via === 'sister');
  assert.equal(claimB.verdict, 'corroborated', 'a world-witnessed edge still corroborates');
  assert.equal(claimB.citation, 's0', 'and earns the witnessing sentence as the citation');
  assert.ok(!claimB.reach, 'a world-witnessed claim is no reach');
});

test('bind-or-mark at the veto battery: reach claims are marked, plain unwitnessed claims still flag', () => {
  const base = { draft: 'Some claim.', bound: [], question: 'q' };
  // A claim tracing to a walk step: marked-reach fires, edge-unsupported does not.
  const marked = runVetoes({ ...base, edgeVerdicts: [{ verdict: 'unsupported', reach: true }] });
  assert.ok(marked.fired.some(v => v.id === 'marked-reach'), 'the reach is surfaced with its mark');
  assert.ok(!marked.fired.some(v => v.id === 'edge-unsupported'), 'and is not mislabelled a grounding failure');
  assert.ok(marked.fired.every(v => v.id !== 'marked-reach' || v.refuses === false), 'the mark rides, it never refuses');
  // A plain unwitnessed claim: exactly today's behaviour.
  const plain = runVetoes({ ...base, edgeVerdicts: [{ verdict: 'unsupported' }] });
  assert.ok(plain.fired.some(v => v.id === 'edge-unsupported'), 'a claim with no walk step behind it still flags');
  assert.ok(!plain.fired.some(v => v.id === 'marked-reach'), 'and earns no reach mark');
});

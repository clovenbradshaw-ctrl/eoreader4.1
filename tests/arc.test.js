import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/pipeline.js';
import { runTurn } from '../src/turn/pipeline.js';
import {
  runArc, classifyScope, clusterByEmbedding, bindableSpans,
  planSections, evaCoverageGate, overlap, assembleArc, ceilingFor, FLOOR_TOKENS,
} from '../src/arc/index.js';
import { createAuditLog } from '../src/audit/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import { createModel } from '../src/model/interface.js';
import '../src/model/echo.js';

// A doc with the sentenceEmbeddings memo the turn pipeline expects.
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

// A deterministic topic-bucketing embedder: each text maps to a one-hot vector
// on the dimension of the first topic keyword it matches. This gives the arc's
// clustering full, deterministic control — spans of the same topic cluster
// exactly, spans of different topics never do — so the plan is a fixed function
// of the injected spans (no bag-of-words noise to confound the assertions).
const oneHot = (d, n = 8) => { const v = new Float32Array(n); v[d % n] = 1; return v; };
const topicEmbedder = (topics) => ({
  id: 'topic', measuresMeaning: false, organ: 'topic', isWarm: () => true, async warm() {},
  async embed(text) {
    for (let i = 0; i < topics.length; i++) if (topics[i].test(text)) return oneHot(i + 1);
    return oneHot(0);
  },
});
const FRUIT_BIKE_STAR = topicEmbedder([/apple|fruit|orchard/i, /bicycle|wheel|pedal/i, /galax|star|telescope/i, /zebra|stripe/i]);

// ── §5.1 Demand — scopeClass ──────────────────────────────────────────────────
test('classifyScope reads the question’s inherent scope', () => {
  assert.equal(classifyScope('what does clause 4 say').scopeClass, 'point');
  assert.equal(classifyScope('what are the exceptions').scopeClass, 'list');
  assert.equal(classifyScope('summarize the obligations').scopeClass, 'survey');
  assert.equal(classifyScope('how does A differ from B').scopeClass, 'compare');
  // compare is read before explain's "how" — a comparison, not an explanation.
  assert.equal(classifyScope('how do apples and pears compare').scopeClass, 'compare');
});

// ── §5.4 Per-section budget — floor and ceiling ───────────────────────────────
test('ceilingFor is monotone in cluster mass and span count, floored at FLOOR_TOKENS', () => {
  const small = ceilingFor({ mass: 0.5, spans: [{}] });
  const moreMass = ceilingFor({ mass: 2.0, spans: [{}] });
  const moreSpans = ceilingFor({ mass: 0.5, spans: [{}, {}, {}] });
  assert.ok(moreMass > small, 'more mass → higher ceiling');
  assert.ok(moreSpans > small, 'more spans → higher ceiling');
  assert.ok(ceilingFor({ mass: 0, spans: [] }) >= FLOOR_TOKENS, 'never below the floor');
});

// ── §9 arc.degenerate — a point arc equals runTurn byte-for-byte ──────────────
test('arc.degenerate — a point question through runArc equals runTurn byte-for-byte', async () => {
  const text = 'Alice loves apples. Bob hates broccoli. Carol grows carrots.';
  const q = 'what does the first sentence say about apples';   // point scope
  const model = createModel('echo');
  await model.load();

  const turn = await runTurn({ question: q, doc: setup(text), model, embedder: createHashEmbedder(), auditLog: createAuditLog() });
  const arc  = await runArc({ question: q, doc: setup(text), model, embedder: createHashEmbedder(), auditLog: createAuditLog() });

  assert.equal(arc.degenerate, true, 'a point arc is the degenerate one-section arc');
  assert.equal(arc.answer, turn.answer, 'byte-identical answer to the single-turn path');
  assert.deepEqual(arc.sources, turn.sources, 'and identical sources');
});

// ── §9 arc.monotone — coverageAfter is non-decreasing ─────────────────────────
test('arc.monotone — coverageAfter is sorted non-decreasing across the arc', async () => {
  const spans = [
    { idx: 0, text: 'apples are red sweet fruit', score: 0.9 },
    { idx: 1, text: 'apples grow in the orchard as fruit', score: 0.7 },
    { idx: 2, text: 'bicycles have two wheels and pedals', score: 0.8 },
    { idx: 3, text: 'bicycles need a chain and wheel repair', score: 0.6 },
    { idx: 4, text: 'galaxies contain billions of stars seen by telescope', score: 0.85 },
  ];
  const model = createModel('echo');
  await model.load();
  const res = await runArc({
    question: 'summarize every topic', doc: null, model,
    embedder: FRUIT_BIKE_STAR, spans, auditLog: createAuditLog(), coverage: 'exhaustive',
  });
  assert.ok(res.sections.length >= 2, 'a multi-cluster arc emits several sections');
  const cov = res.sections.map(s => s.coverageAfter);
  for (let i = 1; i < cov.length; i++)
    assert.ok(cov[i] >= cov[i - 1], `coverageAfter non-decreasing (${cov[i - 1]} → ${cov[i]})`);
  // Invariant 1: no empty sections — every appended section earns ≥ 1 citation.
  assert.ok(res.sections.every(s => s.sources.length > 0), 'every section is grounded');
});

// ── §9 arc.saturation — stops when the evidence is drawn down ──────────────────
test('arc.saturation — three identical-topic spans yield one section, not three', async () => {
  const spans = [
    { idx: 0, text: 'the contract terminates on breach of terms', score: 0.9 },
    { idx: 1, text: 'the contract terminates upon a breach of its terms', score: 0.8 },
    { idx: 2, text: 'contract termination follows the breach of terms', score: 0.7 },
  ];
  const model = createModel('echo');
  await model.load();
  const res = await runArc({
    question: 'summarize the contract', doc: null, model,
    embedder: topicEmbedder([/contract|breach|terminat/i]), spans, auditLog: createAuditLog(), coverage: 'exhaustive',
  });
  assert.equal(res.sections.length, 1, 'one topic → one section, however many spans say it');
});

test('evaCoverageGate holds (NUL) when the budget is spent or the next section adds no novelty', () => {
  const totalMass = 1.0;
  // budget spent — remaining/total < EPSILON
  assert.equal(evaCoverageGate({ spanSet: [9] }, { coveredMass: 0.97, coveredSpans: new Set([0]) }, { totalMass }).proceed, false);
  // no novelty — the next section's spans are already fully covered
  assert.equal(evaCoverageGate({ spanSet: [0, 1] }, { coveredMass: 0.2, coveredSpans: new Set([0, 1]) }, { totalMass }).proceed, false);
  // proceeds — fresh spans and budget remaining
  assert.equal(evaCoverageGate({ spanSet: [5, 6] }, { coveredMass: 0.2, coveredSpans: new Set([0, 1]) }, { totalMass }).proceed, true);
  // overlap is the fraction of a section's spans already covered
  assert.equal(overlap([0, 1, 2, 3], new Set([0, 1])), 0.5);
});

// ── §9 arc.supply-cap — never exceeds supply to satisfy a demand prior ────────
test('arc.supply-cap — exhaustive coverage on a two-cluster doc never emits a third section', async () => {
  const spans = [
    { idx: 0, text: 'apples are red sweet fruit', score: 0.9 },
    { idx: 1, text: 'apples grow in the orchard as fruit', score: 0.7 },
    { idx: 2, text: 'bicycles have two wheels and pedals', score: 0.8 },
    { idx: 3, text: 'bicycles need a chain and wheel repair', score: 0.6 },
  ];
  const model = createModel('echo');
  await model.load();
  const res = await runArc({
    question: 'list every single thing in the document', doc: null, model,
    embedder: FRUIT_BIKE_STAR, spans, auditLog: createAuditLog(), coverage: 'exhaustive',
  });
  assert.equal(res.lengthTrace.clusterCount, 2, 'two topics → two clusters');
  assert.ok(res.sections.length <= 2, 'never a third section — bounded by supply');
});

// ── §9 arc.empty-section — the vetoing span never yields a section ────────────
test('arc.empty-section — a span that cannot ground is dropped, never appended', async () => {
  const spans = [
    { idx: 0, text: 'apples are red sweet fruit', score: 0.9 },
    { idx: 1, text: 'apples are red sweet fruit indeed', score: 0.7 },
    { idx: 9, text: 'zebra stripes form a monochrome pattern', score: 0.5 },   // the always-vetoing span
  ];
  // A model that grounds the apple cluster but emits ungroundable prose for the
  // zebra cluster — its draft makes no lexical contact with the zebra span, so
  // bind+veto cannot tie it and the faithfulness gate drops the section.
  const model = {
    id: 'stub', kind: 'local', isLoaded: () => true, async load() {},
    async phrase(messages) {
      const user = messages.find(m => m.role === 'user')?.content || '';
      if (/apple/i.test(user)) return 'Apples are red sweet fruit.';
      return 'Entirely unrelated commentary, grounded in nothing whatsoever.';
    },
  };
  const res = await runArc({
    question: 'summarize everything here', doc: null, model,
    embedder: FRUIT_BIKE_STAR, spans, auditLog: createAuditLog(), coverage: 'exhaustive',
  });
  assert.ok(res.sections.length >= 1, 'the strong cluster still yields a section');
  assert.ok(!res.sections.some(s => s.spanSet.includes(9)), 'the vetoing span never yields a section');
  assert.ok(res.sections.every(s => s.sources.length > 0), 'no empty sections (invariant 1)');
});

// ── §9 arc.replay — re-folding the events reproduces the identical answer ──────
test('arc.replay — folding the arc’s section events twice yields the identical answer', async () => {
  const spans = [
    { idx: 0, text: 'apples are red sweet fruit', score: 0.9 },
    { idx: 2, text: 'bicycles have two wheels and pedals', score: 0.8 },
    { idx: 4, text: 'galaxies contain billions of stars seen by telescope', score: 0.85 },
  ];
  const model = createModel('echo');
  await model.load();
  const run = () => runArc({
    question: 'summarize the topics here', doc: null, model,
    embedder: FRUIT_BIKE_STAR, spans, auditLog: createAuditLog(), coverage: 'exhaustive',
  });
  const res = await run();
  // Re-folding the same events is a pure projection — identical every time.
  assert.equal(assembleArc(res.sections), res.answer);
  assert.equal(assembleArc(res.sections), assembleArc(res.sections));
  // And the arc is replay-stable: no module-scope state, so a second run over
  // the same inputs reproduces the identical answer (invariant 5).
  const again = await run();
  assert.equal(again.answer, res.answer, 'the arc carries no hidden state between runs');
});

// ── Plan shape — reconcile lets demand cap supply, never pad it ───────────────
test('planSections — a point scope collapses to one section even with many clusters', async () => {
  const spans = [
    { idx: 0, text: 'apples are red sweet fruit', score: 0.9 },
    { idx: 2, text: 'bicycles have two wheels and pedals', score: 0.8 },
    { idx: 4, text: 'galaxies contain billions of stars', score: 0.85 },
  ];
  const { bindable, totalMass } = bindableSpans(spans);
  const clusters = await clusterByEmbedding(bindable, FRUIT_BIKE_STAR);
  assert.equal(clusters.length, 3, 'three topics → three clusters of supply');
  const point = planSections({ scopeClass: 'point', clusters, totalMass, coverage: 'exhaustive' });
  assert.equal(point.sections.length, 1, 'demand caps to one section — it does not pad');
  const survey = planSections({ scopeClass: 'survey', clusters, totalMass, coverage: 'exhaustive' });
  assert.equal(survey.sections.length, 3, 'survey takes the full supply under exhaustive coverage');
});

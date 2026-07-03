import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseText } from '../src/perceiver/parse/index.js';
import { projectGraph } from '../src/core/index.js';
import { createPhasepostClassifier, createCellAdjacency } from '../src/classify/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import { createCorefField } from '../src/perceiver/parse/coref.js';
import { runVetoes } from '../src/ground/veto.js';
import { TALKER } from '../src/converse/index.js';
import {
  VERDICTS, documentFieldAt, claimedEdges, factCheck,
  proposeCoref, corroborateCoref, geometricSecond,
} from '../src/factcheck/index.js';

const CELLS = JSON.parse(
  readFileSync(new URL('../data/phasepost-cells.json', import.meta.url))).CELLS;

// A meaning-measuring fake: a lookup table over a tiny 4-dim space. Each embedded
// query (a clause, by default construction) maps to a chosen vector, so we drive
// exactly which cell a clause lands in and the centroid cosine between cells.
const fakeEmbedder = (table, { measuresMeaning = true } = {}) => ({
  id: 'fake', measuresMeaning, isWarm: () => true, async warm() {},
  async embed(t) { return Float32Array.from(table[t] || [0, 0, 0, 0]); },
});
const bundle = (vectors) => ({ meta: { model: 'test', construction: 'clause', dim: 4 }, vectors });

// Three Pattern-band cell centroids: CON_Binding_Link and CON_Tending_Field are
// adjacent (cosine 0.8 ≥ floor 0.6); SYN_Making_Link is far from both (cosine 0).
const PATTERN = {
  CON_Binding_Link:  [1,   0,   0, 0],
  CON_Tending_Field: [0.8, 0.6, 0, 0],
  SYN_Making_Link:   [0,   0,   1, 0],
};

const DOC_TEXT =
  'Gregor Pike waited at home. Grete Vale watched him. Grete Vale tends Gregor Pike now. Klaus Berg arrived later.';

const liveClassifier = (table) =>
  createPhasepostClassifier({ cells: CELLS, embedder: fakeEmbedder(table), centroids: bundle(PATTERN) });

// ---------------------------------------------------------------------------
// The document referent table is the binding of record (§5).

test('documentFieldAt reconstructs a γ-decayed referent field from the page', () => {
  const doc = parseText(DOC_TEXT, { docId: 'd' });
  const at2 = documentFieldAt(doc, 2);
  // At s2 Grete Vale (s1,s2) outweighs Gregor Pike (s0,s2) and Klaus Berg (s3).
  assert.equal(at2[0].id, 'grete-vale');
  assert.ok(at2.every(c => c.w >= 0 && c.w <= 1));
});

test('a talker claim resolves its endpoints through the DOCUMENT table, not the talker', () => {
  const doc = parseText(DOC_TEXT, { docId: 'd' });
  // A leading pronoun in the talker's claim binds to the hottest DOCUMENT
  // referent at the cursor — the talker does not get to choose the node.
  const expected = documentFieldAt(doc, 2)[0].id;
  const claims = claimedEdges({ prose: 'He tends Klaus Berg.', doc, cursor: 2 });
  assert.equal(claims.length, 1);
  assert.equal(claims[0].src, expected);          // document-side, never the talker's
  assert.equal(claims[0].tgt, 'klaus-berg');
});

// ---------------------------------------------------------------------------
// The four verdicts (§3).

test('corroborated: a claim matching a document edge earns its citation (§7)', async () => {
  const doc   = parseText(DOC_TEXT, { docId: 'd' });
  const graph = projectGraph(doc.log, {});
  const clf   = liveClassifier({
    'Grete Vale looks after Gregor Pike.': [1, 0, 0, 0],   // → CON_Binding_Link
    'Grete Vale tends Gregor Pike now.':   [0.8, 0.6, 0, 0], // → CON_Tending_Field (adjacent)
  });
  const out = await factCheck({ prose: 'Grete Vale looks after Gregor Pike.', doc, graph, classifier: clf });
  assert.equal(out.counts.corroborated, 1);
  assert.equal(out.claims[0].verdict, VERDICTS.CORROBORATED);
  assert.equal(out.claims[0].citation, 's2');     // the document edge's witness
  assert.deepEqual([...out.citations], ['s2']);
  assert.equal(out.refuse, false);
});

test('unsupported: a relation between two resolved referents with no document edge', async () => {
  const doc   = parseText(DOC_TEXT, { docId: 'd' });
  const graph = projectGraph(doc.log, {});
  const clf   = liveClassifier({ 'Grete Vale owns Klaus Berg.': [1, 0, 0, 0] });
  const out = await factCheck({ prose: 'Grete Vale owns Klaus Berg.', doc, graph, classifier: clf });
  assert.equal(out.counts.unsupported, 1);
  assert.equal(out.claims[0].verdict, VERDICTS.UNSUPPORTED);
  assert.equal(out.claims[0].reason, 'no-edge');
  assert.ok(out.fired.some(f => f.id === 'edge-unsupported' && f.refuses === false));
  assert.equal(out.refuse, false);                // unsupported flags, does not refuse
});

test('contradicted: an explicit VOID denying the claimed relation is a hard refusal', async () => {
  const doc = parseText('Block Corp opened downtown. River House stood beside it.', { docId: 'v' });
  // The document carves the cause of River House as absent — a no-cause-named VOID.
  doc.log.append({ op: 'NUL', kind: 'void', node: 'river-house', rel: 'caused', sentIdx: 1 });
  const graph = projectGraph(doc.log, {});
  assert.equal(graph.voids.length, 1);
  const clf = liveClassifier({
    'Block Corp caused River House.': [1, 0, 0, 0],   // CON_Binding_Link
    'caused':                          [1, 0, 0, 0],   // the void's relation, same cell
  });
  const out = await factCheck({ prose: 'Block Corp caused River House.', doc, graph, classifier: clf });
  assert.equal(out.counts.contradicted, 1);
  assert.equal(out.claims[0].verdict, VERDICTS.CONTRADICTED);
  assert.equal(out.refuse, true);
  assert.ok(out.fired.some(f => f.id === 'edge-contradicted' && f.refuses === true));
});

test('indeterminate under the hash organ: every relational verdict holds (§4)', async () => {
  const doc   = parseText(DOC_TEXT, { docId: 'd' });
  const graph = projectGraph(doc.log, {});
  // The hash embedder does not measure meaning — the classifier holds every
  // position, so the relation cannot be typed and the verdict cannot run.
  const clf = createPhasepostClassifier({
    cells: CELLS, embedder: createHashEmbedder(), centroids: bundle(PATTERN),
  });
  const out = await factCheck({ prose: 'Grete Vale looks after Gregor Pike.', doc, graph, classifier: clf });
  assert.equal(out.counts.indeterminate, 1);
  assert.equal(out.claims[0].verdict, VERDICTS.INDETERMINATE);
  assert.equal(out.claims[0].reason, 'weak-embedder');
  assert.equal(out.fired.length, 0);              // the check is honestly inert
  assert.equal(out.refuse, false);
});

test('indeterminate: an asserted relation whose endpoints will not resolve is held', async () => {
  const doc   = parseText(DOC_TEXT, { docId: 'd' });
  const graph = projectGraph(doc.log, {});
  const clf   = liveClassifier({});
  const out = await factCheck({ prose: 'Grete Vale trusts strangers.', doc, graph, classifier: clf });
  assert.equal(out.claims[0].verdict, VERDICTS.INDETERMINATE);
  assert.equal(out.claims[0].reason, 'unresolved-endpoints');
});

test('a mixed turn reports each verdict and refuses only on contradiction', async () => {
  const doc   = parseText(DOC_TEXT, { docId: 'd' });
  const graph = projectGraph(doc.log, {});
  const clf   = liveClassifier({
    'Grete Vale looks after Gregor Pike.': [1, 0, 0, 0],
    'Grete Vale tends Gregor Pike now.':   [0.8, 0.6, 0, 0],
    'Grete Vale owns Klaus Berg.':         [1, 0, 0, 0],
  });
  const out = await factCheck({
    prose: 'Grete Vale looks after Gregor Pike. Grete Vale owns Klaus Berg.',
    doc, graph, classifier: clf,
  });
  assert.equal(out.counts.corroborated, 1);
  assert.equal(out.counts.unsupported, 1);
  assert.deepEqual([...out.citations], ['s2']);
  assert.equal(out.refuse, false);
});

// ---------------------------------------------------------------------------
// The diagonal guard (P1): the confabulation guard, made live. A specific (Figure-
// grain) claim asserted where the reading typed Ground is off the Object diagonal.

test('the diagonal guard catches a specific claim at a measured Void — the confabulation proper', async () => {
  const doc   = parseText(DOC_TEXT, { docId: 'd' });
  const graph = projectGraph(doc.log, {});
  // A resolved relational claim (Figure-grain) over a Void (Ground) is a grain mismatch.
  // The guard is grain algebra, not meaning geometry — no classifier, so it fires even
  // under the hash organ (here, with no classifier at all).
  const out = await factCheck({ prose: 'Grete Vale owns Klaus Berg.', doc, graph, terrain: 'Void' });
  assert.equal(out.counts.offDiagonal, 1);
  const od = out.offDiagonal[0];
  assert.equal(od.verdict, VERDICTS.OFF_DIAGONAL);
  assert.equal(od.void, true);
  assert.equal(od.terrainGrain, 'Ground');
  assert.equal(od.claimGrain, 'Figure');
  assert.match(od.reason, /grain-mismatch/);
  // It rides in edgeVerdicts beside the four-way verdict, for the veto battery.
  assert.ok(out.edgeVerdicts.some(v => v.verdict === 'off_diagonal' && v.void));
});

test('the diagonal guard passes a figure claim at a figure terrain, and is inert with no terrain', async () => {
  const doc   = parseText(DOC_TEXT, { docId: 'd' });
  const graph = projectGraph(doc.log, {});
  // At an Entity terrain (a figure locus) the same Figure claim is ON the diagonal.
  const onDiag = await factCheck({ prose: 'Grete Vale owns Klaus Berg.', doc, graph, terrain: 'Entity' });
  assert.equal(onDiag.counts.offDiagonal, 0);
  // With no terrain measured the guard does not run.
  const inert = await factCheck({ prose: 'Grete Vale owns Klaus Berg.', doc, graph });
  assert.equal(inert.counts.offDiagonal, 0);
  assert.equal(inert.offDiagonal.length, 0);
});

test('the diagonal guard skips a corroborated claim — a witnessed edge is grounded, not a confabulation', async () => {
  const doc   = parseText(DOC_TEXT, { docId: 'd' });
  const graph = projectGraph(doc.log, {});
  const clf   = liveClassifier({
    'Grete Vale looks after Gregor Pike.': [1, 0, 0, 0],
    'Grete Vale tends Gregor Pike now.':   [0.8, 0.6, 0, 0],
  });
  // Even handed a Void terrain, a claim the document positively witnesses is not flagged.
  const out = await factCheck({ prose: 'Grete Vale looks after Gregor Pike.', doc, graph, classifier: clf, terrain: 'Void' });
  assert.equal(out.counts.corroborated, 1);
  assert.equal(out.counts.offDiagonal, 0);
});

test('the diagonal-guard vetoes flag, never refuse — rewrite-then-tag', () => {
  const base = { draft: 'a sentence', question: 'q', bound: [] };
  // A figure at a measured Void ships tagged (the rewrite was the mitigation).
  const atVoid = runVetoes({ ...base, edgeVerdicts: [{ verdict: 'off_diagonal', terrainGrain: 'Ground', void: true }] });
  assert.ok(atVoid.fired.some(f => f.id === 'off-diagonal-void' && !f.refuses));
  assert.equal(atVoid.refuse, false);
  // A figure at a non-void Ground terrain (a site/atmosphere locus) — the softer flag.
  const atGround = runVetoes({ ...base, edgeVerdicts: [{ verdict: 'off_diagonal', terrainGrain: 'Ground', void: false }] });
  assert.ok(atGround.fired.some(f => f.id === 'off-diagonal-grain' && !f.refuses));
  assert.equal(atGround.refuse, false);
  // Inert when no diagonal verdict is present.
  const none = runVetoes({ ...base, edgeVerdicts: [{ verdict: 'unsupported' }] });
  assert.ok(!none.fired.some(f => f.id.startsWith('off-diagonal')));
});

// ---------------------------------------------------------------------------
// Relation correspondence is geometric, not string (§4).

test('cell adjacency is read off the centroid geometry; unmeasurable under no centroids', () => {
  const adj = createCellAdjacency(PATTERN);
  assert.equal(adj.adjacent('CON_Binding_Link', 'CON_Binding_Link'), true);   // self
  assert.equal(adj.adjacent('CON_Binding_Link', 'CON_Tending_Field'), true);  // 0.8 ≥ 0.6
  assert.equal(adj.adjacent('CON_Binding_Link', 'SYN_Making_Link'), false);   // 0 < 0.6
  const none = createCellAdjacency(null);
  assert.equal(none.measurable(), false);
  assert.equal(none.adjacent('CON_Binding_Link', 'CON_Tending_Field'), null); // hold, never guess
});

test('cell adjacency DERIVES its line from the centroid set (Born); the constant is only the cold-start fallback', () => {
  // A rich Pattern set — seven cells, 21 pairwise cosines, well over MIN_SAMPLES
  // (the three-cell fixtures above fall BELOW it and so ride the constant). Five
  // cells spread across the band (the chance-pairing bulk) plus two pairs built
  // deliberately near (a–f, b–g). The boundary is now measured off this geometry,
  // not declared at 0.6.
  const RICH = {
    a: [1,    0,    0,    0],
    b: [0.35, 1,    0,    0],
    c: [0.1,  0.4,  1,    0],
    d: [0,    0.15, 0.45, 1],
    e: [0.5,  0.5,  0.5,  0.5],
    f: [0.95, 0.18, 0,    0],   // near a  (cosine ≈ 0.98)
    g: [0.25, 0.9,  0.2,  0],   // near b  (cosine ≈ 0.98)
  };
  const derived = createCellAdjacency(RICH);                  // alpha default → derives
  const fixed   = createCellAdjacency(RICH, { alpha: null }); // forces the 0.6 constant

  // The genuine adjacencies clear the derived line; a spread cell pair does not.
  assert.equal(derived.adjacent('a', 'f'), true);
  assert.equal(derived.adjacent('b', 'g'), true);
  assert.equal(derived.adjacent('a', 'b'), false);

  // The line is not 0.6, and it is the GEOMETRY that proves it: a mid pair the
  // blunt constant waves through (cosine ≈ 0.637 ≥ 0.6) sits inside this set's
  // chance bulk, so the derived reader holds it. Same vectors, two verdicts —
  // the floor has moved off the number and onto the field.
  assert.equal(fixed.adjacent('e', 'b'), true,  'the 0.6 constant accepts the mid pair');
  assert.equal(derived.adjacent('e', 'b'), false, 'the derived line rejects it — the floor moved to the geometry');
});

// ---------------------------------------------------------------------------
// The veto battery surfaces the edge-grounding check beside the node one (§8).

test('the edge-grounding vetoes fire on the four-way verdict and are inert without it', () => {
  const base = { draft: 'a sentence', question: 'q', bound: [] };
  const contra = runVetoes({ ...base, edgeVerdicts: [{ verdict: 'contradicted' }] });
  assert.ok(contra.fired.some(f => f.id === 'edge-contradicted'));
  assert.equal(contra.refuse, true);

  const unsup = runVetoes({ ...base, edgeVerdicts: [{ verdict: 'unsupported' }] });
  assert.ok(unsup.fired.some(f => f.id === 'edge-unsupported'));
  assert.equal(unsup.refuse, false);              // flag-only

  const indet = runVetoes({ ...base, edgeVerdicts: [{ verdict: 'indeterminate' }] });
  assert.ok(!indet.fired.some(f => f.id.startsWith('edge-')));

  const inert = runVetoes(base);                  // no fact-check ran
  assert.ok(!inert.fired.some(f => f.id.startsWith('edge-')));
});

test('the contradiction veto is a likelihood gate: a weakly-typed conflict flags, never refuses', () => {
  const base = { draft: 'a sentence', question: 'q', bound: [] };
  // A confident contradiction (or one with no confidence) hard-refuses.
  const strong = runVetoes({ ...base, edgeVerdicts: [{ verdict: 'contradicted', confidence: 0.9 }] });
  assert.ok(strong.fired.some(f => f.id === 'edge-contradicted' && f.refuses));
  assert.equal(strong.refuse, true);

  // A contradiction below the floor surfaces as a flag, and does NOT refuse.
  const weak = runVetoes({ ...base, edgeVerdicts: [{ verdict: 'contradicted', confidence: 0.2 }] });
  assert.ok(weak.fired.some(f => f.id === 'edge-contradicted-weak' && !f.refuses));
  assert.ok(!weak.fired.some(f => f.id === 'edge-contradicted'));
  assert.equal(weak.refuse, false);
});

// ---------------------------------------------------------------------------
// Coreference as proposal (§6): the talker proposes, document-side readers dispose.

test('a coref proposal deposits capped conversational warmth, never grounded mass', () => {
  const f  = createCorefField();
  const ev = proposeCoref({ a: 'officer', b: 'topps', cursor: 0, field: f });
  assert.equal(ev.witness, TALKER);
  assert.equal(ev.kind, 'coref-proposal');
  assert.ok(f.field(0).some(c => c.id === 'officer' && c.conversational > 0));
  assert.ok(f.field(0).some(c => c.id === 'topps'   && c.conversational > 0));
  assert.ok(!f.fieldGrounded(0).some(c => c.id === 'officer')); // warmth, never witness
});

test('corroborateCoref commits only on a grounding reader’s second; holds otherwise', async () => {
  const proposal = proposeCoref({ a: 'officer', b: 'topps', cursor: 5 });

  const held = await corroborateCoref(proposal, { second: async () => ({ seconds: false }) });
  assert.equal(held.committed, false);
  const none = await corroborateCoref(proposal, {});            // no reader → held
  assert.equal(none.committed, false);

  const ok = await corroborateCoref(proposal, {
    second: async () => ({ seconds: true, by: 'geometric', score: 0.9 }), cursor: 5,
  });
  assert.equal(ok.committed, true);
  assert.equal(ok.merge.op, 'SYN');
  assert.equal(ok.merge.kind, 'merge');
  assert.notEqual(ok.merge.witness, TALKER);      // the grounding reader, not the talker
});

test('geometricSecond cannot corroborate under the hash organ (the proposal holds)', async () => {
  const second = geometricSecond({
    embedder: createHashEmbedder(), textA: 'the off-duty officer', textB: 'Sgt. Topps',
  });
  const v = await second();
  assert.equal(v.seconds, false);
  assert.equal(v.reason, 'weak-embedder');
});

test('geometricSecond DERIVES its nearness line from the document background (Born); the constant is the unwired fallback', async () => {
  // Two spans at a MODERATE cosine (≈ 0.5) — under the 0.6 constant, so a
  // constant-only second HOLDS — against a document background of low chance span
  // pairings. The derived line (boundedNull) sits far below 0.6, so the same pair
  // seconds: a true paraphrase the blunt floor would have missed. (No live caller
  // hands geometricSecond a background today; this exercises the path that one will.)
  const embedder = fakeEmbedder({ 'the trooper': [1, 0, 0, 0], 'Sgt. Topps': [0.5, 0.87, 0, 0] });
  const background = [0.05, 0.1, 0.0, 0.15, 0.08, 0.2, 0.12];   // chance span pairings, all low

  const constOnly = await geometricSecond({ embedder, textA: 'the trooper', textB: 'Sgt. Topps' })();
  assert.equal(constOnly.seconds, false);          // 0.5 < 0.6 constant → holds

  const derived = await geometricSecond({ embedder, textA: 'the trooper', textB: 'Sgt. Topps', background })();
  assert.equal(derived.seconds, true);             // 0.5 ≫ the line off a low-cosine field
  assert.ok(derived.line < 0.6, 'the derived line sits below the blunt constant');
});

test('a committed coref merge unifies the referents in the document reading', async () => {
  const doc = parseText('Alpha One spoke first. Bravo Two spoke later.', { docId: 'm' });
  const before = projectGraph(doc.log, {});
  assert.notEqual(before.representative('alpha-one'), before.representative('bravo-two'));

  const proposal = proposeCoref({ a: 'alpha-one', b: 'bravo-two', cursor: 1 });
  const { committed, merge } = await corroborateCoref(proposal, {
    second: async () => ({ seconds: true, by: 'geometric' }), cursor: 1,
  });
  assert.ok(committed);
  doc.log.append(merge);                          // the caller owns the log
  const after = projectGraph(doc.log, {});
  assert.equal(after.representative('alpha-one'), after.representative('bravo-two'));
});

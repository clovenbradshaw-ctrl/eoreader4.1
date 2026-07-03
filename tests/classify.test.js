import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  createPhasepostClassifier, perceptionDeposit,
  BANDS, BAND_OPERATORS, bandOf, partitionCells, isDesert, isMisfireCell,
} from '../src/classify/index.js';

const CELLS = JSON.parse(
  readFileSync(new URL('../data/phasepost-cells.json', import.meta.url))).CELLS;

// A fake embedder: a lookup table over a tiny space. `measuresMeaning` is the
// no-commit guard the classifier reads. Counts calls so we can prove the memo.
const fakeEmbedder = (table, { measuresMeaning = true } = {}) => {
  const state = { calls: 0, last: null };
  return {
    id: 'fake', measuresMeaning, isWarm: () => true, async warm() {},
    async embed(t) { state.calls++; state.last = t; return Float32Array.from(table[t] || [0, 0, 0, 0]); },
    state,
  };
};

const bundle = (vectors, construction = 'clause') =>
  ({ meta: { model: 'test', construction, dim: 4 }, vectors });

const FLOORS = { Ground: 0.05, Figure: 0.05, Pattern: 0.05 };

test('bands partition the 27 cells 6 / 12 / 9', () => {
  const p = partitionCells(CELLS);
  assert.equal(p.Ground.length, 6);
  assert.equal(p.Figure.length, 12);
  assert.equal(p.Pattern.length, 9);
  assert.equal(p.Ground.length + p.Figure.length + p.Pattern.length, 27);
});

test('bandOf maps every operator to its grain band', () => {
  assert.deepEqual(BANDS, ['Ground', 'Figure', 'Pattern']);
  for (const [band, ops] of Object.entries(BAND_OPERATORS))
    for (const op of ops) assert.equal(bandOf(op), band);
  assert.equal(bandOf('ZZZ'), null);
});

test('DESERT is SYN(Making,Field); empty cells are misfires', () => {
  assert.equal(isDesert({ op: 'SYN', stance: 'Making', site: 'Field' }), true);
  assert.equal(isDesert({ op: 'SYN', stance: 'Making', site: 'Link' }), false);
  // the four proven-empty cells in the registry
  for (const k of ['NUL_Clearing_Void', 'SEG_Clearing_Field', 'SYN_Cultivating_Field', 'REC_Cultivating_Atmosphere'])
    assert.equal(isMisfireCell(CELLS[k]), true, k);
  assert.equal(isMisfireCell(CELLS['CON_Binding_Link']), false);
});

test('the hash guard holds every position at no-commit — even with centroids present', async () => {
  const embedder = fakeEmbedder({ 'x': [1, 0, 0, 0] }, { measuresMeaning: false });
  const clf = createPhasepostClassifier({
    cells: CELLS, embedder, floors: FLOORS,
    centroids: bundle({ 'CON_Binding_Link': [1, 0, 0, 0] }),
  });
  const p = await clf.classify('x');
  assert.equal(clf.isLive(), false);
  assert.equal(p.live, false);
  for (const band of ['ground', 'figure', 'pattern']) {
    assert.equal(p[band].cell, null);
    assert.equal(p[band].reason, 'weak-embedder');
  }
  assert.equal(embedder.state.calls, 0, 'never even embeds under the weak organ');
});

test('with no centroids the reader holds at no-commit', async () => {
  const embedder = fakeEmbedder({ 'x': [1, 0, 0, 0] });
  const clf = createPhasepostClassifier({ cells: CELLS, embedder, floors: FLOORS, centroids: null });
  const p = await clf.classify('x');
  assert.equal(clf.isLive(), false);
  assert.equal(p.pattern.reason, 'no-centroids');
});

test('a clear nearest centroid commits its band with a positive margin', async () => {
  const embedder = fakeEmbedder({ 'they bind': [1, 0, 0, 0] });
  const clf = createPhasepostClassifier({
    cells: CELLS, embedder, floors: FLOORS,
    centroids: bundle({ 'CON_Binding_Link': [1, 0, 0, 0], 'SYN_Making_Link': [0, 1, 0, 0] }),
  });
  const p = await clf.classify('they bind');
  assert.equal(clf.isLive(), true);
  assert.equal(p.pattern.cell, 'CON_Binding_Link');
  assert.equal(p.pattern.op, 'CON');
  assert.equal(p.pattern.note_rel, 'binds');
  assert.ok(p.pattern.margin > 0.5, `margin ${p.pattern.margin}`);
  // confidence = margin × provenance weight (CON_Binding_Link is attested → 1.0)
  assert.ok(Math.abs(p.pattern.confidence - p.pattern.margin) < 1e-6);
});

test('a tie below the floor holds at no-commit (the colliding-verb case)', async () => {
  const embedder = fakeEmbedder({ 'between': [1, 1, 0, 0] });
  const clf = createPhasepostClassifier({
    cells: CELLS, embedder, floors: FLOORS,
    centroids: bundle({ 'CON_Binding_Link': [1, 0, 0, 0], 'SYN_Making_Link': [0, 1, 0, 0] }),
  });
  const p = await clf.classify('between');
  assert.equal(p.pattern.cell, null);
  assert.equal(p.pattern.reason, 'below-floor');
});

test('a DESERT/empty argmax is demoted to the runner-up', async () => {
  // The empty cell sits exactly on the query; the attested cell is the runner-up.
  const embedder = fakeEmbedder({ 'q': [1, 0, 0, 0] });
  const clf = createPhasepostClassifier({
    cells: CELLS, embedder, floors: FLOORS,
    centroids: bundle({
      'SYN_Cultivating_Field': [1, 0, 0, 0],   // empty — must be demoted
      'CON_Binding_Link':      [0.9, 0.2, 0, 0], // attested — the real reading
      'SYN_Making_Link':       [0, 1, 0, 0],
    }),
  });
  const p = await clf.classify('q');
  assert.notEqual(p.pattern.cell, 'SYN_Cultivating_Field');
  assert.equal(p.pattern.cell, 'CON_Binding_Link');
});

test('provenance grades confidence below margin for a partial cell', async () => {
  const embedder = fakeEmbedder({ 'q': [1, 0, 0, 0] });
  // SYN_Composing_Network is attested_partial (weight 0.7).
  assert.equal(CELLS['SYN_Composing_Network'].provenance, 'attested_partial');
  const clf = createPhasepostClassifier({
    cells: CELLS, embedder, floors: FLOORS,
    centroids: bundle({ 'SYN_Composing_Network': [1, 0, 0, 0], 'CON_Binding_Link': [0, 1, 0, 0] }),
  });
  const p = await clf.classify('q');
  assert.equal(p.pattern.cell, 'SYN_Composing_Network');
  assert.ok(p.pattern.confidence < p.pattern.margin, 'partial provenance discounts confidence');
  assert.ok(Math.abs(p.pattern.confidence - p.pattern.margin * 0.7) < 1e-6);
});

test('construction grain governs the query: verb-grain centroids get the verb', async () => {
  const embedder = fakeEmbedder({ 'tends': [1, 0, 0, 0], 'The sister tends Gregor.': [0, 1, 0, 0] });
  const clf = createPhasepostClassifier({
    cells: CELLS, embedder, floors: FLOORS,
    centroids: bundle({ 'CON_Binding_Link': [1, 0, 0, 0] }, 'verb'),
  });
  await clf.classify({ clause: 'The sister tends Gregor.', verb: 'tends' });
  assert.equal(embedder.state.last, 'tends', 'embeds the lemma in lexical-space centroids');
});

test('the perception is memoized — re-perceiving the same clause does not re-embed', async () => {
  const embedder = fakeEmbedder({ 'they bind': [1, 0, 0, 0] });
  const clf = createPhasepostClassifier({
    cells: CELLS, embedder, floors: FLOORS,
    centroids: bundle({ 'CON_Binding_Link': [1, 0, 0, 0] }),
  });
  const a = await clf.classify('they bind');
  const b = await clf.classify('they bind');
  assert.strictEqual(a, b, 'same frozen perception returned');
  assert.equal(embedder.state.calls, 1, 'the fold is cached, not recomputed');
});

test('perceptionDeposit records reader, cursor and the verbatim clause', () => {
  const dep = perceptionDeposit({
    reader: 'geometric', cursor: 205, clause: 'The sister tends Gregor.',
    perception: { pattern: { cell: 'CON_Binding_Link' }, ground: null, figure: null },
  });
  assert.equal(dep.kind, 'phasepost');
  assert.equal(dep.reader, 'geometric');
  assert.equal(dep.cursor, 205);
  assert.equal(dep.clause, 'The sister tends Gregor.');
  assert.equal(dep.pattern.cell, 'CON_Binding_Link');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ingestText } from '../src/organs/in/index.js';
import {
  MOVE_ALPHABET, buildMoveLog, recurrencePrior, structuralPrior,
  learnGrammar, grammarPrior, DEFAULT_GRAMMAR, predictNextMove,
  scoreSeries, persistenceAccuracy, marginalAccuracy, shuffleMoves,
} from '../src/predict/index.js';

// The Cursor Predictor — a grounded structural predictor over the next MOVE.
// These pin the four phases (move-log, recurrence, structure, fusion) and the four
// controls (persistence/recurrence baseline, shuffle, the REC test, the VOID test).
// The reader is deterministic, so the worked example (the Esker story) is a fixed
// point the assertions can name.

const text = readFileSync(new URL('../data/esker.txt', import.meta.url), 'utf8');
const doc = await ingestText(text, {});
const ml = buildMoveLog(doc);

const sums1 = (dist) => Math.abs(Object.values(dist).reduce((a, b) => a + b, 0) - 1) < 1e-3;

// ── Phase 0 — the move-log ────────────────────────────────────────────────────
test('Phase 0 · move-log is a clean sequence, indexable by cursor', () => {
  assert.ok(ml.moves.length > 50, 'the reading emits a substantial move stream');
  assert.equal(MOVE_ALPHABET.length, 10);
  for (const sym of ['NUL', 'REC', 'VOID', 'EVA', 'INS', 'CON', 'DEF']) assert.ok(MOVE_ALPHABET.includes(sym));

  ml.moves.forEach((m, i) => {
    assert.equal(m.i, i, 'every move carries its own index');
    assert.ok(MOVE_ALPHABET.includes(m.op), `move op ${m.op} is in the alphabet`);
    assert.ok(Number.isInteger(m.cursor), 'every move has an integer unit cursor');
    assert.ok(m.site && m.resolution, 'every move carries a Site and a Resolution');
  });

  // cursors are non-decreasing — the arrow of time, indexable by position.
  for (let i = 1; i < ml.moves.length; i++) assert.ok(ml.moves[i].cursor >= ml.moves[i - 1].cursor);

  // the per-unit frame state the structural prior reads.
  assert.equal(ml.frameByCursor.length, doc.units.length);
});

test('Phase 0 · both registers and the refusal operators are present', () => {
  const ops = new Set(ml.moves.map(m => m.op));
  for (const sym of ['INS', 'CON', 'EVA', 'DEF', 'REC', 'NUL']) assert.ok(ops.has(sym), `${sym} appears`);
  assert.ok(ml.moves.some(m => m.register === 'content'), 'content (perception) moves');
  assert.ok(ml.moves.some(m => m.register === 'enacted'), 'enacted (cognition) moves');
  // the roman-numeral part markers are held as NUL (the chrome gate).
  assert.ok(ml.moves.filter(m => m.op === 'NUL').length >= 1, 'a degenerate line is held NUL');
  // the disowning's frame break is an enacted REC.
  assert.ok(ml.moves.some(m => m.op === 'REC' && m.register === 'enacted'), 'a frame breaks (REC)');
});

// ── Phase 1 — the recurrence prior ────────────────────────────────────────────
test('Phase 1 · recurrence is a smoothed distribution over the alphabet', () => {
  const d = recurrencePrior(ml.moves.slice(0, 40), MOVE_ALPHABET);
  assert.ok(sums1(d), 'sums to 1');
  for (const op of MOVE_ALPHABET) assert.ok(d[op] > 0, `${op} keeps a smoothing floor (no hard zero)`);
});

test('Phase 1 · recurrence favours an observed transition', () => {
  // A synthetic log where DEF is always followed by EVA; the prefix ends on DEF.
  const moves = 'DEF EVA DEF EVA DEF EVA DEF'.split(' ').map((op, i) => ({ op, cursor: i }));
  const d = recurrencePrior(moves, MOVE_ALPHABET);
  assert.equal(Object.entries(d).sort((a, b) => b[1] - a[1])[0][0], 'EVA', 'EVA is the top continuation of DEF');
});

// ── Phase 2 — the structural prior ────────────────────────────────────────────
test('Phase 2 · strain near threshold licenses REC (after an EVA)', () => {
  const moves = [{ op: 'EVA', cursor: 0 }, { op: 'EVA', cursor: 1 }];
  const strained = structuralPrior(moves, 0, { frameByCursor: [{ ratio: 1.0, bayes: 0.4, newFigure: false }] }, MOVE_ALPHABET);
  const holding = structuralPrior(moves, 0, { frameByCursor: [{ ratio: 0.1, bayes: 0.4, newFigure: false }] }, MOVE_ALPHABET);
  assert.ok(sums1(strained) && sums1(holding));
  assert.ok(strained.REC > holding.REC * 5, 'REC mass rises sharply with strain');
  assert.equal(Object.entries(strained).sort((a, b) => b[1] - a[1])[0][0], 'REC', 'a breaking frame predicts REC');
});

test('Phase 2 · a flat field licenses NUL / VOID (the structural abstention)', () => {
  const moves = [{ op: 'EVA', cursor: 0 }];
  const flat = structuralPrior(moves, 0, { frameByCursor: [{ ratio: 0.0, bayes: 0.0, newFigure: false }] }, MOVE_ALPHABET);
  const active = structuralPrior(moves, 0, { frameByCursor: [{ ratio: 0.2, bayes: 0.5, newFigure: true }] }, MOVE_ALPHABET);
  assert.ok((flat.NUL + flat.VOID) > (active.NUL + active.VOID) * 10, 'NUL+VOID mass is far higher on a flat field');
});

// ── the grammar (learned once, frozen) ────────────────────────────────────────
test('grammar · the frozen grammar loads and is a valid conditional', () => {
  assert.ok(DEFAULT_GRAMMAR.alphabet?.length === 10);
  const d = grammarPrior('EVA', DEFAULT_GRAMMAR, MOVE_ALPHABET);
  assert.ok(sums1(d));
  // REC installs a frame via DEF — the canonical cycle should survive learning.
  const recRow = grammarPrior('REC', DEFAULT_GRAMMAR, MOVE_ALPHABET);
  assert.equal(Object.entries(recRow).sort((a, b) => b[1] - a[1])[0][0], 'DEF', 'REC→DEF is the learned cycle');
});

test('grammar · learnGrammar fits a normalised matrix from move-logs', () => {
  const g = learnGrammar([ml.moves], MOVE_ALPHABET, { alpha: 1 });
  assert.ok(sums1(g.marginal));
  for (const prev of MOVE_ALPHABET) assert.ok(sums1(g.trans[prev]), `row ${prev} is a distribution`);
});

// ── fusion — the posterior ────────────────────────────────────────────────────
test('fusion · posterior is a ranked distribution with sharpness and flatness', () => {
  const p = predictNextMove(ml, 10);
  assert.ok(Array.isArray(p.posterior) && p.posterior.length === 10);
  assert.ok(Math.abs(p.posterior.reduce((s, [, x]) => s + x, 0) - 1) < 1e-6, 'posterior sums to 1');
  assert.equal(p.sharpness, Math.round(p.posterior[0][1] * 1000) / 1000, 'sharpness is the top-1 probability');
  assert.ok(p.concentration >= 0 && p.concentration <= 1);
  assert.equal(typeof p.flat, 'boolean');
  assert.ok(p.components.recurrence && p.components.structure && p.components.grammar);
});

test('fusion · the prediction is strictly causal (the future never informs it)', () => {
  const i = 60;
  const full = predictNextMove(ml, i);
  // Truncate every move after i+1 and re-predict at i: identical posterior.
  const truncated = { ...ml, moves: ml.moves.slice(0, i + 2) };
  const causal = predictNextMove(truncated, i);
  assert.deepEqual(causal.posterior, full.posterior, 'posterior at c uses only moves up to c');
});

// ── Phase 7 — the controls ────────────────────────────────────────────────────
test('control · the predictor beats persistence and the bare recurrence n-gram', () => {
  const full = scoreSeries(ml);
  const recOnly = scoreSeries(ml, { weights: { recurrence: 1, structure: 0, grammar: 0 } });
  const pers = persistenceAccuracy(ml);
  assert.ok(full.accuracy > pers.accuracy + 0.2, `full ${full.accuracy} ≫ persistence ${pers.accuracy}`);
  assert.ok(full.accuracy > recOnly.accuracy, `frame-aware ${full.accuracy} > recurrence-only ${recOnly.accuracy}`);
});

test('control · shuffle collapses accuracy to chance', () => {
  const full = scoreSeries(ml).accuracy;
  const marg = marginalAccuracy(ml).accuracy;
  const shuffled = [1, 2, 3, 4, 5].map(s => scoreSeries(shuffleMoves(ml, s)).accuracy);
  const mean = shuffled.reduce((a, b) => a + b, 0) / shuffled.length;
  assert.ok(mean < full - 0.2, `shuffled ${mean.toFixed(3)} ≪ real ${full.toFixed(3)} — the predictor reads the sequence`);
  assert.ok(mean < marg + 0.1, 'shuffled accuracy sits near the marginal-frequency floor');
});

test('control · REC test — the strongest break is predicted top-1 from strain', () => {
  // The REC with the most accumulated strain is the planted boundary (the disowning).
  const recs = ml.moves.filter(m => m.op === 'REC' && m.i > 0);
  assert.ok(recs.length >= 1);
  const strongest = recs.sort((a, b) => ml.frameByCursor[b.cursor].ratio - ml.frameByCursor[a.cursor].ratio)[0];
  const p = predictNextMove(ml, strongest.i - 1);
  assert.equal(p.top, 'REC', 'the breaking move is the predicted mode');
  assert.ok(p.correctTop1 && p.sharpness > 0.6, `sharp-and-right at the break (p=${p.sharpness})`);

  // and REC probability tracks strain: higher strain ⇒ higher predicted REC.
  const recProb = (m) => predictNextMove(ml, m.i - 1).posterior.find(([op]) => op === 'REC')[1];
  const lowStrain = recs.sort((a, b) => ml.frameByCursor[a.cursor].ratio - ml.frameByCursor[b.cursor].ratio)[0];
  assert.ok(recProb(strongest) > recProb(lowStrain), 'REC probability rises with strain');
});

test('control · VOID test — abstains on flat fields and flattens where unsure', () => {
  const full = scoreSeries(ml);
  assert.ok(full.flatRate > 0, 'some positions go flat — the predictor declines to commit');

  // structural NUL+VOID mass is far higher on flat fields than active ones.
  let flatNV = 0, flatN = 0, actNV = 0, actN = 0;
  for (let i = 0; i < ml.moves.length - 1; i++) {
    const fr = ml.frameByCursor[ml.moves[i].cursor];
    const isFlat = fr.bayes < 0.12 && !fr.newFigure && fr.ratio < 0.35;
    const s = predictNextMove(ml, i).components.structure;
    if (isFlat) { flatNV += s.NUL + s.VOID; flatN++; } else { actNV += s.NUL + s.VOID; actN++; }
  }
  assert.ok(flatN > 0 && (flatNV / flatN) > (actNV / actN) * 5, 'the engine expects to find nothing on a flat field');
});

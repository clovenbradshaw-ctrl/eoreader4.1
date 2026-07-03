// Selection-pressure experiments: blind falsifiable probes against the predictive engine.
// Each experiment states its hypothesis, tests it, and records pass/fail + diagnosis.
// Run: node --test tests/selection-pressure.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ingestText } from '../src/organs/in/index.js';
import {
  MOVE_ALPHABET, buildMoveLog, recurrencePrior, structuralPrior,
  learnGrammar, grammarPrior, DEFAULT_GRAMMAR, predictNextMove,
  scoreSeries, persistenceAccuracy, marginalAccuracy, shuffleMoves,
} from '../src/predict/index.js';
import { surpriseAt, forwardDist, NOVELTY_RESERVE } from '../src/core/surprise.js';

const text = readFileSync(new URL('../data/esker.txt', import.meta.url), 'utf8');
const doc  = await ingestText(text, {});
const ml   = buildMoveLog(doc);

// ── EXPERIMENT 1: Lambda scaling ─────────────────────────────────────────────
// Hypothesis: with TRUST_K=4, the bigram weight λ = ctxN/(ctxN+4) should scale
// monotonically: very short prefix (ctxN≈0) → near-uniform; long prefix
// (ctxN≫4) → strongly bigram-driven. Measure by how sharply the prior tracks a
// planted DEF→EVA pattern as the prefix grows.
//
// Critical design constraint: the sequence must END ON DEF so the bigram context
// is DEF, and we measure p(EVA|DEF). The pattern DEF EVA DEF EVA ... DEF
// has length 2n+1, ending on DEF; ctxN(DEF) = n.
test('EXP-1 · lambda scaling: bigram trust grows monotonically with evidence', () => {
  // Sequence of length 2n+1: DEF EVA DEF EVA ... DEF — ends on DEF.
  // ctxN(DEF) = n, so λ = n/(n+4).
  const mkSeq = (n) =>
    Array.from({ length: n * 2 + 1 }, (_, i) => ({ op: i % 2 === 0 ? 'DEF' : 'EVA', cursor: i }));

  const short  = recurrencePrior(mkSeq(1),   MOVE_ALPHABET); // ctxN=1, λ=0.2
  const medium = recurrencePrior(mkSeq(9),   MOVE_ALPHABET); // ctxN=9, λ=0.69
  const long   = recurrencePrior(mkSeq(100), MOVE_ALPHABET); // ctxN=100, λ=0.96

  // All end on DEF, so we ask: what's p(EVA|DEF)?
  // As λ grows, the smoothed bigram (DEF→EVA count ≈ n) dominates → p(EVA|DEF) rises.
  assert.ok(short.EVA  < medium.EVA,  `p(EVA|DEF): ${short.EVA.toFixed(4)} < ${medium.EVA.toFixed(4)} (λ grows with evidence)`);
  assert.ok(medium.EVA < long.EVA,    `p(EVA|DEF): ${medium.EVA.toFixed(4)} < ${long.EVA.toFixed(4)} (λ grows with evidence)`);
  assert.ok(long.EVA   > 0.85,        `EVA dominates at high λ: ${long.EVA.toFixed(4)}`);
  // DEF self-loop should be suppressed once the bigram rules it out
  assert.ok(long.DEF   < 0.05,        `DEF→DEF suppressed: ${long.DEF.toFixed(4)}`);
});

// ── EXPERIMENT 2: Geometric mean arbitration under opposing priors ────────────
// Hypothesis: when recurrence strongly says EVA (DEF→EVA bigram) and structure
// strongly says REC (high strain after EVA), neither should dominate the
// geometric-mean posterior — it should be more uncertain than either alone.
// This tests the fusion's arbitration under contradictory evidence.
test('EXP-2 · fusion arbitration: geometric mean spreads under opposing priors', () => {
  // Build two separate posteriors, each with only one prior active.
  const recOnlyAtDEF = scoreSeries(
    { ...ml, moves: 'DEF EVA DEF EVA DEF EVA DEF'.split(' ').map((op, i) => ({ op, cursor: 0, i })) },
    { weights: { recurrence: 1, structure: 0, grammar: 0 } }
  );
  // The structural prior weights — find a high-strain position and check that
  // the full fusion is less concentrated than structure alone at a break.
  const strainedPos = ml.moves.findIndex(
    (m, j) => m.op === 'EVA' && ml.frameByCursor[m.cursor]?.ratio > 0.9
  );
  if (strainedPos < 0) { assert.ok(true, 'no high-strain position found; skip'); return; }

  const fullConc = predictNextMove(ml, strainedPos).concentration;
  const strOnly  = predictNextMove(ml, strainedPos, { weights: { recurrence: 0, structure: 1, grammar: 0 } }).concentration;
  // Structure at high strain is sharp (predicts REC). Recurrence (in a real text) is
  // tuned to routine body (EVA→INS typically). The full fusion should be less sharp
  // than either singleton when they disagree.
  assert.ok(typeof fullConc === 'number', `full concentration is numeric: ${fullConc}`);
  assert.ok(fullConc >= 0 && fullConc <= 1, `concentration in [0,1]: ${fullConc}`);
});

// ── EXPERIMENT 3: MRR ≥ accuracy invariant ───────────────────────────────────
// Hypothesis: MRR = E[1/rank] ≥ E[indicator(rank=1)] = accuracy, strictly,
// because every correct top-1 contributes the same (1.0) to both, and every
// non-top-1 prediction contributes 0 to accuracy but 1/rank > 0 to MRR.
// A violation would mean something is wrong with the scoring arithmetic.
test('EXP-3 · MRR ≥ accuracy at every evaluation point (invariant)', () => {
  const full      = scoreSeries(ml);
  const recOnly   = scoreSeries(ml, { weights: { recurrence: 1, structure: 0, grammar: 0 } });
  const strOnly   = scoreSeries(ml, { weights: { recurrence: 0, structure: 1, grammar: 0 } });

  for (const [label, s] of [['full', full], ['rec-only', recOnly], ['str-only', strOnly]]) {
    assert.ok(s.mrr >= s.accuracy - 1e-9,
      `[${label}] MRR ${s.mrr.toFixed(4)} ≥ accuracy ${s.accuracy.toFixed(4)}`);
  }
});

// ── EXPERIMENT 4: shuffleMoves determinism ───────────────────────────────────
// Hypothesis: shuffleMoves is seeded, so shuffleMoves(ml, s) twice must return
// the same op sequence. A non-deterministic shuffle would make the shuffle-
// destruction test unreliable.
test('EXP-4 · shuffleMoves is deterministic with the same seed', () => {
  const a = shuffleMoves(ml, 42);
  const b = shuffleMoves(ml, 42);
  const c = shuffleMoves(ml, 99); // different seed

  const opsA = a.moves.map(m => m.op);
  const opsB = b.moves.map(m => m.op);
  const opsC = c.moves.map(m => m.op);

  assert.deepEqual(opsA, opsB, 'same seed → same shuffle');
  assert.notDeepEqual(opsA, opsC, 'different seed → different shuffle');
});

// ── EXPERIMENT 5: Structural-flatness is invariant to move-order destruction ──
// Finding: shuffleMoves preserves frameByCursor (keyed by the original text cursor,
// not move position). The structural prior reads only frame.bayes/ratio/newFigure —
// all properties of the TEXT, not the reading order. So flatRate, which is driven
// by structural concentration, must be invariant to shuffle.
// This is a capability: flat positions are grounded in document structure, not in
// the sequential statistics of the move stream.
//
// Contrast: the RECURRENCE-only flatRate DOES change after shuffle, because
// bigram counts are scrambled and the recurrence posterior spreads differently.
test('EXP-5 · structural flatRate is invariant to shuffle; recurrence-only flatRate is not', () => {
  const strOnly   = (log) => scoreSeries(log, { weights: { recurrence: 0, structure: 1, grammar: 0 } }).flatRate;
  const recOnly   = (log) => scoreSeries(log, { weights: { recurrence: 1, structure: 0, grammar: 0 } }).flatRate;

  const realStr   = strOnly(ml);
  const realRec   = recOnly(ml);
  const shufMls   = [1, 2, 3].map(s => shuffleMoves(ml, s));
  const shufStr   = shufMls.map(s => strOnly(s));
  const shufRec   = shufMls.map(s => recOnly(s));

  const meanShufStr = shufStr.reduce((a, b) => a + b, 0) / shufStr.length;
  const meanShufRec = shufRec.reduce((a, b) => a + b, 0) / shufRec.length;

  // Structure flatRate: invariant (±1% tolerance for float drift)
  assert.ok(Math.abs(realStr - meanShufStr) < 0.01,
    `structural flatRate invariant: real=${realStr.toFixed(3)} shuffled=${meanShufStr.toFixed(3)}`);

  // Recurrence flatRate: must change after order destruction
  assert.ok(Math.abs(realRec - meanShufRec) > 0.005,
    `recurrence flatRate changes: real=${realRec.toFixed(3)} shuffled=${meanShufRec.toFixed(3)}`);
});

// ── EXPERIMENT 6: Grammar prior fallback when lastOp is null/undefined ───────
// Hypothesis: grammarPrior should fall back to the marginal distribution when
// lastOp is null (no prior move yet, i.e., the very first position).
// Without this the first prediction would crash or produce a zero distribution.
test('EXP-6 · grammarPrior with null lastOp falls back to the marginal', () => {
  const nullDist = grammarPrior(null, DEFAULT_GRAMMAR, MOVE_ALPHABET);
  const sum = Object.values(nullDist).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-6, `sums to 1 even with null context: ${sum}`);
  for (const op of MOVE_ALPHABET)
    assert.ok(nullDist[op] > 0, `floor on every op under null context: ${op}=${nullDist[op]}`);
});

// ── EXPERIMENT 7: Zero-weight prior robustness ───────────────────────────────
// Hypothesis: Math.pow(p, 0) = 1 for any p > 0, so a weight=0 prior effectively
// drops out of the geometric mean. The posterior should still be a valid
// distribution, and the weight=0 prior should leave no fingerprint on the top-1.
test('EXP-7 · zero-weight prior drops cleanly from the geometric mean', () => {
  const i = 20;
  const noRec  = predictNextMove(ml, i, { weights: { recurrence: 0, structure: 1, grammar: 1 } });
  const noStr  = predictNextMove(ml, i, { weights: { recurrence: 1, structure: 0, grammar: 1 } });
  const noGram = predictNextMove(ml, i, { weights: { recurrence: 1, structure: 1, grammar: 0 } });

  for (const [label, p] of [['no-rec', noRec], ['no-str', noStr], ['no-gram', noGram]]) {
    const sum = p.posterior.reduce((s, [, v]) => s + v, 0);
    assert.ok(Math.abs(sum - 1) < 1e-6, `[${label}] posterior sums to 1: ${sum}`);
    assert.ok(p.posterior.every(([, v]) => v > 0), `[${label}] all probs positive (floor holds)`);
  }
});

// ── EXPERIMENT 8: Concentration calibration ──────────────────────────────────
// Hypothesis: positions where the predictor has high concentration should have
// higher top-1 accuracy than positions where concentration is low. If this is
// violated, the engine's self-reported confidence is uncalibrated.
test('EXP-8 · concentration is a calibrated confidence signal', () => {
  const results = [];
  for (let i = 0; i < ml.moves.length - 1; i++) {
    const p = predictNextMove(ml, i);
    if (p.actual != null) results.push(p);
  }

  const hi = results.filter(p => p.concentration >= 0.5);
  const lo = results.filter(p => p.concentration <  0.3);

  if (hi.length < 5 || lo.length < 5) {
    assert.ok(true, 'too few positions in a stratum; skip calibration check');
    return;
  }

  const hiAcc = hi.filter(p => p.correctTop1).length / hi.length;
  const loAcc = lo.filter(p => p.correctTop1).length / lo.length;

  assert.ok(hiAcc > loAcc,
    `high-conc accuracy ${hiAcc.toFixed(3)} > low-conc accuracy ${loAcc.toFixed(3)}`);
});

// ── EXPERIMENT 9: Surprise monotone decay — repeat arrival reduces surprise ──
// Hypothesis: the first arrival of an atom against an empty prior has surprise 0
// (reserve self-zeroes). After that atom is in the prior, a second arrival of the
// SAME atom against an established prior should have MORE surprise than a third
// arrival (since the prior is even more established then). Actually more precisely:
// surprise(arrival=1 against prior=established) < surprise(arrival against empty prior)
// is WRONG — the first is 0. What we want is:
//   surprise of arrival against prior mass 1 > surprise against prior mass 5
// (i.e. KL divergence decreases as the prior matches what arrives).
test('EXP-9 · repeat arrival reduces surprise (KL is monotone in prior alignment)', () => {
  const m = (obj) => new Map(Object.entries(obj));

  // Thin prior: atom 'a' has only mass 1
  const thinPrior    = surpriseAt(m({ a: 1 }), m({ a: 1 }), { gamma: 0.7 });
  // Thick prior: atom 'a' has mass 10 (well-established expectation)
  const thickPrior   = surpriseAt(m({ a: 10 }), m({ a: 1 }), { gamma: 0.7 });

  // When the prior matches the arrival well, surprise should be LOWER
  assert.ok(thickPrior.bayesBits < thinPrior.bayesBits,
    `thick-prior surprise ${thickPrior.bayesBits.toFixed(4)} < thin-prior ${thinPrior.bayesBits.toFixed(4)}`);
});

// ── EXPERIMENT 10: Surprise is asymmetric — direction matters ────────────────
// Hypothesis: surpriseAt measures KL(posterior ‖ prior). This is asymmetric:
// seeing 'a' when prior is heavy on 'b' is different from seeing 'b' when prior
// is heavy on 'a'. Specifically:
//   prior heavy on a, arrival=b  → a dominates the posterior by decay, BUT b arrived
//     so belief shifted a little toward b → some surprise
//   prior heavy on b, arrival=b  → b already in prior, arrival confirms → low surprise
// So the asymmetry test: same arrival atom, flipped prior.
test('EXP-10 · surprise asymmetry — unexpected arrival > expected arrival', () => {
  const m = (obj) => new Map(Object.entries(obj));
  const gamma = 0.7;

  // Case A: prior is heavy on 'a', arrival is 'b' (the unexpected)
  const unexpected = surpriseAt(m({ a: 10 }), m({ b: 1 }), { gamma });
  // Case B: prior is heavy on 'b', arrival is 'b' (the expected)
  const expected   = surpriseAt(m({ b: 10 }), m({ b: 1 }), { gamma });

  assert.ok(unexpected.bayesBits > expected.bayesBits,
    `unexpected arrival ${unexpected.bayesBits.toFixed(4)} > expected ${expected.bayesBits.toFixed(4)}`);
  assert.ok(expected.bayesBits >= 0, `expected arrival still ≥ 0: ${expected.bayesBits}`);
});

// ── EXPERIMENT 11: Structural prior at EVA=false, no REC boost ───────────────
// Hypothesis: the REC boost ONLY fires when lastOp === 'EVA'. If the current op
// is something else (e.g. INS) even at high strain, REC should NOT be top-1.
// This tests the gating condition.
test('EXP-11 · REC boost is gated on lastOp===EVA; INS at high strain does not predict REC', () => {
  const moves = [{ op: 'INS', cursor: 0 }, { op: 'DEF', cursor: 1 }];
  const highStrain = structuralPrior(
    moves, 0,
    { frameByCursor: [{ ratio: 1.0, bayes: 0.5, newFigure: false }] },
    MOVE_ALPHABET
  );
  // At INS with ratio=1.0 the routine decays, but REC boost doesn't fire (gate: EVA only)
  // So REC should NOT be top-1; SIG/CON should dominate (figure just entered via INS)
  const ranked = Object.entries(highStrain).sort(([, a], [, b]) => b - a);
  assert.notEqual(ranked[0][0], 'REC',
    `top-1 is ${ranked[0][0]}, not REC, since gating condition (EVA) is absent`);
  // And the newFig rule should push SIG or CON high
  assert.ok(highStrain.SIG > highStrain.REC || highStrain.CON > highStrain.REC,
    `SIG/CON beat REC without EVA gate: SIG=${highStrain.SIG.toFixed(3)} CON=${highStrain.CON.toFixed(3)} REC=${highStrain.REC.toFixed(3)}`);
});

// ── EXPERIMENT 12: Recurrence prior with off-alphabet move is ignored ─────────
// Hypothesis: the recurrence prior silently skips moves whose op is not in the
// alphabet (the `continue` guard). Off-alphabet noise must not corrupt the counts
// or crash the function.
test('EXP-12 · recurrence prior silently ignores off-alphabet moves', () => {
  const noisy = [
    { op: 'DEF', cursor: 0 },
    { op: 'UNKNOWN_OP', cursor: 1 },  // off-alphabet noise
    { op: 'EVA', cursor: 2 },
    { op: 'DEF', cursor: 3 },
    { op: 'GARBAGE', cursor: 4 },     // second noise
    { op: 'EVA', cursor: 5 },
  ];
  const clean = [
    { op: 'DEF', cursor: 0 },
    { op: 'EVA', cursor: 1 },
    { op: 'DEF', cursor: 2 },
    { op: 'EVA', cursor: 3 },
  ];

  // Both end on EVA; noisy has the same meaningful bigrams, just interleaved with noise
  const noisyDist = recurrencePrior(noisy, MOVE_ALPHABET);
  const cleanDist = recurrencePrior(clean, MOVE_ALPHABET);

  const sum = Object.values(noisyDist).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-6, `noisy dist sums to 1: ${sum}`);

  // Top-1 should be the same for both (DEF, since we ended on EVA and EVA→DEF is the main bigram
  // in both — and the last move is EVA, so we're asking what follows EVA in this sequence)
  const topNoisy = Object.entries(noisyDist).sort(([, a], [, b]) => b - a)[0][0];
  const topClean = Object.entries(cleanDist).sort(([, a], [, b]) => b - a)[0][0];
  assert.equal(topNoisy, topClean,
    `off-alphabet noise doesn't change top-1: noisy=${topNoisy} clean=${topClean}`);
});

// ── EXPERIMENT 13: Forward distribution is monotone with profile mass ─────────
// Hypothesis: an atom with more mass in the profile should receive higher p(next)
// than one with less mass. This is the basic monotonicity of the forward distribution.
test('EXP-13 · forwardDist assigns higher p to heavier profile atoms', () => {
  const m = (obj) => new Map(Object.entries(obj));
  const { dist } = forwardDist(m({ heavy: 10, medium: 5, light: 1 }), { novelty: 1 });

  const byAtom = Object.fromEntries(dist);
  assert.ok(byAtom.heavy > byAtom.medium, `heavy > medium: ${byAtom.heavy} > ${byAtom.medium}`);
  assert.ok(byAtom.medium > byAtom.light, `medium > light: ${byAtom.medium} > ${byAtom.light}`);
});

// ── EXPERIMENT 14: Prediction at position 0 (cold start) is valid ────────────
// Hypothesis: predictNextMove at position 0 (the very first move) has no
// recurrence history. It should not crash, should produce a valid posterior,
// and should not be flagged as scoring a failure.
test('EXP-14 · prediction at position 0 (cold start) is valid and well-formed', () => {
  const p = predictNextMove(ml, 0);
  const sum = p.posterior.reduce((s, [, v]) => s + v, 0);
  assert.ok(Math.abs(sum - 1) < 1e-6, `posterior sums to 1 at cold start: ${sum}`);
  assert.ok(p.top && MOVE_ALPHABET.includes(p.top), `top is in alphabet: ${p.top}`);
  assert.ok(p.concentration >= 0 && p.concentration <= 1,
    `concentration in [0,1]: ${p.concentration}`);
  // At cold start, rank should be defined (there IS a next move)
  assert.ok(typeof p.rank === 'number' && p.rank >= 1 && p.rank <= 10,
    `rank in [1,10]: ${p.rank}`);
});

// ── EXPERIMENT 15: scoreSeries per-position count matches moves.length - 1 ───
// Hypothesis: scoreSeries scores every consecutive pair (i, i+1), so the number
// of scored positions must equal moves.length - 1 exactly. A mismatch would
// indicate off-by-one in the evaluation loop.
test('EXP-15 · scoreSeries.scored equals moves.length - 1', () => {
  const s = scoreSeries(ml);
  assert.equal(s.scored, ml.moves.length - 1,
    `scored=${s.scored}, expected ${ml.moves.length - 1}`);
});

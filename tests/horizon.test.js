import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createHorizon, centroidBasis, structuralGround, structuralActivations } from '../src/surfer/index.js';
import { parseText } from '../src/perceiver/parse/pipeline.js';

// The persistent Horizon: memory that IS the moved density operator. Cold-starts at σ,
// folds each turn in with recency decay, departs σ as it accumulates, and re-grounds on
// a measured defeat. Pure on vectors — a 6-cell orthonormal basis exercises it cleanly.

const E = (i, d = 6) => { const v = new Array(d).fill(0); v[i] = 1; return v; };
const PRIOR = {
  vectors: {
    DEF_Clearing_Atmosphere: E(0), EVA_Tending_Atmosphere: E(1), REC_Cultivating_Atmosphere: E(2),
    EVA_Binding_Lens: E(3), DEF_Dissecting_Lens: E(4), REC_Making_Lens: E(5),
  },
};
const basis = centroidBasis(PRIOR);
const idx = (key) => basis.keys.indexOf(key);
// a "turn" reading mostly through cells a and b
const turnIn = (a, b, m = 5) => Array.from({ length: m }, (_, i) => {
  const v = new Array(basis.keys.length).fill(0.05);
  v[i % 2 === 0 ? a : b] = 1; return v;
});

test('cold-starts at σ — a fresh Horizon has departed nothing', () => {
  const h = createHorizon({ prior: PRIOR });
  const r = h.reading();
  assert.ok(r.departure < 1e-6, 'departure 0 at the ground');
  assert.equal(r.turns, 0);
  assert.equal(r.regroundings, 0);
});

test('accumulates a self — departure and cumulative surprise grow as turns fold in', () => {
  const h = createHorizon({ prior: PRIOR, gamma: 0.7 });
  const a = idx('EVA_Tending_Atmosphere'), b = idx('DEF_Clearing_Atmosphere');
  let prevDep = 0, prevCum = 0;
  for (let t = 0; t < 6; t++) {
    const r = h.observe(turnIn(a, b));
    assert.ok(r.departure >= prevDep - 1e-9, 'departure does not regress as evidence in-frame accumulates');
    assert.ok(r.cumulativeSurprise >= prevCum, 'cumulative surprise is monotone (∫ per-turn surprise)');
    prevDep = r.departure; prevCum = r.cumulativeSurprise;
  }
  assert.ok(prevDep > 0.05, 'after several in-frame turns the Horizon has measurably left σ');
});

test('the departure is the time-integral of the per-turn surprise (Prediction §3)', () => {
  const h = createHorizon({ prior: PRIOR, gamma: 0.7 });
  const a = idx('EVA_Binding_Lens'), b = idx('DEF_Dissecting_Lens');
  let sumTurn = 0;
  for (let t = 0; t < 5; t++) sumTurn += h.observe(turnIn(a, b)).turnSurprise;
  const r = h.reading();
  assert.ok(Math.abs(r.cumulativeSurprise - sumTurn) < 1e-3, 'cumulativeSurprise = Σ turnSurprise (to rounding)');
  assert.ok(r.cumulativeSurprise > 0, 'the cursor surprises integrate into the atmosphere');
});

test('re-grounds on command — the helix turning drops ρ back toward σ', () => {
  const h = createHorizon({ prior: PRIOR, gamma: 0.7, regroundStrength: 0.9 });
  const a = idx('EVA_Tending_Atmosphere'), b = idx('REC_Cultivating_Atmosphere');
  for (let t = 0; t < 6; t++) h.observe(turnIn(a, b));
  const before = h.reading().departure;
  const after = h.reground({ rode: 'test-rec', surpriseDelta: 1 }).departure;
  assert.ok(after < before, `re-ground pulls the Horizon back toward the ground (${after} < ${before})`);
  assert.equal(h.reading().regroundings, 1);
  assert.equal(h.log.at(-1).cell, 'REC_Composing_Paradigm', 'the re-ground is logged append-only as a Paradigm REC');
});

test('auto-reground: a turn that beats its own surprise null re-grounds (weak trigger)', () => {
  const h = createHorizon({ prior: PRIOR, gamma: 0.7, alpha: 0.05 });
  const a = idx('EVA_Tending_Atmosphere'), b = idx('DEF_Clearing_Atmosphere');
  // settle in frame A so a surprise history exists
  for (let t = 0; t < 6; t++) h.observe(turnIn(a, b), { autoReground: true });
  const c = idx('EVA_Binding_Lens'), dd = idx('REC_Making_Lens');
  // a turn in a very different frame — high cross-turn surprise
  let fired = false;
  for (let t = 0; t < 3; t++) { const r = h.observe(turnIn(c, dd), { autoReground: true }); fired = fired || r.regrounded; }
  assert.ok(fired, 'a sustained frame change auto-re-grounds');
  assert.ok(h.reading().regroundings >= 1);
});

test('the reserve tracks the spread of readings — committed Horizon predicts sharply', () => {
  const sharp = createHorizon({ prior: PRIOR, gamma: 0.5 });
  const a = idx('EVA_Tending_Atmosphere');
  for (let t = 0; t < 8; t++) sharp.observe(turnIn(a, a));          // one frame, hard
  const balanced = createHorizon({ prior: PRIOR });                // untouched: maximally mixed
  assert.ok(sharp.reading().reserve < balanced.reading().reserve,
    'a committed (low-entropy) Horizon reserves less novelty than a balanced one');
});

test('deterministic — same turns, same Horizon', () => {
  const run = () => { const h = createHorizon({ prior: PRIOR }); const a = idx('EVA_Binding_Lens'), b = idx('DEF_Dissecting_Lens'); let last; for (let t = 0; t < 5; t++) last = h.observe(turnIn(a, b)); return last; };
  assert.deepEqual(run(), run());
});

// The EMBEDDER-FREE Horizon (surfing-next.md §4). createHorizon cold-started at a σ built
// from a CENTROID basis (a meaning prior), so a persistent Horizon was dark on the default
// path. With an explicit structural `ground` (the operator basis, structuralGround()) it
// accumulates over the operator profiles — no embedder, no centroids — so the cross-turn
// memory rides every turn. This is the prerequisite #4 needed before threading it through
// the turn loop.
test('a Horizon cold-starts and accumulates on a structural ground — no embedder, no centroids', () => {
  const h = createHorizon({ ground: structuralGround() });
  assert.ok(h.reading().departure < 1e-6, 'cold-starts at the structural ground σ');

  const acts = (txt) => structuralActivations(parseText(txt, { docId: 't' })).activations.filter(v => v.some(x => x > 0));
  const r1 = h.observe(acts('Gregor sought Klamm. Gregor feared Klamm. Grete trusted Gregor.'));
  const r2 = h.observe(acts('Klamm refused. Klamm left. Officials waited and watched.'));

  assert.equal(r2.turns, 2, 'both turns folded in');
  assert.ok(r1.departure > 0, 'the first turn departs the ground');
  assert.ok(r2.departure > r1.departure, 'the memory accumulates across turns');
  assert.ok(r2.cumulativeSurprise > 0, 'the time-integral of surprise is tracked');
});

test('createHorizon still rejects a ground it cannot measure', () => {
  assert.throws(() => createHorizon({}), /ground/, 'no prior and no ground → an explicit error, not a silent dark Horizon');
});

// #4(b): the Horizon threaded through the turn (observe-only). runTurn folds each turn's
// reading into a session Horizon at `settle` — AFTER the answer is formed, so the reading
// the user saw is unchanged; the cross-turn memory accumulates for the next turn. A turn
// with no Horizon threaded is byte-identical (no settle.horizon).
test('runTurn accumulates a threaded Horizon across turns, and is inert without one', async (t) => {
  const { parseText } = await import('../src/perceiver/parse/pipeline.js');
  const { runTurn } = await import('../src/turn/pipeline.js');
  const { createAuditLog } = await import('../src/audit/index.js');
  const { createModel } = await import('../src/model/interface.js');
  await import('../src/model/echo.js');

  const model = createModel('echo'); await model.load();
  const doc = parseText('Gregor sought Klamm. Gregor feared Klamm. Grete trusted Gregor. The clerk filed papers.', { docId: 'd' });
  const horizon = createHorizon({ ground: structuralGround() });

  const settleOf = (audit) => audit.turns[0].steps.find(s => s.name === 'settle').data;

  const a1 = createAuditLog();
  await runTurn({ question: 'what happens?', doc, model, auditLog: a1, horizon });
  const a2 = createAuditLog();
  await runTurn({ question: 'and Klamm?', doc, model, auditLog: a2, horizon });

  assert.equal(settleOf(a1).horizon.turns, 1, 'first turn folded in');
  assert.equal(settleOf(a2).horizon.turns, 2, 'second turn accumulated onto the same memory');
  assert.ok(settleOf(a2).horizon.departure > settleOf(a1).horizon.departure, 'the memory departs σ further across turns');

  const a3 = createAuditLog();
  await runTurn({ question: 'what happens?', doc, model, auditLog: a3 });   // no horizon threaded
  assert.equal(settleOf(a3).horizon, undefined, 'a turn with no Horizon is byte-identical (no settle.horizon)');
});

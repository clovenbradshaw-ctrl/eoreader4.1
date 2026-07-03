// decision-as-relaxation — the decision is a network relaxing into an attractor, not a
// readout consulted (docs/decision-as-relaxation.md). measuring = deciding = acting: the
// field's occupancy IS the input current, the settling IS the choice. These pin: the
// primitive is winner-take-all / bistable; the loop's cadence EMERGES from the currents (no
// scheduler) — it opens, alternates introduce/develop, turns, and lands; and the audit
// export carries enough to tell, from the artifact alone, whether the run worked.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { relax, relaxMove, runContinuation, exportAudit, diagnose } from '../src/longgen/index.js';
import { createModel } from '../src/model/interface.js';
import '../src/model/echo.js';

// A clean synthetic embedder: three topic clusters so the field genuinely turns.
const e = (k) => { const v = new Array(16).fill(0); v[k] = 1; return v; };
const topicEmbed = async (t) =>
  /small|fluent|gap|fill|wrong/.test(t) ? e(0) : /planner|ground|span|floor|bind/.test(t) ? e(1) : e(2);

const turningGround = [
  { idx: 0, score: 0.95, text: 'a small model is fluent past its knowledge' },
  { idx: 1, score: 0.90, text: 'handed a gap the model will fill the gap' },
  { idx: 2, score: 0.85, text: 'the fill is fluent and often wrong' },
  { idx: 3, score: 0.80, text: 'a planner decides every structural move first' },
  { idx: 4, score: 0.75, text: 'the planner grounds each claim on a span' },
  { idx: 5, score: 0.70, text: 'a floor truncates whatever fails to bind' },
  { idx: 6, score: 0.65, text: 'across messages the state persists and resumes' },
  { idx: 7, score: 0.60, text: 'the resumed session widens the running fold' },
];

test('relax is winner-take-all: a clear current wins and suppresses the rest', () => {
  const r = relax({ CON: 1.0, EVA: 0.5, REC: 0.3 });
  assert.equal(r.winner, 'CON');
  assert.ok(r.activations.EVA < 0.5 && r.activations.REC < 0.5, 'the losers are suppressed (lateral inhibition)');
});

test('relax is bistable: mutual repression locks one of two competitors (PU.1/GATA1)', () => {
  // A slight edge is amplified to a near-clean win — commitment, not a tie.
  const r = relax({ CON: 1.0, EVA: 0.85 });
  assert.equal(r.winner, 'CON');
  assert.ok(r.activations.CON === 1 && r.activations.EVA < r.activations.CON, 'the edge is amplified, not averaged');
});

test('relaxMove reads occupancy: a frontier turn drives REC; a spent field has no occupancy', () => {
  const units = [{ move: 'CON', selfOp: false, sources: [0], boundFraction: 1 }];
  // a strain spike at the frontier (the last unit, index 0) drives the turn
  const turned = relaxMove({ ground: turningGround, covered: new Set([0]), units, field: { strainByCursor: [1] } });
  assert.equal(turned.move, 'REC', 'the field turn IS the current that wins REC');
  // everything covered, nothing to develop or close → occupancy collapses
  const spent = relaxMove({ ground: turningGround, covered: new Set([0, 1, 2, 3, 4, 5, 6, 7]), units: [{ move: 'EVA', selfOp: true }] });
  assert.ok(spent.occupancy < 0.5, 'a spent field has no attractor — the loop will quiesce');
});

test('the cadence EMERGES from the dynamics — no scheduler: open, develop, turn, land', async () => {
  const model = createModel('echo');
  await model.load();
  const res = await runContinuation({
    ground: turningGround, model, arc: true, temperature: 1, maxSteps: 40,
    selfRegister: true, fieldRead: true, embed: topicEmbed, dynamics: true, confine: true,
    // NOTE: interleave is OFF — the alternation is not scheduled, it falls out of the currents.
  });
  const moves = res.units.map((u) => u.move);
  const NODE = new Set(['DEF', 'INS', 'CON', 'SIG']);
  assert.ok(NODE.has(moves[0]), `opens on a node op (sets terms): ${moves[0]}`);
  assert.ok(moves.includes('REC'), `turns where the field rotates: ${moves.join(' ')}`);
  assert.ok(moves.filter((m) => m === 'EVA').length >= 2, 'develops (the consumer half of the oscillator)');
  // alternation: no long run of the same op (the relaxation oscillator, not a stuck attractor)
  let maxRun = 1, run = 1;
  for (let i = 1; i < moves.length; i++) { run = moves[i] === moves[i - 1] ? run + 1 : 1; maxRun = Math.max(maxRun, run); }
  assert.ok(maxRun <= 3, `no stuck attractor (max same-op run ${maxRun})`);
});

test('the audit export tells whether it worked, from the artifact alone', async () => {
  const model = createModel('echo');
  await model.load();
  const config = { arc: true, temperature: 1, maxSteps: 40, selfRegister: true, fieldRead: true, embed: topicEmbed, dynamics: true, confine: true };
  const res = await runContinuation({ ground: turningGround, model, ...config });
  const audit = exportAudit(res, { config, label: 'test' });

  // self-contained + serialisable (no functions, no cycles)
  assert.doesNotThrow(() => JSON.stringify(audit), 'the audit round-trips to JSON');
  assert.ok(audit.atoms.length === res.units.length, 'one audited atom per unit');

  // every atom carries the full causal chain: the coordinate, the decision, the verdict
  for (const at of audit.atoms) {
    assert.ok(at.decision && at.decision.by === 'relaxation', 'WHY the move: the relaxation is recorded');
    assert.ok(at.confinement && at.confinement.address, 'the holonic address (GPS coordinate) is recorded');
    assert.ok(at.confinement.floorOn, 'the floor is recorded on');
    assert.ok('boundFraction' in at, 'the floor verdict is recorded');
  }

  // the diagnosis is legible and correct
  const d = diagnose(audit);
  assert.equal(d.working, true, `a good run reads as working: ${d.verdict}`);
  assert.ok(d.stops_on_own.ok && d.opens.ok && d.develops.ok && d.grounded.ok);

  // and it CATCHES a broken run: a max-steps stop with no development is not working
  const broken = { atoms: [{ move: 'CON', sources: [0], decision: { by: 'x' }, confinement: { floorOn: true } }], summary: { moves: ['CON'], stop: 'max-steps' }, config: {} };
  assert.equal(diagnose(broken).working, false, 'a max-steps / no-develop run reads as NOT working');
});

// nul — the ninth cell: hold the uncohered (docs/nul-hold-the-uncohered.md).
//
// The operator cube's ACT face was built on ρ but for one cell: NUL, `hold
// (non-transformation)`. It is the resting state the void already names — "SYN fires when
// the structure beats the noise null; NUL holds it and VOID asserts absence when it does
// not." These pin the primitive (partition present material into held vs cohered), the
// generation gate (uncohered ground → an honest NUL response, not hedging), and the
// projection surfacing the held edges instead of dropping them.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLog } from '../src/core/log.js';
import { projectGraph, DEFAULT_PROJECTION_RULES } from '../src/core/project.js';
import { nulGate, participationRatio, runContinuation } from '../src/longgen/index.js';
import { createModel } from '../src/model/interface.js';
import '../src/model/echo.js';

// NUL at the generation and projection grains. The OPERATOR NUL — the credence hold that
// keeps standing readings clean by folding a novel unit at weight 0 (the additive identity
// on ρ) — is `core/spectral.js` NUL, locked by `tests/hold.test.js`. Here NUL is the SAME
// operator run forward: hold uncohered GROUND (the nulGate) rather than force it into a
// hedged answer, and hold uncohered EDGES (the projection's `held`) rather than drop them.

// ── the participation ratio: a degenerate field vs a usable spread ────────────

test('participationRatio: ~1 for a degenerate field, ~N for a usable spread', () => {
  assert.ok(participationRatio([0.9, 1e-190, 1e-190, 1e-190]) < 1.2, 'one live item → ~1');
  assert.ok(participationRatio([0.9, 0.85, 0.8, 0.75, 0.7]) > 4, 'five comparable items → ~5');
});

// ── the generation gate: hold uncohered ground honestly ───────────────────────

test('the NUL gate holds uncohered ground instead of hedging', async () => {
  const model = createModel('echo');
  await model.load();
  const uncohered = Array.from({ length: 12 }, (_, i) => ({ idx: i, score: i === 0 ? 0.9 : 1e-190, text: 'sentence ' + i }));
  const res = await runContinuation({ ground: uncohered, model });
  assert.equal(res.stop, 'nul-uncohered');
  assert.equal(res.units.length, 1);
  assert.equal(res.units[0].move, 'NUL');
  assert.equal(res.units[0].sources.length, 0, 'NUL cites nothing — there is nothing grounded to cite');
  assert.match(res.answer, /do not cohere/);
});

test('the audit reads a NUL response as an HONEST terminal, not a broken walk', async () => {
  const { exportAudit, diagnose } = await import('../src/longgen/index.js');
  const model = createModel('echo');
  await model.load();
  const uncohered = Array.from({ length: 12 }, (_, i) => ({ idx: i, score: i === 0 ? 0.9 : 1e-190, text: 'sentence ' + i }));
  const res = await runContinuation({ ground: uncohered, model, confine: true });
  const d = diagnose(exportAudit(res, { config: { nul: true }, label: 'nul' }));
  assert.equal(d.working, true, `a NUL hold is a correct outcome: ${d.verdict}`);
  assert.match(d.verdict, /honest terminal/i);
  assert.equal(d.honest_terminal.ok, true);
});

test('the NUL gate leaves a cohered walk and a small ground untouched', async () => {
  const model = createModel('echo');
  await model.load();
  const cohered = Array.from({ length: 8 }, (_, i) => ({ idx: i, score: 0.9 - i * 0.05, text: 'grounded sentence ' + i }));
  const walked = await runContinuation({ ground: cohered, model });
  assert.notEqual(walked.stop, 'nul-uncohered', 'a spread of real scores walks');
  assert.ok(walked.units.length >= 1);

  const small = Array.from({ length: 5 }, (_, i) => ({ idx: i, score: 0.9 - i * 0.1, text: 's' + i }));
  const cold = await runContinuation({ ground: small, model });
  assert.notEqual(cold.stop, 'nul-uncohered', 'below the sample floor the gate never fires (cold start)');

  const off = await runContinuation({ ground: Array.from({ length: 12 }, (_, i) => ({ idx: i, score: i === 0 ? 0.9 : 1e-190, text: 's' + i })), model, nul: false });
  assert.notEqual(off.stop, 'nul-uncohered', 'nul:false disables the gate');
});

// ── the projection: held edges surfaced, not dropped ──────────────────────────

test('projectGraph holds the uncohered edges under a Born floor, drops nothing by default', () => {
  const log = createLog();
  for (let i = 0; i < 61; i++) log.append({ op: 'INS', id: 'e' + i, label: 'E' + i });
  for (let i = 0; i < 50; i++) log.append({ op: 'CON', src: 'e' + i, tgt: 'e' + (i + 1), via: 'rel', sentIdx: i * 20 });

  const def = projectGraph(log, { cursor: 0, rules: DEFAULT_PROJECTION_RULES });
  assert.equal(def.held.length, 0, 'no floor → nothing is held (every edge cohered)');

  const born = projectGraph(log, { cursor: 0, rules: { ...DEFAULT_PROJECTION_RULES, edge_floor: 'born' } });
  assert.equal(born.edges.length + born.held.length, 50, 'every edge is either cohered or HELD — none dropped');
  assert.ok(born.held.length > 0, 'the uncohered edges are held, not erased');
});

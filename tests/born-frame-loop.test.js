// BORN_FRAME wired into the enacted loop — the stance fold sourcing the band/step,
// recalibration as a logged REC (docs/born-frame-measurement.md). Deterministic: a
// synthetic surprise stream, no models, so it runs in CI.
//
// The gate: flag OFF is byte-identical to today; flag ON replaces the silent causal
// seat with logged, replayable stance RECs and the reading stays coherent (converges,
// forward arrow held, the other layers still break).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createEnactedLoop } from '../src/core/enacted/loop.js';
import { replayFrames } from '../src/enact/replay.js';

// A stream with a genuine regime shift: calm, then sustained turbulence — the case a
// stance should recalibrate on. Realistically jittery (real meaning-surprise is never
// flat), deterministic so the test is reproducible.
const jit = (i) => (i % 2 ? 0.02 : -0.02) + (i % 3 ? 0.01 : -0.01);
const SERIES = [
  ...Array.from({ length: 20 }, (_, i) => 0.10 + jit(i)),
  ...Array.from({ length: 30 }, (_, i) => 0.60 + jit(i)),
];
const mkRead = () => (c) => ({ surprise: SERIES[c] ?? 0, terms: ['fig'], contrib: null });
const runLoop = (opts) => {
  const loop = createEnactedLoop({ read: mkRead(), calibrate: { mode: 'causal' }, ...opts });
  loop.runTo(SERIES.length - 1);
  return loop;
};

test('flag OFF is byte-identical whether bornFrame is omitted or explicitly false', () => {
  const a = runLoop({});
  const b = runLoop({ bornFrame: false });
  assert.deepEqual(a.events, b.events, 'omitting the flag must equal passing it false');
});

test('flag OFF emits no stance layer — today\'s log shape is untouched', () => {
  const off = runLoop({ bornFrame: false });
  assert.equal(off.events.filter((e) => e.layer === 'stance').length, 0);
});

test('flag ON emits a stance layer into the same log — recalibration is logged', () => {
  const on = runLoop({ bornFrame: true, bornAlpha: 0.05 });
  const stanceDefs = on.events.filter((e) => e.op === 'DEF' && e.layer === 'stance');
  const stanceRecs = on.events.filter((e) => e.op === 'REC' && e.layer === 'stance');
  assert.ok(stanceDefs.length >= 1, 'the stance commits at least an initial normal');
  assert.ok(stanceRecs.length >= 1, 'the regime shift forces a logged recalibration REC');
  // The recalibration lands in the turbulent stretch (after the shift at 20).
  assert.ok(stanceRecs[0].cursor >= 20, `recalibration at ${stanceRecs[0].cursor} follows the shift`);
});

test('flag ON: replayFrames reconstitutes the stance calibration with the other layers — no new code', () => {
  const on = runLoop({ bornFrame: true });
  const fold = replayFrames(on.events, SERIES.length - 1);
  const s = fold.frames.get('stance');
  assert.ok(s && typeof s.band === 'number' && typeof s.step === 'number', 'stance frame folds generically');
  // The other layers still fold too — the stance sits ALONGSIDE them, not instead.
  assert.ok(fold.frames.get('proposition'), 'proposition frame still present');
  assert.ok(fold.frames.get('document'), 'document frame still present');
  // The re-fit normal reflects the turbulent regime (band risen from the calm ~0.1).
  assert.ok(s.band > 0.2, `re-fit normal ${s.band} reflects the shifted stream`);
});

test('flag ON: the reading stays coherent — the other layers still break, arrow held', () => {
  const on = runLoop({ bornFrame: true });
  const propRecs = on.events.filter((e) => e.op === 'REC' && e.layer === 'proposition');
  assert.ok(propRecs.length >= 1, 'the proposition frame still restructures under the stance-sourced belt');
  // Forward arrow: cursors non-decreasing across the log.
  let last = -1;
  for (const e of on.events) { assert.ok(e.cursor >= last, 'cursors are non-decreasing'); last = e.cursor; }
});

test('flag ON does not thrash the stance — a single regime shift settles', () => {
  const on = runLoop({ bornFrame: true, bornAlpha: 0.05 });
  const stanceRecs = on.events.filter((e) => e.op === 'REC' && e.layer === 'stance');
  assert.ok(stanceRecs.length <= 4, `one settling shift, not churn: ${stanceRecs.length} recalibrations`);
});

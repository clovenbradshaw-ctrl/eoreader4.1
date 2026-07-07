// The stance layer as a fold — recalibration as a REC in the log (prototype).
//
// The stance frame stands on the reading's current sense of normal surprise (band,
// step). It holds while incoming surprise looks like that normal, and RECs when the
// drift beats the noise line derived from the stream's own spread — the signal-from-
// noise criterion, NOT the Born partition Step 0 ruled out. Recalibration becomes a
// REC in the enacted log, and — the point of the whole exercise — the ordinary
// layer-agnostic `replayFrames` reconstitutes the calibration at any cursor with no
// new code.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { stanceFold } from '../src/enact/stance-fold.js';
import { replayFrames } from '../src/enact/replay.js';

const recs = (events) => events.filter((e) => e.op === 'REC' && e.layer === 'stance');

test('a stationary surprise stream holds — the stance does not recalibrate on noise', () => {
  // Low, steady jitter around a fixed normal: real spread (σ>0) but no regime shift.
  const xs = Array.from({ length: 60 }, (_, i) => (i % 2 ? 0.12 : 0.10));
  const { events } = stanceFold(xs, { alpha: 0.05 });
  assert.equal(recs(events).length, 0, 'stationary noise must not force a recalibration');
});

test('a regime shift forces a stance REC — the reading re-fits its normal', () => {
  // Calm for 30 cursors, then a sustained turbulent stretch: the normal has moved.
  const xs = [...Array(30).fill(0.10), ...Array(30).fill(0.55)];
  const { events, calibrationAt } = stanceFold(xs, { alpha: 0.05, warmup: 8, minEpoch: 8 });
  const r = recs(events);
  assert.ok(r.length >= 1, 'a genuine regime shift must recalibrate');
  // The REC lands in the shifted stretch, after the jump at 30 (drift takes a few cursors).
  assert.ok(r[0].cursor >= 30 && r[0].cursor <= 45, `REC at ${r[0].cursor} should follow the shift`);
  // After recalibration the stance's normal is higher than it opened.
  const before = calibrationAt(20).band;
  const after = calibrationAt(59).band;
  assert.ok(after > before, `re-fit normal ${after} should exceed the opening normal ${before}`);
});

test('replayFrames reconstitutes the stance calibration at any cursor — with NO new code', () => {
  const xs = [...Array(30).fill(0.10), ...Array(30).fill(0.55)];
  const { events, calibrationAt } = stanceFold(xs, { alpha: 0.05 });
  // The generic, layer-agnostic fold sees 'stance' like any other layer and carries
  // its band/step through `...e.frame`.
  const fold = replayFrames(events, 59);
  const f = fold.frames.get('stance');
  assert.ok(f, 'replayFrames must reconstitute the stance frame generically');
  assert.equal(f.band, calibrationAt(59).band, 'folded band matches the stance module');
  assert.equal(f.step, calibrationAt(59).step, 'folded step matches the stance module');
});

test('the folded strain IS the EWMA drift — strainDelta = (1−λ)(surprise − band)', () => {
  // replayFrames accumulates strain as a leaky sum of strainDelta; by construction that
  // equals the stance detector\'s own drift g, so the fold reconstitutes the detector.
  const xs = [...Array(20).fill(0.10), ...Array(10).fill(0.60)];
  const { events } = stanceFold(xs, { alpha: 0.05, minEpoch: 100 });   // minEpoch high → no REC, one epoch
  // Pick a cursor before any REC; the last EVA's `drift` must equal the folded strain.
  const at = 25;
  const fold = replayFrames(events, at);
  const evaAt = [...events].reverse().find((e) => e.op === 'EVA' && e.cursor === at);
  assert.ok(evaAt, 'an EVA at the cursor');
  const folded = fold.frames.get('stance').strain;
  assert.ok(Math.abs(folded - evaAt.drift) < 1e-2, `folded strain ${folded} ≈ drift ${evaAt.drift}`);
});

test('a converging stream recalibrates ever more rarely — the stance settles', () => {
  // A single early shift then stability: exactly one recalibration, then it holds.
  const xs = [...Array(15).fill(0.1), ...Array(45).fill(0.5)];
  const { events } = stanceFold(xs, { alpha: 0.05, warmup: 8, minEpoch: 8 });
  const r = recs(events);
  assert.ok(r.length >= 1 && r.length <= 3, `one settling, not thrash: got ${r.length}`);
});

test('an empty stream is honest — no events, no calibration', () => {
  const { events, calibrationAt } = stanceFold([], {});
  assert.equal(events.length, 0);
  assert.equal(calibrationAt(0), null);
});

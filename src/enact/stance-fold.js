// The stance layer as a fold — recalibration as a REC in the log (prototype, flagged).
//
// THE SEAT this dissolves. The enacted loop rides a scale — "what counts as normal
// surprise for this reading" (the confirm band, the per-line step). Today that scale
// is set two ways, both OUTSIDE the log: hand-set constants (the k·step family), or
// the causal `recalibrate()` window in loop.js that refits band/step every cursor from
// a rolling `seen[]`. The refit is the reading's stance adapting — but by a mechanism
// that sits outside the enacted record: it cannot be replayed by the fold, and it
// cannot itself be RECed. A derived threshold (even the signal-from-noise one measured
// in docs/born-frame-measurement.md) is the same seat with better arithmetic, as long
// as it is computed by something the log does not contain.
//
// THE MOVE. Make the calibration an ENACTED act. A `stance` frame stands on the
// reading's current sense of normal — its band and step. Each cursor is an EVA of the
// incoming surprise against that normal; the departures accumulate as strain. When the
// accumulated drift beats what the reading's own surprise throws up by chance, the
// stance frame can no longer hold its normal and RECs: it installs a NEW normal as a
// DEF. Recalibration is then a REC in the log — replayable by `replayFrames` (which is
// already layer-agnostic), and revisable by the same operator the loop uses on a claim.
// REC applied to REC.
//
// THE BREAK RULE is signal-from-noise, NOT the Born partition. Step 0
// (docs/born-frame-measurement.md) measured that `offMass > onMass` does not track a
// frame break; the stance layer as literally specified in the directive inherited that
// rule and would inherit its negative. So the stance breaks by the criterion that DID
// measure sound: the drift beats the noise line derived from the stream's own spread.
//
// THE FOLD FALLS OUT FOR FREE. `replayFrames` reconstitutes any layer's frame by
// spreading `...e.frame` and accumulating `strainDelta` under the frame's leak. So if
// the stance DEF carries { band, step } and each stance EVA carries
// `strainDelta = (1−λ)·(surprise − band)` with the stance frame's leak = λ, the folded
// strain IS the EWMA drift of surprise from the stance's normal — the detector's own
// state, reconstituted by the existing fold with no new replay code. That is the
// directive's claim made literal: "replayFrames reconstitutes the calibration at any
// cursor with no new code, because it folds any layer generically."

import { DEFAULT_STRAIN_LEAK } from '../core/enacted/index.js';

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const meanExcess = (xs, band) => {
  const ex = xs.map((x) => Math.max(0, x - band)).filter((e) => e > 0);
  return ex.length ? ex.reduce((a, b) => a + b, 0) / ex.length : 0;
};
const stdOf = (xs) => {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length;
  return Math.sqrt(v);
};
const round = (x) => Math.round(x * 1000) / 1000;

// The two-sided Gaussian critical value for a per-cursor false-alarm budget α — the
// ONE knob, the same hallucination budget deriveNull/boundedNull expose. The surprise
// stream is not Gaussian, so this is an approximation; what matters is that the break
// LINE is z·σ_drift — derived from the stream's OWN spread and the leak — not a bare
// constant. A caller wanting the exact null can Monte-Carlo σ_drift (the noise-k probe
// does); the analytic line keeps the module pure and deterministic for the fold.
const Z = Object.freeze({ 0.1: 1.645, 0.05: 1.96, 0.02: 2.326, 0.01: 2.576 });
const zFor = (alpha) => Z[alpha] ?? 1.96;

// The stance frame's terms — a human-readable calibration signature, so a DEF in the
// log SAYS what normal the reading committed to (and the thrash detector can see a
// stance oscillating between two normals, exactly as it does for any layer).
const signature = (band, step) => [`band≈${round(band)}`, `step≈${round(step)}`];

// Build the stance fold over a surprise series. Pure and deterministic. Returns the
// enacted events (DEF/EVA/REC for layer 'stance', in generation order) and a
// convenience `calibrationAt(cursor)`; the events also fold through the ordinary
// `replayFrames` with no new code (see header).
//
//   leak     the stance frame's memory (λ) — how far back a drift is felt.
//   alpha    the false-alarm budget for a recalibration (the one knob).
//   warmup   samples used to fit the first / each new normal.
//   minEpoch cursors a fresh stance normal holds before it can REC again (hysteresis,
//            the refractory the loop already runs — a just-recalibrated stance must not
//            immediately re-break on the residual that forced it).
export const stanceFold = (surprises, {
  leak = DEFAULT_STRAIN_LEAK, alpha = 0.05, warmup = 8, minEpoch = 8,
} = {}) => {
  const xs = (surprises || []).map((x) => (Number.isFinite(+x) ? +x : 0));
  const N = xs.length;
  const events = [];
  let seq = 0;
  const emit = (e) => { const s = Object.freeze({ ...e, register: 'enacted', reader: 'reading', seq: seq++ }); events.push(s); return s; };

  const globalStd = stdOf(xs) || 1e-9;   // fallback spread until an epoch has enough samples
  const driftScale = Math.sqrt((1 - leak) / (1 + leak));   // std(EWMA) = σ · this, for iid input

  if (!N) return { events, calibrationAt: () => null };

  // Fit a normal from a window: the band (median), the step (mean excess), and a
  // FROZEN noise scale σ0 (the window's spread, floored so a degenerate flat window
  // still admits signal). σ0 is fit at DEF time from PAST surprises and held for the
  // epoch, so the drift line is judged against the calm the stance committed to — a
  // later turbulent stretch does not inflate its own detection threshold.
  const SCALE_FLOOR = 1e-3;
  const fit = (window) => {
    const band = median(window);
    const step = meanExcess(window, band);
    const sigma0 = Math.max(stdOf(window), globalStd * 0.25, SCALE_FLOOR);
    return { band, step, sigma0, scale: Math.max(step, sigma0) };
  };
  let epochStart = 0;
  let cal = fit(xs.slice(0, Math.min(warmup, N)));
  const defFrame = (cursor, producedBy) => emit({
    op: 'DEF', layer: 'stance', cursor,
    frame: Object.freeze({ layer: 'stance', cursor, terms: signature(cal.band, cal.step), threshold: null, leak, band: round(cal.band), step: round(cal.step) }),
    producedBy,
  });
  defFrame(0, 'initial');

  let g = 0;                 // the leaky drift of surprise from the stance's normal (== folded strain)
  const sinceSet = [];       // EVA seqs since the frame was set (the forcing EVAs, §9)

  for (let c = 1; c < N; c++) {
    const s = xs[c];
    // SPIKE-ROBUST departure. A single line far from the normal is a SHOCK — the frame
    // layer's impulse, not a shift in the normal — so its pull on the stance is CLIPPED
    // to the accommodation scale. A sustained shift moves every line the same way and
    // accumulates; one hammer-blow contributes at most `scale` and then leaks away. This
    // is what separates "the reading was surprised once" from "the reading's sense of
    // normal has moved," and it is why the stance does not chase a single anomaly.
    const raw = s - cal.band;
    const departure = Math.max(-cal.scale, Math.min(cal.scale, raw));
    const strainDelta = round((1 - leak) * departure);
    g = round(leak * g + strainDelta);          // EWMA drift — identical to replayFrames' folded strain

    // The noise line: how far the clipped drift wanders by chance under the epoch's own
    // FROZEN spread. std(EWMA) = σ0 · driftScale for iid input; z·that is the (1−α) line.
    const line = round(zFor(alpha) * cal.sigma0 * driftScale);
    const verdict = Math.abs(g) > line ? 'strain' : 'confirm';

    const ev = emit({
      op: 'EVA', testLayer: 'stance', frameLayer: 'stance', frameCursor: epochStart,
      cross: false, cursor: c, particular: c,
      verdict, surprise: round(s), strainDelta, drift: g, line,
    });
    sinceSet.push(ev.seq);

    // REC when the drift beats the noise line AND the fresh normal has held its minimum
    // epoch (hysteresis). The stance's normal has shifted — recalibrate, in the log.
    if (c - epochStart >= minEpoch && line > 0 && Math.abs(g) > line) {
      const from = Object.freeze({ layer: 'stance', cursor: epochStart, terms: signature(cal.band, cal.step), band: round(cal.band), step: round(cal.step) });
      const recEv = emit({
        op: 'REC', target: 'stance', action: 'recalibrate', layer: 'stance', cursor: c,
        trigger: 'drift', alongAxis: [raw >= 0 ? 'turbulence' : 'calm'],
        from, drift: g, line, strainSum: g, forcedBy: sinceSet.slice(),
      });
      // Install the new normal from the recent window — which, because detection lags the
      // shift by the drift's build-up, is now mostly POST-shift data. The reading's
      // re-fit sense of normal, a DEF the fold can replay.
      cal = fit(xs.slice(Math.max(0, c - warmup + 1), c + 1));
      epochStart = c;
      g = 0;
      sinceSet.length = 0;
      defFrame(c, { rec: recEv.seq });
    }
  }

  // Fold the stance events to a cursor and read the live normal — a thin scan mirroring
  // replayFrames (which reconstitutes the SAME frame generically; see the tests).
  const calibrationAt = (cursor = Infinity) => {
    let cur = null;
    for (const e of events) {
      if (e.cursor > cursor) break;
      if (e.op === 'DEF') cur = { band: e.frame.band, step: e.frame.step, cursor: e.cursor, terms: e.frame.terms };
    }
    return cur;
  };

  return { events, calibrationAt };
};

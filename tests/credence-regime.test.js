import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCredenceBook, CLASS } from '../src/credence/index.js';
import { createPageHinkley } from '../src/credence/detect.js';

const lcg = (seed) => { let s = seed >>> 0; return () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; }; };

// ── The detector in isolation: a break fires, stationary noise does not ────────

test('Page-Hinkley fires on a sustained mean shift, fast', () => {
  const ph = createPageHinkley();
  let firedAt = -1;
  for (let i = 0; i < 40; i++) {
    const x = i < 20 ? 0.9 : 0.1;            // a clean flip at i = 20
    if (ph.observe(x) && firedAt < 0) firedAt = i;
  }
  assert.ok(firedAt >= 20 && firedAt <= 24, `fired at ${firedAt}, within a few steps of the break`);
});

test('Page-Hinkley does NOT fragment a stationary noisy stream', () => {
  // A bullshitter: erratic but with no real regime change. One regime, no breaks.
  const ph = createPageHinkley();
  const rng = lcg(11);
  let fires = 0;
  for (let i = 0; i < 200; i++) if (ph.observe(0.30 * rng())) fires++;
  assert.equal(fires, 0, 'stationary jitter never accumulates past the tolerance');
});

test('Page-Hinkley does NOT fragment a tight low-noise stream either', () => {
  const ph = createPageHinkley();
  const rng = lcg(7);
  let fires = 0;
  for (let i = 0; i < 200; i++) if (ph.observe(0.85 + 0.04 * (rng() - 0.5))) fires++;
  assert.equal(fires, 0, 'a steady source stays one regime');
});

// ── Conformance §3: regime change (end-to-end through the book) ────────────────

test('§3 a source that flips coherent → incoherent yields a dated break and two regimes', () => {
  const D = 25, LATENCY = 8;
  const book = createCredenceBook();
  const rng = lcg(9);
  for (let i = 0; i < D; i++)  book.observeCoherence('R', 'news', 0.88 + 0.05 * (rng() - 0.5));
  for (let i = 0; i < 25; i++) book.observeCoherence('R', 'news', 0.10 + 0.10 * rng());

  const cps = book.log.snapshot().filter(e => e.kind === 'changepoint');
  assert.equal(cps.length, 1, 'exactly one regime boundary was named');
  assert.ok(cps[0].cursor >= D && cps[0].cursor <= D + LATENCY,
    `break dated at ${cps[0].cursor}, within latency ${LATENCY} of D=${D}`);

  const before = book.at('R', 'news', { cursor: D - 1 });
  const after = book.at('R', 'news');
  assert.ok(before.M.mean > 0.55, `before the break the source is modelful (M=${before.M.mean.toFixed(2)})`);
  assert.ok(after.M.mean < 0.35, `after the break it is not (M=${after.M.mean.toFixed(2)})`);
  assert.notEqual(before.classification, after.classification, 'credence before D ≠ after D');
  assert.ok(after.prior_regime, 'the new regime remembers the one before the break');
  assert.equal(after.prior_regime.regime_end, cps[0].cursor, 'the prior regime ends at the break');
});

test('§3 the trajectory velocity reads the heading inside the current regime', () => {
  const book = createCredenceBook();
  // a degrading run: coherence sliding down within one regime (no break)
  for (let i = 0; i < 12; i++) book.observeCoherence('V', 'news', 0.85 - i * 0.005);
  const st = book.at('V', 'news');
  assert.ok(typeof st.velocity.dM === 'number', 'velocity dM is reported');
});

// ── Conformance §4: forgetting and reform ──────────────────────────────────────

test('§4 a long-reformed source recovers credence; the break between regimes is dated', () => {
  const book = createCredenceBook();
  const rng = lcg(2);
  // Regime 1: a bullshitter — low, dispersed coherence.
  for (let i = 0; i < 30; i++) book.observeCoherence('F', 'news', 0.28 * rng());
  const degraded = book.at('F', 'news');
  assert.ok(degraded.M.mean < 0.35, `degraded M=${degraded.M.mean.toFixed(2)}`);

  // Regime 2: reform — coherent, and corroborated by independent sources.
  for (let i = 0; i < 40; i++) book.observeCoherence('F', 'news', 0.86 + 0.05 * (rng() - 0.5));
  for (let i = 0; i < 30; i++) book.observeCorroboration('F', 'news', 0.82,
    { corroborators: [{ id: 'a' + i, w_indep: 1 }, { id: 'b' + i, w_indep: 1 }] });
  for (let i = 0; i < 12; i++) book.observeRevision('F', 'news', 0.5);

  const reformed = book.at('F', 'news');
  assert.ok(reformed.M.mean > 0.6, `reformed M=${reformed.M.mean.toFixed(2)} — recovered, not stuck at the average`);
  assert.ok(book.log.snapshot().some(e => e.kind === 'changepoint'), 'the reform is marked by a break');
  assert.ok(reformed.prior_regime, 'and the degraded regime is preserved as prior_regime');
});

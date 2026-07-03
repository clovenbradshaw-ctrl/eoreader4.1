import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestFrequencies } from '../src/organs/in/frequency.js';
import { ingestFrames } from '../src/organs/in/video.js';
import { detectMotion } from '../src/surfer/index.js';
import { discoverEquivalences as _de } from '../src/perceiver/index.js';
import { retrieveLexical } from '../src/retrieve/index.js';
const discoverEquivalences = (doc, opts = {}) => _de(doc, { retrieve: retrieveLexical, ...opts });
import { deriveNull, createNoiseFloor, extremeValueZ, MIN_SAMPLES } from '../src/core/index.js';

// The VOID boundary is DERIVED, not set. The engine estimates from its own
// non-cohering background the distribution of the largest structure chance
// produces, and fires SYN only when the proposal beats it. The only human number
// is alpha, the tolerated probability of mistaking noise for structure.
//
// Calibration is two-directional and it is the test (spec §6):
//   VOID direction — pure noise across density 2%..35%+ must VOID at EVERY density,
//                    including 35% where the longest snow chain is largest.
//   SYN  direction — real signal from clean down to faint must hold SYN, the flip
//                    landing at the chance edge and not one step early.
// The boundary is honest iff both hold.

const rng = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const ops = (doc) => { const c = { SYN: 0, NUL: 0, VOID: 0 };
  for (const e of doc.log.snapshot()) { if (e.kind === 'void') c.VOID++; else if (e.op === 'SYN') c.SYN++; else if (e.op === 'NUL') c.NUL++; } return c; };

const ALPHA = 0.01;   // fire SYN only when chance would produce this structure < 1% of the time

// ---- audio fixtures --------------------------------------------------------
const harmonic = () => ingestFrequencies({ name: 'r', notes: [{ hz: 220 }, { hz: 330 }, { hz: 440 }, { hz: 660 }] });
const inharm = (seed) => { const r = rng(seed); return Array.from({ length: 16 }, () => 1 + r() * 16); };
const noiseDoc = (seed) => ingestFrequencies({ name: 'n', notes: [{ hz: 220 }, { hz: 287 }, { hz: 413 }, { hz: 631 }], partialMultipliers: inharm(seed) });

// ---- video fixtures --------------------------------------------------------
const W = 34, H = 20, R = 3, FRAMES = 10;
const clip = (snow, seed, hasShape, move) => {
  const rand = rng(seed), clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const out = []; let cx = 5, cy = 10, vx = move ? 3 : 0, vy = 0;
  for (let t = 0; t < FRAMES; t++) {
    const f = Array.from({ length: H }, () => new Array(W).fill(0));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rand() < snow) f[y][x] = 1;
    if (hasShape) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= R * R) f[y][x] = 1;
    out.push(f);
    if (move && t === 4) { vx = 0; vy = 2; }
    cx = clamp(cx + vx, R, W - 1 - R); cy = clamp(cy + vy, R, H - 1 - R);
  }
  return out;
};
const noiseClip = (snow, seed) => clip(snow, seed, false, false);
const circleClip = (snow, seed) => clip(snow, seed, true, true);

// ============================================================================
// The estimator itself — the null is a readout, not a constant.
// ============================================================================

test('NULL · cold start abstains — no SYN before the void is measured', () => {
  // Below MIN_SAMPLES the noise floor cannot be known. Abstain (→ Infinity), never
  // assume structure. The old `minOverlap = 0` (merge readily) is the wrong cold start.
  assert.equal(deriveNull(Array(MIN_SAMPLES - 1).fill(1), { scale: 'linear' }), Infinity);
  const floor = createNoiseFloor({ scale: 'linear', grain: 0.1, alpha: ALPHA });
  assert.equal(floor.threshold(), Infinity, 'cold floor abstains');
  for (let i = 0; i < 30; i++) floor.observe(1 + (i % 5) * 0.1);
  assert.equal(floor.count, 30);
  assert.ok(Number.isFinite(floor.threshold()), 'a warmed floor reads a finite boundary');
});

test('NULL · extreme-value, not mean — the bar rises with N and with strictness', () => {
  // The thing that fools you is the MAX of many draws, so the z grows with the
  // competition size N; and a smaller alpha (less willing to be fooled) raises it too.
  assert.ok(extremeValueZ(100, ALPHA) > extremeValueZ(10, ALPHA), 'more candidates → higher bar');
  assert.ok(extremeValueZ(20, 0.001) > extremeValueZ(20, 0.05), 'stricter alpha → higher bar');
});

test('NULL · leave-one-out — a real outlier clears a null built from the bulk', () => {
  // A real shape must not have to outrank ITSELF: estimate its null from the
  // background that excludes it. A genuine outlier then clears a low bulk floor.
  const bulk = Array.from({ length: 30 }, (_, i) => 1 + (i % 5) * 0.1);   // a tight noise bulk ~1.0–1.4
  const thr = deriveNull([...bulk, 10], { scale: 'linear', grain: 0.1, leaveOut: 10 });
  assert.ok(thr < 5, `floor stays near the bulk (${thr.toFixed(2)}), not dragged toward the outlier`);
  assert.ok(10 > thr, 'the outlier clears its own leave-one-out null');
});

test('NULL · robust — a handful of real structures do not poison the floor', () => {
  // When several real shapes are present they are background to each other. The bulk
  // fit (gap-cut) keeps the floor where the noise is; a few outliers must not raise it.
  const bulk = Array.from({ length: 30 }, (_, i) => 1 + (i % 5) * 0.1);
  const clean = deriveNull(bulk, { scale: 'linear', grain: 0.1 });
  const contaminated = deriveNull([...bulk, 20, 25, 30], { scale: 'linear', grain: 0.1 });
  assert.ok(contaminated < clean * 1.5, `the bar barely moves (${clean.toFixed(2)} → ${contaminated.toFixed(2)})`);
});

test('NULL · alpha is the only knob — the boundary is a readout of it', () => {
  const bg = Array.from({ length: 40 }, (_, i) => 1 + (i % 7) * 0.2);
  const strict = deriveNull(bg, { scale: 'linear', grain: 0.1, alpha: 0.001 });
  const loose  = deriveNull(bg, { scale: 'linear', grain: 0.1, alpha: 0.05 });
  assert.ok(strict >= loose, 'a smaller hallucination budget raises the boundary the physics computes');
});

// ============================================================================
// VOID direction — no false structure, swept across density including 35%.
// ============================================================================

test('VOID · VIDEO pure noise fires VOID at EVERY density 2%..35% (the decisive sweep)', () => {
  for (const snow of [0.02, 0.05, 0.10, 0.20, 0.35]) {
    for (const seed of [1000, 1001, 1002, 1003, 1004, 1005]) {
      const doc = ingestFrames({ name: 'n', frames: noiseClip(snow, seed) });
      const res = detectMotion(doc, { alpha: ALPHA });
      assert.equal(res.voided, true, `noise at ${Math.round(snow * 100)}% (seed ${seed}) must VOID`);
    }
  }
});

test('VOID · the 35% snow chain sits AT its own null — longest-of-many, not a shape', () => {
  // The decisive case: a chain that is merely the longest of many chance chains is,
  // by construction, at the max of the background, so it does not clear and fires VOID.
  for (const seed of [1000, 1001, 1002, 1003, 1004, 1005]) {
    const doc = ingestFrames({ name: 'snow35', frames: noiseClip(0.35, seed) });
    const res = detectMotion(doc, { alpha: ALPHA });
    assert.equal(res.voided, true, `the longest 35% chain (seed ${seed}) is at chance, not above it`);
    const c = ops(doc);
    assert.ok(c.NUL >= 1 && c.VOID === 1, `held NUL + one VOID, got ${JSON.stringify(c)}`);
    assert.equal(doc.projectGraph().voids[0].node, 'shape');
  }
});

test('VOID · AUDIO inharmonic noise is NUL-held and VOID-asserted, zero merges', () => {
  for (const seed of [11, 12, 13, 14, 15, 16, 17, 18]) {
    const doc = noiseDoc(seed);
    const res = discoverEquivalences(doc, { alpha: ALPHA });
    assert.equal(res.voided, true, `inharmonic noise (seed ${seed}) must VOID`);
    assert.equal(res.pairs.length, 0, 'nothing clears the null');
    const c = ops(doc);
    assert.equal(c.SYN, 0);
    assert.equal(c.VOID, 1, 'absence asserted once');
    assert.equal(doc.projectGraph().voids[0].node, 'identity');
  }
});

// ============================================================================
// SYN direction — no false silence, swept from clean down to faint-but-real.
// ============================================================================

test('SYN · VIDEO a real circle holds SYN from clean down to faint (2%..20% static)', () => {
  // Low SNR is the snow density. SYN must hold while the shape is genuinely present;
  // VOID must not fire one step early. (Past ~25% percolation absorbs it — the honest
  // limit the abstention sweep already records — so the reliable band is swept here.)
  for (const snow of [0.02, 0.05, 0.10, 0.20]) {
    for (const seed of [7, 8, 9]) {
      const doc = ingestFrames({ name: 'c', frames: circleClip(snow, seed) });
      const res = detectMotion(doc, { alpha: ALPHA });
      assert.equal(res.voided, false, `the circle at ${Math.round(snow * 100)}% (seed ${seed}) must hold SYN`);
      assert.ok(res.shape, 'a shape is read');
      assert.equal(doc.projectGraph().voids.length, 0, 'no absence asserted on a real shape');
    }
  }
});

test('SYN · AUDIO the harmonic octave clears the derived null; the inharmonic does not', () => {
  // The two-directional flip in one modality — reproducing the inharmonic control as
  // a special case of the boundary: the harmonic octave is structure, noise is not.
  const real = harmonic();
  const res = discoverEquivalences(real, { alpha: ALPHA });
  assert.equal(res.voided, false, 'the octave is real structure');
  assert.ok(res.pairs.length > 0, 'the octave clears the null and merges (SYN)');
  assert.equal(real.projectGraph().voids.length, 0);

  const noise = noiseDoc(11);
  assert.equal(discoverEquivalences(noise, { alpha: ALPHA }).voided, true, 'inharmonic noise does not');
});

// ============================================================================
// The flip lands at the chance edge — structure vs none at the SAME density.
// ============================================================================

test('FLIP · at one density, a shape fires SYN where pure noise fires VOID', () => {
  for (const seed of [7, 8, 9]) {
    const noise  = detectMotion(ingestFrames({ name: 'n', frames: noiseClip(0.10, seed) }),  { alpha: ALPHA });
    const circle = detectMotion(ingestFrames({ name: 'c', frames: circleClip(0.10, seed) }), { alpha: ALPHA });
    assert.equal(noise.voided, true,  `noise at 10% (seed ${seed}) → VOID`);
    assert.equal(circle.voided, false, `a circle at 10% (seed ${seed}) → SYN`);
  }
});

// ============================================================================
// Projection-inert — SYN does the same thing; only WHEN it fires is derived.
// ============================================================================

test('INERT · on real signal the derived null reproduces the prior reading', () => {
  // Where SYN fired before it fires again: the octaves collapse, no void is exposed.
  const doc = harmonic();
  assert.equal(doc.projectGraph().entities.size, 4);
  discoverEquivalences(doc, { alpha: ALPHA });
  assert.equal(doc.projectGraph().entities.size, 2, 'the two octave pairs collapse, as before');
  assert.equal(doc.projectGraph().voids.length, 0);
});

test('INERT · the default stays pure-rank recovery — no alpha, no derived null', () => {
  // Backwards compatible: with neither alpha nor minOverlap the boundary is 0, the
  // recovery rule. The derived null engages only when you state your alpha.
  const fourOctaves = ingestFrequencies({ name: 'A', notes: [
    { hz: 110 }, { hz: 220 }, { hz: 440 }, { hz: 880 }, { hz: 330 }, { hz: 275 }, { hz: 311.13 }] });
  const { classes } = discoverEquivalences(fourOctaves);   // no alpha → pure rank
  const octaveClass = classes.find(c => c.length > 1).map(i => fourOctaves.noteHz[i]).sort((a, b) => a - b);
  assert.deepEqual(octaveClass, [110, 220, 440, 880], 'recovery merges the octaves with no null');
});

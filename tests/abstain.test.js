import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestFrames } from '../src/organs/in/video.js';
import { ingestFrequencies } from '../src/organs/in/frequency.js';
import { coherentFigures } from '../src/surfer/index.js';
import { discoverEquivalences as _de } from '../src/perceiver/index.js';
const discoverEquivalences = (doc, opts = {}) => _de(doc, { retrieve: retrieveLexical, ...opts });
import { retrieveLexical } from '../src/retrieve/index.js';

// Abstention: given only noise, the engine must report nothing. Recovery and
// dissociation are not enough — a detector can ace the noise sweep and still
// hallucinate. These pin both halves: the refusal works WITH a null, and the
// pure-rank rule that gave clean recovery cannot abstain WITHOUT one.

const rng = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const max = (xs) => xs.reduce((a, b) => Math.max(a, b), -Infinity);

// ---- video ----------------------------------------------------------------
const W = 34, H = 20, R = 3, FRAMES = 10;
const frame = (rand, snow, center) => {
  const f = Array.from({ length: H }, () => new Array(W).fill(0));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rand() < snow) f[y][x] = 1;
  if (center) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if ((x - center[0]) ** 2 + (y - center[1]) ** 2 <= R * R) f[y][x] = 1;
  return f;
};
const noiseClip = (snow, seed) => { const rand = rng(seed); return Array.from({ length: FRAMES }, () => frame(rand, snow, null)); };
const circleClip = (snow, seed) => {
  const rand = rng(seed), clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const out = []; let cx = 5, cy = 10, vx = 3, vy = 0;
  for (let t = 0; t < FRAMES; t++) { out.push(frame(rand, snow, [cx, cy])); if (t === 4) { vx = 0; vy = 2; } cx = clamp(cx + vx, R, W - 1 - R); cy = clamp(cy + vy, R, H - 1 - R); }
  return out;
};
const bestExtent = (frames) => coherentFigures(ingestFrames({ name: 'c', frames }))[0].meanSize;

test('VIDEO · at low static, pure noise stays grain-sized; the circle towers over it', () => {
  const nullMax = max(Array.from({ length: 20 }, (_, i) => bestExtent(noiseClip(0.05, 1000 + i))));
  const circle = bestExtent(circleClip(0.05, 7));
  assert.ok(nullMax < 6, `noise-only best extent should be grain-sized, got ${nullMax}`);
  assert.ok(circle > 5 * nullMax, `circle (${circle}) should tower over the noise null (${nullMax})`);
});

test('VIDEO · detection power collapses as static percolates (honest limit)', () => {
  const margin = (snow) => {
    const nullMax = max(Array.from({ length: 20 }, (_, i) => bestExtent(noiseClip(snow, 3000 + i))));
    return bestExtent(circleClip(snow, 7)) / nullMax;
  };
  assert.ok(margin(0.05) > 5, 'clean separation at low static');
  assert.ok(margin(0.35) < 3, 'percolation absorbs the circle — margin collapses, as predicted');
});

// ---- audio ----------------------------------------------------------------
const realFresh = () => ingestFrequencies({ name: 'r', notes: [{ hz: 220 }, { hz: 330 }, { hz: 440 }, { hz: 660 }] });
const inharm = (seed) => { const r = rng(seed); return Array.from({ length: 16 }, () => 1 + r() * 16); };
const noiseFresh = (seed) => ingestFrequencies({ name: 'n', notes: [{ hz: 220 }, { hz: 287 }, { hz: 413 }, { hz: 631 }], partialMultipliers: inharm(seed) });
const mergedCount = (doc, gate) => doc.noteHz.length - discoverEquivalences(doc, { minOverlap: gate }).classes.length;
const maxOverlap = (doc) => max(doc.noteHz.map((_, i) => max(retrieveLexical(doc, doc.spectrumQuery(i), 9).filter(r => r.idx !== i).map(r => r.score).concat(0))));

test('AUDIO · pure-rank merge HALLUCINATES equivalences in noise', () => {
  const spurious = Array.from({ length: 20 }, (_, i) => mergedCount(noiseFresh(2000 + i), 0)).reduce((s, m) => s + m, 0);
  assert.ok(spurious > 0, 'threshold-free mutual-nearest cannot abstain — it merges the argmax');
});

test('AUDIO · null-gated merge ABSTAINS on noise yet DETECTS the real octave', () => {
  const gate = max(Array.from({ length: 20 }, (_, i) => maxOverlap(noiseFresh(2000 + i))));
  const noiseMerges = Array.from({ length: 20 }, (_, i) => mergedCount(noiseFresh(2000 + i), gate)).reduce((s, m) => s + m, 0);
  assert.equal(noiseMerges, 0, 'gated by the noise null, no spurious merge survives');
  assert.ok(mergedCount(realFresh(), gate) > 0, 'the real octave (overlap 0.5) still clears the null');
});

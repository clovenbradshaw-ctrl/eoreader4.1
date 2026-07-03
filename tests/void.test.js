import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestFrequencies } from '../src/organs/in/frequency.js';
import { ingestFrames } from '../src/organs/in/video.js';
import { detectMotion, coherentFigures } from '../src/surfer/index.js';
import { discoverEquivalences as _de } from '../src/perceiver/index.js';
const discoverEquivalences = (doc, opts = {}) => _de(doc, { retrieve: retrieveLexical, ...opts });
import { retrieveLexical } from '../src/retrieve/index.js';

// The refusal must be RECORDED, not a silent non-output: a proposed-but-rejected
// structure is a NUL (held), and an empty reading is a VOID (a DEF to VOID the
// projection exposes on `voids`). These pin that NUL/VOID fire on noise and not
// on signal, in both modalities.

const rng = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const max = (xs) => xs.reduce((a, b) => Math.max(a, b), -Infinity);
const ops = (doc) => { const c = { SYN: 0, NUL: 0, VOID: 0 };
  for (const e of doc.log.snapshot()) { if (e.kind === 'void') c.VOID++; else if (e.op === 'SYN') c.SYN++; else if (e.op === 'NUL') c.NUL++; } return c; };

// ---- audio ----------------------------------------------------------------
const inharm = (seed) => { const r = rng(seed); return Array.from({ length: 16 }, () => 1 + r() * 16); };
const noiseDoc = (seed) => ingestFrequencies({ name: 'n', notes: [{ hz: 220 }, { hz: 287 }, { hz: 413 }, { hz: 631 }], partialMultipliers: inharm(seed) });
const maxOverlap = (doc) => max(doc.noteHz.map((_, i) => max(retrieveLexical(doc, doc.spectrumQuery(i), 9).filter(r => r.idx !== i).map(r => r.score).concat(0))));
const gate = () => max([12, 13, 14, 15, 16, 17].map(s => maxOverlap(noiseDoc(s))));

test('AUDIO · real signal SYN-merges and asserts no VOID', () => {
  const doc = ingestFrequencies({ name: 'r', notes: [{ hz: 220 }, { hz: 330 }, { hz: 440 }, { hz: 660 }] });
  const res = discoverEquivalences(doc, { minOverlap: gate() });
  assert.equal(res.voided, false);
  const c = ops(doc);
  assert.ok(c.SYN > 0, 'the octave merges');
  assert.equal(c.VOID, 0, 'a real equivalence asserts no absence');
  assert.equal(doc.projectGraph().voids.length, 0);
});

test('AUDIO · noise is NUL-held and VOID-asserted, with zero merges', () => {
  const doc = noiseDoc(11);
  const res = discoverEquivalences(doc, { minOverlap: gate() });
  assert.equal(res.voided, true);
  const c = ops(doc);
  assert.equal(c.SYN, 0, 'nothing clears the null');
  assert.ok(c.NUL > 0, 'the proposed pairs are held, not merged');
  assert.equal(c.VOID, 1, 'the absence is asserted once');
  assert.equal(doc.projectGraph().voids[0].node, 'identity');
});

// ---- video ----------------------------------------------------------------
const W = 34, H = 20, R = 3, FRAMES = 10;
const frame = (rand, snow, center) => { const f = Array.from({ length: H }, () => new Array(W).fill(0));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rand() < snow) f[y][x] = 1;
  if (center) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - center[0]) ** 2 + (y - center[1]) ** 2 <= R * R) f[y][x] = 1;
  return f; };
const noiseClip = (seed) => { const rand = rng(seed); return Array.from({ length: FRAMES }, () => frame(rand, 0.05, null)); };
const circleClip = (seed) => { const rand = rng(seed), clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const out = []; let cx = 5, cy = 10, vx = 3, vy = 0;
  for (let t = 0; t < FRAMES; t++) { out.push(frame(rand, 0.05, [cx, cy])); if (t === 4) { vx = 0; vy = 2; } cx = clamp(cx + vx, R, W - 1 - R); cy = clamp(cy + vy, R, H - 1 - R); } return out; };
const nullExtent = () => max(Array.from({ length: 20 }, (_, i) => coherentFigures(ingestFrames({ name: 'n', frames: noiseClip(1000 + i) }))[0].meanSize));

test('VIDEO · a real circle is read as a shape, no VOID', () => {
  const doc = ingestFrames({ name: 'c', frames: circleClip(7) });
  const res = detectMotion(doc, { nullExtent: nullExtent() });
  assert.equal(res.voided, false);
  assert.ok(res.shape.peak.surprise > 2);
  assert.equal(doc.projectGraph().voids.length, 0);
});

test('VIDEO · pure static is NUL-held and VOID-asserted empty', () => {
  const doc = ingestFrames({ name: 's', frames: noiseClip(1005) }); // seed in the calibration set → top ≤ null
  const res = detectMotion(doc, { nullExtent: nullExtent() });
  assert.equal(res.voided, true);
  const c = ops(doc);
  assert.ok(c.NUL >= 1 && c.VOID === 1, `expected a held NUL and one VOID, got ${JSON.stringify(c)}`);
  assert.equal(doc.projectGraph().voids[0].node, 'shape');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestFrames } from '../src/organs/in/video.js';
import { helixPredict, helixGenerate } from '../src/surfer/index.js';
import { deriveNull } from '../src/core/index.js';

// Video as the helix predictor's home: a moving object IS a constant MOVE against a
// shifting frame. deriveNull does per-frame signal/noise, persistence does cross-frame,
// and the same predictor that handled the melody extrapolates the trajectory.

const W = 28, H = 12, T = 14, R = 2;
const blank = () => Array.from({ length: H }, () => Array.from({ length: W }, () => 0));
const drawDisk = (f, cx, cy) => { for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { if (dx * dx + dy * dy > R * R) continue; const x = cx + dx, y = cy + dy; if (x >= 0 && x < W && y >= 0 && y < H) f[y][x] = 1; } };

// a clean clip (no snow) → exact trajectory, so the prediction claims are deterministic
const clean = [];
for (let t = 0; t < T; t++) { const f = blank(); drawDisk(f, 4 + t, 6); clean.push(f); }

test('persistence recovers the moving disk as one full-length track', () => {
  const doc = ingestFrames({ name: 'clean', frames: clean });
  const longest = [...doc.tracks].sort((a, b) => b.points.length - a.points.length)[0];
  assert.equal(longest.points.length, T, 'the disk persists every frame');
  const xs = longest.points.map(p => Math.round(p.x));
  assert.deepEqual(xs, Array.from({ length: T }, (_, i) => 4 + i), 'trajectory is the constant +1 drift');
});

test('the helix predictor: the MOVE rung carries the trajectory, not the absolute rung', () => {
  const doc = ingestFrames({ name: 'clean', frames: clean });
  const xs = [...doc.tracks].sort((a, b) => b.points.length - a.points.length)[0].points.map(p => Math.round(p.x));
  const r = helixPredict(xs, { order: 2 });
  assert.ok(r.summary.meanMoveBits < r.summary.meanExistenceBits,
    `move rung calmer than absolute (${r.summary.meanMoveBits} < ${r.summary.meanExistenceBits})`);
});

test('self-generation extrapolates the next frames along the trajectory', () => {
  const doc = ingestFrames({ name: 'clean', frames: clean });
  const xs = [...doc.tracks].sort((a, b) => b.points.length - a.points.length)[0].points.map(p => Math.round(p.x));
  const gx = helixGenerate(xs, { order: 2, n: 3, rung: 'structure' }).slice(1);
  assert.equal(gx.length, 3, 'three frames generated');
  assert.deepEqual(gx, [xs.at(-1) + 1, xs.at(-1) + 2, xs.at(-1) + 3], 'the disk continues its constant move');
});

test('signal from noise: the disk blob beats the void boundary the snow throws up', () => {
  // one frame: the disk plus deterministic snow
  let s = 7;
  const rnd = () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const f = blank();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rnd() < 0.06) f[y][x] = 1;
  drawDisk(f, 14, 6);
  const doc = ingestFrames({ name: 'snowy', frames: [f] });
  const sizes = doc.blobsByFrame[0].map(b => b.size).sort((a, b) => b - a);
  const nul = deriveNull(sizes.slice(1), { scale: 'log', alpha: 0.05, grain: 1 });
  assert.ok(Number.isFinite(nul), 'a void boundary is measurable from the snow bulk');
  assert.ok(sizes[0] > nul, `the disk (${sizes[0]}) beats the snow null (${nul.toFixed(2)})`);
});

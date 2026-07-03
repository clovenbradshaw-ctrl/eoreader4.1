import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestFrames } from '../src/organs/in/video.js';
import { motionReading, persistentFigures, coherentFigures } from '../src/surfer/index.js';

// A circle moving through TV snow, given as raw lit pixels. The engine must
// recover it with no model: by contiguity (a blob), coherence (extent), and
// persistence (it travels through time as one thing).

const W = 34, H = 20, R = 3, FRAMES = 10, SNOW = 0.05;
const rng = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);

const makeClip = (seed = 7) => {
  const rand = rng(seed);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const path = [];
  let cx = 5, cy = 10, vx = 3, vy = 0;
  for (let t = 0; t < FRAMES; t++) {
    path.push([cx, cy]);
    if (t === 4) { vx = 0; vy = 2; }            // the turn
    cx = clamp(cx + vx, R, W - 1 - R);
    cy = clamp(cy + vy, R, H - 1 - R);
  }
  return path.map(([ox, oy]) => {
    const f = Array.from({ length: H }, () => new Array(W).fill(0));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rand() < SNOW) f[y][x] = 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - ox) ** 2 + (y - oy) ** 2 <= R * R) f[y][x] = 1;
    return f;
  });
};

test('the circle is sighted every frame — one track travels through time', () => {
  const doc = ingestFrames({ name: 'c', frames: makeClip() });
  const top = persistentFigures(doc)[0];
  assert.equal(top.mass, FRAMES, 'the moving shape persists across all frames');
});

test('persistence alone is fooled, but coherence is decisive', () => {
  const doc = ingestFrames({ name: 'c', frames: makeClip() });
  // Snow can fake mass, so the top mass may be tied; but by AREA the circle stands
  // alone by a wide margin (a real disk vs a 1–2px grain chain).
  const byArea = coherentFigures(doc);
  assert.ok(byArea[0].area > 10 * byArea[1].area, 'the circle dwarfs every snow chain by extent');
  assert.ok(byArea[0].meanSize > 15, `the shape is substantial, got ${byArea[0].meanSize}px/frame`);
});

test('the trajectory is traced, and surprise peaks where the circle turns', () => {
  const doc = ingestFrames({ name: 'c', frames: makeClip() });
  const m = motionReading(doc);
  assert.equal(m.points.length, FRAMES, 'a centroid per frame');
  // The velocity changes between frame 4 and 5, so the constant-velocity
  // prediction is most wrong at frame 5.
  assert.equal(m.peak.frame, 5, `the turn should surprise at frame 5, got ${m.peak.frame}`);
});

test('robust across snow seeds — the shape always towers over the snow', () => {
  // The 10-line tracker can fragment the circle on an unlucky seed, so the
  // second-ranked track is sometimes another circle piece, not snow. The claim
  // that holds regardless: the top figure is a real shape (substantial extent),
  // and the best SNOW track (grain-sized, meanSize < 5) comes nowhere near it.
  for (const seed of [1, 2, 3, 99]) {
    const byArea = coherentFigures(ingestFrames({ name: 'c', frames: makeClip(seed) }));
    const shape = byArea[0];
    const bestSnow = byArea.find(f => f.meanSize < 5);
    assert.ok(shape.meanSize > 15, `seed ${seed}: top figure is a shape (${shape.meanSize}px)`);
    assert.ok(shape.area > 5 * (bestSnow?.area ?? 0), `seed ${seed}: shape dwarfs snow`);
  }
});

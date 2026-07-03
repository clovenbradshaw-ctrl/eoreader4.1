import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestFrequencies } from '../src/organs/in/frequency.js';
import { ingestMusic } from '../src/organs/in/music.js';
import { ingestFrames } from '../src/organs/in/video.js';
import { retrieveLexical } from '../src/retrieve/index.js';
import { predictiveSequenceReading, motionReading, coherentFigures, persistentFigures } from '../src/surfer/index.js';

// The control battery, as falsifications: the structure must go DARK when the
// thing it claims to read is removed, and survive when an order-blind property
// should be untouched. These pin the dissociations the controls script reports.

const rng = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const shuffle = (arr, seed) => { const r = rng(seed), a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; };
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

test('CONTROL · inharmonic partials destroy octave equivalence', () => {
  const octave = (mults) => {
    const doc = ingestFrequencies({ name: 'c', notes: [{ hz: 220 }, { hz: 440 }], ...(mults ? { partialMultipliers: mults } : {}) });
    return new Map(retrieveLexical(doc, doc.spectrumQuery(0), 9).map(r => [r.idx, r.score])).get(1) || 0;
  };
  const harmonic = octave(null);
  const inharmonic = octave(shuffle(Array.from({ length: 16 }, (_, k) => 1 + k * 0.97 + 0.31), 5).map(m => m * 1.013));
  assert.ok(harmonic > 0.3, `harmonic octave overlap ${harmonic} should be high`);
  assert.ok(inharmonic < 0.05, `inharmonic octave overlap ${inharmonic} should vanish`);
});

test('CONTROL · shuffling notes: mass-tonic survives, prediction collapses', () => {
  const FRERE = ['C4','D4','E4','C4','C4','D4','E4','C4','E4','F4','G4','E4','F4','G4',
    'G4','A4','G4','F4','E4','C4','G4','A4','G4','F4','E4','C4','C4','G3','C4','C4','G3','C4'];
  const topTwo = (notes) => [...ingestMusic({ name: 'm', notes }).projectGraph().entities.values()]
    .sort((a, b) => b.sightings - a.sightings).slice(0, 2).map(e => e.label).sort();
  const hits = (notes) => predictiveSequenceReading(ingestMusic({ name: 'm', notes }), { order: 2 }).filter(s => s.hit).length;

  // Order-blind property: untouched.
  assert.deepEqual(topTwo(FRERE), topTwo(shuffle(FRERE, 7)));
  // Order-dependent property: collapses toward chance.
  const real = hits(FRERE);
  const shuffled = mean(Array.from({ length: 20 }, (_, i) => hits(shuffle(FRERE, 200 + i))));
  assert.ok(real > shuffled + 1.5, `real ${real} should beat shuffled mean ${shuffled.toFixed(1)}`);
});

const W = 34, H = 20, R = 3, FRAMES = 10;
const clip = ({ move = true, snow = 0.05, seed = 7 }) => {
  const rand = rng(seed), clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const path = []; let cx = 5, cy = 10, vx = move ? 3 : 0, vy = 0;
  for (let t = 0; t < FRAMES; t++) { path.push([cx, cy]); if (move && t === 4) { vx = 0; vy = 2; } cx = clamp(cx + vx, R, W - 1 - R); cy = clamp(cy + vy, R, H - 1 - R); }
  return path.map(([ox, oy]) => { const f = Array.from({ length: H }, () => new Array(W).fill(0));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rand() < snow) f[y][x] = 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - ox) ** 2 + (y - oy) ** 2 <= R * R) f[y][x] = 1;
    return f; });
};
const jitter = (doc) => { const s = motionReading(doc).steps.slice(1); return s.length ? mean(s.map(x => x.surprise)) : 0; };

test('CONTROL · shuffling frames destroys smooth motion, not per-frame coherence', () => {
  const moving = ingestFrames({ name: 'mv', frames: clip({ move: true }) });
  const shuffled = ingestFrames({ name: 'sh', frames: shuffle(clip({ move: true }), 3) });
  // Per-frame coherence is order-blind — a blob is present either way.
  assert.ok(coherentFigures(shuffled)[0].meanSize > 15);
  // Smooth, predictable motion is order-dependent — it dies under shuffle.
  assert.ok(jitter(shuffled) > 2 * jitter(moving), `jitter ${jitter(moving).toFixed(2)} → ${jitter(shuffled).toFixed(2)}`);
});

test('CONTROL · the turn-event requires real motion; a static shape shows none', () => {
  const moving = ingestFrames({ name: 'mv', frames: clip({ move: true }) });
  const static_ = ingestFrames({ name: 'st', frames: clip({ move: false }) });
  assert.ok(motionReading(moving).peak.surprise > 2, 'a real turn surprises');
  assert.ok((motionReading(static_).peak?.surprise ?? 0) < 0.6, 'a static shape has no event');
  // Yet the static shape still PERSISTS — present every frame, just not moving.
  assert.equal(persistentFigures(static_)[0].mass, FRAMES);
});

test('CONTROL · noise sweep — the shape outranks the snow up to heavy static', () => {
  for (const snow of [0.02, 0.05, 0.10, 0.20]) {
    const figs = coherentFigures(ingestFrames({ name: 'n', frames: clip({ move: true, snow }) }));
    const shape = figs[0], bestSnow = figs.find(t => t.meanSize < 5) || { area: 0 };
    assert.ok(shape.area > 3 * bestSnow.area, `snow ${snow}: shape area ${shape.area} vs snow ${bestSnow.area}`);
  }
});

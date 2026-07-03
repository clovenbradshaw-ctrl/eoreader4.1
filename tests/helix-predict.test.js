import { test } from 'node:test';
import assert from 'node:assert/strict';

import { helixPredict, helixGenerate } from '../src/surfer/index.js';

// The helix-aware predictor: predict the move against the frame, and let a stale basis
// be a REC, not endless surprise. The decisive case is a MODULATION — the same motif
// transposed — which the Existence rung reads as novelty forever and the Structure rung
// sails through, so the difference between them diagnoses a reframe.

const motif = (root) => [root, root + 4, root + 7, root + 4];   // an arpeggio shape
const modulating = [].concat(...Array(4).fill(motif(60)), ...Array(4).fill(motif(67))); // C…→G…
const seam = motif(60).length * 4;
const stationary = [].concat(...Array(8).fill(motif(60)));      // never leaves C

test('a modulation fires a REC and re-grounds; the move rung carries through it', () => {
  const r = helixPredict(modulating, { order: 2, window: 3, alpha: 0.05 });
  assert.deepEqual(r.rungs, ['existence', 'structure'], 'a numeric signal exposes the move rung');
  assert.ok(r.recs.length >= 1, 'the key change is detected as a reframe');
  const rec = r.recs[0];
  assert.equal(rec.cell, 'REC_Composing_Paradigm');
  assert.equal(rec.reground, true);
  assert.ok(rec.surpriseDelta > 0, 'the REC carries the basis-defeat margin');
  assert.ok(rec.at >= seam, 'the REC fires at/after the seam (hysteresis: sustained, not a spike)');
  // the mis-framed signature: post-seam the move rung beats the absolute rung
  const post = r.steps.filter(s => s.at >= seam);
  const mE = post.reduce((a, s) => a + s.existenceBits, 0) / post.length;
  const mM = post.reduce((a, s) => a + s.moveBits, 0) / post.length;
  assert.ok(mM < mE, `the move rung is calmer than the absolute rung after the reframe (${mM.toFixed(2)} < ${mE.toFixed(2)})`);
  assert.ok(post.some(s => s.carrying === 'structure'), 'the structure rung carries through the reframe');
});

test('a stationary signal fires no REC — there is no frame to relocate', () => {
  const r = helixPredict(stationary, { order: 2, window: 3, alpha: 0.05 });
  assert.equal(r.recs.length, 0, 'no reframe, no REC');
  assert.equal(r.summary.recCount, 0);
});

test('a non-numeric stream degrades to the Existence rung alone, never crashes', () => {
  const seq = ['a', 'b', 'a', 'b', 'c', 'a', 'b', 'a'];
  const r = helixPredict(seq, { order: 2 });
  assert.deepEqual(r.rungs, ['existence'], 'no cheap move without numbers');
  assert.ok(r.steps.length > 0 && r.steps.every(s => s.moveBits === null));
  assert.equal(r.recs.length, 0, 'a reframe needs the move rung to confirm; without it, no relocation');
});

test('helixGenerate rides the move rung and re-grounds into an untrained register', () => {
  const g = helixGenerate(modulating, { order: 2, n: 12, seed: 7, rung: 'structure' });
  assert.equal(g.length, 13, 'start + n drawn');
  assert.ok(g.every(x => typeof x === 'number'), 'generates a real note stream');
  // re-ground onto a pitch the training never started a motif on
  const g2 = helixGenerate(modulating, { order: 2, n: 8, seed: 7, rung: 'structure', start: 74 });
  assert.equal(g2[0], 74, 'generation begins at the re-grounded root');
  assert.ok(g2.length === 9);
});

test('the helix climbs: a constant-acceleration signal is stationary at rung 2, which carries', () => {
  // position quadratic, velocity linear, acceleration constant
  const pos = []; let x = 0, v = 0;
  for (let t = 0; t < 20; t++) { pos.push(x); v += 1; x += v; }
  const r = helixPredict(pos, { order: 2, maxRung: 2 });
  assert.deepEqual(r.rungs, ['existence', 'structure', 'acceleration']);
  const [e, s, a] = r.summary.rungBits;
  assert.ok(a < s && a < e, `the acceleration rung is the calmest (${a} < ${s}, ${e})`);
  assert.ok(a < 0.5, 'a constant 2nd difference is ~0 bits — perfectly predictable');
  assert.ok(r.steps.filter(st => st.carrying === 'acceleration').length > r.steps.length / 2,
    'the acceleration rung carries most steps');
});

test('helixGenerate from the acceleration rung extrapolates a parabola (constant 2nd difference)', () => {
  const pos = []; let x = 0, v = 0;
  for (let t = 0; t < 20; t++) { pos.push(x); v += 1; x += v; }
  const g = helixGenerate(pos, { order: 2, n: 5, rung: 'acceleration' });
  const tail = g.slice(-6);
  const d1 = tail.slice(1).map((y, i) => y - tail[i]);          // velocities
  const d2 = d1.slice(1).map((y, i) => y - d1[i]);              // accelerations
  assert.ok(d2.every(a => Math.abs(a - d2[0]) < 1e-9), 'second differences are constant — a real parabola');
});

test('maxRung default is 1 — the deeper rungs do not appear unless asked (parity)', () => {
  const r = helixPredict([0, 2, 4, 6, 8, 10, 12], { order: 2 });
  assert.deepEqual(r.rungs, ['existence', 'structure'], 'default depth unchanged');
});

test('deterministic — same seq, same opts, same trace and same generation', () => {
  const a = helixPredict(modulating, { order: 2 });
  const b = helixPredict(modulating, { order: 2 });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.deepEqual(helixGenerate(modulating, { seed: 3 }), helixGenerate(modulating, { seed: 3 }));
});

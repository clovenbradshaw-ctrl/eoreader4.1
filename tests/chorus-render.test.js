// chorus-render — the weighted map, mechanical, no generation (docs/chorus.md,
// "The render"), the fold-voice as an addressed projection (docs/chorus.md, "The
// fold-voice"), and the level governor (docs/chorus.md, "Levels as rotated
// bases"). The lanes are never collapsed.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bornDistribution } from '../src/chorus/born.js';
import { foldVoice, cubeFolds } from '../src/chorus/fold.js';
import { recStrain, ascendWhile } from '../src/chorus/levels.js';
import { renderLane, recTransition, renderChorus, project, SILENCE_CELL } from '../src/chorus/render.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

// A cube reading with a leader, a genuine rival, silence, and a tail.
const reading = () => bornDistribution([
  { key: 'INS_Making_Entity', amp: Math.sqrt(0.45) },
  { key: 'CON_Binding_Link', amp: Math.sqrt(0.4) },     // rival at ~0.9 of the leader
  { key: 'DEF_Dissecting_Lens', amp: Math.sqrt(0.1) },
  { key: SILENCE_CELL, amp: Math.sqrt(0.05) },
]);

// ── the fold-voice ───────────────────────────────────────────────────────────

test('a fold-voice is addressed and recoverable, and carries no prose', () => {
  const f = foldVoice({ level: 2, face: 'cube', cell: 'CON_Binding_Link', amp: -0.3, weight: 0.4, spans: [7, 8] });
  assert.equal(f.address, 'L2/cube/CON_Binding_Link');
  assert.equal(f.amp, -0.3);
  assert.deepEqual([...f.provenance.spans], [7, 8]);
  assert.equal(f.kind, 'fold-voice');
  assert.ok(!('prose' in f) && !('sentence' in f));   // folds carry no prose
});

test('cubeFolds lifts a distribution into addressed folds in order', () => {
  const folds = cubeFolds(reading(), { level: 1 });
  assert.equal(folds[0].address, 'L1/cube/INS_Making_Entity');
  assert.equal(folds.length, 4);
});

// ── the lane ─────────────────────────────────────────────────────────────────

test('a lane voices the head, keeps the three face-marginals, and holds the rivals', () => {
  const lane = renderLane(reading(), { level: 0, coverage: 0.8 });
  assert.ok(lane.cube.voiced.length >= 2, 'ambiguous reading voices several');
  // the three readable projections are present and governed
  for (const face of ['act', 'site', 'stance']) assert.ok(lane.faces[face].voiced.length >= 1);
  // the rival is held as an EVA-site, side by side, unresolved
  assert.ok(lane.evaSites.length >= 1, 'a ~0.9 rival is held as an EVA-site');
  assert.deepEqual(lane.evaSites[0].hold, ['INS_Making_Entity', 'CON_Binding_Link']);
});

test('a sharp lane holds no EVA-site — no rival clears the floor', () => {
  const sharp = bornDistribution([
    { key: 'INS_Making_Entity', amp: 0.97 },
    { key: 'CON_Binding_Link', amp: 0.1 },
  ]);
  const lane = renderLane(sharp, { coverage: 0.8 });
  assert.equal(lane.evaSites.length, 0);
});

test('SYN-by-Ground is drawn as silence — a preserved absence kept as data', () => {
  const lane = renderLane(reading(), {});
  assert.equal(lane.silence.cell, SILENCE_CELL);
  assert.equal(lane.silence.preservedAbsence, true);
  assert.ok(lane.silence.weight >= 0);
});

// ── the level governor and the transitions ───────────────────────────────────

test('recStrain is 0 when a level leaves the distribution fixed, 1 when it moves all mass', () => {
  const a = bornDistribution([{ key: 'X', amp: 1 }]);
  const b = bornDistribution([{ key: 'Y', amp: 1 }]);
  close(recStrain(a, a), 0);
  close(recStrain(a, b), 1);
});

test('ascendWhile stops when a rotation tells us nothing new, and bounds the ascent', () => {
  const L0 = bornDistribution([{ key: 'X', amp: 1 }]);
  const L1 = bornDistribution([{ key: 'Y', amp: 1 }]);   // big strain from L0
  const L2 = bornDistribution([{ key: 'Y', amp: 1 }]);   // no strain from L1 → stop
  const r = ascendWhile([L0, L1, L2], { strainFloor: 0.05 });
  assert.equal(r.depth, 2, 'kept L0 and L1, stopped before L2');
  assert.ok(r.terminatedByStrain);
  assert.equal(r.sketch, true);
});

test('ascendWhile never ascends past maxLevels — the open risk is bounded', () => {
  const moving = Array.from({ length: 12 }, (_, i) => bornDistribution([{ key: 'k' + i, amp: 1 }]));
  const r = ascendWhile(moving, { strainFloor: 0.01, maxLevels: 4 });
  assert.ok(r.depth <= 4);
  assert.ok(r.hitMaxLevels);
});

test('a REC-transition shows the rotation: the strain and the movers', () => {
  const lo = bornDistribution([{ key: 'A', amp: 1 }]);
  const hi = bornDistribution([{ key: 'B', amp: 1 }]);
  const t = recTransition(lo, hi);
  assert.equal(t.kind, 'REC-transition');
  assert.ok(t.strain > 0);
  assert.ok(t.movers.some((m) => m.key === 'B' && m.delta > 0));
});

// ── the whole chorus never collapses ─────────────────────────────────────────

test('renderChorus lays one lane per level with the transitions between, uncollapsed', () => {
  const chorus = renderChorus([reading(), reading()], { coverage: 0.8 });
  assert.equal(chorus.lanes.length, 2);
  assert.equal(chorus.transitions.length, 1);
  assert.equal(chorus.collapsed, false);
});

test('a reader may project down to one lane or one face and lose nothing', () => {
  const chorus = renderChorus([reading()], {});
  const lane = project(chorus, { level: 0 });
  assert.equal(lane.level, 0);
  const face = project(chorus, { level: 0, face: 'act' });
  assert.equal(face.face, 'act');
  assert.ok(face.governed.voiced.length >= 1);
  // the folds are still there, addressed — the projection is lossless
  assert.ok(lane.folds.every((f) => typeof f.address === 'string'));
});

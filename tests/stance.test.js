import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildDensity, eigenLenses, vonNeumann, applyStance } from '../src/core/index.js';
import { updateStance, applyMeasuredStance, surfFold, centroidBasis } from '../src/surfer/index.js';
import { parseText } from '../src/perceiver/parse/index.js';

// Track F — the Stance face. applyStance is the four real-symmetric primitives (the
// nine moves on ρ); updateStance reads the move off the field and is the confabulation
// guard, quantified. Default surf is byte-identical — stance only rides under opts.stance.

const entropyOf = (rho) => vonNeumann(eigenLenses(rho).map(l => l.weight));
const topOf = (rho) => eigenLenses(rho, { k: 1 })[0]?.weight ?? 0;
const close = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ── applyStance: the four primitives sort into the three Modes ─────────────────
test('Making (Generate×Figure) adds a rank-1 spike — top eigenvalue up', () => {
  const { rho } = buildDensity([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);   // maximally mixed
  const moved = applyStance(rho, { family: 'Generate', grain: 'Figure', firmness: 1, lens: [1, 0, 0] });
  assert.ok(topOf(moved) > topOf(rho), 'a Making spikes one eigenvalue');
  assert.ok(entropyOf(moved) < entropyOf(rho), 'and lowers entropy (it commits a direction)');
});

test('Cultivating (Generate×Ground) raises the floor — entropy up, no direction', () => {
  const { rho } = buildDensity([[1, 0.1, 0], [0.2, 1, 0]]);          // somewhat concentrated
  const moved = applyStance(rho, { family: 'Generate', grain: 'Ground', firmness: 1 });
  assert.ok(entropyOf(moved) > entropyOf(rho), 'a Cultivating raises entropy (the reserve)');
});

test('Clearing (Differentiate×Ground) drops the floor — entropy down', () => {
  const { rho } = buildDensity([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);   // maximally mixed
  const moved = applyStance(rho, { family: 'Differentiate', grain: 'Ground', firmness: 1 });
  assert.ok(entropyOf(moved) <= entropyOf(rho) + 1e-9, 'a Clearing does not raise entropy');
});

test('Dissecting (Differentiate×Figure) is a projection — sharpens toward one lens', () => {
  const { rho } = buildDensity([[1, 0.3, 0], [0.2, 1, 0.1], [0, 0.4, 1]]);
  const moved = applyStance(rho, { family: 'Differentiate', grain: 'Figure', firmness: 1 });
  assert.ok(entropyOf(moved) < entropyOf(rho), 'a firm Dissecting collapses toward a lens');
});

test('Binding/Tracing (Relate) preserve the spectrum — rotation, mass conserved', () => {
  const { rho } = buildDensity([[1, 0.3, 0.1], [0.2, 1, 0], [0.1, 0.2, 1]]);
  const before = eigenLenses(rho).map(l => l.weight).sort((a, b) => a - b);
  const moved = applyStance(rho, { family: 'Relate', grain: 'Figure', firmness: 1, theta: 0.6 });
  const after = eigenLenses(moved).map(l => l.weight).sort((a, b) => a - b);
  for (let i = 0; i < before.length; i++) assert.ok(close(before[i], after[i], 1e-6), 'eigenvalues unchanged');
});

test('firmness is the strength of the map — a defeasible Making spikes less than a firm one', () => {
  const { rho } = buildDensity([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  const soft = applyStance(rho, { family: 'Generate', grain: 'Figure', firmness: 0.2, lens: [1, 0, 0] });
  const firm = applyStance(rho, { family: 'Generate', grain: 'Figure', firmness: 1, lens: [1, 0, 0] });
  assert.ok(topOf(firm) > topOf(soft), 'a firmer Making lifts the lens higher');
});

// ── updateStance: the field-read confabulation guard ───────────────────────────
test('a clean rank-1 lens past its spectral null → Making (commit), guard does not fire', () => {
  // ρ dominated by one direction → a real lens; a high peak bayes
  const acts = Array.from({ length: 8 }, () => [1, 0.05, 0, 0, 0, 0]);
  const { rho } = buildDensity(acts);
  const field = [{ idx: 0, bayes: 0.1 }, { idx: 1, bayes: 0.9 }, { idx: 2, bayes: 0.2 }];
  const s = updateStance(field, 1, rho, { alpha: 0.05 });
  assert.equal(s.stance, 'Making');
  assert.equal(s.grain, 'Figure');
  assert.equal(s.guard, false, 'a supported Making is not the guard firing');
  assert.equal(s.cell, 'REC_Making_Lens');
});

test('a flat field → Cultivating (reserve) — the confabulation guard fires', () => {
  // balanced ρ (no dominant lens) AND a peak no higher than the reach median
  const acts = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  const { rho } = buildDensity(acts);
  const field = [{ idx: 0, bayes: 0.5 }, { idx: 1, bayes: 0.5 }, { idx: 2, bayes: 0.5 }];
  const s = updateStance(field, 1, rho, { alpha: 0.05 });
  assert.equal(s.stance, 'Cultivating');
  assert.equal(s.grain, 'Ground');
  assert.equal(s.guard, true, 'a Ground commit on a flat field IS the guard: reserve, do not Make');
  assert.equal(s.cell, 'REC_Cultivating_Atmosphere');
});

test('a real surprise with no clean lens → Clearing (dephase) — guard fires', () => {
  const acts = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];   // balanced, no lens clears
  const { rho } = buildDensity(acts);
  const field = [{ idx: 0, bayes: 0.1 }, { idx: 1, bayes: 0.95 }, { idx: 2, bayes: 0.1 }];  // peak >> median
  const s = updateStance(field, 1, rho, { alpha: 0.05 });
  assert.equal(s.stance, 'Clearing');
  assert.equal(s.grain, 'Ground');
  assert.equal(s.guard, true);
  assert.equal(s.cell, 'DEF_Clearing_Atmosphere');
});

test('every measured stance routes through cellAt — the move lands on the Object diagonal', () => {
  const acts = Array.from({ length: 6 }, () => [1, 0.1, 0, 0]);
  const { rho } = buildDensity(acts);
  const s = updateStance([{ idx: 0, bayes: 0.9 }], 0, rho, { alpha: 0.05 });
  assert.ok(['REC_Making_Lens', 'REC_Cultivating_Atmosphere', 'DEF_Clearing_Atmosphere'].includes(s.cell));
  assert.equal(s.refused, undefined, 'a diagonal move is not refused');
});

test('applyMeasuredStance closes the loop — moves ρ and reports the entropy change', () => {
  const acts = Array.from({ length: 8 }, () => [1, 0.05, 0, 0]);
  const { rho } = buildDensity(acts);
  const s = updateStance([{ idx: 0, bayes: 0.9 }], 0, rho, { alpha: 0.05 });
  const applied = applyMeasuredStance(rho, s);
  assert.ok(applied && applied.rho, 'ρ was moved');
  assert.ok(typeof applied.entropyBefore === 'number' && typeof applied.entropyAfter === 'number');
});

// ── parity: stance is off unless opts.stance is set ────────────────────────────
test('surfFold carries a stance only under opts.stance; default is byte-identical', () => {
  const doc = parseText('Grete entered. Grete sat. Otto knocked. Otto left. Mara spoke.', { docId: 's' });
  const basis = centroidBasis({ vectors: { EVA_Binding_Lens: [1, 0], DEF_Dissecting_Lens: [0, 1] } });
  const acts = doc.sentences.map(() => [1, 0]);
  const bare = surfFold(doc, 1);
  const withActs = surfFold(doc, 1, { activations: acts });   // activations but no stance opt
  assert.equal(JSON.stringify(bare), JSON.stringify(withActs), 'no stance leaks onto the default');
  const stanced = surfFold(doc, 1, { activations: acts, prior: basis, stance: true });
  assert.ok(stanced.stance && typeof stanced.stance.stance === 'string', 'opts.stance adds the measured commit');
});

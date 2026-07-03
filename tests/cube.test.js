import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { OPERATORS, GRAINS } from '../src/core/operators.js';
import { eoAddressOfEvent } from '../src/core/address.js';
import {
  STANCES, TERRAINS, stanceOf, terrainOf, grainOfStance, grainOfTerrain, terrainInfo,
  cellOf, DIAGONAL_CELLS, coherence, isDiagonal,
  SIGNATURES, signatureOf,
  OPERATOR_ALIASES, aliasOperator, aliasCellKey,
} from '../src/core/cube.js';

// ── The two named faces ──────────────────────────────────────────────────────

test('the Resolution face has nine distinct stances; the Site face nine distinct terrains', () => {
  const stances  = Object.values(STANCES).flatMap(row => Object.values(row));
  const terrains = Object.values(TERRAINS).flatMap(row => Object.values(row));
  assert.equal(new Set(stances).size, 9);
  assert.equal(new Set(terrains).size, 9);
});

test('stance / terrain reverse lookups are inverse to the forward tables', () => {
  for (const [mode, row] of Object.entries(STANCES))
    for (const [grain, stance] of Object.entries(row)) {
      assert.equal(stanceOf(mode, grain), stance);
      assert.equal(grainOfStance(stance), grain);
    }
  for (const [domain, row] of Object.entries(TERRAINS))
    for (const [grain, terrain] of Object.entries(row)) {
      assert.equal(terrainOf(domain, grain), terrain);
      assert.equal(grainOfTerrain(terrain), grain);
    }
});

test('off-cube coordinates return null, never a guess', () => {
  assert.equal(stanceOf('Relate', 'Nope'), null);
  assert.equal(terrainOf('Nope', 'Ground'), null);
  assert.equal(cellOf('XXX', 'Ground'), null);
  assert.equal(cellOf('INS', 'Nope'), null);
});

test('terrainInfo names the (domain, grain) a terrain sits at — the diagonal guard reads it', () => {
  assert.deepEqual(terrainInfo('Void'),       { domain: 'Existence',      grain: 'Ground' });
  assert.deepEqual(terrainInfo('Entity'),     { domain: 'Existence',      grain: 'Figure' });
  assert.deepEqual(terrainInfo('Atmosphere'), { domain: 'Interpretation', grain: 'Ground' });
  assert.equal(terrainInfo('Nope'), null);
  // Consistent with the grain-only reverse already exported.
  for (const terrain of ['Void', 'Entity', 'Kind', 'Field', 'Link', 'Atmosphere', 'Lens', 'Paradigm', 'Network'])
    assert.equal(terrainInfo(terrain).grain, grainOfTerrain(terrain));
});

// ── The 27 diagonal cells, bound to the data registry ────────────────────────

test('there are exactly 27 diagonal cells, three per operator', () => {
  assert.equal(Object.keys(DIAGONAL_CELLS).length, 27);
  for (const op of Object.keys(OPERATORS))
    assert.equal(Object.values(DIAGONAL_CELLS).filter(c => c.op === op).length, 3);
});

test('the generated diagonal reproduces the shipped phasepost-cells registry exactly', () => {
  // core/cube.js is the authority; data/phasepost-cells.json is a projection of
  // it. If either drifts, this binding fails loudly.
  const url = new URL('../data/phasepost-cells.json', import.meta.url);
  const reg = JSON.parse(readFileSync(url, 'utf8')).CELLS;
  assert.deepEqual(new Set(Object.keys(reg)), new Set(Object.keys(DIAGONAL_CELLS)));
  for (const [key, cell] of Object.entries(reg)) {
    const c = DIAGONAL_CELLS[key];
    assert.ok(c, `registry key ${key} is a known diagonal cell`);
    assert.equal(c.op, cell.op);
    assert.equal(c.stance, cell.stance);
    assert.equal(c.terrain, cell.site);
  }
});

// ── Coherence: the confabulation guard (Edit #1) ─────────────────────────────

test('a single-operator event is diagonal by construction', () => {
  for (const op of Object.keys(OPERATORS))
    for (const grain of GRAINS)
      assert.equal(isDiagonal({ op, grain }), true, `${op} @ ${grain}`);
});

test('the address derived from an event is always coherent', () => {
  const addr = eoAddressOfEvent({ op: 'DEF', grain: 'Ground' });
  assert.equal(addr.resolution.stance, 'Clearing');
  assert.equal(addr.site.terrain, 'Atmosphere');
  assert.equal(coherence({ op: 'DEF', stance: addr.resolution.stance, site: addr.site.terrain }).ok, true);
});

test('the Kafka confabulation — Making at a Void — is rejected off-diagonal', () => {
  // INS at a Void is the Ground-grain move; Making is the Figure-grain stance.
  // Producing a specific cause (Making) where the cause-node is absent (Void) is
  // a grain mismatch — the category error the diagonal forbids.
  const v = coherence({ op: 'INS', stance: 'Making', site: 'Void' });
  assert.equal(v.ok, false);
  assert.match(v.reason, /grain-mismatch/);
  // The diagonal-coherent move at a Void is Cultivating (Generate × Ground).
  assert.equal(coherence({ op: 'INS', stance: 'Cultivating', site: 'Void' }).ok, true);
});

test('coherence catches a Mode mismatch and a Domain mismatch with a named reason', () => {
  // DEF is Differentiate; Binding is a Relate stance.
  assert.match(coherence({ op: 'DEF', stance: 'Binding' }).reason, /mode-mismatch/);
  // DEF is Interpretation; Entity is an Existence terrain.
  assert.match(coherence({ op: 'DEF', site: 'Entity' }).reason, /domain-mismatch/);
});

test('coherence reports unknown components honestly', () => {
  assert.equal(coherence({ op: 'XXX' }).reason, 'unknown-operator');
  assert.equal(coherence({ op: 'INS', stance: 'Wat' }).reason, 'unknown-stance');
  assert.equal(coherence({ op: 'INS', site: 'Wat' }).reason, 'unknown-terrain');
  assert.equal(coherence(null).reason, 'no-event');
});

test('a bare operator with no grain is trivially coherent, with no cell yet', () => {
  const v = coherence({ op: 'CON' });
  assert.equal(v.ok, true);
  assert.equal(v.cell, null);
});

// ── Read/write signatures from Mode (Edit #2) ────────────────────────────────

test('the read/write signature follows the operator Mode', () => {
  assert.equal(signatureOf('NUL').label, 'read-and-void');   // Differentiate
  assert.equal(signatureOf('SEG').writes, 'void');
  assert.equal(signatureOf('CON').label, 'read-two-write-link'); // Relate
  assert.equal(signatureOf('SIG').reads, 'two');
  assert.equal(signatureOf('INS').label, 'write-new');       // Generate
  assert.equal(signatureOf('REC').writes, 'new');
  // Every operator resolves to one of the three Mode signatures.
  for (const op of Object.keys(OPERATORS))
    assert.equal(signatureOf(op).mode, OPERATORS[op].mode);
  assert.equal(signatureOf('XXX'), null);
  assert.equal(Object.keys(SIGNATURES).length, 3);
});

// ── Import-time alias table (Edit #3) ────────────────────────────────────────

test('the alias table maps the stale corpus forward by geometry, not spelling', () => {
  // The corpus exemplars settle the direction: SUP cells are Relate-mode → EVA;
  // ALT cells are Differentiate-mode → DEF — matching the shipped centroid
  // bundle's operator_rename and the corrected master spec.
  assert.equal(OPERATOR_ALIASES.SUP, 'EVA');
  assert.equal(OPERATOR_ALIASES.ALT, 'DEF');
  assert.equal(aliasOperator('SUP'), 'EVA');
  assert.equal(aliasOperator('ALT'), 'DEF');
  assert.equal(aliasOperator('CON'), 'CON'); // current names pass through
});

test('aliasCellKey rewrites the stale key prefix onto a real diagonal cell', () => {
  assert.equal(aliasCellKey('SUP_Binding_Lens'), 'EVA_Binding_Lens');
  assert.equal(aliasCellKey('ALT_Dissecting_Lens'), 'DEF_Dissecting_Lens');
  // And the result is a legal diagonal cell.
  assert.ok(DIAGONAL_CELLS[aliasCellKey('SUP_Binding_Lens')]);
  assert.ok(DIAGONAL_CELLS[aliasCellKey('ALT_Dissecting_Lens')]);
  // Current keys are unchanged (idempotent).
  assert.equal(aliasCellKey('CON_Binding_Link'), 'CON_Binding_Link');
});

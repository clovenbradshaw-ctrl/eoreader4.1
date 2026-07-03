import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { siteTerrain, siteTerrainAt, bondTerrain, arcTerrain, trajectory } from '../src/surfer/index.js';
import { reanalyze } from '../src/surfer/reanalyze.js';

// The Site face is Domain × grain → 9 terrains. The engine had been creating only a corner of
// it (Void/Entity at the locus; Atmosphere/Lens/Paradigm in the column) and NEVER the Structure
// row (Field/Link/Network), though CON — the bond — is the central operator. siteTerrain reads
// the terrain off the operators + grain, never words, so it types all 9 in any modality.

test('siteTerrain produces all nine terrains from operator profile + grain', () => {
  // Existence (INS/SIG/NUL)
  assert.equal(siteTerrain({ ops: ['INS'] }), 'Entity');               // Figure
  assert.equal(siteTerrain({ ops: ['INS'], recurrent: true }), 'Kind'); // Pattern
  assert.equal(siteTerrain({ ops: ['INS'], thin: true }), 'Void');      // Ground
  // Structure (CON/SEG/SYN) — the row that was never created
  assert.equal(siteTerrain({ ops: ['CON'] }), 'Link');                  // Figure
  assert.equal(siteTerrain({ ops: ['CON'], recurrent: true }), 'Network'); // Pattern
  assert.equal(siteTerrain({ ops: ['CON'], thin: true }), 'Field');     // Ground
  // Interpretation (DEF/EVA/REC)
  assert.equal(siteTerrain({ ops: ['EVA'] }), 'Lens');                  // Figure
  assert.equal(siteTerrain({ ops: ['REC'], recurrent: true }), 'Paradigm'); // Pattern
  assert.equal(siteTerrain({ ops: ['DEF'], thin: true }), 'Atmosphere'); // Ground
});

test('a bond locus is typed a Link; a bare entity an Entity; an empty one a Void', () => {
  const doc = parseText('Gregor saw Grete. Light.', { docId: 'd' });
  assert.equal(siteTerrainAt(doc, 0), 'Link', 'the bonded sentence is a Link (Structure × Figure)');
  // the second "sentence" has no bond — thin → Void (or Entity if an entity was admitted)
  assert.ok(['Void', 'Entity'].includes(siteTerrainAt(doc, 1)), 'the contentless locus is Ground/Figure of Existence');
});

test('the SAME typing works on a non-linguistic log — omnimodal by construction', () => {
  // A sensor log: channels (INS) and their couplings (CON). No words. siteTerrainAt types the
  // coupling locus a Link exactly as it types a sentence's bond — a link is a link in any
  // modality, because the typing reads the operator, not the surface.
  const sensorDoc = {
    log: { snapshot: () => [
      { op: 'INS', id: 1, label: 'channelX', sentIdx: 0 },
      { op: 'INS', id: 2, label: 'channelY', sentIdx: 0 },
      { op: 'CON', src: 1, tgt: 2, via: 'coupled', sentIdx: 1 },
    ] },
  };
  assert.equal(siteTerrainAt(sensorDoc, 1), 'Link', 'a sensor coupling is a Link, same as a sentence bond');
  assert.equal(bondTerrain(), 'Link');
  assert.equal(arcTerrain(), 'Network');
});

test('the trajectory declares itself a Network reading (a pattern of Links)', () => {
  const doc = parseText('Anna saw Ben. Anna trusted Ben. Anna left Ben.', { docId: 'g' });
  const traj = trajectory(doc, { focus: 'Anna', segments: [2] });
  assert.equal(traj.terrain, 'Network', 'an arc over links is Structure × Pattern = Network');
  assert.equal(traj.linkTerrain, 'Link', 'each bond it reads is a Link');
});

test('reanalysis is back on the cube — a Lens reconsolidation, not the off-cube "Bond"', () => {
  const doc = parseText('The horse raced past the barn fell.', { docId: 'gp', genderCoref: true });
  const { reanalyses } = reanalyze(doc, { isVerb: (w) => /raced|fell/.test(w) });
  for (const r of reanalyses) {
    assert.equal(r.rec.site, 'Lens', 'the reconsolidation lands at the Lens terrain (Interpretation × Figure)');
    assert.notEqual(r.rec.site, 'Bond', 'never the off-cube site');
    assert.equal(r.rec.formsTerrain, 'Link', 'its Structure footprint — the re-formed bond — is a Link');
  }
});

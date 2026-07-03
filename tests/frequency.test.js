import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestFrequencies } from '../src/organs/in/frequency.js';
import { retrieveLexical } from '../src/retrieve/index.js';

// The frequency adapter hands the engine raw Hz as overtone token sets and lets
// its Level-1 set-overlap reading (hits/qLen) measure harmonic relatedness. No
// scale, no `mod 12`, no ratio table. These tests pin what the demo claims:
// octave equivalence and the consonance ordering are DISCOVERED, not supplied.

const around220 = {
  name: 'tones',
  notes: [
    { hz: 220 },     // 0 reference
    { hz: 440 },     // 1 octave        2:1
    { hz: 330 },     // 2 fifth         3:2
    { hz: 275 },     // 3 major third   5:4
    { hz: 311.13 },  // 4 tritone       √2, no small-integer ratio
    { hz: 110 },     // 5 octave below  1:2
  ],
};

const overlapWith = (doc, refIdx) => {
  const out = new Map();
  for (const r of retrieveLexical(doc, doc.spectrumQuery(refIdx), 99)) out.set(r.idx, r.score);
  return out;
};

test('every tone is its own entity — octaves are NOT merged a priori', () => {
  const doc = ingestFrequencies(around220);
  // No mod-12: 220 and 440 are distinct entities. The engine must discover any
  // equivalence, never assume it.
  assert.equal(doc.projectGraph().entities.size, 6);
  assert.equal(doc.modality, 'frequency');
});

test('octave equivalence is discovered — the octave shares the most overtones', () => {
  const doc = ingestFrequencies(around220);
  const o = overlapWith(doc, 0);
  // Octave above (1) and below (5) outrank the fifth (2), third (3), tritone (4).
  assert.ok(o.get(1) > o.get(2), 'octave should beat the fifth');
  assert.ok(o.get(5) > o.get(2), 'lower octave should beat the fifth');
  assert.ok(o.get(1) >= 0.5, `octave overlap should be ~0.5, got ${o.get(1)}`);
});

test('consonance ordering falls out of overtone overlap: octave > fifth > third', () => {
  const doc = ingestFrequencies(around220);
  const o = overlapWith(doc, 0);
  assert.ok(o.get(1) > o.get(2), 'octave > fifth');
  assert.ok(o.get(2) > o.get(3), 'fifth > major third');
});

test('the tritone shares (almost) no overtones — the dissonant extreme', () => {
  const doc = ingestFrequencies(around220);
  const o = overlapWith(doc, 0);
  // √2 has no small-integer ratio, so no overtone coincides within tolerance.
  assert.ok(!o.has(4) || o.get(4) < 0.1, `tritone overlap should be ~0, got ${o.get(4)}`);
  // And it is the least consonant of all the candidates.
  const tritone = o.get(4) || 0;
  for (const idx of [1, 2, 3, 5]) assert.ok((o.get(idx) || 0) > tritone, `idx ${idx} should beat the tritone`);
});

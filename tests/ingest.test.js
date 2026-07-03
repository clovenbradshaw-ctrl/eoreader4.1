import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestImage } from '../src/organs/in/image.js';
import { ingestMusic } from '../src/organs/in/music.js';
import { readingAt } from '../src/perceiver/index.js';

// The image adapter must yield the same doc contract text does, so the graph,
// reading levels and fold all work over an image's object graph unchanged.
const DETECTIONS = {
  name: 'street.jpg', width: 800, height: 600,
  regions: [
    { label: 'Person', bbox: [100, 120, 80, 200] },
    { label: 'Dog',    bbox: [200, 300, 60, 80] },
    { label: 'Car',    bbox: [400, 140, 300, 160] },
  ],
  relations: [{ from: 0, to: 1, kind: 'con', via: 'walking' }],
};

test('image adapter emits the nine operators onto the same spine', () => {
  const doc = ingestImage(DETECTIONS);
  assert.equal(doc.modality, 'image');
  assert.equal(doc.units.length, 3);
  const g = doc.projectGraph();
  assert.equal(g.entities.size, 3);
  assert.ok(g.edges.some(e => e.via === 'walking'));
});

test('reading mode runs over an image with no change to the spine', () => {
  const doc = ingestImage(DETECTIONS);
  const r = readingAt(doc, 1);
  assert.ok(typeof r.surprise === 'number');
  assert.ok(Array.isArray(r.surprises));
});

test('repeated labels become distinct referents', () => {
  const doc = ingestImage({
    name: 'crowd', regions: [{ label: 'Person', bbox: [0, 0, 1, 1] }, { label: 'Person', bbox: [10, 0, 1, 1] }],
  });
  assert.equal(doc.projectGraph().entities.size, 2);
});

// The music adapter feeds the engine only a raw note sequence — no key, no
// labels, no relations — and the engine's own folds extract the structure.
const TWINKLE = {
  name: 'twinkle', notes: ['C4','C4','G4','G4','A4','A4','G4','F4','F4','E4','E4','D4','D4','C4'],
};

test('music adapter emits the same spine — INS per note, CON per interval', () => {
  const doc = ingestMusic(TWINKLE);
  assert.equal(doc.modality, 'music');
  assert.equal(doc.sequence.length, 14);
  const g = doc.projectGraph();
  // Six distinct pitch classes (C D E F G A); every C is one recurring entity.
  assert.equal(g.entities.size, 6);
  // Adjacency bonds carry the interval the two pitch numbers imply, derived —
  // not supplied. C4→G4 is up a perfect fifth (7 semitones).
  assert.ok(g.edges.some(e => e.via === 'up7'));
});

test('count-mass recovers the tonic and dominant — extraction, not input', () => {
  const doc = ingestMusic(TWINKLE);
  const byMass = [...doc.projectGraph().entities.values()].sort((a, b) => b.sightings - a.sightings);
  // The two heaviest pitch classes are C and G — tonic and dominant of the key.
  // Nothing told the engine the key; it fell out of the sighting fold.
  assert.deepEqual(new Set([byMass[0].label, byMass[1].label]), new Set(['C', 'G']));
});

test('L3 surprise runs over a melody with no change to the spine', () => {
  const doc = ingestMusic(TWINKLE);
  const r = readingAt(doc, 13);
  assert.ok(typeof r.surprise === 'number' && r.surprise > 0);
  assert.ok(Array.isArray(r.surprises));
});

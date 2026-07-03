import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestFrequencies } from '../src/organs/in/frequency.js';
import { ingestMusic } from '../src/organs/in/music.js';
import { predictiveSequenceReading } from '../src/surfer/index.js';
import { discoverEquivalences as _de } from '../src/perceiver/index.js';
import { retrieveLexical } from '../src/retrieve/index.js';
const discoverEquivalences = (doc, opts = {}) => _de(doc, { retrieve: retrieveLexical, ...opts });

// The close: the tonal reading the music adapter got from `midi % 12` comes back
// when the equivalence is DISCOVERED from frequencies instead of asserted. If it
// does, `mod 12` was doing no work the signal couldn't do itself.

const A4 = 440, CH = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const hzOf = (name) => {
  const m = /^([A-G]#?)(\d)$/.exec(name);
  const midi = CH.indexOf(m[1]) + 12 * (Number(m[2]) + 1);
  return A4 * Math.pow(2, (midi - 69) / 12);
};
const SONG = ['C4','C4','G4','G4','A4','A4','G4','F4','F4','E4','E4','D4','D4','C4'];
const hits = (steps) => steps.filter(s => s.hit).length;

test('same-pitch tones merge into the pitch classes — discovered, not asserted', () => {
  const doc = ingestFrequencies({ name: 't', notes: SONG.map(n => ({ hz: hzOf(n) })) });
  assert.equal(doc.projectGraph().entities.size, 14);   // 14 separate tones at first
  discoverEquivalences(doc);
  assert.equal(doc.projectGraph().entities.size, 6);    // → the six pitch classes
});

test('discovered tonic matches the mod-12 tonic (C and G, ×3 each)', () => {
  const freqDoc = ingestFrequencies({ name: 't', notes: SONG.map(n => ({ hz: hzOf(n) })) });
  discoverEquivalences(freqDoc);
  const g = freqDoc.projectGraph();
  const idx = (id) => Number(String(id).slice(1));
  const masses = [...g.entities.values()]
    .map(e => ({ name: SONG[idx(g.representative(e.id))].replace(/\d+$/, ''), mass: e.sightings }))
    .sort((a, b) => b.mass - a.mass);

  const pc = [...ingestMusic({ name: 'm', notes: SONG }).projectGraph().entities.values()]
    .sort((a, b) => b.sightings - a.sightings);

  assert.equal(masses[0].mass, pc[0].sightings);
  assert.deepEqual(new Set([masses[0].name, masses[1].name]), new Set([pc[0].label, pc[1].label]));
  assert.deepEqual(new Set([masses[0].name, masses[1].name]), new Set(['C', 'G']));
});

test('next-note prediction is identical over discovered classes and pitch classes', () => {
  const freqDoc = ingestFrequencies({ name: 't', notes: SONG.map(n => ({ hz: hzOf(n) })) });
  discoverEquivalences(freqDoc);
  const g = freqDoc.projectGraph();
  const disc = predictiveSequenceReading(freqDoc, { order: 2, repOf: g.representative });
  const pc = predictiveSequenceReading(ingestMusic({ name: 'm', notes: SONG }), { order: 2 });
  // Same recurrence structure → same prediction, whatever the equivalence's source.
  assert.equal(hits(disc), hits(pc));
});

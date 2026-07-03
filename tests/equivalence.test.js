import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestFrequencies } from '../src/organs/in/frequency.js';
import { discoverEquivalences as _de, mutualNearestPairs as _mnp } from '../src/perceiver/index.js';
import { retrieveLexical } from '../src/retrieve/index.js';
const discoverEquivalences = (doc, opts = {}) => _de(doc, { retrieve: retrieveLexical, ...opts });
const mutualNearestPairs = (doc, opts = {}) => _mnp(doc, { retrieve: retrieveLexical, ...opts });

// "The same note" must EMERGE from overtone overlap by rank alone — no threshold,
// no a priori category. Mutual nearest neighbour + the engine's union-find: two
// tones merge iff each is the other's strongest match.

const fourOctavesPlus = {
  name: 'A',
  notes: [
    { hz: 110 }, { hz: 220 }, { hz: 440 }, { hz: 880 },  // octaves of A
    { hz: 330 },     // fifth
    { hz: 275 },     // major third
    { hz: 311.13 },  // tritone
  ],
};

test('octaves collapse to one entity; fifth, third, tritone stay separate', () => {
  const doc = ingestFrequencies(fourOctavesPlus);
  assert.equal(doc.projectGraph().entities.size, 7);   // before: all distinct
  const { classes } = discoverEquivalences(doc);
  assert.equal(doc.projectGraph().entities.size, 4);   // after: one octave class + 3 singletons

  const octaveClass = classes.find(c => c.length > 1).map(i => doc.noteHz[i]).sort((a, b) => a - b);
  assert.deepEqual(octaveClass, [110, 220, 440, 880]);
  // The fifth/third/tritone never joined the octave class.
  for (const hz of [330, 275, 311.13]) {
    assert.ok(classes.some(c => c.length === 1 && doc.noteHz[c[0]] === hz), `${hz} should stand alone`);
  }
});

test('the merges are mutual — each tone is the other\'s strongest match', () => {
  const doc = ingestFrequencies(fourOctavesPlus);
  const pairs = mutualNearestPairs(doc).map(p => [doc.noteHz[p.i], doc.noteHz[p.j]].sort((a, b) => a - b));
  // Adjacent octaves are mutual nearest (overlap 0.5 each way); the fifth is not.
  assert.ok(pairs.some(p => p[0] === 110 && p[1] === 220));
  assert.ok(pairs.some(p => p[0] === 220 && p[1] === 440));
  assert.ok(!pairs.some(p => p.includes(330)), 'the fifth is no tone\'s strongest match');
});

test('the category is relative: with no octave, the strongest relation groups', () => {
  // A bare fifth and nothing else: lacking an octave, the fifth is the strongest
  // relation present, so it is what gets grouped. Sameness is relative to the signal.
  const doc = ingestFrequencies({ name: 'fifth', notes: [{ hz: 220 }, { hz: 330 }] });
  const { classes } = discoverEquivalences(doc);
  assert.equal(classes.length, 1);
  assert.equal(classes[0].length, 2);
});

test('a tone sharing no overtones never merges', () => {
  // 220 and an inharmonic partner with no small-integer ratio share no overtone
  // bin, so neither is the other's >0 match — they stay apart with no threshold.
  const doc = ingestFrequencies({ name: 'pair', notes: [{ hz: 220 }, { hz: 220 * Math.SQRT2 }] });
  const { classes } = discoverEquivalences(doc);
  assert.equal(classes.length, 2);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { detectHolons, holarchy } from '../src/surfer/index.js';

// Autopoietic holons by the Born rule: ρ over the cast, its eigenlenses the self-coupled
// communities, units assigned by Born probability, lens-switches the boundaries. These pin
// that the grain is DETECTED from cast-closure — not imposed — and that the boundary falls
// where the cast turns over.

// Two distinct casts in two halves: the reading should close on each and cut at the seam.
const TWO =
  'Alice met Bob. Alice met Bob. Alice trusted Bob. Alice helped Bob. ' +
  'Carol feared Dave. Carol feared Dave. Carol chased Dave. Carol caught Dave.';

test('detectHolons cuts where the cast turns over, not on a fixed window', () => {
  const doc = parseText(TWO, { docId: 'h', totalRead: true });
  const h = detectHolons(doc, { k: 4, minLen: 2, topFigures: 10 });
  assert.equal(h.holons.length, 2, 'two casts → two holons');
  assert.deepEqual(h.boundaries, [4], 'the boundary is the seam between the casts');
  const names = (x) => x.cast.map((c) => c.label).sort();
  assert.deepEqual(names(h.holons[0]), ['Alice', 'Bob'], 'the first holon closes on Alice+Bob');
  assert.deepEqual(names(h.holons[1]), ['Carol', 'Dave'], 'the second on Carol+Dave');
});

test('the spectrum is the Born weight of each holon; entropy reads the balance', () => {
  const doc = parseText(TWO, { docId: 'h', totalRead: true });
  const h = detectHolons(doc, { k: 4, minLen: 2, topFigures: 10 });
  assert.ok(Math.abs(h.spectrum[0] - 0.5) < 0.15 && Math.abs(h.spectrum[1] - 0.5) < 0.15, 'two balanced lenses');
  assert.ok(Math.abs(h.entropy - Math.log(2)) < 0.1, 'von Neumann entropy ≈ ln 2 for two equal readings');
});

test('closure is high when a cast stays inside its holon (operational closure)', () => {
  const doc = parseText(TWO, { docId: 'h', totalRead: true });
  const h = detectHolons(doc, { k: 4, minLen: 2, topFigures: 10 });
  for (const x of h.holons) assert.ok(x.closure > 0.9, `a clean holon keeps its cast inside (got ${x.closure})`);
});

test('a single-cast passage is one holon — no phantom boundary', () => {
  const doc = parseText('Alice met Bob. Alice met Bob. Alice trusted Bob. Alice helped Bob.',
    { docId: 's', totalRead: true });
  const h = detectHolons(doc, { k: 4, minLen: 2, topFigures: 10 });
  assert.equal(h.holons.length, 1);
  assert.deepEqual(h.boundaries, []);
});

test('holarchy nests a coarse arc into its finer holons', () => {
  // four casts: two arcs of two scenes each. Coarse k=2 finds the arcs; fine resolves within.
  const DOC =
    'Alice met Bob. Alice trusted Bob. Alice helped Bob. ' +
    'Bob met Eve. Bob trusted Eve. Bob helped Eve. ' +
    'Carol feared Dave. Carol chased Dave. Carol caught Dave. ' +
    'Dave feared Mara. Dave chased Mara. Dave caught Mara.';
  const doc = parseText(DOC, { docId: 'ha', totalRead: true });
  const ha = holarchy(doc, { coarseK: 2, fineK: 3, minLen: 2, topFigures: 12 });
  assert.ok(ha.coarse.holons.length >= 1, 'a coarse level exists');
  assert.equal(ha.levels.length, ha.coarse.holons.length, 'every coarse holon carries its children');
  assert.ok(ha.levels.some((l) => l.children.length >= 1), 'a coarse arc resolves into finer holons');
});

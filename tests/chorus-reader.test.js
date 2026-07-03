// chorus-reader — the browser entry (src/reader/eo/chorus.js) that wires the
// chorus holon to the EO Reader app. Verified in node against the REAL installed
// centroids and a stub embedder (MiniLM cannot run in CI), so the display model
// the app renders is locked.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createChorusReader } from '../src/reader/eo/chorus.js';

const centroids = JSON.parse(readFileSync(new URL('../data/centroids-27.json', import.meta.url)));
const dim = centroids.vectors[Object.keys(centroids.vectors)[0]].length;

// A stub embedder in the centroid space: returns a chosen centroid (near) verbatim,
// so the clause reads as sharply that one cell — measuresMeaning:true so the reader
// treats it as live, exactly like MiniLM.
const stubEmbedder = (pickKey) => ({
  measuresMeaning: true,
  async embed() {
    const base = centroids.vectors[pickKey];
    const v = new Float32Array(dim);
    for (let i = 0; i < dim; i++) v[i] = base[i];
    return v;
  },
});

test('the reader is not live without a meaning-measuring embedder', async () => {
  const r = createChorusReader({ centroids, embedder: { measuresMeaning: false } });
  assert.equal(r.isLive(), false);
  assert.equal((await r.read('anything')).live, false);
});

test('the reader is not live without centroids', () => {
  assert.equal(createChorusReader({ centroids: null, embedder: stubEmbedder('CON_Binding_Link') }).isLive(), false);
});

test('a live read returns the Born weighted map: voiced cells, three faces, silence', async () => {
  const r = createChorusReader({ centroids, embedder: stubEmbedder('CON_Binding_Link'), coverage: 0.8 });
  const out = await r.read('the citation holds the claim to its source');
  assert.equal(out.live, true);
  assert.ok(out.voiced.length >= 1, 'at least one voiced cell');
  assert.ok(out.voiced[0].pct > 0);
  assert.ok(out.voiced.every((c) => typeof c.label === 'string' && c.label.includes('·')));
  // the three readable projections are present
  assert.deepEqual(out.faces.map((f) => f.face), ['act', 'site', 'stance']);
  assert.ok(out.faces.every((f) => f.cells.length >= 1));
  // silence is carried as data
  assert.equal(out.silence.cell, 'SYN_Cultivating_Field');
  assert.ok(out.silence.pct >= 0);
});

test('an empty clause reads as empty, not a fabricated map', async () => {
  const r = createChorusReader({ centroids, embedder: stubEmbedder('CON_Binding_Link') });
  const out = await r.read('   ');
  assert.equal(out.empty, true);
});

test('an embedder fault degrades to honest not-live, never throws', async () => {
  const r = createChorusReader({
    centroids,
    embedder: { measuresMeaning: true, async embed() { throw new Error('backend race'); } },
  });
  const out = await r.read('a clause');
  assert.equal(out.live, false);
  assert.equal(out.reason, 'embed-failed');
});

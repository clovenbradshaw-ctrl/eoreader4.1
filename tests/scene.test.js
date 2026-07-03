import { test } from 'node:test';
import assert from 'node:assert/strict';

import { composeScene } from '../src/organs/in/scene.js';
import { ingestImage } from '../src/organs/in/image.js';

// The scene composer is the PURE half of the vision organ: Florence-2's structured
// output (labels + corner boxes + one gist sentence) in, the image organ's detections
// contract out — spatial relations and narration DERIVED from the geometry, never
// decoded. The model itself cannot run in CI (real-model-wiring.test.js's rule), so
// these tests lock the derivation and the spine contract against a model-shaped input.

// A photograph, Florence-2-shaped: dense-region-caption labels with [x1,y1,x2,y2] boxes.
const PARK = {
  name: 'park.jpg', width: 800, height: 600,
  caption: 'A dog stands in a park',
  regions: [
    { label: 'dog',   bbox: [300, 380, 500, 580] }, // big, base low in the frame — nearest
    { label: 'tree',  bbox: [320, 120, 480, 460] }, // same column, base higher — behind the dog
    { label: 'hills', bbox: [0, 60, 800, 260] },    // wide, high in the frame — the background
  ],
};

test('corner boxes normalize to the [x,y,w,h] the image organ reads', () => {
  const scene = composeScene(PARK);
  assert.deepEqual(scene.regions[0].bbox, [300, 380, 200, 200]);
  const kept = composeScene({ ...PARK, bboxFormat: 'xywh' });
  assert.deepEqual(kept.regions[0].bbox, [300, 380, 500, 580]);
});

test('depth falls out of the geometry: behind-chains from base position, never decoded', () => {
  const scene = composeScene(PARK);
  // The tree is behind the dog; the hills behind the tree — original-index relations.
  assert.ok(scene.relations.some(r => r.from === 1 && r.to === 0 && r.via === 'behind'));
  assert.ok(scene.relations.some(r => r.from === 2 && r.to === 1 && r.via === 'behind'));
});

test('the narration is composed prose: gist first, then near → far, spatially phrased', () => {
  const { text } = composeScene(PARK);
  assert.ok(text.startsWith('A dog stands in a park.'));
  assert.ok(text.includes('In the foreground, a dog.'));
  assert.ok(text.includes('Behind the dog, a tree.'));
  assert.ok(text.includes('In the background, hills.'));
});

test('every narration sentence grounds to its regions — a claim is a set of boxes', () => {
  const scene = composeScene(PARK);
  const mentioned = new Set();
  for (const line of scene.narration) {
    assert.ok(Array.isArray(line.regions));
    for (const i of line.regions) {
      assert.ok(Number.isInteger(i) && i >= 0 && i < scene.regions.length, 'a sentence points at a real region');
      mentioned.add(i);
    }
  }
  assert.equal(mentioned.size, scene.regions.length, 'no region is spoken of without a box, none left unspoken');
});

test('the composed scene feeds the image organ unchanged — same spine, same operators', () => {
  const doc = ingestImage(composeScene({ ...PARK, witness: 'florence-2-base-ft · test' }));
  assert.equal(doc.modality, 'image');
  const g = doc.projectGraph();
  assert.equal(g.entities.size, 3);
  assert.ok(g.edges.some(e => e.via === 'behind'));
  // The gist and the witness ride in the front matter, like any modality's metadata.
  assert.equal(doc.metadata.description, 'A dog stands in a park');
  assert.equal(doc.metadata.witness, 'florence-2-base-ft · test');
});

test('an enclosed box reads as containment, not depth', () => {
  const scene = composeScene({
    width: 600, height: 600,
    regions: [
      { label: 'tree', bbox: [100, 50, 300, 400] },
      { label: 'bird', bbox: [180, 100, 240, 160] },
    ],
  });
  assert.ok(scene.relations.some(r => r.via === 'in' && r.from === 1 && r.to === 0));
  assert.ok(scene.text.includes('In the tree, a bird.'));
});

test('same-depth neighbours read laterally', () => {
  const scene = composeScene({
    width: 600, height: 600,
    regions: [
      { label: 'cup',   bbox: [100, 300, 200, 400] },
      { label: 'plate', bbox: [400, 300, 500, 400] },
    ],
  });
  assert.ok(scene.relations.some(r => r.via === 'right of' && r.from === 1 && r.to === 0));
  assert.ok(scene.text.includes('To the right of the cup, a plate.'));
});

test('a scene with no regions still carries its gist; labels keep their own determiners', () => {
  const bare = composeScene({ caption: 'a quiet, empty room' });
  assert.equal(bare.text, 'A quiet, empty room.');
  assert.deepEqual(bare.relations, []);
  const det = composeScene({ width: 100, height: 100, regions: [{ label: 'the sky', bbox: [0, 0, 100, 40] }] });
  assert.ok(det.text.includes('The sky.'));
  assert.ok(!det.text.includes('a the sky'));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { encodeLevels, detectGrain, coarseSurf, routeDomain, CAST_OPS, MEANING_OPS } from '../src/surfer/index.js';

// The accumulation layer — fold the sentence-grain total read into coarse units and surf
// that spine, so a whole-document question reaches the region it lives in without surfing
// every sentence at full resolution.

// A small multi-section document: four structural divisions, distinct casts, so the coarse
// encoding has something to separate (four headings clears the structural-grain threshold).
const DOC =
  'CHAPTER I\n' +
  'Pierre Bezukhov arrived. Pierre Bezukhov joined the lodge. ' +
  'Pierre Bezukhov embraced the brotherhood. The lodge welcomed Pierre Bezukhov. ' +
  'CHAPTER II\n' +
  'Andrei Bolkonski marched. Andrei Bolkonski fought the battle. Andrei Bolkonski fell wounded. ' +
  'CHAPTER III\n' +
  'Natasha Rostova sang. Natasha Rostova danced. ' +
  'Natasha Rostova married Pierre Bezukhov. Natasha Rostova raised the children. ' +
  'CHAPTER IV\n' +
  'Anna Pavlovna hosted the salon. Anna Pavlovna greeted the guests.';

test('detectGrain reads the document\'s own structural headings when it carries them', () => {
  const doc = parseText(DOC, { docId: 'lv', totalRead: true });
  const g = detectGrain(doc);
  assert.equal(g.mode, 'structural', 'CHAPTER headings are the grain');
  assert.ok(g.bounds.length >= 2, 'at least the two chapters are boundaries');
});

test('a short document with no headings stays at sentence grain', () => {
  const doc = parseText('Alice met Bob. Bob left.', { docId: 'short', totalRead: true });
  assert.equal(detectGrain(doc).mode, 'sentence');
});

test('a long heading-less document folds to windows, the spine bounded by doc size', () => {
  const long = Array.from({ length: 300 }, (_, i) => `Figure${i % 5} acted on the room.`).join(' ');
  const doc = parseText(long, { docId: 'long', totalRead: true });
  const g = detectGrain(doc);
  assert.equal(g.mode, 'window');
  assert.ok(g.bounds.length >= 8 && g.bounds.length <= 60, `the spine stays bounded, got ${g.bounds.length}`);
});

test('encodeLevels gives each coarse unit its own reading (figures, backbone, domain split)', () => {
  const doc = parseText(DOC, { docId: 'lv', totalRead: true });
  const enc = encodeLevels(doc);
  assert.ok(enc.segments.length >= 2, 'two chapter units');
  const ch1 = enc.segments.find(s => s.text.includes('lodge'));
  const ch2 = enc.segments.find(s => s.text.includes('danced'));
  assert.ok(ch1.figures.some(f => /Pierre/.test(f.label)), 'chapter I turns on Pierre');
  assert.ok(ch2.figures.some(f => /Natasha/.test(f.label)), 'chapter II turns on Natasha');
  // each unit carries the cube's cast/meaning split, and a backbone of sure bonds.
  for (const seg of enc.segments) {
    assert.ok(seg.domain.cast >= 0 && seg.domain.meaning >= 0, 'the two-channel profile is present');
    assert.ok(seg.bonds.every(b => b.confidence >= 0.85), 'the backbone is the high-confidence spine');
  }
});

test('the cast/meaning split partitions the cube operators (no overlap, covers the nine)', () => {
  for (const op of CAST_OPS) assert.ok(!MEANING_OPS.has(op), `${op} is cast-only`);
  assert.equal(CAST_OPS.size + MEANING_OPS.size, 9, 'the nine operators split into the two channels');
});

test('routeDomain reads the question\'s domain off its own vocabulary', () => {
  assert.equal(routeDomain('who married Natasha?'), 'cast');
  assert.equal(routeDomain('is his conversion genuine progress or an illusion?'), 'meaning');
  assert.equal(routeDomain('trace the philosophy of history and its paradigm'), 'meaning');
});

test('coarseSurf reaches the region a question lives in, routed by domain', () => {
  const doc = parseText(DOC, { docId: 'lv', totalRead: true });
  const enc = encodeLevels(doc);
  // a cast question about the lodge surfaces Chapter I (Pierre / brotherhood).
  const a = coarseSurf(enc, 'who joined the lodge and embraced the brotherhood?');
  assert.ok(a.regions.length > 0, 'a region is surfaced');
  assert.ok(a.regions[0].figures.some(f => /Pierre/.test(f.label)), 'the lodge region turns on Pierre');
  assert.match(a.regions[0].title, /CHAPTER I\b/);
  // a question about Natasha's marriage surfaces Chapter III.
  const b = coarseSurf(enc, 'whom did Natasha marry and raise children with?');
  assert.ok(b.regions[0].figures.some(f => /Natasha/.test(f.label)), 'the marriage region turns on Natasha');
  assert.match(b.regions[0].title, /CHAPTER III\b/);
});

test('the coarse surf is bounded by the spine, not the sentence count (cost)', () => {
  const long = 'CHAPTER I\n' + Array.from({ length: 200 }, () => 'Anna met Boris in the hall.').join(' ') +
    ' CHAPTER II\n' + Array.from({ length: 200 }, () => 'Carl chased Dmitri through the square.').join(' ');
  const doc = parseText(long, { docId: 'cost', totalRead: true });
  const enc = encodeLevels(doc);
  // far fewer coarse units than sentences — the surf rides the spine.
  assert.ok(enc.segments.length < enc.sentenceCount / 10, 'the spine is much coarser than the sentence read');
  const r = coarseSurf(enc, 'who chased Dmitri through the square?');
  assert.ok(r.regions[0].figures.some(f => /Carl|Dmitri/.test(f.label)), 'the chase region is reached');
});

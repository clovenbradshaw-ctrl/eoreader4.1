import { test } from 'node:test';
import assert from 'node:assert/strict';

import { leadSentence, stripHeadingPrefix } from '../src/longgen/render.js';
import { trimDangling, trimDegeneration } from '../src/longgen/walk.js';

// ── heading-glue: a Wikipedia section heading fused onto the first sentence ──────
// The dolphins run seeded paragraphs on header fragments — "Evolution Dolphins
// display…", "Behavior A pod…", "Locomotion Dolphins…". stripHeadingPrefix removes a
// leading run of KNOWN section words so the seed opens on the real topic sentence.

test('stripHeadingPrefix removes a glued section heading', () => {
  assert.equal(
    stripHeadingPrefix('Evolution Dolphins display convergent evolution with fish and aquatic reptiles.'),
    'Dolphins display convergent evolution with fish and aquatic reptiles.');
  assert.equal(stripHeadingPrefix('Behavior A pod of Indo-Pacific bottlenose dolphins.'),
    'A pod of Indo-Pacific bottlenose dolphins.');
  assert.equal(stripHeadingPrefix('Locomotion Dolphins are fast swimmers.'),
    'Dolphins are fast swimmers.');
});

test('stripHeadingPrefix leaves a real Title-Case opener untouched', () => {
  // "United" is not a curated section word — a real sentence must never be trimmed.
  const s = 'United States dolphins are protected under federal law.';
  assert.equal(stripHeadingPrefix(s), s);
  // A lone capitalized ordinary opener stays put.
  const t = 'Dolphins are highly social animals.';
  assert.equal(stripHeadingPrefix(t), t);
});

test('leadSentence strips the heading then returns the topic sentence', () => {
  assert.equal(
    leadSentence('Evolution Dolphins display convergent evolution with fish. They are streamlined.'),
    'Dolphins display convergent evolution with fish.');
});

// ── mid-sentence truncation: a ceiling-length beat stops mid-thought ─────────────
// Under groundLater the whole draft is kept, so an un-terminated tail would ship
// ("…dolphins have also been observed exhibiting"). trimDangling drops it back to the
// last completed sentence — but never to nothing.

test('trimDangling drops an un-terminated tail to the last complete sentence', () => {
  assert.equal(
    trimDangling('Dolphins are social. In these complex structures, dolphins have also been observed exhibiting'),
    'Dolphins are social.');
});

test('trimDangling leaves a paragraph that already ends on a sentence boundary', () => {
  const s = 'Dolphins are social. They live in pods.';
  assert.equal(trimDangling(s), s);
  // A closing quote / paren after the terminal punctuation still counts as a boundary.
  const q = 'She said "they are social."';
  assert.equal(trimDangling(q), q);
});

test('trimDangling never trims a single unfinished sentence to nothing', () => {
  const frag = 'Dolphins have also been observed exhibiting';
  assert.equal(trimDangling(frag), frag);
  assert.equal(trimDangling(''), '');
});

// trimDegeneration and trimDangling compose: loops trimmed, then the dangling tail.
test('trimDegeneration then trimDangling: loop cut, tail cut', () => {
  const cleaned = trimDangling(trimDegeneration('Dolphins are social. They live in pods. And then it kept'));
  assert.equal(cleaned, 'Dolphins are social. They live in pods.');
});

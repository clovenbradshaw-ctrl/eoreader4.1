import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/pipeline.js';
import { surfFold } from '../src/surfer/index.js';
import { foldImpression } from '../src/write/impression.js';
import { HASHID_RE } from '../src/core/index.js';

// docs/streaming-answer.md — the fold's impression, rendered MODEL-FREE: what the
// substrate has read by the time the slow talker is warming, streamed during the
// wait. A preview off the same §2 plan, never a witness-bound claim.

const impressionOf = (text, anchor = 1) => {
  const doc = parseText(text, { docId: 'k' });
  return foldImpression({ doc, surf: surfFold(doc, anchor) });
};

test('the impression glosses the reading in plain surface, model-free', () => {
  const imp = impressionOf('Alice met Bob. Bob trusted Carol. Carol warned Dan. Dan feared Eve.');
  assert.ok(imp.phrases.length > 0, 'one impression phrase per resolved stop');
  assert.ok(imp.text.length > 0);
  assert.equal(HASHID_RE.test(imp.text), false, 'no hashId leaks into the impression');
  // it names the figures and reads the trajectory — opening, the turn, the gathering
  assert.match(imp.text, /Alice|Bob|Carol/);
  assert.match(imp.text, /^The reading opens/);
});

test('a hedged connection reads as held open, never asserted (§3b)', () => {
  const imp = impressionOf('Gregor Samsa might have frightened his mother. Grete fed Gregor. Grete left.', 0);
  assert.match(imp.text, /is left open/, 'the void band surfaces as a holding-open, not a claim');
});

test('no surfer path (a chat turn) yields an empty impression — nothing extra is shown', () => {
  assert.deepEqual(foldImpression({ doc: null, surf: null }), { phrases: [], text: '' });
  assert.deepEqual(foldImpression({}), { phrases: [], text: '' });
});

test('the impression is deterministic — same passage, same gloss', () => {
  const a = impressionOf('Gregor Samsa woke as a vermin. Gregor frightened his mother. Grete fed Gregor.');
  const b = impressionOf('Gregor Samsa woke as a vermin. Gregor frightened his mother. Grete fed Gregor.');
  assert.deepEqual(a, b);
});

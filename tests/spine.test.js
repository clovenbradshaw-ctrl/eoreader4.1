import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/pipeline.js';
import { significanceSpine } from '../src/perceiver/index.js';
import { retrieveStructural } from '../src/retrieve/structural.js';

// The significance spine (surfing-next.md §1) — the document read at DOCUMENT SCALE, so a
// whole-document task is built from the lines where the reading turned, not an even stride
// of arbitrary ones. It rides the surf's own Bayesian-surprise scalar across the whole
// text, bounded by a sampling stride so the cost stays flat on a long document.

const STORY = '# Doc\n' +
  'The office opened as usual. Papers were filed. The clerk sorted the mail. Routine held all morning. ' +
  'A courier arrived with a sealed crate nobody had ordered. The crate was opened and the room changed. ' +
  'Work stopped. The records were sealed. Filing resumed days later. The clerk sorted the mail again.';

test('the spine returns document-scale turning points in reading order', () => {
  const doc = parseText(STORY, { docId: 'd.md' });
  const spine = significanceSpine(doc, { k: 5 });
  assert.ok(spine.peaks.length > 0 && spine.peaks.length <= 5, 'at most k peaks');
  assert.deepEqual(spine.peaks, [...spine.peaks].sort((a, b) => a - b), 'peaks come back in reading order');
  assert.equal(spine.units, (doc.units || doc.sentences).length, 'reports the document length');
  assert.ok(spine.sampled > 0, 'it actually read the document');
});

test('the spine is bounded by a budget — long documents read on a stride, not in full', () => {
  // 4000 trivial units; budget 200 → stride 20 → ~200 readings, not 4000.
  const big = parseText(Array.from({ length: 4000 }, (_, i) => `Line number ${i} states a fact.`).join(' '),
    { docId: 'big.md' });
  const spine = significanceSpine(big, { budget: 200, k: 12 });
  assert.ok(spine.stride >= 20, `the stride scales with length (${spine.stride})`);
  assert.ok(spine.sampled <= 220, `the work is bounded by the budget (${spine.sampled} readings)`);
});

test('the spine is pure and memoised — same doc, same answer, identity-cached', () => {
  const doc = parseText(STORY, { docId: 'd.md' });
  const a = significanceSpine(doc, { k: 5 });
  const b = significanceSpine(doc, { k: 5 });
  assert.deepEqual(a.peaks, b.peaks, 'deterministic on the same document');
  assert.equal(a, b, 'the second call returns the cached object (memoised by identity)');
});

test('retrieveStructural ranks the spine turning points above the generic stride, opening still leads', () => {
  const doc = parseText(STORY, { docId: 'd.md' });
  const spans = retrieveStructural(doc, 8);
  assert.equal(spans[0].idx, 0, 'the opening still takes the primacy slot');
  // The body now carries spine peaks (0.55) which outrank the even stride (0.5).
  const spine = significanceSpine(doc, { k: 8 });
  const bodyScores = new Map(spans.map(s => [s.idx, s.score]));
  const peakInBody = spine.peaks.find(i => bodyScores.has(i) && bodyScores.get(i) === 0.55);
  assert.ok(peakInBody != null, 'a spine turning point rides the structural read at the turning-point score');
});

test('a document with no measured surprise still gets a representative spread (graceful fallback)', () => {
  // A single short line — nothing to turn on; the even spread alone must still deliver body.
  const doc = parseText('One short opening line and nothing more to say here.', { docId: 'tiny.md' });
  const spans = retrieveStructural(doc, 6);
  assert.ok(spans.length > 0, 'never empty on a non-empty document');
  assert.equal(spans[0].idx, 0, 'the opening leads');
});

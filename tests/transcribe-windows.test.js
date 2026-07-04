import { test } from 'node:test';
import assert from 'node:assert/strict';

import { _transcribeWindows } from '../src/reader/import-file.js';

// The live, windowed transcription: whisper is run one ~30s window at a time so the
// transcript can be watched filling in. These pin the parts that have no model — the
// per-window time offset back to the absolute clock, the overlap dedup, the progress
// percentage, and the accumulated text — using a mock ASR that answers by window.

const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

// A mock whisper: each call answers for the next window. Timestamps are RELATIVE to the
// segment it was handed, exactly as the real pipeline returns them. Window 1 re-hears the
// word at the boundary (the overlap) — the dedup must drop it, not double it.
function mockAsr(windows) {
  let n = 0;
  return async () => {
    const chunks = (windows[n++] || []).map(([a, b, text]) => ({ timestamp: [a, b], text }));
    return { text: chunks.map(c => c.text).join(' '), chunks };
  };
}

test('windows are stitched onto the absolute clock, overlaps deduped, progress reported', async () => {
  const SR = 100, duration = 60;                 // small numbers; windows are [0,30] [25,55] [50,60]
  const mono = new Float32Array(duration * SR);
  const asr = mockAsr([
    [[0, 1, 'alpha'], [28, 29, 'bravo']],        // window @0
    [[3, 4, 'bravo'], [10, 11, 'charlie']],      // window @25 → abs 28-29 (dup), 35-36
    [[5, 6, 'delta']],                           // window @50 → abs 55-56
  ]);
  const seen = [];
  const { utterances, text } = await _transcribeWindows(asr, mono, SR, duration, norm, { onPartial: (p) => seen.push(p) });

  const words = utterances.flatMap(u => u.words);
  assert.deepEqual(words.map(w => w.text), ['alpha', 'bravo', 'charlie', 'delta']);   // the duplicate bravo is gone
  // Times are absolute (offset by the window start), not relative to the segment.
  assert.deepEqual(words.map(w => [w.start, w.end]), [[0, 1], [28, 29], [35, 36], [55, 56]]);
  assert.equal(text, 'alpha bravo charlie delta');

  // A partial fired per window, monotonic pct, ending at 100.
  assert.equal(seen.length, 3);
  assert.deepEqual(seen.map(p => p.pct), [50, 92, 100]);
  assert.equal(seen[0].text, 'alpha bravo');
  assert.equal(seen[2].text, 'alpha bravo charlie delta');
});

test('a clip shorter than the window is a single pass that finishes at 100%', async () => {
  const SR = 100, duration = 8;
  const mono = new Float32Array(duration * SR);
  const asr = mockAsr([[[0, 1, 'hello'], [2, 3, 'world']]]);
  const seen = [];
  const { text } = await _transcribeWindows(asr, mono, SR, duration, norm, { onPartial: (p) => seen.push(p) });
  assert.equal(text, 'hello world');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].pct, 100);
});

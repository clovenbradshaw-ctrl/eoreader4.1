import { test } from 'node:test';
import assert from 'node:assert/strict';

import { frameAt, SITES } from '../src/write/frame.js';
import { createFold } from '../src/write/fold.js';

// The Streaming Answer §8 — the piece-grain frame: each beat's site, MEASURED off
// the field, never declared. Ground while terrain is laid, Figure at the surfer's
// peak (the turn), Pattern after it and at a REC. The talker never sees the site.

// A surfer reading with a clear peak at idx 4 and a frame break (REC) at idx 6.
const SURF = {
  stops: [0, 2, 4, 6],
  peak: 4,
  recCursors: [6],
  field: [
    { idx: 0, bayes: 0.10 }, { idx: 1, bayes: 0.10 }, { idx: 2, bayes: 0.20 },
    { idx: 3, bayes: 0.10 }, { idx: 4, bayes: 0.90 }, { idx: 5, bayes: 0.10 },
    { idx: 6, bayes: 0.30 },
  ],
};

const fullFold = () => {
  const f = createFold();
  f.appear('a'); f.appear('b');     // some integral mass — terrain laid
  return f;
};

test('the trajectory is read off the peak: Ground → Figure (the turn) → Pattern', () => {
  const fold = fullFold();
  const sites = SURF.stops.map((stop, i) => frameAt(fold, SURF, stop, i, SURF.stops.length).site);
  assert.deepEqual(sites, ['Ground', 'Ground', 'Figure', 'Pattern'],
    'opening beats establish, the steepest stop is the move, the close draws across');
});

test('the steepest stop measures into Figure; a REC measures into Pattern', () => {
  const fold = fullFold();
  assert.equal(frameAt(fold, SURF, 4, 2, 4).site, SITES[1], 'the surfer peak is the Figure');
  assert.equal(frameAt(fold, SURF, 6, 3, 4).site, SITES[2], 'a frame break is drawn across — Pattern');
});

test('a flat field holds at no-commit — the neutral posture, the frame\'s VOID (§8)', () => {
  const fold = fullFold();
  const flat = { stops: [0, 1], peak: 0, recCursors: [], field: [{ idx: 0, bayes: 0.1 }, { idx: 1, bayes: 0.1 }] };
  const frame = frameAt(fold, flat, 0, 0, 2);
  assert.equal(frame.site, null, 'no shape is read into a flat reach');
  assert.equal(frame.committed, false);
  assert.equal(frame.posture, 'narrative', 'falls back to a neutral posture');
});

test('the talker never sees the site — the target is plain words, no label (§8)', () => {
  const fold = fullFold();
  for (let i = 0; i < SURF.stops.length; i++) {
    const frame = frameAt(fold, SURF, SURF.stops[i], i, SURF.stops.length);
    assert.ok(frame.target && frame.target.length > 0, 'a plain-words target is handed to the cursor');
    assert.doesNotMatch(frame.target, /Ground|Figure|Pattern|NUL|INS|CON|SYN|REC|EVA|DEF|SIG|SEG/,
      'no site name and no operator code reaches the talker');
  }
});

test('thin terrain opens in Ground even at the start', () => {
  const empty = createFold();          // no mass yet — terrain is still being laid
  assert.equal(frameAt(empty, SURF, 0, 0, 4).site, 'Ground');
});

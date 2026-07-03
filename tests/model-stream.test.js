import { test } from 'node:test';
import assert from 'node:assert/strict';

import { streamPhrase, surfaceTokens, emitSurface } from '../src/model/stream.js';
import { createModel } from '../src/model/interface.js';
import '../src/model/echo.js';
import { EXCERPTS_HEADER } from '../src/model/prompt.js';

// The Streaming Answer §3a, §5 — phrase's streaming sibling. A backend that can
// decode token-by-token emits through `onToken`; one that cannot falls back to
// draw-then-emit. Either way the live surface concatenates to the returned beat.

test('surfaceTokens splits losslessly — the pieces concatenate to the original', () => {
  const s = 'Gregor turns toward Grete. She withdraws.';
  assert.equal(surfaceTokens(s).join(''), s, 'whitespace runs are kept as their own pieces');
  assert.deepEqual(surfaceTokens(''), []);
});

test('emitSurface streams every piece and returns the text unchanged', () => {
  const seen = [];
  const out = emitSurface('a flowing answer', (t) => seen.push(t));
  assert.equal(out, 'a flowing answer');
  assert.equal(seen.join(''), 'a flowing answer', 'the stream reconstructs the beat');
  // No callback → no throw, text returned.
  assert.equal(emitSurface('untouched'), 'untouched');
});

test('streamPhrase over a streaming backend emits tokens that rebuild the beat (§3a)', async () => {
  const model = createModel('echo');
  await model.load();
  const messages = [{ role: 'user', content: `${EXCERPTS_HEADER}\nGrete set down the bowl of milk.` }];

  const seen = [];
  const text = await streamPhrase(model, messages, { onToken: (t) => seen.push(t) });
  assert.ok(text.length > 0, 'the beat is drawn');
  assert.ok(seen.length > 1, 'the echo backend surfaced more than one token');
  assert.equal(seen.join(''), text, 'the live surface is exactly the returned beat');
});

test('streamPhrase falls back to draw-then-emit on a non-streaming backend (§5)', async () => {
  // A backend that ignores onToken — the present golden path. The whole drawn beat
  // is emitted once; the loss is latency, never a token.
  const drawOnly = { async phrase() { return 'one whole sentence, drawn at once.'; } };
  const seen = [];
  const text = await streamPhrase(drawOnly, [], { onToken: (t) => seen.push(t) });
  assert.equal(text, 'one whole sentence, drawn at once.');
  assert.deepEqual(seen, ['one whole sentence, drawn at once.'], 'emitted whole, exactly once');
});

test('streamPhrase with no onToken is the plain phrase() draw', async () => {
  const drawOnly = { async phrase() { return 'plain.'; } };
  assert.equal(await streamPhrase(drawOnly, []), 'plain.');
});

// Cancellation (the Stop button): streamPhrase forwards the caller's AbortSignal to the
// backend's phrase, so a backend that honours it can halt the decode and return the partial.
test('streamPhrase forwards the AbortSignal to the backend phrase()', async () => {
  let sawSignal = null;
  const spy = { async phrase(_m, opts) { sawSignal = opts.signal; return 'x'; } };
  const ctl = new AbortController();
  await streamPhrase(spy, [], { signal: ctl.signal });
  assert.equal(sawSignal, ctl.signal, 'the signal reaches the backend');
});

test('a signal-aware backend stops streaming and returns the partial beat', async () => {
  // A backend shaped like webllm/onnx/wllama: it emits token by token and stops the
  // moment the signal aborts, returning only what decoded before the halt.
  const ctl = new AbortController();
  const signalAware = {
    async phrase(_m, opts) {
      const pieces = ['one ', 'two ', 'three ', 'four'];
      let text = '';
      for (const p of pieces) {
        text += p; opts.onToken?.(p);
        if (text.includes('two')) ctl.abort();   // the user presses Stop mid-stream
        if (opts.signal?.aborted) break;
      }
      return text.trim();
    },
  };
  const seen = [];
  const out = await streamPhrase(signalAware, [], { onToken: (t) => seen.push(t), signal: ctl.signal });
  assert.equal(out, 'one two', 'only the tokens before the abort are kept');
  assert.equal(seen.join(''), 'one two ', 'the live surface stops with the decode');
});

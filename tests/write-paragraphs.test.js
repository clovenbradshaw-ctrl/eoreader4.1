import { test } from 'node:test';
import assert from 'node:assert/strict';

import { streamParagraphs, CONTINUE_CUE } from '../src/write/paragraphs.js';
import { emitSurface } from '../src/model/stream.js';

// The paragraph loop (write/paragraphs.js): the model is trusted with the fold's
// content and answers one paragraph per call; the boundary gate keeps the visible
// stream byte-identical to the returned draft, holds DONE back from the surface,
// closes a paragraph at its first blank line, and drops a cap-cut fragment before
// it is ever shown.

const MESSAGES = [
  { role: 'system', content: 'You are the voice of a reader.' },
  { role: 'user',   content: 'What I found reading it:\nAlice met Bob.\n\nThey asked you: what happened?' },
];

// A scripted streaming backend: emits each reply token by token (emitSurface), one
// reply per call, recording the messages each call received.
const scripted = (outputs) => {
  const calls = [];
  return {
    id: 'scripted',
    calls,
    async phrase(messages, opts = {}) {
      calls.push(messages);
      const text = outputs[Math.min(calls.length - 1, outputs.length - 1)];
      return emitSurface(text, opts.onToken);
    },
  };
};

test('paragraphs accumulate one call at a time; DONE closes the answer unstreamed', async () => {
  const model = scripted(['Alpha one. Alpha two.', 'Beta one. Beta two.', 'DONE']);
  const emitted = [];
  const out = await streamParagraphs({ model, messages: MESSAGES, onToken: (t) => emitted.push(t) });
  assert.equal(out.draft, 'Alpha one. Alpha two.\n\nBeta one. Beta two.');
  assert.deepEqual([...out.paragraphs], ['Alpha one. Alpha two.', 'Beta one. Beta two.']);
  assert.equal(out.done, true, 'the model closed its own answer');
  assert.equal(emitted.join(''), out.draft, 'the visible stream IS the draft — DONE never reached the surface');
});

test('the continuation rides as the model\'s own assistant turn plus the cue', async () => {
  const model = scripted(['Alpha one. Alpha two.', 'DONE']);
  await streamParagraphs({ model, messages: MESSAGES });
  assert.equal(model.calls.length, 2);
  assert.deepEqual(model.calls[0], MESSAGES, 'the first call is the turn\'s grounded prompt, untouched');
  const second = model.calls[1];
  assert.equal(second[second.length - 2].role, 'assistant');
  assert.equal(second[second.length - 2].content, 'Alpha one. Alpha two.', 'the answer so far is the model\'s turn');
  assert.equal(second[second.length - 1].content, CONTINUE_CUE);
});

test('a blank line closes the paragraph — nothing past it is streamed or kept', async () => {
  const model = scripted(['First stays. Also this.\n\nThis leaks nowhere.', 'DONE']);
  const emitted = [];
  const out = await streamParagraphs({ model, messages: MESSAGES, onToken: (t) => emitted.push(t) });
  assert.equal(out.draft, 'First stays. Also this.');
  assert.equal(emitted.join(''), out.draft);
});

test('a fragment the token cap cut mid-sentence is dropped before it is shown', async () => {
  const model = scripted(['Whole sentence lands. And then the cap cut this fragm', 'DONE']);
  const emitted = [];
  const out = await streamParagraphs({ model, messages: MESSAGES, onToken: (t) => emitted.push(t) });
  assert.equal(out.draft, 'Whole sentence lands.');
  assert.equal(emitted.join(''), out.draft, 'the fragment was never forwarded');
});

test('a repeated opener halts the loop — the model looping is a stop, not a stutter', async () => {
  const model = scripted(['Loop me. Extra.', 'Loop me. Extra.']);
  const emitted = [];
  const out = await streamParagraphs({ model, messages: MESSAGES, onToken: (t) => emitted.push(t) });
  assert.deepEqual([...out.paragraphs], ['Loop me. Extra.']);
  assert.equal(emitted.join(''), out.draft, 'the repeat was never streamed');
});

test('DONE on the first call → null, and the caller falls back to the one-shot draw', async () => {
  const model = scripted(['DONE']);
  const emitted = [];
  const out = await streamParagraphs({ model, messages: MESSAGES, onToken: (t) => emitted.push(t) });
  assert.equal(out, null);
  assert.equal(emitted.length, 0, 'nothing reached the surface');
});

test('a draw-then-emit backend (no token stream) still upholds the invariant', async () => {
  let n = 0;
  const outputs = ['One whole paragraph, drawn at once.', 'DONE'];
  const model = { id: 'plain', async phrase() { return outputs[Math.min(n++, outputs.length - 1)]; } };
  const emitted = [];
  const out = await streamParagraphs({ model, messages: MESSAGES, onToken: (t) => emitted.push(t) });
  assert.equal(out.draft, 'One whole paragraph, drawn at once.');
  assert.equal(emitted.join(''), out.draft, 'the whole paragraph was emitted once (draw-then-emit)');
});

test('the budget caps the paragraph count — no call is made past the cap', async () => {
  const model = scripted(['One. Two.', 'Never asked for.']);
  const out = await streamParagraphs({ model, messages: MESSAGES, budget: 128 });
  assert.equal(model.calls.length, 1, 'budget 128 → a single paragraph');
  assert.deepEqual([...out.paragraphs], ['One. Two.']);
});

test('an aborted signal returns the paragraphs so far, marked stopped', async () => {
  const ctrl = new AbortController();
  const model = {
    id: 'abortable',
    calls: 0,
    async phrase(messages, opts = {}) {
      this.calls += 1;
      const text = 'A paragraph before the stop.';
      emitSurface(text, opts.onToken);
      ctrl.abort();          // the user hits Stop after the first paragraph decoded
      return text;
    },
  };
  const out = await streamParagraphs({ model, messages: MESSAGES, signal: ctrl.signal });
  assert.equal(out.stopped, true);
  assert.deepEqual([...out.paragraphs], ['A paragraph before the stop.']);
  assert.equal(model.calls, 1, 'no further paragraph was drawn after the stop');
});

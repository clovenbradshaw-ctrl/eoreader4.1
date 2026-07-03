// The conversation cast as a DEF→EVA→REC cycle (converse/cast.js). The unit behaviour: the live
// read wins, a settled referent carries forward ONLY when the live read is null and the topic is
// still warm, and a referent is settled ONLY when the fold concentrated on it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseText } from '../src/perceiver/parse/index.js';
import { createCast } from '../src/converse/cast.js';

const KIN = `Gregor Samsa woke from troubled dreams. His sister Grete looked after him.
Grete was Gregor's sister. The mother wept. Gregor's sister played the violin.`;
const docOf = () => parseText(KIN, { docId: 'd', genderCoref: true });

test('EVA: a resolved live read always wins, untouched (carried:false)', () => {
  const cast = createCast();
  const doc = docOf();
  const refTarget = { id: 'grete', label: 'Grete', locale: 1 };
  const out = cast.evaluate({ doc, history: [], question: 'who is she?', refTarget });
  assert.equal(out.id, 'grete');
  assert.equal(out.carried, false);
});

test('REC: a CONCENTRATED fold settles the target; a diffuse one settles nothing', () => {
  const cast = createCast();
  cast.reconcile({ id: 'gregor-samsa', label: 'Gregor Samsa', concentrated: false });
  assert.equal(cast.snapshot().settled.length, 0, 'diffuse fold commits nothing');
  cast.reconcile({ id: 'gregor-samsa', label: 'Gregor Samsa', concentrated: true });
  assert.equal(cast.snapshot().settled.length, 1, 'concentrated fold settles the referent');
  assert.equal(cast.snapshot().settled[0].label, 'Gregor Samsa');
});

test('EVA: a NULL live read carries forward a settled referent the conversation still holds', () => {
  const cast = createCast();
  const doc = docOf();
  // Turn 1 settled Gregor (concentrated).
  cast.reconcile({ id: 'gregor-samsa', label: 'Gregor Samsa', locale: 0, concentrated: true });
  // Turn 2: a thin follow-up the live read could not resolve, but Gregor is still warm in the thread.
  const history = [{ role: 'user', content: 'who is Gregor Samsa?' }];
  const out = cast.evaluate({ doc, history, question: 'tell me more', refTarget: null });
  assert.ok(out, 'a referent is carried, not null');
  assert.equal(out.id, 'gregor-samsa');
  assert.equal(out.carried, true);
});

test('EVA: a settled referent the conversation has DROPPED is not carried (no stale stickiness)', () => {
  const cast = createCast();
  const doc = docOf();
  cast.reconcile({ id: 'gregor-samsa', label: 'Gregor Samsa', concentrated: true });
  // The thread no longer names Gregor at all — a fresh, unrelated thin turn.
  const out = cast.evaluate({ doc, history: [{ role: 'user', content: 'the violin' }], question: 'what about it', refTarget: null });
  // Gregor is not warm here → it must NOT be carried (returns the null live read).
  assert.ok(!out || out.id !== 'gregor-samsa', 'a dropped referent does not stick');
});

test('the most RECENTLY settled warm referent wins the carry-forward', () => {
  const cast = createCast();
  const doc = docOf();
  cast.reconcile({ id: 'gregor-samsa', label: 'Gregor Samsa', concentrated: true });
  cast.reconcile({ id: 'grete', label: 'Grete', concentrated: true });
  // A thread that warms BOTH referents (verified against conversationCast).
  const history = [
    { role: 'user', content: 'Tell me about Gregor Samsa.' },
    { role: 'assistant', content: 'Grete is his sister.' },
    { role: 'user', content: 'What about Grete?' },
  ];
  const out = cast.evaluate({ doc, history, question: 'and?', refTarget: null });
  assert.equal(out.id, 'grete', 'the later-settled referent is preferred');
});

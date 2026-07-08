import { test } from 'node:test';
import assert from 'node:assert/strict';

import { selfRead, walk } from '../src/longgen/index.js';
import { createModel } from '../src/model/interface.js';
import '../src/model/echo.js';

// The same falcons fold the walk tests read — every span developable, every
// sentence period-terminated, so echo phrases slices back verbatim.
const foldOf = () => ([
  { idx: 0, score: 0.95, text: 'The peregrine falcon reaches speeds over three hundred kilometres per hour in its stoop.' },
  { idx: 1, score: 0.90, text: 'Falcons show a marked affinity for tall cliffs away from human establishments.' },
  { idx: 2, score: 0.85, text: 'The peregrine has a body length of thirty-four to fifty-eight centimetres.' },
  { idx: 3, score: 0.70, text: 'The Latin term for falcon is related to falx, meaning a curved sickle.' },
  { idx: 4, score: 0.65, text: 'The ancient Egyptian sun deity was often shown with the head of a falcon.' },
  { idx: 5, score: 0.60, text: 'A falcon delivers a knockout blow with a clenched talon against larger prey.' },
]);

// ── the weld verdict, sentence by sentence ──────────────────────────────────────

test('a faithful paragraph passes the weld untouched', () => {
  const pool = foldOf();
  const slice = pool.slice(0, 3);
  const text = slice.map(s => s.text).join(' ');
  const v = selfRead(text, { slice, pool });
  assert.equal(v.action, 'accept');
  assert.equal(v.fired, false);
  assert.equal(v.text, text);
});

test('a quantity the slice never served is struck (the number signal)', () => {
  const pool = foldOf();
  const slice = pool.slice(0, 2);
  const drifted = slice[0].text + ' ' + slice[1].text +
    ' The peregrine falcon reaches speeds over five hundred kilometres per hour in its stoop.';
  const v = selfRead(drifted, { slice, pool });
  assert.equal(v.action, 'splice');
  const struck = v.spans.filter(s => s.fired);
  assert.equal(struck.length, 1);
  assert.ok(struck[0].reasons.includes('number'), 'the foreign magnitude is the reason');
  assert.ok(!v.text.includes('five hundred'), 'the drifted sentence is gone from the welded text');
  assert.ok(v.text.includes(slice[0].text), 'the faithful opening survives');
});

test('a sentence with no contact anywhere in the fold is struck (the refold signal)', () => {
  const pool = foldOf();
  const slice = pool.slice(0, 2);
  const drifted = slice[0].text +
    ' Quantum senators debated orbital tariffs beneath the glass parliament.';
  const v = selfRead(drifted, { slice, pool });
  assert.equal(v.action, 'splice');
  const struck = v.spans.filter(s => s.fired);
  assert.equal(struck.length, 1);
  assert.ok(struck[0].reasons.includes('refold'), 'contamination binds nowhere in the fold');
});

test('content from elsewhere in the fold is NOT struck — the fold is the situation', () => {
  const pool = foldOf();
  const slice = pool.slice(0, 2);
  // A sentence lifted from a DIFFERENT slice of the same fold: the refold signal
  // binds it (it is inside the situation), and no foreign quantity rides on it.
  const offSlice = slice.map(s => s.text).join(' ') + ' ' + pool[4].text;
  const v = selfRead(offSlice, { slice, pool });
  const refoldStruck = v.spans.filter(s => s.fired && s.reasons.includes('refold'));
  assert.equal(refoldStruck.length, 0, 'in-fold content is never contamination');
});

test('a short connective is never struck by refold (the content-term floor)', () => {
  const pool = foldOf();
  const slice = pool.slice(0, 2);
  const text = slice[0].text + ' And then it was over.';
  const v = selfRead(text, { slice, pool });
  const struck = v.spans.filter(s => s.fired && s.reasons.includes('refold'));
  assert.equal(struck.length, 0, 'a connective binds nowhere without being drift');
});

test('a paragraph that is drift end to end is rejected, not trimmed to nothing', () => {
  const pool = foldOf();
  const slice = pool.slice(0, 2);
  const v = selfRead(
    'Quantum senators debated orbital tariffs beneath the glass parliament. ' +
    'The colony numbered forty thousand at dusk.',
    { slice, pool });
  assert.equal(v.action, 'reject');
  assert.equal(v.text, '');
});

test('the known blind spot stays on the record: a bare polarity flip passes', () => {
  const pool = foldOf();
  const slice = pool.slice(0, 2);
  const flipped = slice[0].text.replace(' reaches ', ' never reaches ') + ' ' + slice[1].text;
  const v = selfRead(flipped, { slice, pool });
  // The measurement (docs/self-read-weld-measurement.md) found no read-only organ
  // that discriminates negation. If this ever starts firing, a new organ landed —
  // update the doc and retire this expectation deliberately, not silently.
  assert.equal(v.action, 'accept');
});

// ── the weld inside the walk ────────────────────────────────────────────────────

// A talker that echoes its slice and then drifts: the drifted sentence borrows the
// anchor's own words (so the birth gate binds it — lexical contact is high) while
// moving the magnitude. Exactly the drift the Step 0 measurement showed rides
// through bindAndVeto untouched.
const driftingModel = (drift) => ({
  id: 'drift', kind: 'test', isLoaded: () => true,
  async load() {},
  async phrase(messages) {
    const user = String(messages[messages.length - 1]?.content || '');
    // Continue the seed with the next slice line if present, then drift.
    const line = user.split('\n').map(s => s.trim()).find(s => /falcon|peregrine/i.test(s) && /\.$/.test(s)) || '';
    return `${line} ${drift}`.trim();
  },
});

test('the walk strikes drifted sentences before they join the document', async () => {
  const drift = 'The peregrine falcon reaches speeds over five hundred kilometres per hour in its stoop.';
  const res = await walk({
    fold: foldOf(), design: { demand: 2, question: 'falcons' },
    model: driftingModel(drift),
  });
  assert.ok(res.paragraphs.length >= 1, 'the walk still produces');
  for (const p of res.paragraphs) {
    assert.ok(!p.text.includes('five hundred'), 'no drifted magnitude reaches an accepted paragraph');
  }
  assert.ok(res.trace.some(t => t.weldStruck >= 1 || t.weld),
    'the trace records the weld firing');
  // The drifted sentence never becomes the prior: the walk's answer is clean.
  assert.ok(!res.answer.includes('five hundred'));
});

test('selfRead: false restores the birth gate alone (the drift ships)', async () => {
  const drift = 'The peregrine falcon reaches speeds over five hundred kilometres per hour in its stoop.';
  const res = await walk({
    fold: foldOf(), design: { demand: 2, question: 'falcons' },
    model: driftingModel(drift), selfRead: false,
  });
  assert.ok(res.answer.includes('five hundred'),
    'without the weld the birth gate alone passes the drifted magnitude — the measured gap');
});

test('the echo walk is unchanged by the weld (no false strikes on faithful prose)', async () => {
  const model = createModel('echo');
  await model.load();
  const on = await walk({ fold: foldOf(), design: { demand: 3, question: 'falcons' }, model });
  const off = await walk({ fold: foldOf(), design: { demand: 3, question: 'falcons' }, model: createModel('echo'), selfRead: false });
  assert.equal(on.answer, off.answer, 'weld on and off agree on faithful output');
  assert.ok(!on.trace.some(t => t.weldStruck || t.weld), 'the weld never fires on faithful prose');
});

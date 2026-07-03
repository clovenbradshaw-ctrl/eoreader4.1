import { test } from 'node:test';
import assert from 'node:assert/strict';

import { spurt, surfDraft, draftSurprise, writeLoop, stubModel } from '../src/write/spurt.js';
import { buildCursor } from '../src/write/cursor.js';
import { createFold } from '../src/write/fold.js';
import { HASHID_RE } from '../src/core/index.js';

// SPEC §6 — the renderer and the spurt loop. The stub backend stands in for
// model.phrase (contract.mjs): swap createModel('wllama') and nothing above the
// membrane changes.

test('surfDraft fires only on RESOLVABLE surprise — the noisy-TV guard (§6)', () => {
  const spike = surfDraft([0, 0, 0, 5, 0, 0, 0]);
  assert.equal(spike.fires, true, 'a clear structural turn fires a generation-grain REC');
  assert.equal(spike.at, 3, 'at the spike');

  // a flat draft has no resolvable surprise — the guard keeps the surfer from going numb
  assert.equal(surfDraft([1, 1, 1, 1, 1]).fires, false);
  // too short to derive a null → no fire (abstain, never force)
  assert.equal(surfDraft([1, 2]).fires, false);
});

test('draftSurprise is the coarse, universal text-grain proxy (§6 phrase-only fallback)', () => {
  const s = draftSurprise('Gregor woke calm. A vermin sprawled where a man had slept.');
  assert.ok(Array.isArray(s) && s.length >= 1);
  assert.equal(s[0], 0, 'the first clause has nothing before it to shift from');
  assert.equal(draftSurprise('one clause only').length, 1);
});

test('spurt renders a beat and reads its own seam; the output is pure surface (§6)', async () => {
  const fold = createFold();
  fold.register('r#001', { head: 'Gregor Samsa', pron: { subj: 'he', obj: 'him' } });
  fold.register('r#002', { head: 'Grete', pron: { subj: 'she', obj: 'her' } });
  fold.appear('r#001'); fold.appear('r#002');
  const cell = { id: 'c_tends', op: 'CON', args: ['r#002', 'r#001'], edge: 'tends', target: 'one sentence' };
  const cursor = buildCursor(cell, fold, [], { resolution: 'firm' });

  const out = await spurt(cursor, stubModel());
  assert.equal(typeof out.text, 'string');
  assert.equal(HASHID_RE.test(out.text), false, 'the model never emits a hashId');
  assert.ok(out.seam, 'the spurt carries its own seam reading');
});

test('the write loop folds the spine: schedule → cursor → spurt → witness → fold advance (§6)', async () => {
  const fold = createFold();
  fold.register('r#001', { head: 'Gregor Samsa', pron: { subj: 'he', obj: 'him' } });
  fold.register('r#002', { head: 'Grete', pron: { subj: 'she', obj: 'her' } });

  const cells = [
    { id: 'r#001', op: 'INS', site: 'r#001' },
    { id: 'r#002', op: 'INS', site: 'r#002' },
    { id: 'c_tends', op: 'CON', args: ['r#002', 'r#001'], edge: 'tends', deps: ['r#001', 'r#002'],
      spans: [{ idx: 312, text: 'It was Grete who set down the bowl of milk and withdrew to the door.' }],
      target: 'one plain past-tense sentence' },
  ];

  const result = await writeLoop(cells, { fold, model: stubModel(), posture: 'narrative' });

  assert.equal(result.beats.length, 3, 'one beat per cell');
  assert.deepEqual(result.order, ['r#001', 'r#002', 'c_tends'], 'the scheduled spine');
  assert.equal(HASHID_RE.test(result.draft), false, 'no hashId leaks into the whole draft');

  // the fold advanced — both figures are on the frontier after the loop
  assert.ok(fold.has('r#001') && fold.has('r#002'), 'INS-by-appearance advanced the frontier');

  // the witness ran on the relation beat and bound the output back to the cursor Sites
  const tends = result.beats.find(b => b.cellId === 'c_tends');
  assert.deepEqual([...tends.witness.bound].sort(), ['r#001', 'r#002']);
});

test('writeLoop requires a fold; the stub never leaks a hashId', async () => {
  await assert.rejects(() => writeLoop([], {}), /a fold .* is required/);
  const text = await stubModel().phrase([{ role: 'user', content: 'Subject: Grete\nObject: Gregor Samsa\n  Grete -> Gregor Samsa : tends' }]);
  assert.equal(HASHID_RE.test(text), false);
});

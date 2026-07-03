import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runGate, VOID_TOKEN } from '../src/enactor/gate.js';
import { EFFERENCE, efferenceCopy, efferenceCopiesOf, propKey } from '../src/enactor/index.js';

// Add-on 3 §3: output is not terminal. At commitment the core generates an
// EFFERENCE COPY — the predicted sensed-consequence of the commit, indexed to it
// and held outstanding for the monitor. The skeleton prediction is identity:
// committing P, I predict I will sense P return. The copy carries the
// proposition's IDENTITY (propKey), the thing the monitor matches against, and is
// modality-blind (the organ is provenance only).

const prop = (subj, rel, obj, amplitude = 0.4) =>
  ({ kind: 'rel', op: 'CON', subj, rel, obj, amplitude, status: 'support' });
const cand = (surface, svo, modelAmplitude = 0.9) => ({ surface, svo, modelAmplitude });

test('an efference copy predicts the committed proposition returning, indexed to the commit', () => {
  const p = { kind: 'rel', op: 'CON', subj: 'grete', rel: 'opened', obj: 'window' };
  const copy = efferenceCopy(p, 7, { modality: 'speech' });
  assert.equal(copy.kind, EFFERENCE);
  assert.equal(copy.commitId, 7, 'indexed to this commit');
  assert.equal(copy.predicted, propKey(p), 'predicts the proposition itself returning (identity skeleton)');
  assert.equal(copy.status, 'outstanding', 'held until the monitor matches it');
  assert.equal(copy.modality, 'speech', 'organ is provenance only');
  assert.ok(Object.isFrozen(copy));
});

test('efferenceCopiesOf casts one copy per commit, indexed in order with a start offset', () => {
  const committed = [
    { svo: prop('grete', 'opened', 'window') },
    { svo: prop('gregor', 'loved', 'grete') },
  ];
  const copies = efferenceCopiesOf(committed, { startId: 10 });
  assert.deepEqual(copies.map(c => c.commitId), [10, 11], 'a later turn does not collide with earlier outstanding copies');
  assert.deepEqual(copies.map(c => c.predicted),
    committed.map(c => propKey(c.svo)), 'each predicts its own commit returning');
});

test('the gate casts an efference copy at the moment a proposition collapses', async () => {
  const basis = {
    props: [prop('grete', 'opened', 'window')],
    question: { targetProps: [{ kind: 'rel', op: 'CON', subj: 'grete', rel: 'opened', obj: 'window' }] },
    void: [],
  };
  const svo = { kind: 'rel', op: 'CON', subj: 'grete', rel: 'opened', obj: 'window' };
  const r = await runGate([cand('Grete opened the window.', svo)], basis, { alpha: 0.05, modality: 'speech' });

  assert.equal(r.committed.length, 1, 'one proposition committed');
  assert.equal(r.efference.length, 1, 'one efference copy, born with the commit');
  assert.equal(r.efference[0].commitId, 0, 'indexed to the commit');
  assert.equal(r.efference[0].predicted, propKey(svo), 'predicts what was committed');
  assert.equal(r.efference[0].modality, 'speech');
});

test('a VOID commits nothing and so casts no efference copy', async () => {
  const basis = {
    props: [prop('grete', 'opened', 'window')],
    question: { targetProps: [{ kind: 'rel', op: 'CON', subj: 'gregor', rel: 'earns', obj: 'salary' }] },
    void: [],
  };
  const r = await runGate(
    [cand('Gregor earns a large salary.', { kind: 'rel', op: 'CON', subj: 'gregor', rel: 'earns', obj: 'salary' })],
    basis, { alpha: 0.05 });
  assert.equal(r.answer, VOID_TOKEN);
  assert.equal(r.committed.length, 0, 'nothing committed');
  assert.equal(r.efference.length, 0, 'absence casts no prediction of return');
});

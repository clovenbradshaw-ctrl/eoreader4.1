import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PERCEIVER, ENACTOR, DOORS, EXAFFERENCE, REAFFERENCE, READ_BACK,
  provenance, fromPerceiver, fromEnactor, reenter, classify,
  canOrient, canWitness, isReadBackOfPriorSelf, isMine,
  serializeProvenance, restoreProvenance, restoreOnReload,
} from '../src/core/provenance.js';

// SPEC §8 — me-ness as a type law, not a flag. Admissibility is a function of
// provenance; the witness READS it as a type, it does not run it as a policy.

test('the two doors and the constructor (§8)', () => {
  assert.deepEqual(DOORS, [PERCEIVER, ENACTOR]);
  assert.equal(fromPerceiver('ingest-1').door, PERCEIVER);
  assert.equal(fromEnactor('write-1').door, ENACTOR);
  assert.throws(() => provenance({ door: 'mouth' }), /unknown door/);
  assert.ok(Object.isFrozen(fromEnactor('x')));
});

test('the admissibility type law — exafference anchors, reafference cannot (§8 table)', () => {
  const ingest = fromPerceiver('ingest-1');
  const myOutput = fromEnactor('write-1');

  assert.equal(classify(ingest), EXAFFERENCE);
  assert.equal(classify(myOutput), REAFFERENCE);

  // continuity is open to all; only evidence is gated
  assert.ok(canOrient(ingest) && canOrient(myOutput));
  assert.ok(canWitness(ingest), 'exafference YES — anchors');
  assert.ok(!canWitness(myOutput), 'reafference NO — the model cannot witness its own claim');

  assert.ok(!isMine(ingest));
  assert.ok(isMine(myOutput));
});

test('the indexical hard edge — prior-self re-read now is read-back, never fresh world (§8)', () => {
  // generated THEN through the enactor door, reloaded NOW through the perceiver door
  const priorSelf = fromEnactor('session-7');
  const reread = reenter(priorSelf, { door: PERCEIVER, enactment: 'session-now' });

  assert.equal(reread.door, ENACTOR, 'keeps its ORIGIN door — provenance is never edited');
  assert.equal(reread.reentry.door, PERCEIVER, 'gains a reentry marking how it came back');
  assert.equal(classify(reread), READ_BACK);
  assert.ok(isReadBackOfPriorSelf(reread));

  // admissible for continuity, INADMISSIBLE as evidence, never silently promoted
  assert.ok(canOrient(reread));
  assert.ok(!canWitness(reread), 'a prior self reloaded as bare text must NOT launder forward');
  assert.ok(isMine(reread));
});

test('a re-read of a prior PERCEPTION is still world (origin door decides, not reentry) (§8)', () => {
  const priorWorld = fromPerceiver('ingest-old');
  const reread = reenter(priorWorld, { door: PERCEIVER, enactment: 'now' });
  assert.equal(classify(reread), EXAFFERENCE, 're-reading a prior perception stays exafferent');
  assert.ok(canWitness(reread));
});

test('provenance persists and restores on reload — not re-derived from the reload door (§8)', () => {
  const myOutput = fromEnactor('session-7');
  const raw = serializeProvenance(myOutput);              // durable record
  assert.deepEqual(raw, { door: ENACTOR, enactment: 'session-7' });

  const restored = restoreProvenance(raw);
  assert.equal(classify(restored), REAFFERENCE, 'restored as itself, not re-tagged');

  // the reload path: a durable prior-self record, loaded NOW through the perceiver
  // door, comes back read-back-of-prior-self — barred from witnessing.
  const reloaded = restoreOnReload(raw, { door: PERCEIVER, enactment: 'session-now' });
  assert.equal(classify(reloaded), READ_BACK);
  assert.ok(!canWitness(reloaded), 'the P6 gate: reload cannot launder a prior self into evidence');

  // a durable PERCEPTION reloads as still-citable world
  const worldRaw = serializeProvenance(fromPerceiver('doc-1'));
  assert.ok(canWitness(restoreOnReload(worldRaw, { door: PERCEIVER })));
});

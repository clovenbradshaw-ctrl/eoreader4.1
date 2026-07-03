import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createFold } from '../src/write/fold.js';
import { witness, rebind, groundedClaim, claimsOf } from '../src/write/witness.js';
import { fromEnactor, fromPerceiver } from '../src/core/index.js';

// SPEC §7 — the witness: rebind, source veto, type law. Independent of the renderer;
// it owns every factual bind.

const cast = () => {
  const fold = createFold();
  fold.register('r#001', { head: 'Gregor Samsa', pron: { subj: 'he', obj: 'him' } });
  fold.register('r#002', { head: 'Grete',        pron: { subj: 'she', obj: 'her' } });
  fold.register('r#003', { head: 'his mother',   pron: { subj: 'she', obj: 'her' } });  // a salient distractor
  fold.appear('r#001'); fold.appear('r#002'); fold.appear('r#003');
  return fold;
};
// the cursor handed Gregor + Grete (the integral for each, §5); mother was NOT handed
const expect = new Set(['r#001', 'r#002']);
const source = [{ idx: 312, text: 'It was Grete who, in those first weeks, set down the bowl of milk and withdrew to the door.' }];

test('7a outbound membrane: the output binds back to the cursor Sites (rebind round-trip)', () => {
  const r = rebind('Grete carried food to him.', cast());
  assert.deepEqual(r.bound.sort(), ['r#001', 'r#002'], 'surface → hashId: "Grete" and "him" rebind');
});

test('a referent never handed in is flagged — the coref wart the integral prevents (§5, §7)', () => {
  // the integral case: identity fixed, no stray referent
  const good = witness('Grete carried food to him.', expect, source, cast());
  assert.deepEqual(good.flagged, [], 'a clean beat flags nothing');

  // the bare-coref mis-bind cursor.mjs shows: "his mother" was never handed in
  const bad = witness('She brought food to his mother.', expect, source, cast());
  assert.ok(bad.flagged.includes('r#003'), '"his mother" ∉ expect → flagged immediately');
  assert.ok(!bad.ok, 'the witness verdict is not ok');
});

test('7b source veto: an ungrounded factual claim is retracted (§7)', () => {
  const r = witness('Grete set the bowl of milk down. Gregor inherited a great fortune.', expect, source, cast());
  assert.equal(r.kept.length, 1, 'the grounded claim survives');
  assert.match(r.kept[0], /bowl of milk/);
  assert.equal(r.retractions.length, 1, 'the ungrounded claim is retracted');
  assert.match(r.retractions[0].claim, /fortune/);
});

test('7c the type law: only EXAFFERENT source anchors — reafference cannot certify (§7, §8)', () => {
  const claim = 'Gregor inherited a great fortune.';
  // the SAME span as exafference (the document) grounds the claim
  const grounded = witness(claim, expect, [{ idx: 5, text: 'Gregor inherited a great fortune', prov: fromPerceiver('doc') }], cast());
  assert.equal(grounded.retractions.length, 0, 'an exafferent span anchors it');

  // the same span as REAFFERENCE (the model's own prior output, reloaded as "source")
  // cannot witness — it is filtered out of the anchoring set by its TYPE, not a policy
  const laundered = witness(claim, expect, [{ idx: 99, text: 'Gregor inherited a great fortune', prov: fromEnactor('write-1') }], cast());
  assert.equal(laundered.retractions.length, 1, 'me-content cannot ground me-content');
  assert.deepEqual(laundered.inadmissibleSource, [99], 'the reafferent span is surfaced as inadmissible');
});

test('7d pay the retraction: it is returned (logged + surfaced), never hidden (§7, §10)', () => {
  const r = witness('Gregor flew to the moon.', expect, source, cast());
  assert.ok(r.retractions.length >= 1);
  assert.ok('reason' in r.retractions[0], 'the retraction carries its reason — surfaced, not silent');
});

test('the default grounding is a content-word overlap; function-word claims ground trivially', () => {
  assert.ok(groundedClaim('the bowl of milk', source));
  assert.ok(!groundedClaim('a vast inherited fortune in Vienna', source));
  assert.deepEqual(claimsOf('One. Two; three.'), ['One.', 'Two', 'three.']);
});

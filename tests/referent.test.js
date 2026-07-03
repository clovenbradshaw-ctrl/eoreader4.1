import { test } from 'node:test';
import assert from 'node:assert/strict';

import { referentialConfidence, REFERENT_MARGIN } from '../src/perceiver/referent.js';
import { runVetoes } from '../src/ground/veto.js';

// referentialConfidence reads the reader's own confidence about WHO a passage is
// about off the coref posterior — the concentration of the softmax at the cursor.

test('a dominant referent is confident; a near-tie is not', () => {
  // One candidate → unambiguous.
  const solo = referentialConfidence([{ id: 'gregor', w: 1 }]);
  assert.equal(solo.id, 'gregor');
  assert.equal(solo.concentrated, true);

  // A clear lead clears the margin.
  const lead = referentialConfidence([{ id: 'gregor', w: 0.7 }, { id: 'grete', w: 0.3 }]);
  assert.equal(lead.id, 'gregor');
  assert.ok(lead.margin >= REFERENT_MARGIN);
  assert.equal(lead.concentrated, true);

  // A near-tie does not — the passage does not settle the subject.
  const split = referentialConfidence([{ id: 'gregor', w: 0.52 }, { id: 'grete', w: 0.48 }]);
  assert.ok(split.margin < REFERENT_MARGIN);
  assert.equal(split.concentrated, false);

  // No referents at all → nothing to be confident about.
  const none = referentialConfidence([]);
  assert.equal(none.id, null);
  assert.equal(none.concentrated, false);
});

test('the referent-ambiguous veto flags a diffuse field, stays silent on a concentrated one, and never refuses', () => {
  const base = { draft: 'a sentence', question: 'q', bound: [{ claim: 'x', citation: 's0' }] };

  const diffuse = runVetoes({ ...base, referential: { id: 'gregor', w: 0.5, margin: 0.04, concentrated: false } });
  assert.ok(diffuse.fired.some(f => f.id === 'referent-ambiguous' && !f.refuses));
  assert.equal(diffuse.refuse, false);                 // flag-only — the answer rides

  const sharp = runVetoes({ ...base, referential: { id: 'gregor', w: 0.9, margin: 0.8, concentrated: true } });
  assert.ok(!sharp.fired.some(f => f.id === 'referent-ambiguous'));

  // No field measured (e.g. chat turn) → inert.
  const inert = runVetoes(base);
  assert.ok(!inert.fired.some(f => f.id === 'referent-ambiguous'));
});

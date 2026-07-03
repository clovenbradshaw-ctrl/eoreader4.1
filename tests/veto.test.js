import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runVetoes, groundingFloor, GROUNDING_FLOOR } from '../src/ground/veto.js';

// The coverage veto's floor is a per-task grounding prior, not one flat 0.5:
// a direct answer must be tightly grounded, a summary tolerates connective
// claims with no single witnessing sentence.

test('groundingFloor is a calibrated per-task prior, defaulting to the old 0.5', () => {
  assert.equal(groundingFloor('answer'),  0.5);   // a direct answer — strict, unchanged
  assert.equal(groundingFloor('list'),    0.5);
  assert.ok(groundingFloor('summary') < groundingFloor('answer'));  // synthesis tolerates less
  assert.ok(groundingFloor('explain') < groundingFloor('answer'));
  assert.equal(groundingFloor(undefined), GROUNDING_FLOOR.answer);  // no task → the default floor
});

test('an honest abstention is recognised, not refused as unbound (P0.2 fallout)', () => {
  // With the void no longer auto-answered, the talker's own "the document does not say"
  // flows through bind/veto with no bindable claim. That is the CORRECT void response,
  // not a grounding failure — it must not trip the unbound refusal.
  const bound = [{ claim: 'The document does not say.', citation: null }];
  const v = runVetoes({ draft: 'The document does not say.', question: 'what is his salary?', bound, task: 'answer' });
  assert.ok(v.fired.some(f => f.id === 'abstained' && !f.refuses), 'the abstention is flagged benignly');
  assert.ok(!v.fired.some(f => f.id === 'unbound'), 'and NOT refused as unbound');
  assert.ok(!v.fired.some(f => f.id === 'low-coverage'));
  assert.equal(v.refuse, false, 'an abstention rides — it is the honest void answer');

  // But a real claim that merely contains the words is still grounded normally: it has
  // no citation here, so unbound still fires — the abstention guard is subject-anchored.
  const real = runVetoes({ draft: 'The clerk does not say goodbye to Gregor.', question: 'q',
    bound: [{ claim: 'The clerk does not say goodbye to Gregor.', citation: null }], task: 'answer' });
  assert.ok(!real.fired.some(f => f.id === 'abstained'), 'a real "does not say" claim is not an abstention');
  assert.ok(real.fired.some(f => f.id === 'unbound' && f.refuses));
});

test('the same coverage flags a direct answer but not a summary', () => {
  // Five claims, two tied to a source → 0.4 coverage.
  const bound = [
    { claim: 'a', citation: 's0' }, { claim: 'b', citation: 's1' },
    { claim: 'c', citation: null }, { claim: 'd', citation: null }, { claim: 'e', citation: null },
  ];
  const base = { draft: 'x', question: 'q', bound };

  // 0.4 < 0.5 → a direct answer is under-grounded and flags (flag-only, never refuses).
  const direct = runVetoes({ ...base, task: 'answer' });
  assert.ok(direct.fired.some(f => f.id === 'low-coverage' && !f.refuses));
  assert.equal(direct.refuse, false);

  // 0.4 ≥ 0.34 → the same answer, asked as a summary, is acceptably grounded.
  const summary = runVetoes({ ...base, task: 'summary' });
  assert.ok(!summary.fired.some(f => f.id === 'low-coverage'));
});

// The surfer's own confabulation guard, surfaced (surfing-next.md §3). updateStance
// measures HOW the reading committed at the peak; a Ground-grain commit (guard:true)
// means the field supported only a Ground move — naming a specific figure would be the
// confabulation. On a pointed question that thinness is surfaced to the user (flag-only).
test('stance-reserve flags a Ground-grain commit on a pointed question, and only there', () => {
  const bound = [{ claim: 'x', citation: 's0' }];
  const reserve = { op: 'REC', site: 'Atmosphere', stance: 'Cultivating', grain: 'Ground', firmness: 0.3, guard: true };
  const making  = { op: 'REC', site: 'Lens',       stance: 'Making',      grain: 'Figure', firmness: 1,   guard: false };

  // Ground-grain reserve on a pointed answer → flagged, but rides (flag-only).
  const v1 = runVetoes({ draft: 'an answer', question: 'who fed him?', bound, task: 'answer', stance: reserve });
  assert.ok(v1.fired.some(f => f.id === 'stance-reserve' && !f.refuses), 'the reserve is surfaced');
  assert.equal(v1.refuse, false, 'it never gates — the answer rides with the flag');

  // A Making commit (the field supported a figure) does not flag.
  const v2 = runVetoes({ draft: 'an answer', question: 'who fed him?', bound, task: 'answer', stance: making });
  assert.ok(!v2.fired.some(f => f.id === 'stance-reserve'), 'a firm Figure commit is not a reserve');

  // A summary legitimately rides the Ground grain (it synthesises, it does not point).
  const v3 = runVetoes({ draft: 'a summary', question: 'summarize', bound, task: 'summary', stance: reserve });
  assert.ok(!v3.fired.some(f => f.id === 'stance-reserve'), 'a summary is not flagged for reserving');

  // Inert when no stance was measured (no significance column / empty doc).
  const v4 = runVetoes({ draft: 'x', question: 'q', bound, task: 'answer' });
  assert.ok(!v4.fired.some(f => f.id === 'stance-reserve'), 'no stance → no flag');
});

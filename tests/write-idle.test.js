import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createFold } from '../src/write/fold.js';
import { createIdleLoop, seededRng, RESTING } from '../src/write/idle.js';
import { canWitness } from '../src/core/index.js';

// SPEC §15 — the governed idle loop. Reafferent, firewalled, self-terminating,
// woken by the world. The deterministic engine; surf is injected.

// one standing open question: the unnamed LLC (INS without DEF → void)
const openFold = () => {
  const fold = createFold();
  fold.appear('r#7f3', { head: 'the LLC behind the surveillance MOU' });
  return fold;
};

test('it wakes on exafferent arrival, surfaces ONE candidate, and quiesces on its own (§15 I3, I4)', () => {
  const fold = openFold();
  let emitted = false;
  const surf = ({ void: v, docs }) => {
    const bears = docs.some(d => d.bearsOn === v.rid);
    if (bears && !emitted) { emitted = true; return { rec: 0.9, bearsOn: 'A filing lists Bradshaw Holdings LLC at the MOU address.' }; }
    return { rec: 0.1 };                              // accommodations fell below the band → settle
  };
  const loop = createIdleLoop({ fold, surf, medianBand: 0.5, rng: seededRng(1) });

  assert.ok(loop.isResting(), 'idle starts at rest, not spinning');
  const r = loop.arrive({ bearsOn: 'r#7f3' });        // the world wakes it (I4)

  assert.equal(r.quiesced, true, 'it self-terminates on the median band (I3) — it never spins');
  assert.equal(loop.state, RESTING);
  assert.equal(r.candidates.length, 1, 'one reafferent candidate surfaced');
  assert.match(r.candidates[0].body, /Bradshaw Holdings/);
});

test('I2 firewall: an idle candidate is reafferent and CANNOT witness — only a human confirm grounds (§8, §15, §16)', () => {
  const fold = openFold();
  const surf = ({ void: v }) => ({ rec: 0.9, bearsOn: 'a possible name for the entity' });
  const loop = createIdleLoop({ fold, surf, medianBand: 0.5, maxPasses: 2 });
  const { candidates } = loop.arrive({ bearsOn: 'r#7f3' });
  const cand = candidates[0];

  assert.equal(cand.prov.door, 'enactor', 'idle output enters through the enactor door — reafferent by construction');
  assert.equal(canWitness(cand.prov), false, 'the §8 type law bars it from the witnessing set');
  assert.equal(loop.canGround(cand), false, 'the loop cannot ground its own candidate');
  assert.equal(cand.grounded, false);

  // confirmation is the human's WITNESS ACT — it appends a grounded record and does
  // NOT edit the candidate's provenance (constitutive, never edited)
  const grounded = loop.confirm(cand, { by: 'human' });
  assert.equal(grounded.grounded, true);
  assert.equal(grounded.witnessedBy, 'human');
  assert.equal(cand.prov.door, 'enactor', 'the candidate keeps its reafferent type — suppress-never-erase');
});

test('I1 anchor: with nothing bearing on the void, NO candidate is authored (§15)', () => {
  const fold = openFold();
  const surf = ({ void: v, docs }) => ({ rec: docs.length ? 0.1 : 0.1 }); // never bears
  const loop = createIdleLoop({ fold, surf, medianBand: 0.5 });
  const r = loop.arrive({ bearsOn: 'something-unrelated' });
  assert.equal(r.candidates.length, 0, 'idle never manufactures content — it is fed by the world, not its wake');
  assert.equal(r.quiesced, true);
});

test('nothing open → nothing to think about; and surf is required (§15)', () => {
  const loop = createIdleLoop({ fold: createFold(), surf: () => ({ rec: 1 }), medianBand: 0.5 });
  const r = loop.arrive({ bearsOn: 'x' });
  assert.equal(r.candidates.length, 0);
  assert.equal(r.quiesced, true, 'an empty open-set quiesces at once');
  assert.throws(() => createIdleLoop({ fold: createFold() }), /surf.*must be injected/);
});

test('seededRng is deterministic — the attention walk is reproducible (§15 I5)', () => {
  const a = seededRng(42), b = seededRng(42);
  assert.equal(a(), b());
  assert.equal(a(), b());
});

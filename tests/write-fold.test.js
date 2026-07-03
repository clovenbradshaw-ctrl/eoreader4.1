import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createFold } from '../src/write/fold.js';
import { makeEvent, makeSite, fromPerceiver } from '../src/core/index.js';

// SPEC §2 — the fold: frontier + integral. Generalizes cursor.mjs: the γ-decayed,
// firm-only standing dossier, with void attributes held OUT of the name and surfaced
// as open. The running document is Gregor's referent log up to a cursor.

const gregorLog = (fold, hash) => {
  fold.register(hash, { head: 'Gregor Samsa', pron: { subj: 'he', obj: 'him' } });
  fold.appear(hash);
  fold.record(hash, { t: 1, op: 'INS', attr: 'Gregor Samsa', res: 'firm' });          // the head, skipped
  fold.record(hash, { t: 3, op: 'DEF', attr: "the household's sole provider", res: 'firm' });
  fold.record(hash, { t: 5, op: 'CON', attr: 'transformed overnight into an insect', res: 'firm' });
  fold.record(hash, { t: 8, op: 'DEF', attr: 'now confined to the back room', res: 'firm' });
  fold.record(hash, { t: 9, op: 'DEF', attr: 'the embodiment of modern alienation', res: 'void' }); // VOID
};

test('integralName folds FIRM descriptors with γ-decay into a standing dossier (§2)', () => {
  const fold = createFold();              // GAMMA 0.8, keep 0.25 (cursor.mjs)
  gregorLog(fold, 'r#001');
  const integral = fold.integralName('r#001', 11);

  assert.equal(integral.head, 'Gregor Samsa');
  assert.ok(integral.name.startsWith('Gregor Samsa — '), 'the dossier is head + kept descriptors');
  // the recent, strong descriptors are kept; the faded one (t=3, γ^8 < keep) is dropped
  assert.match(integral.name, /now confined to the back room/);
  assert.match(integral.name, /transformed overnight into an insect/);
  assert.doesNotMatch(integral.name, /sole provider/, 'γ-decay drops the faded descriptor (standing, not biography)');
});

test('FIRM-ONLY: a void attribute is held OUT of the name and surfaced as open (§2, §5)', () => {
  const fold = createFold();
  gregorLog(fold, 'r#001');
  const integral = fold.integralName('r#001', 11);
  // baking the void claim into the name would firm it up — the sister/mother / overclaim failure
  assert.doesNotMatch(integral.name, /alienation/, 'the void meaning never enters the name');
  assert.deepEqual(integral.open, ['the embodiment of modern alienation'], 'it is surfaced as unsettled');
});

test('the keep-threshold bounds the dossier; a larger γ keeps more (§2, open question §13.4)', () => {
  const tight = createFold({ gamma: 0.8, keep: 0.25 });
  const loose = createFold({ gamma: 0.95, keep: 0.1 });
  gregorLog(tight, 'r#001');
  gregorLog(loose, 'r#001');
  const tn = tight.integralName('r#001', 11).name;
  const ln = loose.integralName('r#001', 11).name;
  assert.ok(ln.length >= tn.length, 'a slower decay + lower keep retains more of the biography');
  assert.match(ln, /sole provider/, 'the descriptor the tight fold dropped survives in the loose one');
});

test('the dossier carries provenance per descriptor — read (exafference) vs said (§2, §8)', () => {
  const fold = createFold();
  fold.appear('r#001', { head: 'Gregor Samsa' });
  fold.record('r#001', { t: 2, op: 'DEF', attr: 'a travelling salesman', res: 'firm', prov: fromPerceiver('doc') });
  const d = fold.dossierOf('r#001', 5);
  assert.equal(d.descriptors[0].prov.door, 'perceiver', 'the dossier knows the descriptor was READ, not said');
});

test('an un-characterized referent reads as the bare head (§2)', () => {
  const fold = createFold();
  fold.appear('r#009', { head: 'a man' });        // appeared, never DEF'd
  const integral = fold.integralName('r#009', 5);
  assert.equal(integral.name, 'a man');
  assert.deepEqual(integral.open, []);
});

test('update advances the frontier: INS appears, CON appears arguments, SYN appears the promotion (§2, §3a)', () => {
  const fold = createFold();
  fold.update(makeEvent({ op: 'INS', site: makeSite('r#001') }), { head: 'Gregor' });
  assert.ok(fold.has('r#001'), 'INS-by-appearance puts the figure on the frontier');

  fold.update(makeEvent({ op: 'INS', site: makeSite('r#002') }), { head: 'Grete' });
  fold.update(makeEvent({ op: 'CON', site: [makeSite('r#002'), makeSite('r#001')] }));
  assert.ok(fold.has('r#002') && fold.has('r#001'), 'a relation appears its argument Sites');

  fold.update(makeEvent({ op: 'SYN', site: [makeSite('r#001')], promotes: makeSite('r#010', 1) }));
  assert.ok(fold.has('r#010'), 'SYN promotes a new higher-grain figure onto the frontier');
});

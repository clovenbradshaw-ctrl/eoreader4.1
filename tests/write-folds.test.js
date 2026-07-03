import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createFolds } from '../src/write/folds.js';
import {
  INSTRUMENT, READER, STATUS,
  makeSite, siteNotation, holderOf,
  isModeled, canAnchor, beliefValue, beliefNotation, isBelief,
} from '../src/core/index.js';

// SPEC §3, §9, §20 (Update 4) — the family of holder-Horizons over one shared log.
// The belief battery: first- and second-order false belief, the dramatic-irony /
// suspense divergence, the stated-vs-inferred attribution status, and — the load-
// bearing one — that NO other-holder belief is ever reported without the outer
// instrument root that marks it reafferent and bars it from witnessing (§20a, §20f).

// The Metamorphosis scene, hand-labelled with its witnessing routing (§9, §17.6):
//   t1  Gregor is in the room — Grete and the mother both present.
//   t2  Gregor moves to the hall — the mother present, GRETE absent (she has left).
const scene = () => {
  const F = createFolds();
  F.record({ key: 'gregor.loc', value: 'room', t: 1, witnesses: ['grete', 'mother'] });
  F.record({ key: 'gregor.loc', value: 'hall', t: 2, witnesses: ['mother'], absent: ['grete'] });
  return F;
};

// ── The holder root on a Site (§1, §2) ────────────────────────────────────────

test('a Site carries a holder root; the holderless form is the elided reader (§1, §2)', () => {
  const rooted = makeSite('r#001', 0, 'grete');
  assert.equal(rooted.holder, 'grete');
  assert.equal(siteNotation(rooted), 'grete · r#001@0');

  const elided = makeSite('r#001', 0);
  assert.equal(siteNotation(elided), 'r#001@0', 'no holder ⇒ byte-for-byte the pre-holder notation');
  assert.equal(holderOf(elided), READER, 'the elided root defaults to the reader (§1)');
  assert.equal(holderOf(rooted), 'grete');
});

// ── First-order false belief (§3) ─────────────────────────────────────────────

test('beliefOf is the latest value the holder WITNESSED — a missed change is a false belief (§3)', () => {
  const F = scene();
  assert.equal(beliefValue(F.beliefOf('grete', 'gregor.loc')), 'room',
    'Grete left before the move; her fold still holds the stale location');
  assert.equal(beliefValue(F.beliefOf('mother', 'gregor.loc')), 'hall',
    'the mother witnessed the move; her fold is current');
  assert.equal(beliefValue(F.truth('gregor.loc')), 'hall',
    'truth is belief at the limit of witnessing — the instrument saw everything (§1)');
});

test('a holder who never witnessed the fact has a VOID belief — it does not know (§3)', () => {
  const F = scene();
  // a narrator aside only the reading position is given
  F.record({ key: 'gregor.isInsect', value: true, t: 0, witnesses: [READER] });
  assert.equal(beliefValue(F.beliefOf('grete', 'gregor.isInsect')), null,
    'null content = void: Grete was never told');
  assert.equal(beliefValue(F.beliefOf(READER, 'gregor.isInsect')), true);
});

// ── The nested instrument root — the §16 P8 acceptance (§20a, §20f) ────────────

test('every other-holder belief carries the outer instrument root and is reafferent (§20a, §20f)', () => {
  const F = scene();
  const reported = [
    F.beliefOf('grete', 'gregor.loc'),
    F.beliefOf('mother', 'gregor.loc'),
    F.modelOf('mother', 'grete', 'gregor.loc'),
  ];
  for (const b of reported) {
    assert.notEqual(b.believer, INSTRUMENT, 'these are beliefs ABOUT another holder');
    assert.equal(b.modeledBy, INSTRUMENT, 'the outer root is ALWAYS the instrument, never elided (§20f)');
    assert.ok(isModeled(b));
    assert.ok([STATUS.INFERRED, STATUS.STATED].includes(b.status), 'and carries its inferred/stated status');
    assert.equal(canAnchor(b), false,
      'authored by the instrument ⇒ reafferent ⇒ cannot witness: the §9 honesty rule, DERIVED (§20a)');
    assert.match(beliefNotation(b), /^instrument · models\( /, 'the address is rooted at the instrument');
  }
});

test('the self-fold is the one exception: one root, directly held, may anchor (§20c)', () => {
  const F = scene();
  const own = F.truth('gregor.loc');               // beliefOf(instrument, …)
  assert.equal(own.believer, INSTRUMENT);
  assert.equal(isModeled(own), false, 'no outer model wraps the instrument’s own fold');
  assert.equal(canAnchor(own), true, 'it read the doc — exafferent, so it may anchor (§20c)');
  assert.equal(beliefNotation(own), 'instrument · gregor.loc=hall', 'no models() wrapper — one root');
});

// ── Second-order false belief (§3, §20b) ──────────────────────────────────────

test('modelOf is instrument-models(A-models-B); A saw B miss the change, so the model stays stale (§3, §20b)', () => {
  const F = scene();
  // The mother saw Grete leave before Gregor moved, so the mother knows Grete still
  // thinks he is in the room — correct second-order attribution of a false belief.
  const m = F.modelOf('mother', 'grete', 'gregor.loc');
  assert.equal(beliefValue(m), 'room', "the mother's model of Grete keeps the location Grete last saw");

  // three roots, the outer one always the instrument (§20b)
  assert.equal(m.believer, 'mother');
  assert.equal(m.modeledBy, INSTRUMENT);
  assert.ok(isBelief(m.content) && m.content.believer === 'grete' && m.content.modeledBy === 'mother',
    'the inner node is Grete-as-modeled-by-the-mother');
  assert.equal(beliefNotation(m), 'instrument · models( mother · models( grete · gregor.loc=room ) )');
});

// ── Stated vs inferred attribution (§9, §20e) ─────────────────────────────────

test('a stated belief is firm-about-the-record but still reafferent about the mind (§20e)', () => {
  const F = createFolds();
  F.record({ key: 'grete.wish', value: 'be-rid-of-it', t: 1, witnesses: ['grete', 'mother'], status: STATUS.STATED });
  F.record({ key: 'grete.mood', value: 'exhausted',   t: 2, witnesses: ['grete', 'mother'] });   // inferred default

  const stated = F.beliefOf('grete', 'grete.wish');
  assert.equal(stated.status, STATUS.STATED, 'the source stated it in her own terms');
  assert.equal(stated.modeledBy, INSTRUMENT, 'even a stated attribution carries the instrument root (§20e)');
  assert.equal(canAnchor(stated), false, 'firm about the text, NOT about her mind — still cannot witness it');

  assert.equal(F.beliefOf('grete', 'grete.mood').status, STATUS.INFERRED, 'inference is the default (§9)');
});

// ── Divergence across folds — the literary phenomena (§9) ─────────────────────

test('dramatic irony and suspense are belief divergences across folds (§9)', () => {
  const F = scene();
  // the reader is told Gregor is an insect; Grete is not → the reader knows what she does not
  F.record({ key: 'gregor.isInsect', value: true, t: 0, witnesses: [READER] });
  const irony = F.divergence('gregor.isInsect', { reader: READER, character: 'grete' });
  assert.equal(irony.kind, 'dramatic-irony', 'reader knows, character void (§9)');

  // Grete forms a plan the reader has not been shown → the character knows what the reader does not
  F.record({ key: 'grete.plan', value: 'abandon-him', t: 3, witnesses: ['grete'], absent: [READER] });
  const suspense = F.divergence('grete.plan', { reader: READER, character: 'grete' });
  assert.equal(suspense.kind, 'suspense', 'character knows, reader void — the mirror (§9)');

  // both committed but to different values → a plain belief divergence
  const split = F.divergence('gregor.loc', { reader: 'mother', character: 'grete' });
  assert.equal(split.kind, 'divergent-belief');
  assert.equal(split.reader, 'hall');
  assert.equal(split.character, 'room');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { createCorefField } from '../src/perceiver/parse/coref.js';

// Causal gender as a SOFT coref cue (opt-in). Gender established BEFORE a pronoun — a title
// at first naming, or a pronoun that already resolved — biases a later gendered pronoun
// toward a compatible antecedent. Strictly backward-looking; off by default (byte-identical).

const srcOf = (doc, via) => doc.log.snapshot().find(e => (e.op === 'CON' || e.op === 'SIG') && e.via === via)?.src;

test('default OFF: coref is unchanged (gender-free, by the backward field)', () => {
  const text = 'Mr Darcy admired Elizabeth. She refused Darcy.';
  // without the cue, the backward center (Mr Darcy, the prior subject) carries to "She"
  assert.equal(srcOf(parseText(text, { docId: 's' }), 'refused'), 'mr-darcy', 'gender-free reading preserved');
});

test('ON: a title fixes gender causally, so a later "She" will not bind to the masculine antecedent', () => {
  const text = 'Mr Darcy admired Elizabeth. She refused Darcy.';
  // "Mr" established Mr Darcy = masculine at naming (before "She"), so "She" binds to Elizabeth
  assert.equal(srcOf(parseText(text, { docId: 's', genderCoref: true }), 'refused'), 'elizabeth');
});

test('the cue is CAUSAL — it cannot use evidence that arrives after the pronoun', () => {
  // here the only gender evidence ("She") arrives AT the pronoun, with no prior title; there
  // is nothing established before it, so the cue cannot act and the gender-free reading stands.
  const text = 'Anna met Ben. She left.';
  const off = srcOf(parseText(text, { docId: 's' }), 'left');
  const on = srcOf(parseText(text, { docId: 's', genderCoref: true }), 'left');
  assert.equal(on, off, 'with no gender established before the pronoun, the cue changes nothing');
});

test('the gender rule is defeasible: enough EVA breaks toggle it off (strain overtakes support)', () => {
  const f = createCorefField({});
  f.noteGender('x', 'm');                    // a title fixes x = masculine (support 1)
  assert.equal(f.genderOf('x'), 'm');
  f.evaGender('x', false);                   // one failure — strain 1, not yet past support
  assert.equal(f.genderOf('x'), 'm', 'a single failure only strains a held belief');
  f.evaGender('x', false);                   // a second failure — strain 2 > support 1
  assert.equal(f.genderOf('x'), null, 'the belief is DEFEATED — the rule toggles off for x');
});

test('an EVA hold relaxes strain — a belief that keeps earning its place is reinstated', () => {
  const f = createCorefField({});
  f.noteGender('y', 'f');
  f.evaGender('y', false); f.evaGender('y', false);   // defeated
  assert.equal(f.genderOf('y'), null);
  f.evaGender('y', true);                              // it does useful work again
  assert.equal(f.genderOf('y'), 'f', 'strain relaxes below support — the rule comes back on');
});

test('the cue never empties the field: with every candidate incompatible it defers to the gender-free read', () => {
  // "She" with only masculine antecedents established (both titled) → no compatible
  // candidate, so the soft veto stands down rather than resolving to nothing.
  const text = 'Mr Smith met Mr Jones. She saw Anna.';
  const doc = parseText(text, { docId: 's', genderCoref: true });
  assert.ok(srcOf(doc, 'saw') != null, 'a resolution is still produced; the cue does not blank the field');
});

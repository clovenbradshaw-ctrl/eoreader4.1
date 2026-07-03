import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { inferGenders, writeReferring, conceptToPlan } from '../src/write/index.js';

// Gender is inferred by reading (the parser's own subject resolution + the lexical gender of
// the pronoun), never a name table; with no evidence the entity is named, not mis-pronouned.
// The saying order is a coherence walk over the concept, not a salience sort.

test('inferGenders reads gender off the subject pronoun the parser resolved', () => {
  const doc = parseText('Gregor woke. He saw Grete.', { docId: 's' });
  const g = inferGenders(doc);
  assert.equal(g.Gregor, 'm', '"He saw Grete" → the resolved subject (Gregor) is masculine');
});

test('inferGenders is silent where the reading gives no pronoun-subject evidence', () => {
  const doc = parseText('Anna saw Ben. Ben saw Anna.', { docId: 's' });   // all named subjects, no pronouns
  assert.deepEqual(inferGenders(doc), {}, 'no gendered subject pronoun → no gender claimed');
});

test('an entity with no gender evidence is referred to by NAME, never a fabricated "it"', () => {
  const out = writeReferring([
    { subj: { id: 'x', gender: 'n', name: 'the captain' }, verb: 'watched', obj: 'the sea' },
    { subj: { id: 'x', gender: 'n', name: 'the captain' }, verb: 'held', obj: 'the wheel' },
  ]);
  assert.equal(out.units[1].subjForm, 'name', 'unknown gender → the name, not "it"');
  assert.ok(!/\bit\b/i.test(out.text), 'no fabricated neuter pronoun for a named entity');
});

test('a gender-evidenced entity is still pronominalised when warm and unambiguous', () => {
  const out = writeReferring([
    { subj: { id: 'g', gender: 'm', name: 'Gregor' }, verb: 'woke' },
    { subj: { id: 'g', gender: 'm', name: 'Gregor' }, verb: 'rose' },
  ]);
  assert.equal(out.units[1].subjForm, 'pronoun', 'evidenced gender → pronoun where licensed');
  assert.match(out.text, /\bHe\b/);
});

test('the coherence walk drops no relation and keeps a subject\'s acts together', () => {
  const doc = parseText('Anna saw Ben. Anna left Ben. Ben followed Maria.', { docId: 's' });
  const plan = conceptToPlan(doc, { genders: { Anna: 'f', Ben: 'm', Maria: 'f' } });
  // every relation bond is said (nothing dropped by the walk)
  const bonds = doc.log.snapshot().filter(e => (e.op === 'CON' || e.op === 'SIG') && e.src != null && e.via).length;
  assert.equal(plan.length, bonds, 'the walk says every bond, none dropped');
  // Anna's two acts are contiguous (CONTINUE the center before shifting)
  const annaRun = plan.filter(p => p.subj.id === plan[0].subj.id);
  assert.ok(annaRun.length >= 2, 'the focus entity keeps acting before the walk shifts');
});

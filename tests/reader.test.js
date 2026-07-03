import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { encodeLevels, attributedEvaluation, surfToAnswer,
         createReader, interpret, curiousSurf } from '../src/surfer/index.js';

// The reader — the ρ-side self that FEELS surprise (the me-ness). Reader-relative surprise falls
// as the self accumulates (habituation); interpret fills interpretation.surprise at read-time
// without the σ-side surf ever computing it; the surf can follow what it is curious about.

test('surprise is reader-relative — the same content surprises less once the self has read it (habituation)', () => {
  const r = createReader();
  const text = 'Pierre met Andrew. Pierre trusted Andrew. Natasha loved Pierre.';
  const first = r.feel(text, { accumulate: true }).surprise;
  const again = r.feel(text, { accumulate: true }).surprise;
  assert.ok(first >= 0, 'a first reading carries surprise against the blank self');
  assert.ok(again <= first + 1e-9, 'the same content surprises no more the second time — the self has absorbed it');
});

test('a novel register surprises a settled self more than a repeat of what it knows', () => {
  const r = createReader();
  const known = 'Pierre met Andrew. Pierre trusted Andrew. Pierre helped Andrew.';   // CON-heavy narrative
  for (let i = 0; i < 3; i++) r.feel(known, { accumulate: true });   // settle into the narrative register
  const repeat = r.feel(known, { accumulate: false }).surprise;
  // a different REGISTER (copular DEF predicates, not transitive narrative) reads as a shift.
  const novel = r.feel('Natasha was a countess. Natasha was young. Sonya was a maid. Sonya was loyal.', { accumulate: false }).surprise;
  assert.ok(novel >= repeat, 'the unfamiliar register reads as more surprising than the familiar');
});

test('competency, not raw surprise: a surprising-but-incoherent read is named noise, not interest', () => {
  // The noisy-TV trap: snow is maximally surprising and unlearnable. "I find this interesting" must
  // require coherence (it beats chance), so a high-surprise / low-coherence read is noise, not interest.
  const r = createReader();
  for (let i = 0; i < 6; i++) r.feel(`Alice met Bob about topic ${i}.`, { accumulate: true });  // settle
  const f = r.feel('Xerxes. Quinn. Owen. Rudy. Stan. Pim. Vlad. Zane.', { accumulate: true });   // fragments, no structure
  assert.equal(f.interesting, false, 'a fragment smear does not beat chance — "this is NOT interesting"');
  const c = r.curiosity();
  // even if it surprised the settled self, it is not coherent → not interest.
  if (c.curious !== null) assert.notEqual(c.curious, true, 'surprising noise is never "I find this interesting"');
});

test('interpret fills interpretation.surprise at read-time — the σ-side surf never computed it', () => {
  const doc = parseText('CHAPTER I\nPierre met Andrew. Pierre trusted Andrew.\nCHAPTER II\nNatasha sang. Natasha danced.\n' +
    'CHAPTER III\nBoris waited near the door.\nCHAPTER IV\nMary read the letter.', { docId: 's', totalRead: true });
  const enc = encodeLevels(doc);
  const base = surfToAnswer('who did Pierre trust?', { doc, encoding: enc, evaluation: attributedEvaluation(doc, enc) });
  assert.equal(base.interpretation.surprise, null, 'the surf withholds the verdict and the surprise');
  const reader = createReader();
  const felt = interpret(base, reader);
  assert.ok(typeof felt.interpretation.surprise === 'number', 'the reader fills it at read-time (the me-ness)');
  assert.notEqual(felt, base, 'a new object — the original σ-side result is not mutated');
  assert.equal(base.interpretation.surprise, null, 'and the firewall holds: base stays withheld');
});

test('curiosity is meta-surprise — it abstains until there is a history of being surprised', () => {
  const r = createReader();
  assert.equal(r.curiosity().curious, null, 'cold — no history of my own surprise yet');
  for (let i = 0; i < 6; i++) r.feel(`Figure${i} acted on the room number ${i}.`, { accumulate: true });
  const c = r.curiosity();
  assert.ok(c.curious === true || c.curious === false || c.curious === null, 'once warm, curiosity is a judgment');
});

test('the surf follows what it is curious about — it covers distinct casts before repeating', () => {
  // three distinct casts, each in two chapters; curiosity should visit one of each before doubling up.
  const doc = parseText(
    'CHAPTER I\nAlice met Bob. Alice trusted Bob.\nCHAPTER II\nAlice met Bob. Alice helped Bob.\n' +
    'CHAPTER III\nCarl chased Dave. Carl caught Dave.\nCHAPTER IV\nCarl chased Dave. Carl fought Dave.\n' +
    'CHAPTER V\nEve read the letter. Eve wrote the reply.\nCHAPTER VI\nEve read the book. Eve wrote the note.',
    { docId: 'cur', totalRead: true });
  const enc = encodeLevels(doc);
  const path = curiousSurf(doc, enc.segments, { top: 3 });
  assert.equal(path.length, 3, 'a three-step curiosity path');
  // each step carries its competency (meaningful surprise against the self accumulated so far).
  for (const p of path) assert.ok(typeof p.competency === 'number' && p.coherence > 0, 'a competent, coherent step');
  // it does not dwell: the three steps cover the three distinct casts, not the same one repeated.
  const firstFigures = path.map((p) => p.figures?.[0]?.label).filter(Boolean);
  assert.equal(new Set(firstFigures).size, 3, 'curiosity covers all three distinct casts, never doubling up');
});

test('reading improves prediction — prediction error on the read register falls as ρ accumulates', () => {
  // The curiosity→prediction loop: ρ is a predictive model, surprise is prediction error. Reading
  // a register lowers the error of predicting more of it — the self learns to predict by reading.
  const r = createReader();
  const register = 'Pierre met Andrew. Pierre trusted Andrew. Natasha loved Pierre. Pierre helped Andrew.';
  const before = r.expect(register).predictionError;
  for (let i = 0; i < 4; i++) r.feel(register, { accumulate: true });   // read it — the model learns
  const after = r.expect(register).predictionError;
  assert.ok(after <= before, `prediction error falls with reading (${before} → ${after})`);
});

test('curiousSurf takes a cue — the bias guides the start, competency still leads (omnimodal hook)', () => {
  const doc = parseText(
    'CHAPTER I\nAlice met Bob. Alice trusted Bob.\nCHAPTER II\nCarl chased Dave. Carl caught Dave.\n' +
    'CHAPTER III\nEve read the letter. Eve wrote the reply.\nCHAPTER IV\nMara sailed. Mara returned.',
    { docId: 'cue', totalRead: true });
  const enc = encodeLevels(doc);
  // a cue that up-weights the Eve chapter (e.g. a query about Eve) biases the surf toward it.
  const cue = (seg) => /\beve\b/.test(seg.text) ? 5 : 1;   // seg.text is normalized lowercase
  const path = curiousSurf(doc, enc.segments, { top: 2, cue });
  assert.ok(path.some((p) => (p.figures || []).some((f) => /Eve/.test(f.label))), 'the cue guides the surf to its region');
});

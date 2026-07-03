import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/pipeline.js';
import { classifyResolutions, SPECTRUM, TIER, needsWitness, spectrumOf } from '../src/core/resolution-spectrum.js';

// The resolution spectrum — placing each coref/identity situation on the ONE axis
// that matters: does resolving it need the WITNESS CHANNEL to read meaning? The
// engine tier is the large middle (deterministic rules + corpus-learned statistics —
// Fellegi-Sunter weights, the REC ledger); only meaning crosses into `model`.

const find = (cls, type) => cls.items.find((i) => i.type === type);

// ── The axis itself ──────────────────────────────────────────────────────────

test('the axis is the witness channel, not hand-coded-vs-learned — engine holds the LEARNED layer', () => {
  // The anti-conflation guarantee: learned-statistical situations sit on the engine
  // side (no witness), not the model side. Functional-veto rides Fellegi-Sunter m/u.
  const veto = spectrumOf('functional-veto');
  assert.equal(veto.tier, TIER.ENGINE);
  assert.equal(veto.engineKind, 'learned', 'a learned statistic is engine, not model');
  assert.equal(needsWitness(TIER.ENGINE), false);
});

test('only meaning crosses into model — the Winograd pronoun is the genuine frontier', () => {
  const sem = spectrumOf('pronoun-semantic');
  assert.equal(sem.tier, TIER.MODEL);
  assert.equal(needsWitness(TIER.MODEL), true);
  // …and a pronoun the field settles is NOT model.
  assert.equal(spectrumOf('pronoun-structural').tier, TIER.RESOLVED);
});

test('the straddle is rendered, not flattened — same-name-split carries its two sub-cases', () => {
  const split = spectrumOf('same-name-split');
  assert.equal(split.tier, TIER.MIXED);
  assert.equal(needsWitness(TIER.MIXED), 'tail');
  const cases = Object.fromEntries(split.subcases.map((c) => [c.case, c.tier]));
  assert.equal(cases['by-functional-key'], TIER.ENGINE, 'a conflicting key splits deterministically (D4)');
  assert.equal(cases['by-soft-role'], TIER.MODEL, 'only soft roles need the witness');
});

test('every spectrum type is on a real tier; mixed types carry a witness tail', () => {
  for (const s of SPECTRUM) {
    assert.ok(Object.values(TIER).includes(s.tier), `${s.type} has a valid tier`);
    if (s.tier !== TIER.MODEL) assert.ok(s.engineKind === 'rule' || s.engineKind === 'learned',
      `${s.type} names its no-witness machinery (rule|learned)`);
  }
});

// ── Live classification of a document's decisions ─────────────────────────────

test('a name alias is RESOLVED; a defeated surname is ENGINE (learned population statistic)', () => {
  const cls = classifyResolutions(parseText(
    'Gregor Samsa woke. Gregor crawled. Samsa feared this. Mr Samsa raged. Mrs Samsa wept.', { docId: 'fam' }));
  assert.ok(find(cls, 'name-alias') || find(cls, 'surname-collision'));
  // the family proves the surname shared → surname-collision (engine), not a standing alias
  const sc = cls.items.filter((i) => i.type === 'surname-collision');
  assert.ok(sc.length >= 1 && sc.every((i) => i.tier === TIER.ENGINE && i.needsWitness === false));
});

test('a functional veto is ENGINE; a contested key is MIXED (engine detects, witness resolves)', () => {
  const veto = classifyResolutions(parseText(
    'John Smith (born 1961) chaired the hearing. Smith was born in 1979.', { docId: 'b5' }));
  assert.equal(find(veto, 'functional-veto').tier, TIER.ENGINE);

  const contested = classifyResolutions(parseText(
    'John Smith was born in 1961. John Smith was born in 1962.', { docId: 'b6' }));
  const ck = find(contested, 'contested-key');
  assert.equal(ck.tier, TIER.MIXED);
  assert.equal(ck.needsWitness, 'tail');
});

// ── The B6.5 fix: surface the within-doc near-identity (held, never auto-merged) ──

test('B6.5: corroborated same-surname names with a conflicting key surface as a held near-identity', () => {
  // "Mr. Turner" now carries bornOn (the title-aware extractor), both run NDP (shared
  // discriminator), surname Turner — corroboration past coincidence — and the birth
  // dates conflict → a contested near-identity is SURFACED, not silently two strangers.
  const doc = parseText(
    'Tom Turner runs NDP. Mr. Turner runs NDP. Tom Turner was born in 1961. Mr. Turner was born in 1979.',
    { docId: 'b65' });
  const eva = doc.log.events.find((e) => e.op === 'EVA' && e.reason === 'near-identity-contested');
  assert.ok(eva, 'the near-identity is surfaced');
  assert.equal(eva.surname, 'turner');
  assert.equal(eva.key, 'bornOn');
  assert.equal(eva.verdict, 'indeterminate');
  const cls = classifyResolutions(doc);
  const ni = find(cls, 'held-near-identity');
  assert.equal(ni.tier, TIER.MIXED, 'detection is engine; resolving the dispute is the witness’s');
});

test('B6.5 guard-first: corroboration with NO conflict does NOT auto-merge', () => {
  const doc = parseText('Tom Turner runs NDP. Mr. Turner runs NDP.', { docId: 'b65-clean' });
  assert.equal(doc.log.events.some((e) => e.reason === 'near-identity-contested'), false);
  assert.equal(doc.log.events.some((e) => e.op === 'SYN' && e.kind === 'same_as?'), false,
    'merging corroborated same-surname names is the deferred dangerous half');
});

test('the title-aware extractor attaches a functional key to "Mr. X"', () => {
  const ev = parseText('Mr. Turner was born in 1979.', { docId: 'title' }).log.events;
  const def = ev.find((e) => e.op === 'DEF' && e.key === 'bornOn');
  assert.ok(def && def.id === 'mr-turner' && def.value === '1979');
});

// ── The headline the axis is for ──────────────────────────────────────────────

test('the summary splits a document’s open situations into witness-bound vs engine-reachable', () => {
  const cls = classifyResolutions(parseText(
    'The Nashville Downtown Partnership (NDP) was founded. NDP grew.', { docId: 'org' }));
  assert.equal(typeof cls.summary.witnessBound, 'number');
  assert.equal(typeof cls.summary.engineReachable, 'number');
  // an acronym resolution needs no witness
  assert.ok(cls.items.some((i) => i.type === 'name-alias' && i.needsWitness === false));
});

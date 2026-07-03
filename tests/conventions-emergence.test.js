import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  makeUnit, isUnit, sameUnit, streamDistance, unitStream, isOrdered,
  makeProposition, isProposition, propositionOfEdge,
  createConventions,
} from '../src/core/index.js';
import { parseText } from '../src/perceiver/parse/index.js';
import { headVerb } from '../src/perceiver/parse/relations.js';

// ── The two floors (reshape §1/§2) ──────────────────────────────────────────
// The bare unit is the input membrane: comparable + ordered, and NOTHING else.
// Its minimality is the modality-neutrality guarantee — there is no slot to leak
// modality, origin, or structure into.

test('the bare unit is comparable, ordered, and too minimal to leak', () => {
  const a = makeUnit('x', 0), b = makeUnit('x', 1), c = makeUnit('y', 2);
  assert.ok(isUnit(a) && isUnit(b) && isUnit(c));
  assert.ok(sameUnit(a, b), 'comparable: same key → same');
  assert.ok(!sameUnit(a, c), 'comparable: different key → different');
  assert.equal(streamDistance(a, c), 2, 'ordered: distance is along the order index');
  assert.ok(Object.isFrozen(a), 'a unit is immutable once ingested');
  // The membrane test leans on this: a "unit" carrying extra structure is NOT a
  // bare unit, so an organ that smuggled structure in fails here.
  assert.ok(!isUnit({ key: 'x', t: 0, modality: 'audio' }), 'extra slots → not a bare unit');
  assert.ok(!isUnit({ key: 'x' }), 'no order → not a bare unit');
});

test('a unit stream is re-keyed to a dense order and is ordered', () => {
  const s = unitStream(['do', 're', 'mi']);
  assert.deepEqual(s.map(u => u.key), ['do', 're', 'mi']);
  assert.deepEqual(s.map(u => u.t), [0, 1, 2], 'order index is dense and increasing');
  assert.ok(isOrdered(s));
  assert.ok(!isOrdered([makeUnit('a', 1), makeUnit('b', 1)]), 'a tie breaks order');
});

// The proposition is the floor of MEANING — the triadic minimum, all three slots
// and a polarity. It is the emergent currency, not handed in by an organ.

test('the proposition is the triadic minimum, with a polarity', () => {
  const p = makeProposition({ substrate: 'Gregor', relation: 'loved', differentia: 'Grete' });
  assert.ok(isProposition(p));
  assert.equal(p.polarity, '+', 'positive · realis by default');
  assert.ok(Object.isFrozen(p));
  assert.ok(!isProposition({ substrate: 'Gregor', relation: 'loved' }), 'a missing slot is below the floor of meaning');
  // The log's edge currency bridges to the triadic-minimum contract.
  const carved = propositionOfEdge({ src: 'Gregor', via: 'loved', tgt: 'Grete', polarity: 'negative' });
  assert.equal(carved.polarity, '-', 'a carved absence is the negative pole');
});

// ── §5 TEST 1 — readable with conventions OFF ───────────────────────────────
// Turn the priors off and the core must STILL discover structure from units
// alone, slower and worse, but it reads. If it can't, the seeds were load-bearing
// structure, not priors, and the emergence claim is false.

test('TEST 1 · the core reads with priors OFF (slower and worse, but it reads)', () => {
  const txt = 'Gregor met Grete. Gregor met Grete. Gregor loved Grete. Grete saw Gregor.';
  const off = parseText(txt, { docId: 'off', conventionsOpts: { seeds: false } });
  const insOff  = off.log.events.filter(e => e.op === 'INS').length;
  const bondOff = off.log.events.filter(e => e.op === 'CON' || e.op === 'SIG').length;
  assert.ok(insOff > 0, 'entities still emerge from the unit stream with no priors');
  assert.ok(bondOff > 0, 'propositions (bonds) still emerge with no priors');

  // "Worse" is real: the priors GUARD against copula/modifier leakage. With them
  // off, a copula and a modifier slip through as relations; with them on, they do
  // not. So the priors improve quality without being load-bearing for reading.
  const guard = 'Lydia Bennet is Kitty Bennet. Lydia Bennet is Kitty Bennet. Lydia Bennet much more Kitty Bennet.';
  const withPriors = parseText(guard, { docId: 'on' });
  const noPriors   = parseText(guard, { docId: 'off2', conventionsOpts: { seeds: false } });
  const vias = (d) => d.log.events.filter(e => e.op === 'CON' || e.op === 'SIG').map(e => e.via);
  assert.ok(!vias(withPriors).some(v => ['is', 'much', 'more'].includes(v)), 'priors ON guard the copula/modifier');
  assert.ok(vias(noPriors).some(v => ['is', 'much', 'more'].includes(v)), 'priors OFF let them leak — worse, but it read');
});

// ── §5 TEST 2 — a built-in convention can LOSE ──────────────────────────────
// Feed a stream where a seed mis-fires; DEF·EVA·REC overrides the seed. If a seed
// can't be overridden, it's an axiom wearing a convention's coat.

test('TEST 2 · a seeded convention loses to the stream (EVA → REC defeat)', () => {
  const c = createConventions();
  assert.ok(c.isCopula('am'), 'am starts as an inherited prior');
  assert.equal(c.originOf('copula', 'am'), 'prior');
  assert.equal(headVerb(' am sure of it', { isCopula: c.isCopula, isModifier: c.isModifier }).copular, true);

  // A prior is a head start, not an exemption: it takes more breaks to defeat than
  // a fresh convention, but it can be defeated. Here the stream keeps using "am"
  // as a real relation; the breaks overtake the pre-baked support.
  let r;
  for (let i = 0; i < 5; i++) r = c.eva('copula', 'am', false);
  assert.ok(r.defeated, 'EVA breaks overtake the prior support → REC defeats it');
  assert.equal(c.isCopula('am'), false, 'has() now answers false for the defeated prior');
  assert.ok(c.isDefeated('copula', 'am'));

  // The consumer (the verb guard) flips: "am" is now a head verb, not a copula.
  assert.equal(headVerb(' am sure of it', { isCopula: c.isCopula, isModifier: c.isModifier }).copular, false,
    'the override reaches the consumer — am is no longer routed to DEF');

  // The defeat is recorded as a REC on the rules ledger, same log as a learn.
  assert.ok(c.rules.some(x => x.op === 'REC' && x.kind === 'copula' && x.token === 'am' && x.defeat),
    'the defeat is a REC entry');

  // Direct REC override works too (a discovery beating a prior outright).
  const c2 = createConventions();
  c2.defeat('starter', 'then');
  assert.equal(c2.isStarter('then'), false, 'a prior overridden outright');
});

// ── §5 TEST 3 — a learned convention occupies the SAME slot ─────────────────
// A convention the core deposits while reading sits in the same ledger, same
// format, same authority as an inherited one — and a later document inherits it
// exactly as it inherited the seeds. If they lived in different layers, the
// continuity would be a story, not a fact.

test('TEST 3 · learned and inherited are one substance, same slot, inheritable', () => {
  const c1 = createConventions();
  c1.learnAttribution('pinged', 3);            // the document teaches its dialect
  assert.ok(c1.isAttributionVerb('pinged'));
  assert.equal(c1.originOf('attribution-verb', 'pinged'), 'learned');

  // Same format in the exported spec: a learned line and a seed line differ only
  // by op (REC vs DEF) — same kind/token/weight shape, same store.
  const spec = c1.exportJSONL().split('\n').map(s => JSON.parse(s));
  const learnedLine = spec.find(l => l.token === 'pinged');
  const seedLine    = spec.find(l => l.kind === 'copula' && l.token === 'is');
  assert.equal(learnedLine.op, 'REC');
  assert.equal(seedLine.op, 'DEF');
  assert.deepEqual(Object.keys(learnedLine).sort(), Object.keys(seedLine).sort(), 'same record shape');

  // A later document inherits the learned convention EXACTLY as it inherited the
  // seeds — it arrives as a prior, with the same authority a seed has.
  const c2 = createConventions({ inherit: c1.exportLedger() });
  assert.ok(c2.isAttributionVerb('pinged'), 'the learned convention is inherited');
  assert.equal(c2.originOf('attribution-verb', 'pinged'), 'prior',
    'inherited sediment arrives as a prior, the same slot the seeds arrive in');
  assert.ok(c2.isCopula('is'), 'the seeded priors are still there too');
  // And the inherited convention is itself defeasible in the new document.
  c2.defeat('attribution-verb', 'pinged');
  assert.equal(c2.isAttributionVerb('pinged'), false, 'inherited conventions stay revisable');
});

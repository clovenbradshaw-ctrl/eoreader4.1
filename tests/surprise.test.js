import { test } from 'node:test';
import assert from 'node:assert/strict';

import { surpriseAt, forwardDist, NOVELTY_RESERVE } from '../src/core/surprise.js';
import { parseText } from '../src/perceiver/parse/index.js';
import { readingAt } from '../src/perceiver/index.js';

// The modality-agnostic surprise core (Track A, docs/spec-one-surprise.md). The TEXT
// path's byte-identical behaviour is pinned by tests/bayes.test.js, which now runs THROUGH
// this core; these pin the core's OWN contract directly, on an abstract basis (arbitrary
// atom keys), so a later modality (music/phasepost) pointed at it has a fixed target.

const m = (obj) => new Map(Object.entries(obj));

test('an opening — and a first atom with no prior — falls to exactly zero (the reserve self-zeroes)', () => {
  // Nothing arrived, nothing to move belief against.
  assert.equal(surpriseAt(new Map(), new Map(), { gamma: 0.7 }).bayesBits, 0);
  // The very first arrival has no prior to diverge from → exactly zero, the honest opening
  // (the reserve atom sits in both prior and posterior and cancels). No infinite name-snow.
  assert.equal(surpriseAt(new Map(), m({ 'f:a': 1 }), { gamma: 0.7 }).bayesBits, 0);
});

test('a newcomer against an established prior moves belief a FINITE positive amount', () => {
  const { bayesBits, bayesBy } = surpriseAt(m({ 'f:a': 3 }), m({ 'f:b': 1 }), {
    gamma: 0.7, axisLabel: (k) => k.slice(2),
  });
  assert.ok(Number.isFinite(bayesBits) && bayesBits > 0, `finite positive, got ${bayesBits}`);
  assert.ok(bayesBy.b > 0 && !('a' in bayesBy),
    'belief moved TOWARD the newcomer b, not the decaying incumbent a');
});

test('KL is clamped ≥ 0; bayesBy renders axes via the callback and keeps only positive moves', () => {
  const { bayesBits, bayesBy } = surpriseAt(
    m({ 'f:a': 2, 'f:b': 1 }),
    m({ 'f:b': 1, 'p:a|loves|b': 1 }),          // confirm b, plus a new proposition
    { gamma: 0.7, axisLabel: (k) => k.toUpperCase() });
  assert.ok(bayesBits >= 0);
  assert.ok(Object.keys(bayesBy).length > 0 && Object.keys(bayesBy).every(k => k === k.toUpperCase()),
    'axis labels are produced by the front-end callback, not the core');
  assert.ok(Object.values(bayesBy).every(v => v > 0), 'only the dimensions belief moved toward are recorded');
});

test('novelty defaults to the reserve constant', () => {
  const a = surpriseAt(m({ x: 2 }), m({ y: 1 }), { gamma: 0.7 });
  const b = surpriseAt(m({ x: 2 }), m({ y: 1 }), { gamma: 0.7, novelty: NOVELTY_RESERVE });
  assert.equal(a.bayesBits, b.bayesBits);
});

// --- forwardDist: p(next | profile), the FORWARD object (Track A keystone). -------------

test('forwardDist is a proper distribution — Σ p + reserve = 1, ranked, with the reserve open', () => {
  const { dist, reserve, Z } = forwardDist(m({ 'f:a': 3, 'f:b': 1 }), { novelty: 1 });
  assert.equal(Z, 5);                                            // 3 + 1 + novelty(1)
  assert.equal(dist[0][0], 'f:a', 'the heaviest incumbent leads the draw');
  const total = dist.reduce((s, [, p]) => s + p, 0) + reserve;
  assert.ok(Math.abs(total - 1) < 1e-9, `sums to 1, got ${total}`);
  assert.ok(reserve > 0, 'an unseen atom always keeps a slice — the basis is open');
});

test('forwardDist on an empty profile puts ALL mass on the unseen (the opening draws novelty)', () => {
  const { dist, reserve } = forwardDist(new Map(), { novelty: 1 });
  assert.deepEqual(dist, []);
  assert.equal(reserve, 1);
});

// --- p(next) wired through reading, OPT-IN so default reading stays byte-identical. ------

const STORY = 'Grete Vale entered. Grete sat. Grete read. Gregor Pike arrived. Gregor coughed. Gregor waited.';

// --- EXACT-VALUE PARITY GOLDEN. ---------------------------------------------------------
// The existing read/bayes goldens assert only `== 0` (opening) and ORDERINGS (newcomer >
// recurrence), so a small numeric drift in the extracted core would pass unseen. These pin
// exact mid-stream values — verified byte-identical against the pre-extraction inline
// reading.js over two full texts (data/metamorphosis.txt, data/esker.txt). A future
// refactor of surpriseAt that shifts a value trips here.
test('exact-value parity: the extracted core reproduces the inline surprise byte-for-byte', () => {
  const doc = parseText(
    'Ada Long spoke. Ada Long spoke. Ben Cole arrived. Ben Cole spoke. Cara Dove entered. Cara Dove spoke.',
    { docId: 'gold' });
  const at = (c) => { const r = readingAt(doc, c); return [r.surprisalBits, r.bayesBits]; };
  assert.deepEqual(at(0), [0, 0],      'opening is zero on both channels');
  assert.deepEqual(at(1), [1, 0.05],   'a confirming recurrence (Ada) barely moves belief');
  assert.deepEqual(at(2), [1.43, 0.2], 'a newcomer (Ben) — exact surprisal + KL');
  assert.deepEqual(at(4), [1.82, 0.26],'a third figure (Cara) into a committed cast');
});

test('readingAt exposes p(next) ONLY under { forward:true } — default is byte-identical (parity)', () => {
  const doc = parseText(STORY, { docId: 'pn' });
  assert.equal(readingAt(doc, 3).pNext, undefined, 'no forward field unless asked — the goldens are untouched');

  const r = readingAt(doc, 3, { forward: true });               // after three Grete units
  assert.ok(r.pNext && Array.isArray(r.pNext.dist) && r.pNext.dist.length > 0, 'p(next) is materialised');
  const total = r.pNext.dist.reduce((s, [, p]) => s + p, 0) + r.pNext.reserve;
  assert.ok(Math.abs(total - 1) < 1e-9, `a proper distribution, got ${total}`);
  // The profile is the proposition field, so the standing figure leads what is expected next.
  assert.ok(r.pNext.dist[0][0].startsWith('f:') && r.pNext.dist[0][0].includes('grete'),
    `the heaviest incumbent (Grete) leads p(next), got ${r.pNext.dist[0][0]}`);
});

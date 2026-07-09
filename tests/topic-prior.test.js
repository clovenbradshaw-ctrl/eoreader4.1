// Topic-weighted retrieval (docs comment in src/retrieve/hybrid.js). A soft prior over the referent
// field: when the turn has resolved a SUBJECT, a span that names only OFF-topic referents is a
// homonym slipping in by surface form. It is damped — a multiplier, never a gate — so it sinks below
// the activation floor and reserveBySource stops reserving it. The animal "essay about dolphins"
// that grounded on the Miami Dolphins is the load-bearing case (the same corpus the chrome filters
// in retrieve.test.js were cut from).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyTopicPrior, reserveBySource, retrieveHybrid } from '../src/retrieve/hybrid.js';
import { parseText } from '../src/perceiver/parse/pipeline.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';

// A doc that answers sentenceEmbeddings per organ, mirroring retrieve.test.js's harness.
const withPerOrganEmbeddings = (doc) => {
  const cache = new Map();
  doc.sentenceEmbeddings = async (e) => {
    const key = e?.id || 'default';
    if (!cache.has(key)) cache.set(key, Promise.all(doc.sentences.map((s) => e.embed(s))));
    return cache.get(key);
  };
  return doc;
};

// ── 1. The pure prior ─────────────────────────────────────────────────────────────────────────

test('applyTopicPrior damps an OFF-topic named span, leaves an on-topic and a no-referent span alone', () => {
  const ANIMAL = 'ent-dolphin', TEAM = 'ent-miami', OCEAN = 'ent-ocean';
  const topicIds = new Set([ANIMAL, OCEAN]);       // the subject and one graph neighbour
  const spans = [
    { idx: 0, score: 0.8, text: 'dolphins are mammals' },   // names the subject → on-topic
    { idx: 1, score: 0.8, text: 'they live in the ocean' }, // names a neighbour → on-topic
    { idx: 2, score: 0.8, text: 'they are social' },        // names nothing → framing, neutral
    { idx: 3, score: 0.8, text: 'the Miami Dolphins won' }, // names only the team → off-topic
  ];
  const namedRefsOf = (s) => ({ 0: [ANIMAL], 1: [OCEAN], 2: [], 3: [TEAM] }[s.idx]);

  const out = applyTopicPrior(spans, namedRefsOf, topicIds, { floor: 0.25 });
  assert.equal(out[0].score, 0.8, 'subject span untouched');
  assert.equal(out[1].score, 0.8, 'neighbour span untouched');
  assert.equal(out[2].score, 0.8, 'no-referent framing span untouched');
  assert.ok(Math.abs(out[3].score - 0.2) < 1e-9, 'off-topic homonym span damped ×0.25');
  // Pure: the input array and its span objects are never mutated.
  assert.equal(spans[3].score, 0.8, 'the input span is not mutated');
});

test('applyTopicPrior is a byte-identical no-op with no topic frame', () => {
  const spans = [{ idx: 0, score: 0.9, text: 'a' }, { idx: 1, score: 0.5, text: 'b' }];
  assert.equal(applyTopicPrior(spans, null, null), spans, 'no namedRefsOf / no topicIds → same array');
  assert.equal(applyTopicPrior(spans, () => ['x'], new Set()), spans, 'empty topicIds → same array');
  assert.equal(applyTopicPrior(spans, 'not-a-fn', new Set(['x'])), spans, 'non-function namedRefsOf → same array');
});

test('applyTopicPrior honours a custom floor (0 = a hard sink, 1 = inert)', () => {
  const spans = [{ idx: 0, score: 0.6, text: 'off' }];
  const off = () => ['off-topic-id'];
  const topic = new Set(['on-topic-id']);
  assert.equal(applyTopicPrior(spans, off, topic, { floor: 0 })[0].score, 0, 'floor 0 sinks it fully');
  assert.equal(applyTopicPrior(spans, off, topic, { floor: 1 })[0].score, 0.6, 'floor 1 is inert');
});

// ── 2. The prior CLOSES the reservation leak (the writeup's core claim) ─────────────────────────
// A composite: a long local book (non-web) + an animal-dolphin web page + a Miami-Dolphins web page.
// The football page's best "dolphin" span out-scores the weakest book span, so reserveBySource — which
// guarantees every activated web source its best span — seats it (the drift). Damp it below the
// activation floor first and the football SOURCE is no longer "activated", so nothing reserves it,
// while the on-topic animal page keeps its reserved slot.

test('a damped homonym span drops below the activation floor, so reserveBySource stops reserving it', () => {
  const book   = { docId: 'pg-book.txt' };                       // the long loaded document (non-web)
  const animal = { docId: 'dolphin-wiki', web: { url: 'x' } };   // on-topic web page
  const team   = { docId: 'miami-wiki',   web: { url: 'y' } };   // homonym web page
  const origin = (idx) => ({
    0: { doc: book }, 1: { doc: book }, 2: { doc: book }, 3: { doc: book }, 4: { doc: book },
    5: { doc: animal }, 6: { doc: team },
  }[idx] || null);
  const spans = [
    { idx: 0, score: 0.90, text: 'book' }, { idx: 1, score: 0.85, text: 'book' },
    { idx: 2, score: 0.80, text: 'book' }, { idx: 3, score: 0.75, text: 'book' },
    { idx: 4, score: 0.70, text: 'book' },
    { idx: 5, score: 0.50, text: 'Dolphins are marine mammals.' },              // animal, on topic
    { idx: 6, score: 0.45, text: 'The Miami Dolphins play in Miami.' },         // homonym, off topic
  ];
  const isWeb = (d) => !!(d && d.web);

  // Baseline: the football span is web-activated and reserved (this is the drift the prior closes).
  const before = reserveBySource(spans, origin, isWeb, { k: 6 }).map((s) => s.idx);
  assert.ok(before.includes(6), 'without the prior, the homonym football span is reserved');

  // With the prior: topic = the animal only. The football span names the team → damped 0.45 → 0.1125,
  // below the 0.15 floor, so the football source no longer activates and is not reserved; the animal
  // span (untouched, 0.50) keeps its slot.
  const ANIMAL = 'ent-dolphin', TEAM = 'ent-miami';
  const namedRefsOf = (s) => (/Miami/.test(s.text) ? [TEAM] : /Dolphins/.test(s.text) ? [ANIMAL] : []);
  const damped = applyTopicPrior(spans, namedRefsOf, new Set([ANIMAL]), { floor: 0.25 });
  const after  = reserveBySource(damped, origin, isWeb, { k: 6, activationFloor: 0.15 }).map((s) => s.idx);

  assert.ok(!after.includes(6), 'with the prior, the homonym span is no longer reserved');
  assert.ok(after.includes(5), 'the on-topic animal source keeps its reserved slot');
  assert.equal(after.length, 6);
});

// ── 3. retrieveHybrid threads the prior end to end ──────────────────────────────────────────────
// The real hybrid retrieve over a two-sense document: the query "dolphins" matches both sentences by
// surface form. A topic frame naming only the animal damps the football sentence a quarter and leaves
// the animal sentence untouched — proving the plumbing, not just the pure function.

test('retrieveHybrid applies the topic prior: the off-sense homonym span is damped, the on-sense one is not', async () => {
  const doc = withPerOrganEmbeddings(parseText(
    'Dolphins are marine mammals that live in the ocean. The Miami Dolphins are a football team from Miami.',
    { docId: 'composite' },
  ));
  const embedder = createHashEmbedder();
  const query = 'dolphins';

  const plain = await retrieveHybrid(doc, query, embedder, 5);
  const ANIMAL = 'animal-dolphin', TEAM = 'miami-dolphins';
  const namedRefsOf = (s) => (/Miami|football|team/i.test(s.text) ? [TEAM] : [ANIMAL]);
  const weighted = await retrieveHybrid(doc, query, embedder, 5, { topicIds: new Set([ANIMAL]), namedRefsOf, floor: 0.25 });

  const scoreOf = (rows, re) => { const r = rows.find((s) => re.test(s.text)); return r ? r.score : 0; };
  assert.ok(scoreOf(plain, /Miami/) > 0, 'the football sentence is retrieved at all (both match "dolphins")');
  assert.ok(Math.abs(scoreOf(weighted, /Miami/) - scoreOf(plain, /Miami/) * 0.25) < 1e-9,
    'the off-sense span is damped to a quarter of its fused score');
  assert.ok(Math.abs(scoreOf(weighted, /marine/) - scoreOf(plain, /marine/)) < 1e-9,
    'the on-sense span is untouched');
  assert.ok(/marine/.test(weighted[0].text), 'under the prior the on-topic sense ranks first');
});

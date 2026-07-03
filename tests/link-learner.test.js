import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { createLinkLearner, structuralHorizon } from '../src/surfer/index.js';

// The persistent learner: the label-feedback loop closed in-process. It accumulates the
// structural features of untyped links and PROMOTES a verb to a learned link-type only when
// its links cohere beyond a cumulative same-operator null — then reads later documents
// through the grown basis. No embedder, nothing posted out; the learning lives inside.

// a structurally uniform verb among a varied same-operator null pool — the kind of
// regularity a learned type SHOULD capture.
const tight = (n, via) => Array.from({ length: n }, () => ({ op: 'CON', via, coupling: 1, tgtKind: 'np', polarity: 1, ctx: [1, 1, 0, 1, 0, 0, 1, 0, 0] }));
const noise = (n, seed = 7) => { let x = seed >>> 0; const r = () => { x = (x * 1103515245 + 12345) >>> 0; return x / 0x100000000; }; return Array.from({ length: n }, (_, i) => ({ op: 'CON', via: 'v' + (i % 17), coupling: r(), tgtKind: r() < 0.5 ? 'entity' : 'np', polarity: r() < 0.5 ? 1 : -1, ctx: Array.from({ length: 9 }, () => r()) })); };

test('a structurally uniform verb beats the same-operator null and is promoted', () => {
  const learner = createLinkLearner({ minEvidence: 6, samples: 300 });
  const res = learner.observeLinks([...tight(8, 'ringed'), ...noise(60)]);
  assert.equal(res.learnedCount, 1, 'one learned type');
  assert.deepEqual(res.newlyLearned, ['CON/ringed'], 'the operator stays first; the type is grown under it');
  const rec = learner.learnedTypes()[0];
  assert.ok(rec.coherence > rec.nullLine, 'promotion required beating the derived null — never asserted');
});

test('too little evidence is never promoted (no learning off a couple of sightings)', () => {
  const learner = createLinkLearner({ minEvidence: 6, samples: 300 });
  const res = learner.observeLinks([...tight(3, 'ringed'), ...noise(60)]);
  assert.equal(res.learnedCount, 0, 'below minEvidence the verb waits, it is not learned');
});

test('promotions are sticky and accumulation is cumulative across observe calls', () => {
  const learner = createLinkLearner({ minEvidence: 6, samples: 300 });
  const a = learner.observeLinks([...tight(3, 'ringed'), ...noise(30)]);
  assert.equal(a.learnedCount, 0, 'not enough evidence yet');
  const b = learner.observeLinks([...tight(5, 'ringed'), ...noise(30, 99)]);
  assert.equal(b.linksSeen, a.linksSeen + 5 + 30, 'links seen accumulate across documents');
  assert.equal(b.learnedCount, 1, 'evidence crossed the bar on the second document');
  const c = learner.observeLinks(noise(10, 5));
  assert.equal(c.learnedCount, 1, 'once learned, the type stays — promotions are sticky');
});

test('typeLink reports the operator (first level) and the learned type (second) when it applies', () => {
  const learner = createLinkLearner({ minEvidence: 6, samples: 300 });
  learner.observeLinks([...tight(8, 'ringed'), ...noise(60)]);
  assert.deepEqual(learner.typeLink({ op: 'CON', via: 'ringed' }), { op: 'CON', learnedType: 'CON/ringed' });
  assert.deepEqual(learner.typeLink({ op: 'CON', via: 'unseen' }), { op: 'CON', learnedType: null });
});

test('activationsFor grows the basis by one dimension per learned type', () => {
  const learner = createLinkLearner({ minEvidence: 6, samples: 300 });
  const doc = parseText('Gregor woke. Grete brought milk.', { docId: 's' });
  assert.equal(learner.activationsFor(doc).dims.length, 9, 'before learning: operators only');
  learner.observeLinks([...tight(8, 'ringed'), ...noise(60)]);
  const grown = learner.activationsFor(doc);
  assert.equal(grown.dims.length, 10, 'after learning: operators + one grown dimension');
  assert.equal(grown.dims[9], 'CON/ringed', 'the grown dimension is the learned type');
  assert.equal(grown.activations.length, (doc.units || doc.sentences).length, 'one activation row per unit');
});

test('snapshot makes the learned vocabulary persist; restore re-seeds it', () => {
  const learner = createLinkLearner({ minEvidence: 6, samples: 300 });
  learner.observeLinks([...tight(8, 'ringed'), ...noise(60)]);
  const snap = learner.snapshot();
  assert.deepEqual(snap.learned.map(r => r.key), ['CON/ringed']);
  const restored = createLinkLearner({ restore: snap });
  assert.deepEqual(restored.vocabulary(), ['CON/ringed'], 'the learned vocabulary survives a round-trip');
  assert.equal(restored.docsSeen, snap.docsSeen);
});

test('family-wise correction: a vocabulary of pure noise promotes (almost) nothing', () => {
  // many distinct verbs, none structurally concentrated — just random same-operator links.
  // Without correcting for the number of verbs tested, a 0.05 line would leak ~5% as noise;
  // tying the null to the family size holds the bar so noise does not become "learning".
  const learner = createLinkLearner({ minEvidence: 8, samples: 200 });
  let x = 12345 >>> 0; const r = () => { x = (x * 1103515245 + 12345) >>> 0; return x / 0x100000000; };
  const links = [];
  for (let v = 0; v < 40; v++) for (let i = 0; i < 8; i++)
    links.push({ op: 'CON', via: 'noise' + v, coupling: r(), tgtKind: r() < 0.5 ? 'entity' : 'np', polarity: r() < 0.5 ? 1 : -1, ctx: Array.from({ length: 9 }, () => r()) });
  learner.observeLinks(links);
  assert.ok(learner.learnedTypes().length <= 2, `noise should rarely promote, got ${learner.learnedTypes().length}`);
});

test('structuralHorizon reads a document through the grown basis when given the learner', () => {
  const learner = createLinkLearner({ minEvidence: 6, samples: 300 });
  const doc = parseText('Gregor woke. Grete brought milk. The father turned away.', { docId: 's' });
  const before = structuralHorizon(doc, { k: 3 });
  assert.equal(before.dims.length, 9, 'without the learner: operators only');
  learner.observeLinks([...tight(8, 'ringed'), ...noise(60)]);
  const after = structuralHorizon(doc, { k: 3, learner });
  assert.ok(after.dims.includes('CON/ringed'), 'with the learner: the reading is constituted through a learned distinction');
  assert.equal(after.dims.length, 10);
});

test('deterministic — the same ingest yields the same promotion (no Date/Math.random)', () => {
  const a = createLinkLearner({ minEvidence: 6, samples: 200 });
  const b = createLinkLearner({ minEvidence: 6, samples: 200 });
  a.observeLinks([...tight(8, 'ringed'), ...noise(60)]);
  b.observeLinks([...tight(8, 'ringed'), ...noise(60)]);
  assert.deepEqual(a.learnedTypes(), b.learnedTypes(), 'the seeded null makes learning reproducible');
});

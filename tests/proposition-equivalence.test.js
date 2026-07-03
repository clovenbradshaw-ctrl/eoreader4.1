import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  discoverPropositionEquivalence, attestEquivalenceFrom, mutualNearestPropositions,
  evaluatePropositionPair, propositionPolarity,
} from '../src/perceiver/proposition-equivalence.js';
import { createLog } from '../src/core/log.js';

// ── A deterministic, MiniLM-FAITHFUL synthetic embedder ──────────────────────────
//
// We cannot download MiniLM in a unit test, but the mechanism is the embedder's
// CONSUMER, not the embedder. So we stand in a fake meaning space with the property
// that matters: a shared positive baseline (unrelated clauses still cosine ~0.4, as
// real sentence embeddings do) plus a per-CONCEPT direction. Paraphrases declare the
// same concept; unrelated clauses declare distinct ones. `measuresMeaning` is true —
// this stands in for the warm MiniLM organ. (The real measurement is gated on the
// MiniLM download, the same seam the geometric classifier ships behind.)
const D = 80;
const rng = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);   // repo idiom
const gauss = (r) => (r() + r() + r() + r() - 2);
const norm = (v) => { const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1; return v.map(x => x / n); };

// concept c → unique dim 8+c (kept < D); seed re-rolls only the topic spread, so a
// paraphrase (same concept, fresh seed) lands NEAR but not identical (~0.7 cosine).
const conceptVec = (seed, concept) => {
  const r = rng(seed);
  const v = new Array(D).fill(0);
  v[0] = 0.5;                                  // shared baseline → positive cosines
  for (let i = 1; i < 8; i++) v[i] = 0.45 * gauss(r);   // topic spread → realistic variance
  v[8 + concept] = 1.1;                        // the concept's own dominant direction
  return new Float32Array(norm(v));
};

// The clause → (concept, seed) table. Paraphrases share a concept; distractors don't.
const SPACE = {
  'Ralph owns a boat':              [0, 11],
  'Ralph is the owner of a boat':   [0, 12],   // ← paraphrase of the same proposition
  'Ralph does not own a boat':      [0, 13],   // ← same content, the parser cut polarity '−'
  'Grete plays the violin':         [1, 21],
  'The violin is played by Grete':  [1, 22],   // ← paraphrase 2
  'The dog slept by the fire':      [2, 31],
  'The train left at noon':         [3, 41],
  'Snow fell on the rooftops':      [4, 51],
  'He counted the coins':           [5, 61],
};
const meaningEmbedder = {
  measuresMeaning: true,
  embed: async (text) => {
    const e = SPACE[text];
    if (e) return conceptVec(e[1], e[0]);
    // any unlisted clause → its own concept, hashed deterministically from the text
    let h = 0; for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return conceptVec(h, 70 + (h % 8));
  },
};
// The hash organ: a real vector, but it does NOT measure meaning (spelling space).
const hashEmbedder = { measuresMeaning: false, embed: async () => new Float32Array(D).fill(0.1) };

// ── The EVA primitive — same / opposed / open, mirroring asterisk's promote/split/open
test('evaluatePropositionPair: same when it clears the null and polarities agree', () => {
  const v = evaluatePropositionPair({ sim: 0.8, polarityA: '+', polarityB: '+', boundary: 0.5 });
  assert.equal(v.verdict, 'same');
  assert.equal(v.clears, true);
});

test('evaluatePropositionPair: opposed when it clears the null but polarities clash', () => {
  // Same content, opposite sign — a high cosine is exactly when polarity is the only
  // thing telling them apart. Conflict dominates: never a merge.
  const v = evaluatePropositionPair({ sim: 0.9, polarityA: '+', polarityB: '-', boundary: 0.5 });
  assert.equal(v.verdict, 'opposed');
  assert.equal(v.polarityClash, true);
});

test('evaluatePropositionPair: open when the cosine does not clear the null', () => {
  const v = evaluatePropositionPair({ sim: 0.4, polarityA: '+', polarityB: '+', boundary: 0.5 });
  assert.equal(v.verdict, 'open');
  assert.equal(v.clears, false);
});

// ── The headline case, under an explicit boundary (deterministic mechanism) ──────
test('"Ralph owns a boat" ≡ "Ralph is the owner of a boat" — attested as the same proposition', async () => {
  const props = ['Ralph owns a boat', 'Ralph is the owner of a boat', 'The dog slept by the fire'];
  const out = await discoverPropositionEquivalence(props, { embedder: meaningEmbedder, minSim: 0.5 });
  assert.equal(out.live, true);
  // exactly one merge: the two Ralph clauses; the dog clause stands alone
  assert.equal(out.pairs.length, 1);
  const merged = out.classes.find(c => c.length > 1);
  assert.deepEqual(merged.map(i => props[i]).sort(),
    ['Ralph is the owner of a boat', 'Ralph owns a boat']);
  assert.ok(out.classes.some(c => c.length === 1 && props[c[0]] === 'The dog slept by the fire'));
});

// ── The Born-rule path: paraphrases clear the field's own null; noise abstains ───
test('alpha derives the null online: the two paraphrase pairs clear it, the distractors do not', async () => {
  const props = [
    'Ralph owns a boat', 'Ralph is the owner of a boat',        // pair A
    'Grete plays the violin', 'The violin is played by Grete',  // pair B
    'The dog slept by the fire', 'The train left at noon',
    'Snow fell on the rooftops', 'He counted the coins',
  ];
  const out = await discoverPropositionEquivalence(props, { embedder: meaningEmbedder, alpha: 0.01 });
  assert.equal(out.live, true);
  assert.equal(out.pairs.length, 2, 'exactly the two paraphrase pairs are attested');
  const classes = out.classes.filter(c => c.length > 1).map(c => c.map(i => props[i]).sort());
  assert.ok(classes.some(c => c[0] === 'Ralph is the owner of a boat'));
  assert.ok(classes.some(c => c.includes('The violin is played by Grete')));
  assert.equal(out.voided, false);
});

test('Born-rule ABSTENTION: a field of all-distinct propositions merges nothing and voids', async () => {
  // No paraphrases planted — the correct, rare behaviour is silence. The mutual-nearest
  // argmax still proposes pairs, but none beats what the field's own noise produces.
  const props = [
    'The dog slept by the fire', 'The train left at noon', 'Snow fell on the rooftops',
    'He counted the coins', 'A letter arrived on Monday', 'The lamp flickered once',
    'Rain streaked the glass', 'The bell rang twice',
  ];
  const out = await discoverPropositionEquivalence(props, { embedder: meaningEmbedder, alpha: 0.01 });
  assert.equal(out.pairs.length, 0, 'nothing clears its own null — abstains');
  assert.equal(out.voided, true, 'the absence is asserted, not silent');
  assert.equal(out.classes.length, props.length, 'every proposition stands alone');
});

// ── The polarity veto: a negation is NOT a paraphrase, however near the embedding ─
test('polarity clash forks "Ralph owns a boat" from "Ralph does not own a boat" — opposed, not merged', async () => {
  // Both clauses are about Ralph+boat ownership, so their embeddings are near (concept 0).
  // The parser cut the second one's polarity to '−'. The veto refuses the merge.
  const props = [
    { clause: 'Ralph owns a boat', polarity: '+' },
    { clause: 'Ralph does not own a boat', polarity: '−' },   // U+2212, the parser's sign
    { clause: 'Grete plays the violin', polarity: '+' },
    { clause: 'The violin is played by Grete', polarity: '+' },
  ];
  const out = await discoverPropositionEquivalence(props, { embedder: meaningEmbedder, alpha: 0.01 });
  assert.equal(out.opposed.length, 1, 'the negation is caught as an opposition');
  assert.ok(out.pairs.every(p => !(props[p.i].clause.includes('owns') && props[p.j].clause.includes('own'))),
    'the Ralph pair is never merged');
  // and the genuine paraphrase (Grete) is still attested through the same run
  assert.ok(out.classes.some(c => c.length === 2 && c.every(i => /violin/.test(props[i].clause))));
});

test('propositionPolarity reads the parser sign (−), the proposition slot (-), and defaults +', () => {
  assert.equal(propositionPolarity({ clause: 'x', polarity: '−' }), '-');   // U+2212, relations.js
  assert.equal(propositionPolarity({ clause: 'x', polarity: '-' }), '-');   // ASCII, proposition.js
  assert.equal(propositionPolarity({ clause: 'x' }), '+');
  assert.equal(propositionPolarity('a bare string'), '+');
});

// ── The firewall: under the hash organ, hold every pair at no-commit ─────────────
test('the firewall: a spelling-space embedder holds every pair — equivalence is meaning-only', async () => {
  const props = ['Ralph owns a boat', 'Ralph is the owner of a boat'];
  const out = await discoverPropositionEquivalence(props, { embedder: hashEmbedder, alpha: 0.01 });
  assert.equal(out.live, false);
  assert.equal(out.reason, 'weak-embedder');
  assert.equal(out.pairs.length, 0, 'no merge committed off a cosine that measures nothing');
  assert.equal(out.classes.length, 2, 'both propositions stand apart, held');
});

// ── Transitivity through the union-find (a paraphrase chain collapses to one class)
test('equivalence is transitive: a mutual cluster collapses to one class via union-find', () => {
  // Three propositions all mutually nearest (a tight paraphrase cluster) plus a far
  // outlier. Each cluster member is the others' equal-nearest (ties kept), so all three
  // candidates fire and the union-find folds them into one class — the same transitive
  // collapse 110↔220↔440 makes in equivalence.js. (A strict CHAIN, by contrast, would
  // not fully connect under mutual-nearest — that is the rule working, not a gap.)
  const r = rng(7);
  const c = new Float32Array(norm(Array.from({ length: D }, (_, i) => (i === 0 ? 0.5 : (i < 8 ? 0.45 * gauss(r) : (i === 9 ? 1.0 : 0))))));
  const outlier = new Float32Array(norm(Array.from({ length: D }, (_, i) => (i === 20 ? 1 : 0))));
  const vectors = [Float32Array.from(c), Float32Array.from(c), Float32Array.from(c), outlier];
  const out = attestEquivalenceFrom(vectors, [], { minSim: 0.5 });
  const big = out.classes.find(cl => cl.length > 1);
  assert.deepEqual(big.sort((a, b) => a - b), [0, 1, 2], 'the cluster is one class; the outlier stands alone');
  assert.ok(out.classes.some(cl => cl.length === 1 && cl[0] === 3));
});

// ── Mutual-nearest: a weak argmax does not force a merge unless it is reciprocated ─
test('mutualNearestPropositions pairs only reciprocated nearest neighbours', () => {
  const r = rng(3);
  const v = (concept, eps) => { const a = new Array(D).fill(0); a[0] = 0.5; for (let i = 1; i < 8; i++) a[i] = 0.45 * gauss(r); a[8 + concept] = 1.1 + eps; return new Float32Array(norm(a)); };
  const vectors = [v(0, 0), v(0, 0.02), v(5, 0)];   // 0 and 1 are each other's nearest; 2 is alone
  const pairs = mutualNearestPropositions(vectors);
  assert.equal(pairs.length, 1);
  assert.deepEqual([pairs[0].i, pairs[0].j], [0, 1]);
});

// ── Emission: the loop writes SYN / NUL / DEF-void into an append-only log ────────
test('emit writes a SYN merge per attested pair and a held NUL, keyed by proposition id', async () => {
  const props = [
    { clause: 'Ralph owns a boat', id: 'r1' },
    { clause: 'Ralph is the owner of a boat', id: 'r2' },
    { clause: 'The dog slept by the fire', id: 'd1' },
  ];
  const log = createLog({ docId: 'props' });
  const out = await discoverPropositionEquivalence(props, { embedder: meaningEmbedder, minSim: 0.5, emit: true, log });
  const events = log.snapshot();
  const syn = events.find(e => e.op === 'SYN' && e.kind === 'merge');
  assert.ok(syn, 'a SYN merge is appended');
  assert.deepEqual([syn.from, syn.to].sort(), ['r1', 'r2'], 'keyed by the propositions\' ids');
  assert.equal(syn.via, 'same-proposition');
  assert.equal(out.pairs.length, 1);
});

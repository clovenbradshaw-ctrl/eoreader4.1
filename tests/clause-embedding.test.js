import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestText } from '../src/organs/in/text.js';
import { parseText, buildClauses, clauseForVerb } from '../src/perceiver/parse/index.js';
import { retrieveSemantic } from '../src/retrieve/semantic.js';
import { buildMeaningRead } from '../src/enact/index.js';

// A fake MEANING organ: a normalized bag over concept axes, so a paraphrase with no
// shared spelling still lands near its concept — and, crucially, POOLING a compound
// sentence dilutes the relevant axis with the irrelevant clause's, exactly the defect
// clause grain removes. (The same shape retrieve.test.js uses.)
const AXIS = {
  weather: 0, dreary: 0, rambled: 0, hours: 0, rain: 0, cloud: 0, alice: 0, discussed: 0,
  treaty: 1, signed: 1, vienna: 1, accord: 1, pact: 1, sign: 1,
  cat: 2, fire: 2, sat: 2, hearth: 2,
  ship: 3, sank: 3, storm: 3, sea: 3, drowned: 3,
};
const conceptEmbedder = (warm = true) => ({
  id: 'fake-concept', measuresMeaning: true, isWarm: () => warm, async warm() {},
  async embed(text) {
    const v = new Float64Array(4);
    for (const t of String(text).toLowerCase().split(/[^a-z]+/)) if (t && t in AXIS) v[AXIS[t]] += 1;
    const n = Math.hypot(...v) || 1;
    return Float32Array.from(v, (x) => x / n);
  },
});

// ── The clause layer itself ──────────────────────────────────────
test('buildClauses flattens compound sentences and keeps sentence-index provenance', () => {
  const doc = parseText('Alice discussed the weather, and the treaty was signed in Vienna. Vienna is old.',
    { docId: 'd' });
  const clauses = buildClauses(doc.sentences);
  assert.ok(clauses.length >= 3, 'the compound sentence splits into ≥2 clauses plus the second sentence');
  // Both halves of sentence 0 remember sentIdx 0 — a clause-grain match cites the sentence.
  const s0 = clauses.filter(c => c.sentIdx === 0);
  assert.equal(s0.length, 2, 'the compound sentence 0 yields two clauses');
  assert.ok(/weather/.test(s0[0].text) && /treaty/.test(s0[1].text), 'the two clauses carry their own text');
  assert.ok(clauses.some(c => c.sentIdx === 1), 'the second sentence keeps its own index');
});

test('a single-clause sentence yields exactly one clause == the sentence (byte-identical grain)', () => {
  const doc = parseText('Samsa was a travelling salesman.', { docId: 'd' });
  const clauses = buildClauses(doc.sentences);
  assert.equal(clauses.length, 1);
  assert.equal(clauses[0].text, 'Samsa was a travelling salesman.');
  assert.equal(clauses[0].sentIdx, 0);
});

test('clauseForVerb narrows to the clause carrying the verb, else returns the whole sentence', () => {
  const s = 'Alice discussed the weather, and the treaty was signed in Vienna.';
  assert.equal(clauseForVerb(s, 'signed'), 'the treaty was signed in Vienna.');
  assert.equal(clauseForVerb(s, 'discussed'), 'Alice discussed the weather');
  // A verb not present, a bare relation, or a single-clause sentence → unchanged.
  assert.equal(clauseForVerb(s, 'flew'), s);
  assert.equal(clauseForVerb('caused', 'caused'), 'caused');
});

// ── Clause-grain retrieval beats the pooled sentence (the RAG-competitive edge) ──
test('clause-grain retrieval isolates a buried clause the pooled sentence would dilute', async () => {
  // Sentence 0 buries the answer clause among a long irrelevant weather clause; a pooled
  // sentence vector averages the treaty signal down. Clause grain scores the treaty
  // clause on its own → a clean match, and cites sentence 0 (its index is real).
  const doc = await ingestText(
    'Alice rambled on about the dreary weather for hours, and the treaty was signed in Vienna. ' +
    'The cat sat by the fire.',
    { docId: 'd' });
  const emb = conceptEmbedder(true);
  const hits = await retrieveSemantic(doc, 'Where was the treaty signed?', emb, 5);

  assert.equal(hits[0].idx, 0, 'the sentence holding the answer clause is top-ranked');
  assert.ok(hits[0].score > 0.99, 'the buried clause matches cleanly — no pooling dilution');
  assert.equal(hits[0].text, 'the treaty was signed in Vienna.',
    'the excerpt shown is the precise clause, not the whole sentence');

  // The pooled-sentence baseline (the old grain) scores the SAME sentence strictly lower,
  // because the weather clause dilutes the treaty axis — the loss clause grain recovers.
  const qVec = await emb.embed('Where was the treaty signed?');
  const sVec = (await doc.sentenceEmbeddings(emb))[0];
  const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return d / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9); };
  assert.ok(hits[0].score > cos(qVec, sVec) + 0.05,
    'clause grain beats the pooled sentence on the same answer');
});

test('semantic retrieval keeps the sentence-grain fallback when a doc has no clause layer', async () => {
  // A bare parseText doc with only a sentenceEmbeddings stub (no clauses) still retrieves.
  const doc = parseText('The treaty was signed in Vienna. Alice loves apples.', { docId: 'd' });
  doc.sentenceEmbeddings = async (e) => Promise.all(doc.sentences.map(s => e.embed(s)));
  const hits = await retrieveSemantic(doc, 'where was the treaty signed', conceptEmbedder(true), 5);
  assert.equal(hits[0].idx, 0, 'the fallback still finds the treaty line');
  assert.equal(hits[0].text, 'The treaty was signed in Vienna.', 'fallback shows the whole sentence');
});

// ── Clause-grain meaning surprise sees the intra-sentence turn the pool erased ────
test('buildMeaningRead registers an intra-sentence sense-turn a pooled sentence hides', async () => {
  // A COMPOUND opening: a calm hearth clause, then an orthogonal shipwreck clause. Clause
  // grain measures the turn WITHIN the opening (surprise > 0); the old sentence pool, with
  // the opening as its very first unit, could only ever report 0 there.
  const turn = { sentences: ['The cat sat by the fire, and a ship sank in the storm.', 'The cat sat by the fire.'] };
  const mrTurn = await buildMeaningRead(turn, conceptEmbedder(true));
  assert.ok(mrTurn.surprise[0] > 0.9, 'the intra-sentence turn to the shipwreck spikes the opening surprise');

  // Control: the same opening sense with NO second clause stays calm — the opening truly
  // cannot surprise when nothing turns inside it. This is the byte-identical single-clause case.
  const calm = { sentences: ['The cat sat by the fire.', 'The cat sat by the hearth.'] };
  const mrCalm = await buildMeaningRead(calm, conceptEmbedder(true));
  assert.equal(mrCalm.surprise[0], 0, 'a single-clause opening cannot surprise (no prior)');
});

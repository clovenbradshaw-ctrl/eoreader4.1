import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseExemplars, buildShapeLibrary, answerFormError, cosine, centroid } from '../src/turn/shape.js';
import { stages } from '../src/turn/stages.js';
import { expectAnswer } from '../src/turn/expect.js';
import { parseText } from '../src/perceiver/parse/index.js';

// The FORM predictor: what a good answer LOOKS LIKE, learned from sample answers
// (data/exemplars.jsonl) and scored by discriminative cosine. The prediction is the nearest
// sample answer to the question — no template — so it generalizes ("we can predict anything"),
// and it is embedder-gated. Here a deterministic fake embedder stands in for MiniLM.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// A fake meaning embedder: short text → one basis vector, long text → the orthogonal one. So a
// crisp lookup and a rambling synthesis land in orthogonal clusters, and cosine is clean.
const fakeEmbed = async (text) => {
  const wc = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  return wc <= 4 ? [1, 0] : [0, 1];          // short ⇒ lookup basin, long ⇒ synthesis basin
};

const SAMPLES = [
  { id: 'lk1', intent: 'lookup', user_turn: 'who wrote this', response: 'Balzac.' },
  { id: 'lk2', intent: 'lookup', user_turn: 'what is the title', response: 'Father Goriot.' },
  { id: 'sy1', intent: 'synthesis', user_turn: 'what is the book really about and how do its themes connect',
    response: 'It is about money and family obligation slowly corroding affection across the whole arc.' },
  { id: 'sy2', intent: 'synthesis', user_turn: 'draw the threads of the story together for me please',
    response: 'The boarding house gathers strangers whose fortunes turn out to be quietly entangled throughout.' },
];

test('the cosine/centroid primitives behave', () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.deepEqual([...centroid([[2, 0], [0, 0]])], [1, 0]);
});

test('a lookup question answered crisply is in-basin — no form error', async () => {
  const lib = await buildShapeLibrary(SAMPLES, fakeEmbed);
  const qVec = await fakeEmbed('who wrote this');           // short ⇒ matches lookup prompts
  const target = lib.selectForQuestion(qVec);
  assert.equal(target.intent, 'lookup', 'the wanted shape is read off the nearest sample answers');
  const draftVec = await fakeEmbed('Balzac.');             // a crisp lookup-shaped answer
  assert.equal(answerFormError(lib, qVec, draftVec), null, 'in-basin ⇒ no flag');
});

test('a lookup question answered with a rambling synthesis-shaped reply flags (soft)', async () => {
  const lib = await buildShapeLibrary(SAMPLES, fakeEmbed);
  const qVec = await fakeEmbed('who wrote this');
  const draftVec = await fakeEmbed('Well, it is a long and intricate tale of many entangled fortunes and themes.');
  const err = answerFormError(lib, qVec, draftVec);
  assert.ok(err, 'off-basin ⇒ a form error');
  assert.equal(err.dim, 'form');
  assert.equal(err.gates, false, 'form is a smoke alarm — it flags, never gates a restart');
  assert.equal(err.intent, 'lookup');
});

test('the predictor is inert without a library or embedding (byte-identical default)', () => {
  assert.equal(answerFormError(null, [1, 0], [1, 0]), null);
  assert.equal(answerFormError({ selectForQuestion: () => null }, [1, 0], [1, 0]), null);
});

test('the ported sample-answer library loads — 430 records across many intents', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'data', 'exemplars.jsonl'), 'utf8');
  const records = parseExemplars(text);
  assert.ok(records.length >= 400, `expected the full library, got ${records.length}`);
  const intents = new Set(records.map((r) => r.intent));
  assert.ok(intents.has('lookup') && intents.has('synthesis'), 'the intent vocabulary is present');
  assert.ok(records.every((r) => typeof r.response === 'string' && r.response.length), 'every record carries a response');
});

test('form drives revision: an off-shape draft is reshaped toward the matched sample answer', async () => {
  const lib = await buildShapeLibrary(SAMPLES, fakeEmbed);
  const qVec = await fakeEmbed('who wrote this');
  const meaning = { measuresMeaning: true, isWarm: () => true, embed: fakeEmbed };
  const doc = parseText('Father Goriot was written by Balzac.', { docId: 'a' });
  const spans = [{ idx: 0, text: 'Father Goriot was written by Balzac.', score: 1, via: 'lex' }];

  const ctx = {
    question: 'who wrote this',
    expectation: expectAnswer('who wrote this'),          // OPEN — so ONLY form can drive this
    shapeLibrary: lib, shapeQueryVec: qVec,
    shapeTarget: lib.selectForQuestion(qVec),             // intent lookup, sample "Balzac."
    geometricEmbedder: meaning, embedder: meaning,
    doc, spans, task: 'answer', history: [],
    // an off-shape first draft: long, rambling — a synthesis shape for a lookup question
    rawOutput: 'Well now, that is a long and intricate matter of many entangled fortunes and themes.',
    bound: [], edgeVerdicts: [],
    model: { phrase: async () => 'Balzac.' },             // the reshape lands a crisp lookup
  };

  const out = await stages.revise(ctx);
  assert.equal(out.revised.attempts, 1, 'it caught the off-shape draft and answered again');
  assert.ok(out.revised.resolved, 'the reshape is in-basin');
  assert.equal(out.revisions.length, 1);
  assert.match(out.revisions[0].why, /does not read like/i, 'the trail records it reshaped');
  assert.match(out.revisions[0].replacedBy, /Balzac/);
});

test('parseExemplars is defensive — blank lines, comments, and bad JSON are skipped', () => {
  const text = ['', '// a comment', '{bad json', JSON.stringify({ intent: 'lookup', response: 'Balzac.' }),
                JSON.stringify({ intent: 'x' })].join('\n');   // last has no response → dropped
  const r = parseExemplars(text);
  assert.equal(r.length, 1);
  assert.equal(r[0].response, 'Balzac.');
});

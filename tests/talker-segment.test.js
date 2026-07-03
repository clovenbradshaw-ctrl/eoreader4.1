import { test } from 'node:test';
import assert from 'node:assert/strict';

import { segment, appendToken, propAmplitude } from '../src/organs/out/speech/segment.js';

// SEG cuts the token murmur into candidate propositions at SVO boundaries
// (clause-final punctuation + a filled unit). It is testable directly on a
// synthetic Dist stream — no model, no document — with an injected parser.

const distsFor = (tokens) => tokens.map(t => ({ tokens: [{ token: t, logprob: 0 }] }));

// A stub parser: a "proposition" is a clause holding one of these verbs between a
// subject and an object — searched (not anchored), the way the real SVO read folds
// a unit out of whatever surface has accumulated.
const VERB = /([A-Za-z]+)\s+(opened|left|sees|brought)\s+([A-Za-z]+)/;
const stubParse = (surface) => {
  const m = surface.match(VERB);
  return m ? { kind: 'rel', subj: m[1].toLowerCase(), rel: m[2].toLowerCase(), obj: m[3].toLowerCase() } : null;
};

const collect = async (gen) => {
  const out = [];
  for await (const c of gen) out.push(c);
  return out;
};

test('segment closes a candidate at clause-final punctuation with a filled SVO', async () => {
  const toks = ['Grete', 'opened', 'the', 'window', '.', 'She', 'left', 'quietly', '.'];
  const cands = await collect(segment(distsFor(toks), { parseProp: stubParse }));
  assert.equal(cands.length, 2, 'two clauses → two candidate propositions');
  assert.equal(cands[0].surface, 'Grete opened the window.');
  assert.equal(cands[1].surface, 'She left quietly.');
  assert.equal(cands[0].svo.subj, 'grete');
});

test('a clause with no parseable unit keeps accumulating (a bare "Yes." is no proposition)', async () => {
  // "Yes." has no SVO; the segmenter holds it and folds it into the next clause.
  const toks = ['Yes', '.', 'Grete', 'opened', 'it', '.'];
  const cands = await collect(segment(distsFor(toks), { parseProp: stubParse }));
  assert.equal(cands.length, 1, 'only the clause that fills a unit is emitted');
  assert.match(cands[0].surface, /Grete opened it\./);
});

test('the accumulation RESETS at the committed edge after each emit', async () => {
  // No tokens of clause 1 bleed into clause 2's surface.
  const toks = ['A', 'sees', 'B', '.', 'C', 'sees', 'D', '.'];
  const cands = await collect(segment(distsFor(toks), { parseProp: stubParse }));
  assert.equal(cands[1].surface, 'C sees D.', 'clause 2 starts clean');
});

test('modelAmplitude is the proposal’s own mean token weight (exp logprob)', () => {
  assert.equal(propAmplitude([{ logprob: 0 }, { logprob: 0 }]), 1, 'a one-hot proposal weighs 1');
  assert.ok(propAmplitude([{ logprob: Math.log(0.5) }]) - 0.5 < 1e-9, 'a hedged token weighs less');
});

test('appendToken spaces words but hugs punctuation', () => {
  let s = '';
  for (const t of ['Grete', 'opened', 'it', '.']) s = appendToken(s, t);
  assert.equal(s, 'Grete opened it.');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { realize, speakConcept } from '../src/write/index.js';
import { parseText } from '../src/perceiver/parse/index.js';

// Grammatical encoding (surface only): adjacent same-subject clauses are joined into one
// sentence with a compound predicate. It does not re-inflect verbs or re-decide reference,
// and the provenance/self line passes through untouched.

const G = { id: 'g', gender: 'm', name: 'Gregor' };
const F = { id: 'f', gender: 'm', name: 'the father' };

test('aggregation: a run of same-subject clauses becomes one compound-predicate sentence', () => {
  const out = realize([
    { subj: G, verb: 'woke' },
    { subj: G, verb: 'saw', obj: 'his legs' },
    { subj: G, verb: 'turned' },
  ]);
  assert.equal(out.sentences.length, 1, 'three same-subject clauses collapse to one sentence');
  assert.match(out.text, /^Gregor woke, saw his legs, and turned\.$/, 'serial comma + and, subject stated once');
});

test('a subject switch starts a new sentence (the run breaks)', () => {
  const out = realize([
    { subj: G, verb: 'woke' },
    { subj: F, verb: 'hurled', obj: 'an apple' },
  ]);
  assert.equal(out.sentences.length, 2, 'different subjects do not aggregate');
  assert.equal(out.sentences[1], 'The father hurled an apple.');
});

test('two same-subject clauses join with a bare "and" (no serial comma)', () => {
  const out = realize([
    { subj: G, verb: 'woke' },
    { subj: G, verb: 'rose' },
  ]);
  assert.equal(out.text, 'Gregor woke and rose.');
});

test('verbs are NOT re-inflected — the plan\'s surface verbs survive verbatim', () => {
  const out = realize([{ subj: G, verb: 'brought' }, { subj: G, verb: 'said' }]);
  assert.match(out.text, /brought and said/, 'already-inflected verbs pass through unchanged');
});

test('provenance/self pass through the realizer untouched', () => {
  const doc = parseText('Gregor woke.', { docId: 's' });
  const out = realize([{ subj: G, verb: 'woke' }, { subj: G, verb: 'turned' }], { given: doc });
  assert.ok(out.units.every(u => u.mine), 'generated content is mine');
  assert.ok(out.self.every(s => s.readBackOfSelf), 'read back as self');
  assert.equal(out.given.mine, false, 'the given is not mine');
});

test('speakConcept aggregates by default and can be asked for the raw clause stream', () => {
  const doc = parseText('Gregor saw legs. Gregor loved Grete. Grete brought Gregor milk.', { docId: 'scene' });
  const agg = speakConcept(doc, { genders: { Gregor: 'm', Grete: 'f' } });
  assert.equal(typeof agg.text, 'string');
  assert.ok(Array.isArray(agg.sentences), 'aggregated form exposes sentences');
  const raw = speakConcept(doc, { genders: { Gregor: 'm', Grete: 'f' }, aggregate: false });
  assert.equal(raw.sentences, undefined, 'the raw clause stream is not aggregated');
  assert.ok(raw.units.every(u => u.mine));
});

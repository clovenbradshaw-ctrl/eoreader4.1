import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestCodons } from '../src/organs/in/codon.js';
import { discoverEquivalences as _de, mutualNearestPairs as _mnp } from '../src/perceiver/index.js';
import { retrieveLexical } from '../src/retrieve/index.js';
const discoverEquivalences = (doc, opts = {}) => _de(doc, { retrieve: retrieveLexical, ...opts });
const mutualNearestPairs = (doc, opts = {}) => _mnp(doc, { retrieve: retrieveLexical, ...opts });

// The genetic code's family structure must EMERGE from prefix overlap by rank alone —
// no codon table, no hint that the third base is redundant. Mutual nearest neighbour +
// the engine's union-find: two codons merge iff each is the other's strongest match.

const BASES = ['U', 'C', 'A', 'G'];
const ALL_CODONS = BASES.flatMap(a => BASES.flatMap(b => BASES.map(c => a + b + c)));

// Scoring only — never handed to the reader.
const AA = {
  UUU: 'F', UUC: 'F', UUA: 'L', UUG: 'L', CUU: 'L', CUC: 'L', CUA: 'L', CUG: 'L',
  AUU: 'I', AUC: 'I', AUA: 'I', AUG: 'M', GUU: 'V', GUC: 'V', GUA: 'V', GUG: 'V',
  UCU: 'S', UCC: 'S', UCA: 'S', UCG: 'S', CCU: 'P', CCC: 'P', CCA: 'P', CCG: 'P',
  ACU: 'T', ACC: 'T', ACA: 'T', ACG: 'T', GCU: 'A', GCC: 'A', GCA: 'A', GCG: 'A',
  UAU: 'Y', UAC: 'Y', UAA: '*', UAG: '*', CAU: 'H', CAC: 'H', CAA: 'Q', CAG: 'Q',
  AAU: 'N', AAC: 'N', AAA: 'K', AAG: 'K', GAU: 'D', GAC: 'D', GAA: 'E', GAG: 'E',
  UGU: 'C', UGC: 'C', UGA: '*', UGG: 'W', CGU: 'R', CGC: 'R', CGA: 'R', CGG: 'R',
  AGU: 'S', AGC: 'S', AGA: 'R', AGG: 'R', GGU: 'G', GGC: 'G', GGA: 'G', GGG: 'G',
};

test('64 codons collapse into exactly the 16 first-two-base boxes', () => {
  const doc = ingestCodons({ name: 't', codons: ALL_CODONS });
  assert.equal(doc.projectGraph().entities.size, 64);   // before: all distinct
  const { classes } = discoverEquivalences(doc);
  assert.equal(doc.projectGraph().entities.size, 16);   // after: the 16 boxes

  const families = classes.filter(c => c.length > 1);
  assert.equal(families.length, 16);
  for (const cl of families) {
    assert.equal(cl.length, 4, 'each box holds its four third-base variants');
    const boxes = new Set(cl.map(i => doc.codonSeq[i].slice(0, 2)));
    assert.equal(boxes.size, 1, 'a family is exactly one first-two-base box');
  }
});

test('the merges are mutual — each codon is the other\'s strongest prefix-match', () => {
  const doc = ingestCodons({ name: 't', codons: ALL_CODONS });
  const pairs = mutualNearestPairs(doc);
  for (const { i, j } of pairs) {
    assert.equal(doc.codonSeq[i].slice(0, 2), doc.codonSeq[j].slice(0, 2));
  }
});

test('8 of the 16 emergent families are a single amino acid (the rest split on the wobble base)', () => {
  const doc = ingestCodons({ name: 't', codons: ALL_CODONS });
  const families = discoverEquivalences(doc).classes.filter(c => c.length > 1);
  const pure = families.filter(cl => new Set(cl.map(i => AA[doc.codonSeq[i]])).size === 1);
  assert.equal(pure.length, 8);
});

test('reading order is the mechanism — a flat base-bag fuses everything into one blob', () => {
  const doc = ingestCodons({ name: 't', codons: ALL_CODONS });
  doc.codonSeq.forEach((c, i) => {
    const t = [`b1${c[0]}`, `b2${c[1]}`, `b3${c[2]}`].map(s => s.toLowerCase());
    doc.tokensBySentence[i] = new Set(t);
    doc.partialTokens[i] = t;
  });
  const families = discoverEquivalences(doc).classes.filter(c => c.length > 1);
  assert.equal(families.length, 1);
  assert.equal(families[0].length, 64);   // no block structure survives
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildConceptTokenMap, buildEntityTrie, groundedSurfaceForms, groundedNumbers,
  wordBoundaryClosed, measureBridge,
} from '../src/write/concept-tokens.js';

// ── a deterministic fake tokenizer (the injected seam) ────────────────────────────────────
// Byte-level-BPE-flavoured: a word start carries a leading space, so a name's word-initial
// realisation differs from its mid-text one. Greedy longest-match over a fixed vocab; the id
// is the index. This stands in for @mlc-ai/web-tokenizers in Node (the real bridge uses the
// model's own tokenizer.json so ids match the engine exactly).
const VOCAB = [
  '<unk>', ' ', '.', ',',
  'the', ' the', ' woke', ' fed', ' him', ' in', ' and',
  ' Gregor', ' Samsa', ' Grete', ' Schmidt',
  'Gregor', 'Samsa', 'Grete',
  ' 1847', '1847',
  ' 99', ' 12', ' 34', ' 56', ' 78', ' 90', ' 11', ' 22',
];
const ID = Object.fromEntries(VOCAB.map((s, i) => [s, i]));
const PIECES = VOCAB.map((s, i) => [s, i]).filter(([s]) => s !== '<unk>').sort((a, b) => b[0].length - a[0].length);
const fakeTokenizer = {
  encode(text) {
    const out = [];
    let i = 0;
    const s = String(text);
    while (i < s.length) {
      let hit = null;
      for (const [piece, id] of PIECES) if (s.startsWith(piece, i)) { hit = [piece, id]; break; }
      if (hit) { out.push(hit[1]); i += hit[0].length; }
      else { out.push(ID['<unk>']); i += 1; }
    }
    return out;
  },
  decode(ids) { return (Array.isArray(ids) ? ids : [ids]).map(id => VOCAB[id] ?? '').join(''); },
};

// A minimal doc: an append-only log of INS entities + sentences.
const doc = {
  sentences: ['Gregor Samsa woke in 1847.', 'Grete fed him.'],
  log: {
    events: [
      { op: 'INS', id: 'e1', label: 'Gregor Samsa', sentIdx: 0 },
      { op: 'INS', id: 'e2', label: 'Grete', sentIdx: 1 },
      { op: 'CON', id: 'c1', src: 'e2', tgt: 'e1', via: 'feeds', sentIdx: 1 },
    ],
  },
};

test('groundedSurfaceForms — the admitted entity labels, longest first', () => {
  const forms = groundedSurfaceForms(doc);
  assert.deepEqual(forms, ['Gregor Samsa', 'Grete']);   // INS labels only, dedup, by length
});

test('groundedNumbers — numerals carried by a span', () => {
  const nums = groundedNumbers(doc);
  assert.ok(nums.has('1847'));
  assert.equal(nums.has('99'), false);
});

test('concept map — first token of a figure is its word-initial token', () => {
  const map = buildConceptTokenMap(doc, null, fakeTokenizer);
  assert.equal(map.firstTokenOf('grete'), ID[' Grete']);
  assert.equal(map.firstTokenOf('gregor samsa'), ID[' Gregor']);   // first of the multi-token name
  assert.equal(map.firstTokenOf('nobody'), null);
});

test('concept map — coverage separates clean first-token from lossy multi-token', () => {
  const map = buildConceptTokenMap(doc, null, fakeTokenizer);
  assert.equal(map.coverage.figuresMapped, 2);
  assert.equal(map.coverage.cleanFirstToken, 1);    // 'Grete' → [' Grete']
  assert.equal(map.coverage.lossyMultiToken, 1);    // 'Gregor Samsa' → [' Gregor',' Samsa']
});

test('numeral gate — ungrounded number tokens are flagged, grounded ones pass', () => {
  const map = buildConceptTokenMap(doc, null, fakeTokenizer);
  assert.ok(map.isNumberToken(ID[' 99']));
  assert.equal(map.isGroundedNumberToken(ID[' 99']), false);   // 99 is in no span → suppressible
  assert.ok(map.isGroundedNumberToken(ID[' 1847']));            // 1847 is carried by sentence 0
  assert.equal(map.isNumberToken(ID[' Grete']), false);        // a name is not a numeral
});

test('permitted-entity trie — opens on a grounded first token, admits only continuations', () => {
  const trie = buildEntityTrie(groundedSurfaceForms(doc), fakeTokenizer);
  assert.ok(trie.opens(ID[' Gregor']));
  assert.equal(trie.opens(ID[' Schmidt']), false);
  const afterGregor = trie.step(trie.root, ID[' Gregor']);
  assert.ok(afterGregor);
  assert.ok(trie.step(afterGregor, ID[' Samsa']));             // grounded continuation
  assert.equal(trie.step(afterGregor, ID[' Schmidt']), null);  // invented continuation refused
});

test('wordBoundaryClosed — open at start, after space and punctuation; closed mid-word', () => {
  assert.ok(wordBoundaryClosed(''));
  assert.ok(wordBoundaryClosed('Gregor '));
  assert.ok(wordBoundaryClosed('Gregor.'));
  assert.equal(wordBoundaryClosed('Greg'), false);
});

test('measureBridge — the afternoon coverage measurement', () => {
  const m = measureBridge(doc, null, fakeTokenizer);
  assert.equal(m.figuresMapped, 2);
  assert.equal(m.cleanFirstToken, 1);
  assert.equal(m.cleanFraction, 0.5);
});

test('empty / missing tokenizer degrades to an empty map (never throws)', () => {
  const map = buildConceptTokenMap(doc, null, null);
  assert.equal(map.firstTokenOf('grete'), null);
  assert.equal(map.coverage.figuresMapped, 0);
});

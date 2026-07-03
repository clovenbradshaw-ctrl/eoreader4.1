import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { frameSpan } from '../src/perceiver/parse/frame.js';
import { ingestText } from '../src/organs/in/text.js';
import { retrieveHybrid } from '../src/retrieve/hybrid.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';

// A framed document brackets its body between set-off banners. frameSpan reads that shape
// — embedder-free, words-blind — and returns the head/tail to hold. It must find the body
// exactly, and it must ABSTAIN whenever the structure is not unambiguous.

const body = (k) => Array.from({ length: k }, (_, i) => `The hero walked on, and on, sentence ${i}.`);

test('frameSpan finds the body bracketed by banners and holds the head and tail', () => {
  const doc = [
    'The Example eBook of Something.',          // 0  head
    'You may copy it under the terms.',         // 1  head
    'Title: Something',                         // 2  head
    '*** START OF THE EXAMPLE EBOOK ***',       // 3  banner (opens body)
    ...body(45),                                // 4..48  body
    '*** END OF THE EXAMPLE EBOOK ***',         // 49 banner (closes body)
    'Section 1. Donations at www.example.org.', // 50 tail
    'Please visit our website for more.',       // 51 tail
  ];
  const f = frameSpan(doc);
  assert.equal(f.start, 4);
  assert.equal(f.end, 48);
  assert.deepEqual(f.head, [0, 1, 2, 3], 'front matter + the opening banner');
  assert.deepEqual(f.tail, [49, 50, 51], 'the closing banner + back matter');
  assert.ok(!f.all.has(4) && !f.all.has(48), 'the body is never held');
});

test('frameSpan abstains without an unambiguous bracket', () => {
  const plain = body(60);
  assert.equal(frameSpan(plain).all.size, 0, 'no banners → nothing held');

  const scene = [...body(30), '***', ...body(30)];
  assert.equal(frameSpan(scene).all.size, 0, 'a lone interior scene-break is one banner, not a bracket');

  assert.equal(frameSpan(['a', 'b', '***', 'c', '***', 'd']).all.size, 0, 'too short to carry a frame');

  const minorityBody = [...body(30), '***', 'lonely body', '***', ...body(30)];
  assert.equal(frameSpan(minorityBody).all.size, 0, 'a minority body between banners is not trusted');
});

// The real document the audits ran on. The Gutenberg licence — a header credit block and
// a long PROSE footer — is held as frame, and the story body is read normally. This is the
// case neither the degenerate-line chrome nor the per-unit site role caught.
test('pg5200: the Gutenberg licence head and tail are held; the story body is intact', async () => {
  const doc = await ingestText(readFileSync('./pg5200.txt', 'utf8'), { docId: 'pg5200.txt' });
  const S = doc.sentences;
  const framed = new Set(doc.log.filter(e => e.op === 'NUL' && e.via === 'frame').map(e => e.sentIdx));
  const sites  = new Set(doc.log.filter(e => e.op === 'DEF' && e.key === 'role' && e.value === 'site').map(e => e.sentIdx));
  const idxOf  = (re) => S.findIndex(s => re.test(s));

  // A header credit and a tail licence sentence (full prose) are both held — frame + site.
  const translator = idxOf(/Translator: David Wyllie/);
  const licenceTail = idxOf(/cannot survive without widespread public support/);
  assert.ok(framed.has(translator) && sites.has(translator), 'the header credit is framed');
  assert.ok(licenceTail > translator && framed.has(licenceTail) && sites.has(licenceTail),
    'the licence PROSE in the tail is framed — the case a per-line test misses');

  // The body is untouched: the opening line of the story is neither frame nor site.
  const opening = idxOf(/woke from troubled dreams/);
  assert.ok(opening > 0 && !framed.has(opening) && !sites.has(opening), 'the story body reads normally');

  // The boilerplate no longer enters the graph as a figure (the audit's spurious referents).
  const labels = doc.log.filter(e => e.op === 'INS').map(e => String(e.label || ''));
  assert.ok(!labels.some(l => /Gutenberg/i.test(l)), 'Project Gutenberg is no longer admitted as a figure');
  assert.ok(!labels.some(l => /Wyllie/i.test(l)),    'the translator credit is no longer a figure');

  // And it can no longer be retrieved: a licence query returns no framed sentence.
  const hits = await retrieveHybrid(doc, 'project gutenberg trademark license donations', createHashEmbedder(), 6);
  assert.ok(!hits.some(h => framed.has(h.idx)), 'framed licence lines are skipped by retrieval');
});

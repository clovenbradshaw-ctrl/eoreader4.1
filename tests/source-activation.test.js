// Source activation (docs/source-activation.md): a salient source's findings must reach the
// reader even when a long local document out-scores it span-for-span.

import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveBySource } from '../src/retrieve/hybrid.js';

// A composite-style origin map: idx → { doc }. Local doc is a long book; `web-1` is a
// freshly-fetched page. Web spans score lower than the book's prose, so a flat top-k drops them.
const mkOrigin = (map) => (idx) => map[idx] || null;

test('reserveBySource guarantees an activated web source its best span', () => {
  const book = { docId: 'pg5200.txt' };
  const web  = { docId: 'web-1', web: { url: 'https://en.wikipedia.org/x' } };
  const origin = mkOrigin({
    0: { doc: book }, 1: { doc: book }, 2: { doc: book }, 3: { doc: book },
    4: { doc: book }, 5: { doc: book }, 6: { doc: web }, 7: { doc: web },
  });
  const spans = [
    { idx: 0, score: 0.90 }, { idx: 1, score: 0.85 }, { idx: 2, score: 0.80 },
    { idx: 3, score: 0.70 }, { idx: 4, score: 0.60 }, { idx: 5, score: 0.55 },
    { idx: 6, score: 0.40 }, { idx: 7, score: 0.20 },   // web — below the book, dropped by top-6
  ];
  const isWeb = (d) => !!(d && d.web);

  const flat = [...spans].sort((a, b) => b.score - a.score).slice(0, 6).map(s => s.idx);
  assert.deepEqual(flat, [0, 1, 2, 3, 4, 5]);            // the web findings never make the cut

  const kept = reserveBySource(spans, origin, isWeb, { k: 6 }).map(s => s.idx);
  assert.ok(kept.includes(6), 'the web source best span is reserved');
  assert.equal(kept.length, 6);
  assert.ok(kept.includes(0) && kept.includes(1), 'the strongest local evidence is kept');
  assert.ok(!kept.includes(5), 'the weakest local span was evicted for the web span');
});

test('an UN-activated web source (below the floor) is not injected', () => {
  const book = { docId: 'book' };
  const web  = { docId: 'web-1', web: {} };
  // Seven strong local spans push the weak web span (idx 7, 0.05) out of the natural top-6;
  // because it is below the activation floor, reservation must NOT pull it back in.
  const origin = mkOrigin({
    0: { doc: book }, 1: { doc: book }, 2: { doc: book }, 3: { doc: book },
    4: { doc: book }, 5: { doc: book }, 6: { doc: book }, 7: { doc: web },
  });
  const spans = [
    { idx: 0, score: 0.90 }, { idx: 1, score: 0.85 }, { idx: 2, score: 0.80 },
    { idx: 3, score: 0.75 }, { idx: 4, score: 0.70 }, { idx: 5, score: 0.65 },
    { idx: 6, score: 0.60 }, { idx: 7, score: 0.05 },   // web — below the floor
  ];
  const kept = reserveBySource(spans, origin, (d) => !!(d && d.web), { k: 6, activationFloor: 0.15 });
  assert.ok(!kept.includes(7) && !kept.some(s => s.idx === 7), 'an irrelevant web page does not pollute the excerpts');
  assert.equal(kept.length, 6);
});

test('no salient source present → byte-identical to the global top-k', () => {
  const book = { docId: 'book' };
  const origin = mkOrigin({ 0: { doc: book }, 1: { doc: book }, 2: { doc: book } });
  const spans = [{ idx: 2, score: 0.3 }, { idx: 0, score: 0.9 }, { idx: 1, score: 0.6 }];
  const kept = reserveBySource(spans, origin, (d) => !!(d && d.web), { k: 6 });
  assert.deepEqual(kept.map(s => s.idx), [0, 1, 2]);     // pure ranking, nothing reserved
});

test('reservation is capped so the local document is never fully displaced', () => {
  const book = { docId: 'book' };
  const origin = {};
  const spans = [];
  for (let i = 0; i < 6; i++) { origin[i] = { doc: book }; spans.push({ idx: i, score: 0.9 - i * 0.1 }); }
  // five separate web sources, all activated
  for (let i = 6; i < 11; i++) { origin[i] = { doc: { docId: `web-${i}`, web: {} } }; spans.push({ idx: i, score: 0.5 }); }
  const kept = reserveBySource(spans, mkOrigin(origin), (d) => !!(d && d.web), { k: 6 });
  const webKept = kept.filter(s => origin[s.idx].doc.web).length;
  assert.ok(webKept <= 3, `web reservation capped at ceil(k/2)=3, got ${webKept}`);
  assert.equal(kept.length, 6);
});

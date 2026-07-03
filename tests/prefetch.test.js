import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeQuery, viableQuery, createSpeculativeWeb } from '../src/turn/prefetch.js';

test('normalizeQuery lowercases, collapses whitespace, strips trailing punctuation', () => {
  assert.equal(normalizeQuery('  What is   Today?  '), 'what is today');
  assert.equal(normalizeQuery('Capital of France!!'), 'capital of france');
  assert.equal(normalizeQuery(''), '');
  assert.equal(normalizeQuery(null), '');
});

test('viableQuery gates on length and word count', () => {
  assert.equal(viableQuery('what is the capital of france'), true);
  assert.equal(viableQuery('hi'), false);                 // too short
  assert.equal(viableQuery('what is the'), false);        // only 3 words but 11 chars < min
  assert.equal(viableQuery('what is the date today'), true);
  assert.equal(viableQuery('x'.repeat(500)), false);      // too long (one word anyway)
});

// A fake fetch+admit: returns one doc per call, counts invocations per query.
const fakeSearch = () => {
  const calls = new Map();
  const fn = async (q) => {
    calls.set(q, (calls.get(q) || 0) + 1);
    return [{ doc: { docId: `d:${q}`, text: `results for ${q}` } }];
  };
  fn.calls = calls;
  return fn;
};

test('prime caches and dedupes; take returns docs and marks preserved', async () => {
  const search = fakeSearch();
  const spec = createSpeculativeWeb({ search });

  const e1 = spec.prime('what is the capital of france');
  spec.prime('what is the capital of france');   // dedupe — same key, no second fetch
  await e1.promise;

  const docs = await spec.take('What is the capital of France?');   // normalizes to the same key
  assert.equal(docs.length, 1);
  assert.match(docs[0].doc.text, /capital of france/);
  assert.equal(search.calls.get('what is the capital of france'), 1);  // fetched exactly once
  assert.equal(spec.stats().preserved, 1);
});

test('take awaits an in-flight fetch', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const search = async (q) => { await gate; return [{ doc: { docId: q, text: q } }]; };
  const spec = createSpeculativeWeb({ search });

  spec.prime('a deliberately slow speculative query');
  const taking = spec.take('a deliberately slow speculative query');
  release([]);                                   // resolve the gate AFTER take() is waiting
  const docs = await taking;
  assert.ok(docs && docs.length === 1);
});

test('take on a query never primed returns null (caller falls back to live fetch)', async () => {
  const spec = createSpeculativeWeb({ search: fakeSearch() });
  assert.equal(await spec.take('never typed this one'), null);
});

test('unviable queries are not fetched', () => {
  const search = fakeSearch();
  const spec = createSpeculativeWeb({ search });
  assert.equal(spec.prime('hi'), null);
  assert.equal(spec.stats().entries, 0);
});

test('sweep evicts entries past TTL but never preserved-in-flight ones', async () => {
  let t = 1000;
  const search = fakeSearch();
  const spec = createSpeculativeWeb({ search, now: () => t, ttlMs: 5000 });

  const e = spec.prime('a warm speculative query about something');
  await e.promise;
  assert.equal(spec.stats().entries, 1);

  t += 6000;                                      // advance past TTL
  spec.sweep();
  assert.equal(spec.stats().entries, 0);          // swept — never taken, so discarded
});

test('LRU cap evicts the oldest entries', async () => {
  let t = 0;
  const search = fakeSearch();
  const spec = createSpeculativeWeb({ search, now: () => { t += 1; return t; }, maxEntries: 2 });

  for (const q of ['first speculative query here', 'second speculative query here', 'third speculative query here']) {
    const e = spec.prime(q);
    await e.promise;
  }
  assert.equal(spec.stats().entries, 2);          // capped at 2; the first was evicted
  assert.equal(await spec.take('first speculative query here'), null);
  assert.ok(await spec.take('third speculative query here'));
});

test('maxInflight caps concurrent speculative fetches', () => {
  const search = () => new Promise(() => {});      // never resolves — stays in flight
  const spec = createSpeculativeWeb({ search, maxInflight: 1 });
  assert.ok(spec.prime('first inflight speculative query'));
  assert.equal(spec.prime('second inflight speculative query'), null);  // ceiling reached
});

test('clear drops the whole quarantine', async () => {
  const search = fakeSearch();
  const spec = createSpeculativeWeb({ search });
  const e = spec.prime('something worth clearing later on');
  await e.promise;
  assert.equal(spec.clear(), 1);
  assert.equal(spec.stats().entries, 0);
});

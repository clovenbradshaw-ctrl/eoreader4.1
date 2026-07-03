import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRawStore, opfsAvailable, rawFileName, RAW_STORE_DIR } from '../src/ingest/opfs-store.js';

// The raw web-content store keeps every fetched page in full, as binary, in OPFS — and degrades
// to an in-memory cache where OPFS is absent (Node, here). These pin the fallback contract: put
// then get round-trips the text, has() reflects presence, and nothing throws.

test('OPFS is reported unavailable under Node (no navigator.storage)', () => {
  assert.equal(opfsAvailable(), false);
});

test('put/get round-trips the full text through the in-memory fallback', async () => {
  const store = createRawStore();
  const big = 'x'.repeat(500_000);                 // uncapped — the full page is retained
  const r = await store.put('fnv:abc123', big);
  assert.equal(r.bytes, 500_000);
  assert.equal(r.persisted, false, 'no OPFS in Node, so it lives in memory');
  assert.equal(await store.get('fnv:abc123'), big);
  assert.equal(await store.has('fnv:abc123'), true);
});

test('a missing key reads back null and is not present', async () => {
  const store = createRawStore();
  assert.equal(await store.get('nope'), null);
  assert.equal(await store.has('nope'), false);
});

test('put is a no-op (never throws) on a null key', async () => {
  const store = createRawStore();
  const r = await store.put(null, 'ignored');
  assert.equal(r.persisted, false);
  assert.equal(await store.has(null), false);
});

// The pointer manifest is the export half: list() returns one metadata entry per stored page —
// url + OPFS location + hash + byte count — and NEVER the page text.
test('list() returns a pointer manifest with the page identity, not its text', async () => {
  const store = createRawStore();
  await store.put('fnv:abc', 'the full imported page text', {
    url: 'https://example.com/a', title: 'A', fetched_at: '2026-06-30T00:00:00Z',
  });
  const ptrs = await store.list();
  assert.equal(ptrs.length, 1);
  const p = ptrs[0];
  assert.equal(p.content_hash, 'fnv:abc');
  assert.equal(p.url, 'https://example.com/a');
  assert.equal(p.title, 'A');
  assert.equal(p.bytes, 'the full imported page text'.length);
  assert.equal(p.dir, RAW_STORE_DIR);
  assert.equal(p.file, rawFileName('fnv:abc'));
  // The manifest carries no page text — only a pointer to it.
  assert.equal(JSON.stringify(p).includes('imported page text'), false);
});

test('rawFileName sanitises a content hash to a safe .bin name', () => {
  assert.equal(rawFileName('fnv:abc123'), 'fnv_abc123.bin');
});

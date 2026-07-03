import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shredTtl, makeArchive, shredExpired, nextShredTime } from '../src/turn/archive.js';

// The archive (src/turn/archive.js): a curiosity walk PARSES every page but leashes on saliency — a
// strayed page is not stored as a source. Instead of throwing the reading away, it is FILED in the
// archive, leased to go to the SHREDDER after a duration set by HOW MUCH CONTENT it processed. Clock-
// injectable so shred times are deterministic offline — no wall clock baked in.

// ── shredTtl: the lease scales with content processed, floored and capped ─────

test('shredTtl scales the lease linearly with characters processed', () => {
  const a = shredTtl(1000, { msPerChar: 40, min: 0, max: 1e12 });
  const b = shredTtl(2000, { msPerChar: 40, min: 0, max: 1e12 });
  assert.equal(a, 40_000);
  assert.equal(b, 80_000, 'twice the content buys twice the lease before the shredder');
});

test('shredTtl floors a tiny reading and caps a huge one', () => {
  assert.equal(shredTtl(1, { msPerChar: 40, min: 30_000, max: 3_600_000 }), 30_000, 'a snippet still gets the floor');
  assert.equal(shredTtl(10_000_000, { msPerChar: 40, min: 30_000, max: 3_600_000 }), 3_600_000, 'a huge page hits the cap');
});

test('shredTtl coerces junk to 0 content and returns the floor', () => {
  assert.equal(shredTtl(undefined, { min: 30_000 }), 30_000);
  assert.equal(shredTtl(-500, { min: 30_000 }), 30_000, 'negative content clamps to the floor');
});

// ── makeArchive: file, lease by content, run the shredder on schedule ─────────

test('a filed reading is leased by its own content length, stamped by the injected clock', () => {
  let t = 1000;
  const archive = makeArchive({ clock: () => t, msPerChar: 10, min: 0, max: 1e12 });
  const e = archive.file({ text: 'x'.repeat(500), docId: 'd1', web: { title: 'T', url: 'u' } }, { reason: 'strayed' });
  assert.equal(e.chars, 500);
  assert.equal(e.ttlMs, 5000, 'lease = chars × msPerChar');
  assert.equal(e.archivedAt, 1000);
  assert.equal(e.shredAt, 6000, 'archivedAt + ttl');
  assert.equal(e.reason, 'strayed', 'the meta rides along');
  assert.equal(e.title, 'T');
  assert.equal(archive.size, 1);
});

test('a bigger reading is kept longer than a smaller one (duration by content, not flat time)', () => {
  const archive = makeArchive({ clock: () => 0, msPerChar: 10, min: 0, max: 1e12 });
  const small = archive.file({ text: 'x'.repeat(100) });
  const big = archive.file({ text: 'x'.repeat(5000) });
  assert.ok(big.shredAt > small.shredAt, 'the page with more content processed outlives the snippet in the archive');
});

test('the shredder destroys only readings whose lease has run out, and returns them', () => {
  let t = 0;
  const archive = makeArchive({ clock: () => t, msPerChar: 1, min: 0, max: 1e12 });
  archive.file({ text: 'x'.repeat(100) });   // shreds at 100
  archive.file({ text: 'x'.repeat(900) });   // shreds at 900
  t = 500;
  const shredded = archive.shred();
  assert.equal(shredded.length, 1, 'only the short-lease reading was shredded at t=500');
  assert.equal(archive.size, 1, 'the longer lease survives');
  t = 1000;
  archive.shred();
  assert.equal(archive.size, 0, 'the rest goes to the shredder once its content-scaled lease elapses');
});

test('nextShred names the soonest lease to arm a single shredder timer', () => {
  const archive = makeArchive({ clock: () => 0, msPerChar: 1, min: 0, max: 1e12 });
  assert.equal(archive.nextShred(), null, 'empty archive arms nothing');
  archive.file({ text: 'x'.repeat(300) });
  archive.file({ text: 'x'.repeat(50) });
  assert.equal(archive.nextShred(), 50, 'the soonest shred time across the archive');
});

test('the reading itself is stored, so a circle-back re-uses it instead of re-reading', () => {
  const archive = makeArchive({ clock: () => 0 });
  const e = archive.file({ text: 'the strayed prose', docId: 'd9' });
  assert.equal(e.text, 'the strayed prose', 'the parsed reading is retained in the archive');
  assert.equal(e.docId, 'd9');
});

// ── shredExpired / nextShredTime: the shredder over a plain session array ──────

test('shredExpired partitions a plain array into kept and shredded, non-mutating', () => {
  const entries = [{ shredAt: 100 }, { shredAt: 900 }, { shredAt: 500 }];
  const { kept, shredded } = shredExpired(entries, 500);
  assert.equal(shredded.length, 2, 'shredAt ≤ now are shredded (100 and 500)');
  assert.equal(kept.length, 1);
  assert.equal(entries.length, 3, 'the input array is untouched');
});

test('shredExpired and nextShredTime tolerate junk input', () => {
  assert.deepEqual(shredExpired(null, 0), { kept: [], shredded: [] });
  assert.equal(nextShredTime(undefined), null);
  assert.equal(nextShredTime([{ shredAt: 200 }, { shredAt: 80 }]), 80);
});

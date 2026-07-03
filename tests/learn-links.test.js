import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { linkInventory, untypedVias, growLinkTypes } from '../src/surfer/index.js';

// Label feedback (word → concept): the closed relation vocabulary types only a minority of
// links; the recurring untyped verbs are candidates for new SPECIFIC types, scoped under
// their operator. Whether a candidate is USABLE is decided by measurement — does the
// structural feature space carve it beyond a null — never by assertion.

const STORY =
  'Gregor became an insect. The room became cold. The day became long. ' +
  'His father seemed angry. Grete seemed afraid. The chief clerk seemed annoyed. ' +
  'Gregor tried to rise. Gregor tried to speak. Grete tried to help. ' +
  'The father pushed Gregor. Grete brought milk. The mother wept.';

test('linkInventory types every link by its operator (first level) and counts the untyped rest', () => {
  const doc = parseText(STORY, { docId: 's' });
  const inv = linkInventory(doc);
  assert.ok(inv.total >= 1, 'the story has links');
  assert.equal(inv.typed + inv.untyped, inv.total, 'every link is either closed-vocab-typed or untyped');
  for (const l of inv.links) assert.ok(l.op === 'CON' || l.op === 'SIG', 'a link is its operator');
});

test('untypedVias surfaces the recurring verbs the closed vocabulary has no concept for', () => {
  const doc = parseText(STORY, { docId: 's' });
  const cands = untypedVias(doc, { minCount: 2 });
  // candidates are recurring (>= minCount) and carry their dominant operator
  for (const c of cands) {
    assert.ok(c.count >= 2, 'a candidate recurs');
    assert.ok(c.op === 'CON' || c.op === 'SIG', 'the candidate is scoped under an operator');
    assert.equal(typeof c.via, 'string');
  }
});

test('growLinkTypes scopes a learned type under its operator and decides usability by a null', () => {
  const doc = parseText(STORY, { docId: 's' });
  const g = growLinkTypes(doc, { minCount: 2, samples: 64 });
  assert.equal(typeof g.structureGrows, 'boolean', 'a measured verdict, not an assertion');
  assert.equal(g.typed + g.untyped, g.total);
  for (const t of g.grown) {
    assert.match(t.key, /^(CON|SIG)\//, 'the operator stays the first level; growth only makes it specific');
    assert.equal(typeof t.usable, 'boolean');
    // a usable type must have actually beaten its derived null line (never usable on abstention)
    if (t.usable) { assert.ok(t.nullLine != null); assert.ok(t.coherence > t.nullLine); }
  }
  // usableCount and structureGrows agree
  assert.equal(g.structureGrows, g.usableCount > 0);
});

test('deterministic — the same document grows the same verdict (resume-safe, no Date/random)', () => {
  const doc = parseText(STORY, { docId: 's' });
  const a = growLinkTypes(doc, { minCount: 2, samples: 64 });
  const b = growLinkTypes(doc, { minCount: 2, samples: 64 });
  assert.deepEqual(a.grown, b.grown, 'the null is seeded from the data, so growth is reproducible');
  assert.equal(a.structureGrows, b.structureGrows);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/pipeline.js';
import { surfFold } from '../src/surfer/index.js';
import { surfToPlan } from '../src/write/plan.js';
import { buildCursor } from '../src/write/cursor.js';
import { createFold } from '../src/write/fold.js';
import { HASHID_RE } from '../src/core/index.js';

// The Streaming Answer §2 — the span→cell resolver. A surfer stop becomes a cursor
// cell: the focus figure is the Subject, the strongest unspent edge leaving it is the
// arrow, the spans it was read from are the grounding. No firm edge → an orienting
// beat, never a forced claim.

const STORY = 'Gregor Samsa woke as a vermin. Gregor frightened his mother. ' +
              'Grete fed Gregor. Grete pitied Gregor. The father struck Gregor. ' +
              'Gregor weakened. Gregor died. Grete opened the window.';

const planOf = (text, anchor = 1) => {
  const doc = parseText(text, { docId: 'k' });
  const surf = surfFold(doc, anchor);
  const fold = createFold();
  const plan = surfToPlan(surf, doc, fold, {});
  return { doc, surf, fold, plan };
};

test('each surfer stop becomes one cell, in reading order (§2)', () => {
  const { surf, plan } = planOf(STORY);
  assert.equal(plan.length, surf.stops.length, 'one cell per stop');
  assert.deepEqual(plan.map(c => c.stop), surf.stops, 'in the surfer\'s reading order');
});

test('a stop with a leaving edge realises it; the Subject is the focus figure (§2)', () => {
  const { fold, plan } = planOf(STORY);
  const woke = plan.find(c => c.edge === 'woke');
  assert.ok(woke, 'the strongest edge leaving Gregor at the first stop');
  assert.equal(woke.op, 'CON');
  assert.equal(woke.kind, 'relation');
  assert.equal(fold.headOf(woke.args[0]), 'Gregor Samsa', 'Subject = the focus figure');
  assert.equal(woke.res, 'firm', 'a settled edge is firm');
});

test('a repeated arrow is not re-asserted — the stop falls back to an orienting beat (§2)', () => {
  const { plan } = planOf(STORY);
  const edges = plan.filter(c => c.kind === 'relation').map(c => c.edge);
  assert.equal(new Set(edges).size, edges.length, 'no arrow is realised twice');
  assert.ok(plan.some(c => c.kind === 'orient'), 'a stop with no fresh edge orients instead of repeating');
});

test('every beat carries its grounding verbatim, indexed (§2)', () => {
  const { doc, plan } = planOf(STORY);
  const units = doc.units || doc.sentences;
  for (const cell of plan) {
    assert.ok(cell.spans.length > 0, `${cell.id} carries at least one grounded line`);
    for (const s of cell.spans) {
      assert.equal(units[s.idx], s.text, 'a span is verbatim at its real index — so the witness can anchor');
    }
  }
});

test('the resolver feeds a clean cursor — surface edge, no hashId leak (§2, the membrane)', () => {
  const { doc, surf, fold } = planOf(STORY);
  const plan = surfToPlan(surf, doc, fold, {});
  const woke = plan.find(c => c.edge === 'woke');
  // Appear the cell's referents, then build the cursor exactly as the loop does.
  for (const h of woke.args) fold.appear(h);
  const cursor = buildCursor({ ...woke, target: 'one sentence' }, fold, woke.spans, { resolution: woke.res });
  const serial = cursor.input.map(m => m.content).join('\n');
  assert.equal(HASHID_RE.test(serial), false, 'no hashId reaches the model');
  assert.match(serial, /Gregor Samsa -> vermin : woke/, 'the typed edge is handed in EOT surface, labels not ids');
});

test('a hedged (irrealis) edge resolves to a VOID band — the beat hedges before it is written (§3b)', () => {
  // "might have" reads as an epistemic modality: the document does not settle the
  // connection, so the cell's band is void and the cursor will hold it open.
  const { plan } = planOf('Gregor Samsa might have frightened his mother. Grete fed Gregor. Grete left.', 0);
  const hedged = plan.find(c => c.edge === 'frightened');
  assert.ok(hedged, 'the modal relation still resolves to a cell');
  assert.equal(hedged.res, 'void', 'an unsettled connection is void — hedged up front, never overclaimed');
});

test('an empty document yields an empty plan (no doc, nothing to say)', () => {
  const fold = createFold();
  assert.deepEqual(surfToPlan(surfFold({ sentences: [] }, 0), { sentences: [], log: { snapshot: () => [] } }, fold), []);
});

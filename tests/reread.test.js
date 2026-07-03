import { test } from 'node:test';
import assert from 'node:assert/strict';

import { unsettled, rereadOnUnsettled } from '../src/turn/reread.js';

// The active-inference re-read (surfing-next.md §3): when the surf could not settle on a
// figure at the peak (the stance-reserve guard) on a pointed turn, read more of the source
// on the figure it circled, then fold from the wider evidence. The retriever is injected, so
// the decision over (surf, spans) is testable without the retrieve holon.

const reserve = (focus) => ({ stance: { guard: true, stance: 'Cultivating', grain: 'Ground' }, focus });
const making  = (focus) => ({ stance: { guard: false, stance: 'Making', grain: 'Figure' }, focus });
const diffuse  = { id: 'anna', concentrated: false };   // the referent-ambiguous measure firing
const settledRef = { id: 'anna', concentrated: true };

test('unsettled fires on a reserved stance OR a diffuse coref field, with a figure in view', () => {
  // the stance-reserve trigger (the meaning-path signal)
  assert.equal(unsettled(reserve('klamm'), 'answer'), true);
  assert.equal(unsettled(reserve('klamm'), null), true, 'an untyped turn counts as pointed');
  // the referential trigger (the live one on the default basis): a committed lens but diffuse coref
  assert.equal(unsettled(making('anna'), 'answer', diffuse), true, 'a diffuse coref field is an unsettled read');
  // both quiet → settled
  assert.equal(unsettled(making('anna'), 'answer', settledRef), false, 'a firm commit + concentrated coref is settled');
  assert.equal(unsettled(making('klamm'), 'answer'), false, 'a firm Figure commit with no referential signal is settled');
  // scope + preconditions
  assert.equal(unsettled(reserve('klamm'), 'summary'), false, 'a summary rides the Ground grain — never a re-read');
  assert.equal(unsettled(reserve(null), 'answer'), false, 'no circled figure → nothing to read more about');
  assert.equal(unsettled(making('anna'), 'answer', { id: 'anna', concentrated: true }), false, 'concentrated coref is settled');
  assert.equal(unsettled(null, 'answer'), false, 'no surf → no trigger');
});

test('rereadOnUnsettled widens the span set with fresh hits on the circled figure', async () => {
  const spans = [{ idx: 2, text: 'a' }, { idx: 5, text: 'b' }];
  let askedQuery = null;
  const retrieve = async (q) => { askedQuery = q; return [{ idx: 5, text: 'dup' }, { idx: 9, text: 'new-on-klamm' }]; };
  const out = await rereadOnUnsettled({ spans, surf: reserve('klamm'), task: 'answer', query: 'who is it', retrieve });
  assert.equal(out.added, 1, 'only the genuinely new span is added (idx 5 deduped)');
  assert.deepEqual(out.spans.map(s => s.idx).sort((a, b) => a - b), [2, 5, 9]);
  assert.equal(out.asked, 'klamm', 'it reports the figure it read more about');
  assert.match(askedQuery, /klamm/, 'the open figure is in the widening query');
  assert.match(askedQuery, /who is it/, 'beside the turn\'s own resolved query');
});

test('rereadOnUnsettled is inert when settled, figure-less, retriever-less, or nothing fresh', async () => {
  const spans = [{ idx: 1, text: 'x' }];
  const some = async () => [{ idx: 7, text: 'y' }];

  // settled → no widening
  assert.equal((await rereadOnUnsettled({ spans, surf: making('klamm'), task: 'answer', retrieve: some })).added, 0);
  // no retriever → no widening (and no throw)
  assert.equal((await rereadOnUnsettled({ spans, surf: reserve('klamm'), task: 'answer' })).added, 0);
  // retriever returns only spans we already have → nothing fresh
  const dupOnly = async () => [{ idx: 1, text: 'x' }];
  const r = await rereadOnUnsettled({ spans, surf: reserve('klamm'), task: 'answer', retrieve: dupOnly });
  assert.equal(r.added, 0);
  assert.deepEqual(r.spans, spans, 'the span set is returned unchanged');
});

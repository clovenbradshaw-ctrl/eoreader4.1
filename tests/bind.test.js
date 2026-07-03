import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bindCitations } from '../src/ground/bind.js';

// Binding is the certification step — the audit trusts whatever citation it
// lands. These tests pin the two priors that ride it: idf (a rare content word
// outweighs a document-frequent one) and the γ-field (the warm referent breaks
// a lexical tie), and that both flatten to the old overlap when no doc is given.

test('no doc → reduces to plain overlap and the MIN_OVERLAP gate', () => {
  const spans = [{ idx: 0, text: 'alice loves apples' }, { idx: 1, text: 'bob hates broccoli' }];
  // Clears the bar against span 0.
  const hit = bindCitations('alice loves apples', spans);
  assert.equal(hit[0].citation, 's0');
  // Nothing overlaps → no citation, exactly as before.
  const miss = bindCitations('zebras unrelated cosmic nonsense', spans);
  assert.equal(miss[0].citation, null);
});

test('idf prior: a rare content token outweighs a document-frequent one', () => {
  // "data" is frequent (3 units), "perihelion" is rare (1 unit). A claim that
  // shares one token with each candidate must bind the rare-token span, even
  // though raw overlap is an equal 1-of-2 against both.
  const doc = { units: ['data alpha', 'data beta', 'data gamma', 'perihelion note'] };
  const spans = [
    { idx: 0, text: 'data alpha' },      // matches the frequent token only
    { idx: 3, text: 'perihelion note' }, // matches the rare, discriminating token
  ];
  const bound = bindCitations('data perihelion', spans, { doc });
  assert.equal(bound[0].citation, 's3', 'the rare token must win the bind');

  // Without the doc the two spans tie on raw overlap and the first one wins —
  // i.e. the prior is what moved the citation, not the lexical match.
  const flat = bindCitations('data perihelion', spans);
  assert.equal(flat[0].citation, 's0');
});

test('field prior: the warm referent breaks a lexical tie', () => {
  const units = ['apple harvest', 'x', 'y', 'z', 'w', 'apple harvest'];
  const mentions = new Map([['A', [0]], ['B', [5]]]);   // A at unit 0, B at unit 5
  const doc = { units, mentions };
  const spans = [
    { idx: 0, text: 'apple harvest' },   // mentions A
    { idx: 5, text: 'apple harvest' },   // mentions B — lexically identical
  ];
  // Cursor on A's unit → A is the hot referent → the tie goes to span 0.
  assert.equal(bindCitations('apple harvest', spans, { doc, cursor: 0 })[0].citation, 's0');
  // Move the cursor to B's unit → the same tie now goes the other way.
  assert.equal(bindCitations('apple harvest', spans, { doc, cursor: 5 })[0].citation, 's5');
  // No cursor → no tilt → the lexical tie falls to the first span.
  assert.equal(bindCitations('apple harvest', spans, { doc })[0].citation, 's0');
});

test('the field only re-ranks claims that already clear the gate — never binds an under-grounded one', () => {
  const units = ['warm token here', 'cold filler'];
  const mentions = new Map([['A', [0]]]);
  const doc = { units, mentions };
  // The only warm span shares no content token with the claim; it must NOT be
  // pulled above the MIN_OVERLAP null by its warmth.
  const spans = [{ idx: 0, text: 'warm token here' }];
  const bound = bindCitations('completely disjoint nonsense phrase', spans, { doc, cursor: 0 });
  assert.equal(bound[0].citation, null);
});

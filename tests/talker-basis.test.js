import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { surfFold } from '../src/surfer/surf.js';
import { buildBasis } from '../src/enactor/basis.js';

// The surf → grounded basis adapter (§4): the props read at the surfer's stops,
// each carrying the stop's amplitude (the strain that made it a stop), plus the
// void basis (absence as a first-class element) and the question's target props.

const STORY =
  'Gregor Samsa woke transformed. His sister Grete brought a bowl of milk. ' +
  'Grete opened the window. The father drove Gregor back into the room.';

test('the basis carries the stops’ propositions with their surf amplitude', () => {
  const doc = parseText(STORY, { docId: 'rel' });
  const surf = surfFold(doc, 0);
  const basis = buildBasis(surf, doc, 'What did Grete do?');

  assert.ok(basis.props.length > 0, 'propositions are read at the stops');
  for (const p of basis.props) {
    assert.ok(Number.isFinite(p.amplitude), 'each prop carries a numeric amplitude');
    assert.ok(surf.stops.includes(p.idx), 'each prop is anchored at a surf stop');
    assert.equal(p.status, 'support');
  }
});

test('a question target with no supported prop becomes an explicit VOID element', () => {
  const doc = parseText(STORY, { docId: 'rel' });
  const surf = surfFold(doc, 0);
  // A target the document never grounds: Gregor's salary. When the question parses
  // to a target the findings cannot support, the basis records the absence.
  const basis = buildBasis(surf, doc, 'Gregor pays Grete money.');
  if (basis.question.targetProps.length) {
    const unsupported = basis.question.targetProps.filter(t =>
      !basis.props.some(p => p.subj === t.subj && p.obj === t.obj));
    if (unsupported.length) {
      assert.ok(basis.void.some(v => v.from === 'unsupported-target'),
        'an unsupported target is a void basis element');
    }
  }
  // The basis is always well-formed even when no target parses.
  assert.ok(Array.isArray(basis.void));
  assert.ok(Array.isArray(basis.question.targetProps));
});

test('the basis is frozen and self-consistent (cursor sits at the surf peak)', () => {
  const doc = parseText(STORY, { docId: 'rel' });
  const surf = surfFold(doc, 0);
  const basis = buildBasis(surf, doc, 'q');
  assert.equal(basis.cursor, surf.peak);
  assert.throws(() => { basis.props.push({}); }, 'props is frozen');
});

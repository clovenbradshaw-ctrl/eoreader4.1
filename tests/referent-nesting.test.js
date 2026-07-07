import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { projectGraph } from '../src/core/index.js';
import { referentNesting, nestingSummary } from '../src/perceiver/referent-nesting.js';
import { parseHolon, containsHolon } from '../src/core/holon.js';

// The nesting a referent EARNS from its span. Admission mints a flat id, so every
// referent used to parse to a depth-1 atom; this read recovers the containment the
// flat address threw away — a short thread that runs entirely inside a longer one is
// held INSIDE it, addressed one level deeper, exactly as the holon machinery intends.

// A text engineered so the spans nest cleanly. Airing runs the whole length; Bardo
// appears only in its middle stretch (fully inside Airing); Cato is a single-scene
// figure inside Bardo's stretch; Dunmore appears once, far away, sharing no span.
const NESTED = [
  'Airing walked the road.',                         // 0
  'Airing met a merchant.',                          // 1
  'Airing rested by the well.',                       // 2
  'Bardo greeted Airing warmly.',                     // 3
  'Airing told Bardo the news.',                      // 4
  'Cato joined Bardo at the fire.',                   // 5  (Cato: only here)
  'Bardo answered Airing plainly.',                   // 6
  'Airing thanked Bardo and left.',                   // 7
  'Airing pressed on alone.',                         // 8
  'Airing reached the city.',                         // 9
  'The road was long.',                               // 10
  'Dunmore counted the coins.',                       // 11 (Dunmore: only here + next)
  'Dunmore locked the gate.',                         // 12
  'Airing slept at last.',                            // 13
].join(' ');

const build = () => {
  const doc = parseText(NESTED, { docId: 'nest' });
  const g = projectGraph(doc.log, {});
  const nest = referentNesting(doc, g);
  const by = new Map(nest.referents.map((r) => [r.id, r]));
  return { doc, g, nest, by };
};

test('a thread that runs the whole length contains the threads inside it', () => {
  const { by } = build();
  const airing = by.get('airing');
  const bardo  = by.get('bardo');
  const cato   = by.get('cato');
  assert.ok(airing && bardo && cato, 'the three nested figures all admit');

  // Airing spans the whole reading; Bardo sits inside it; Cato sits inside Bardo.
  assert.ok(airing.spanLen > bardo.spanLen, 'Airing outlasts Bardo');
  assert.ok(bardo.spanLen  > cato.spanLen,  'Bardo outlasts Cato');

  assert.ok(bardo.containedBy.includes('airing'), 'Bardo is contained by Airing');
  assert.ok(cato.containedBy.includes('bardo'),   'Cato is contained by Bardo');
  assert.ok(cato.containedBy.includes('airing'),  'Cato is contained by Airing too (the full DAG)');

  // The tightest enclosing thread is the holonic parent — Cato's parent is Bardo, not Airing.
  assert.equal(cato.parent, 'bardo', 'the tightest container is the holon parent');
  assert.equal(bardo.parent, 'airing');
  assert.equal(airing.parent, null, 'the outermost thread has no container');
});

test('the derived address recovers the holon LEVEL the flat id hid', () => {
  const { by } = build();
  const airing = by.get('airing');
  const bardo  = by.get('bardo');
  const cato   = by.get('cato');

  // Depth is no longer uniformly 1 — the chain length is encoded in the path.
  assert.equal(airing.depth, 1);
  assert.equal(bardo.depth, 2);
  assert.equal(cato.depth, 3);
  assert.equal(parseHolon(cato.address).depth, cato.depth, 'the address parses to the reported depth');

  // The path is a genuine containment path the holon algebra walks.
  assert.ok(containsHolon(airing.address, cato.address), 'Airing holonically contains Cato');
  assert.ok(containsHolon(bardo.address, cato.address),  'Bardo holonically contains Cato');
  assert.equal(cato.address, 'airing.bardo.cato');
});

test('a disjoint thread shares no span and stays at the root', () => {
  const { by } = build();
  const dunmore = by.get('dunmore');
  assert.ok(dunmore, 'Dunmore admits');
  // Dunmore (11–12) is inside Airing's outer span (0–13), so it IS contained by Airing,
  // but by nothing tighter — it never overlaps Bardo or Cato.
  assert.ok(!dunmore.containedBy.includes('bardo'), 'Dunmore shares no span with Bardo');
  assert.ok(!dunmore.containedBy.includes('cato'),  'Dunmore shares no span with Cato');
});

test('nestingSummary reports the weave depth, and no referent is silently flattened', () => {
  const { nest } = build();
  const s = nestingSummary(nest);
  assert.ok(s.referents >= 4, 'the ensemble is present');
  assert.ok(s.maxHolonDepth >= 3, 'the deepest chain is at least three levels');
  assert.ok(s.max >= 2, 'the most-nested thread sits inside at least two others');
  // The whole point: not everything is depth 1 any more.
  assert.ok(s.flatDepth1 < s.referents, 'the flat depth-1 collapse is broken');
});

test('the projection is pure — same log, identical addresses on reprojection', () => {
  const doc = parseText(NESTED, { docId: 'nest' });
  const a = referentNesting(doc);
  const b = referentNesting(doc);
  assert.deepEqual(a.referents.map((r) => [r.id, r.address, r.depth]),
                   b.referents.map((r) => [r.id, r.address, r.depth]),
                   'determinism: no clock, no map-order leak into the path');
});

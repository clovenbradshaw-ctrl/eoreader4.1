import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { conceptToPlan } from '../src/write/index.js';

// Cursor and frame make ONE held graph yield different tellings — the honest form of novelty:
// the generator re-centres (cursor) and re-lenses (frame) what it says, and never fabricates a
// fact the graph does not hold. Selection only; the arrow of time still fixes the order.

const SCENE = 'Gregor saw Grete. Gregor loved Grete. Gregor feared Klamm. Grete watched Klamm. Grete trusted Gregor.';
const verbs = (plan) => plan.map(p => p.verb);

test('frame selects by reading lens: a perception telling differs from an affect telling', () => {
  const doc = parseText(SCENE, { docId: 's' });
  const perception = verbs(conceptToPlan(doc, { frame: 'perception' }));
  const affect = verbs(conceptToPlan(doc, { frame: 'affect' }));
  assert.deepEqual(perception.sort(), ['saw', 'watched'], 'only the perception bonds');
  assert.ok(affect.includes('loved') && affect.includes('feared') && !affect.includes('saw'), 'only the affect bonds');
});

test('cursor re-centres: only what the focused entity touches is said', () => {
  const doc = parseText(SCENE, { docId: 's' });
  const grete = conceptToPlan(doc, { cursor: 'Grete' });
  // "Gregor feared Klamm" touches neither side as Grete → dropped from a Grete-centred telling
  assert.ok(!grete.some(p => p.verb === 'feared'), 'a bond not touching the cursor is not said');
  assert.ok(grete.some(p => p.verb === 'watched'), 'a bond the cursor participates in is said');
});

test('cursor and frame compose', () => {
  const doc = parseText(SCENE, { docId: 's' });
  const v = verbs(conceptToPlan(doc, { cursor: 'Grete', frame: 'affect' })).sort();
  // affect bonds touching Grete: loved (Grete is object), trusted (Grete is subject) — not feared (Klamm)
  assert.ok(v.includes('trusted'), 'an affect bond the cursor drives');
  assert.ok(!v.includes('saw') && !v.includes('feared'), 'neither off-frame nor off-cursor bonds');
});

test('a cursor on a given name finds the merged full-name entity', () => {
  const doc = parseText('Gregor Samsa woke. Gregor Samsa saw Grete. Grete brought Gregor Samsa milk.', { docId: 's' });
  const plan = conceptToPlan(doc, { cursor: 'Gregor' });   // entity label is "Gregor Samsa"
  assert.ok(plan.length >= 1, 'the cursor resolves "Gregor" to "Gregor Samsa"');
  assert.ok(plan.every(p => p.subj.name.includes('Gregor') || (p.obj && String(p.obj.name || p.obj).includes('Gregor'))),
    'every said bond touches the cursor entity');
});

test('no cursor/frame is the full telling (byte-identical default)', () => {
  const doc = parseText(SCENE, { docId: 's' });
  assert.equal(conceptToPlan(doc).length, conceptToPlan(doc, { cursor: null, frame: null }).length);
  assert.ok(conceptToPlan(doc).length >= 4, 'the whole graph is told by default');
});

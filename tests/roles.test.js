import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { propositionRoles } from '../src/surfer/index.js';

// The role of an element by ablation, done over operator profiles — the embedder-free
// version of "embed a proposition, remove a word, the difference is the word's role". No
// embedder is constructed; the role is which operations stop firing when the element is gone.

test('an element\'s role is the operational difference its removal makes — no embedder', () => {
  const doc = parseText('Gregor saw Grete.', { docId: 's' });
  const units = propositionRoles(doc);
  assert.ok(units.length >= 1, 'a proposition with ≥2 elements yields roles');
  const u = units[0];
  for (const r of u.roles) {
    assert.equal(typeof r.role, 'number');
    assert.ok(Array.isArray(r.carries));
    assert.equal(typeof r.loadBearing, 'boolean');
  }
});

test('the relation that holds the proposition together is load-bearing and carries its operator', () => {
  const doc = parseText('Gregor saw Grete.', { docId: 's' });
  const u = propositionRoles(doc)[0];
  const verb = u.roles.find(r => r.element === 'saw');
  assert.ok(verb, 'the relation verb is an element of the proposition');
  assert.ok(verb.carries.includes('CON'), 'removing it drops the bond it held up');
  assert.equal(verb.loadBearing, true, 'in a minimal proposition the relation is co-essential');
});

test('roles are ranked by how much the reading moves, and a 1-element unit yields nothing to leave out', () => {
  const doc = parseText('Gregor saw Grete. Grete brought Gregor milk.', { docId: 's' });
  const units = propositionRoles(doc);
  for (const u of units) {
    for (let i = 1; i < u.roles.length; i++) assert.ok(u.roles[i - 1].role >= u.roles[i].role, 'ranked by role magnitude');
  }
});

test('resolution is capped by bond coverage, not by any missing model — a bond-less unit has no roles', () => {
  // "the firm" is a common noun, so no bond forms; there is nothing to ablate — the limit is
  // chemistry (the admission reaction), not the absence of an embedder.
  const doc = parseText('The firm prospered.', { docId: 's' });
  const units = propositionRoles(doc);
  const u = units.find(x => x.sentIdx === 0);
  assert.ok(!u || u.roles.length === 0, 'no bond → nothing to leave out; the cap is bond coverage');
});

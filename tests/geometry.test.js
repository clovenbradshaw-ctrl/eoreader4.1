import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FACES, facesOf, notate, notateHolon, cellAt, cellsOf, siteStanceAt,
  COGNITION, COGNITION_ORDER, facultyOfOperator, facultyOf,
  holonId, parseHolon, holonLevels, depthOf, parentOf, leafOf, joinHolon, containsHolon,
  OPERATORS,
} from '../src/core/index.js';

// ── The cognition triad (add-on 2 §A) — surfer in the middle ─────────────────

test('the cognition triad is perceiver · surfer · enactor, the surfer in the middle', () => {
  assert.deepEqual(COGNITION_ORDER, ['perceiver', 'surfer', 'enactor']);
  assert.equal(COGNITION.surfer.position, 'middle', 'the surfer is the relating step — the middle, by construction');
  assert.equal(COGNITION.perceiver.position, 'first');
  assert.equal(COGNITION.enactor.position, 'last');
  // The two arc-faculties are modality-blind and mirror each other (add-on 3 §1, add-on 4).
  assert.equal(COGNITION.perceiver.modalityBlind, true, 'the perceiver is modality-blind — text is one sense among several');
  assert.equal(COGNITION.enactor.modalityBlind, true, 'the enactor is modality-blind — speech is one organ among several');
  // Each faculty's home operators are its Domain column.
  assert.deepEqual(COGNITION.perceiver.operators, ['NUL', 'SIG', 'INS']); // Existence
  assert.deepEqual(COGNITION.surfer.operators, ['SEG', 'CON', 'SYN']);    // Structure
  assert.deepEqual(COGNITION.enactor.operators, ['DEF', 'EVA', 'REC']);   // Interpretation
  assert.deepEqual(COGNITION.enactor.gate, ['DEF', 'EVA', 'REC'], 'the enactor gates (commits) with DEF·EVA·REC');
});

test('an operator names the faculty that fired it (by Domain)', () => {
  assert.equal(facultyOfOperator('INS'), 'perceiver');
  assert.equal(facultyOfOperator('CON'), 'surfer');
  assert.equal(facultyOfOperator('REC'), 'enactor');
  assert.equal(facultyOf('surfer').function, 'Structure');
});

// ── The three faces (add-on 2 §B) — operator(Site, Stance) ───────────────────

test('the three faces span the cube axes and answer what/where/how', () => {
  assert.deepEqual(FACES.Act.axes, ['Mode', 'Domain']);
  assert.deepEqual(FACES.Site.axes, ['Domain', 'Object']);
  assert.deepEqual(FACES.Stance.axes, ['Mode', 'Object']);
  assert.equal(FACES.Site.asks, 'where it lands');
});

test('facesOf reads Act, Site, Stance off an event; notate writes operator(Site, Stance)', () => {
  const f = facesOf({ op: 'CON', grain: 'Figure' });
  assert.equal(f.act.domain, 'Structure');
  assert.equal(f.site.terrain, 'Link');
  assert.equal(f.stance.stance, 'Binding');
  assert.equal(notate({ op: 'CON', grain: 'Figure' }), 'CON(Link, Binding)');
  // The add-on's four canonical home firings (§B). They do not share one grain —
  // NUL is Ground, INS and CON are Figure, REC is Pattern — so each names its grain.
  assert.equal(notate({ op: 'NUL', grain: 'Ground' }),  'NUL(Void, Clearing)');
  assert.equal(notate({ op: 'INS', grain: 'Figure' }),  'INS(Entity, Making)');
  assert.equal(notate({ op: 'CON', grain: 'Figure' }),  'CON(Link, Binding)');
  assert.equal(notate({ op: 'REC', grain: 'Pattern' }), 'REC(Paradigm, Composing)');
});

test('cellAt respects the grain guard — a grain-mixed (off-home) request is refused', () => {
  // Coherent: Link (Figure) with Binding (Figure) → CON's home cell.
  assert.equal(cellAt('CON', { site: 'Link', stance: 'Binding' }).key, 'CON_Binding_Link');
  // Resolvable from one face alone.
  assert.equal(cellAt('REC', { site: 'Paradigm' }).key, 'REC_Composing_Paradigm');
  assert.equal(cellAt('SIG', { stance: 'Tending' }).key, 'SIG_Tending_Void');
  // Grain-mixed: Entity is Figure-grain, Tending is Ground-grain → the confabulation
  // guard rejects it. Grain stays load-bearing; the cell is not confabulated.
  assert.equal(cellAt('SIG', { site: 'Entity', stance: 'Tending' }), null);
  // Off-domain: SIG is Existence, Link is Structure → refused.
  assert.equal(cellAt('SIG', { site: 'Link' }), null);
});

test('cellsOf gives an operator its three grain-coherent cells (its legal reach)', () => {
  assert.deepEqual(cellsOf('SIG').map(c => c.key),
    ['SIG_Tending_Void', 'SIG_Binding_Entity', 'SIG_Tracing_Kind']);
  assert.deepEqual(siteStanceAt('CON', 'Pattern'), { site: 'Network', stance: 'Tracing' });
});

// ── Holonic Site addressing (add-on 2 §B/§D) — which place it lands on ────────

test('a holonic path addresses a target by level, with a hashId of record', () => {
  const h = parseHolon('customers.profiles.pets.name');
  assert.deepEqual(h.segments, ['customers', 'profiles', 'pets', 'name']);
  assert.equal(h.depth, 4, 'depth is the holonic level');
  assert.equal(h.leaf, 'name');
  assert.equal(h.parent, 'customers.profiles.pets');
  assert.match(h.id, /^[0-9a-f]{8}$/, 'every referent has a hashId');
  assert.equal(h.id, holonId('customers.profiles.pets.name'), 'the id is a function of the canonical path');
  assert.equal(depthOf(' customers . profiles '), 2, 'canonicalised before measuring');
});

test('every level along a path is itself an addressed referent (the CON walks up)', () => {
  const levels = holonLevels('customers.profiles.pets');
  assert.deepEqual(levels.map(l => l.segment), ['customers', 'profiles', 'pets']);
  assert.deepEqual(levels.map(l => l.path), ['customers', 'customers.profiles', 'customers.profiles.pets']);
  assert.equal(levels[1].id, holonId('customers.profiles'), 'each level carries its own hashId');
  assert.deepEqual(levels.map(l => l.depth), [1, 2, 3]);
});

test('holonic containment and navigation walk the holarchy', () => {
  assert.equal(parentOf('customers.profiles.pets'), 'customers.profiles');
  assert.equal(leafOf('customers.profiles.pets'), 'pets');
  assert.equal(joinHolon('customers.profiles', 'pets.name'), 'customers.profiles.pets.name');
  assert.ok(containsHolon('customers.profiles', 'customers.profiles.pets'), 'a prefix on the boundary contains');
  assert.ok(!containsHolon('customers2', 'customers.profiles'), 'not a mere string prefix');
  assert.ok(containsHolon('', 'anything.at.all'), 'the root contains everything');
});

test('the Site face carries both the KIND (terrain) and WHICH (holon) of a place', () => {
  const ev = { op: 'CON', grain: 'Figure', holon: 'customers.profiles.pets.name' };
  const f = facesOf(ev);
  assert.equal(f.site.terrain, 'Link', 'the cube gives the kind of place');
  assert.equal(f.site.holon.path, 'customers.profiles.pets.name', 'the holon gives which place');
  assert.equal(notateHolon(ev), 'CON(customers.profiles.pets.name@Link, Binding)');
});

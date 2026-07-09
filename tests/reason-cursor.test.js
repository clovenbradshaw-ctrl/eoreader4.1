// tests/reason-cursor.test.js — the CURSOR_REV battery (reason/cursor.js + the walk
// wiring). One golden invariant protects all of it: the IDENTITY cursor reproduces the
// pre-cursor walk exactly (tools/cursor/golden-walk.json, captured against the
// ungeneralized readGraph before any of this shipped). Every step's falsifier from the
// wiring directive is asserted here:
//
//   Step 0  prefix determinism (strong Gate A) + the retraction fold
//   Step 1  upto — memory and revision as folds
//   Step 2  origin — standpoint (origin:null reweights nothing)
//   Step 3  grain — height (the full band drops nothing)
//   Step 4  replayState at the final k reproduces the walk's end state; pastMenu
//   Step 5  scope — anchoring develops the supposition (Gate B lever), an open scope
//           never perturbs the no-scope walk, the partiesOf leak is closed, a
//           discharged consequence never reads grounded (noScopeLaunders)
//   Step 6  enactor DEF at a holon — the reseating falsifier: determiners go slack,
//           the term rides with canWitness false, and none of it exists at IDENTITY
//   Step 7  the contradiction veto fires; possibility and necessity read off it
//   Step 8  reflection — idle reaches surfaced, stratification by log order

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createLog } from '../src/core/log.js';
import { fromEnactor } from '../src/core/provenance.js';
import { ESSENTIAL_VERBS } from '../src/dag/stance.js';
import {
  walkReasoning, seedCorpus, noStepLaunders, noScopeLaunders, pastMenu, readGraph, IDENTITY,
  replayState, scopesOf, openScopes, dischargeScope,
  contradictionsIn, possible, necessary, reflect,
} from '../src/reason/index.js';
import { runBaseline, CORPUS } from '../tools/cursor/probe-replay.mjs';

const GOLDEN = JSON.parse(readFileSync(new URL('../tools/cursor/golden-walk.json', import.meta.url)));

const freshLog = () => {
  const log = createLog({ docId: 'cursor-test' });
  seedCorpus(log, CORPUS);
  return log;
};

const snapGraph = (g) => ({
  figures: [...g.figures.values()].map((f) => ({ ...f })),
  bonds: g.bonds.map((b) => ({ ...b })),
  grains: [...g.grains].sort((x, y) => x - y),
  eventCount: g.events.length,
});

// A log shim over the golden run's serialized events — readGraph only calls snapshot().
const goldenLog = { snapshot: () => GOLDEN.logEvents };

// Project a walk result down to what it DID (ops, notes, grades, in order) — the
// perturbation measure that ignores seq numbering.
const moves = (result) => result.steps.map((s) => `${s.op}|${s.note}|${s.grade}`);

// ── the golden invariant ───────────────────────────────────────────────────────

test('GOLDEN — the cursor-era walk reproduces the pre-cursor baseline byte-for-byte', async () => {
  const now = await runBaseline();
  assert.deepEqual(JSON.parse(JSON.stringify(now)), GOLDEN,
    'IDENTITY holds golden parity on the existing walk');
});

test('Step 0 strong Gate A — the prefix fold equals the graph the walk saw entering step k', () => {
  for (let i = 0; i < GOLDEN.steps.length; i++) {
    const fold = readGraph(goldenLog, { upto: GOLDEN.steps[i].seq - 1 });
    assert.deepEqual(snapGraph(fold), GOLDEN.graphsSeen[i], `prefix fold at step ${i}`);
  }
  // The baseline ended `ground-covered` — the break happens before the propose hook, so
  // the capture holds exactly one graph per committed step; a `saturated` ending would
  // carry one more (the fold the flat field was measured on), asserted when present.
  assert.ok(GOLDEN.graphsSeen.length >= GOLDEN.steps.length);
  if (GOLDEN.graphsSeen.length > GOLDEN.steps.length) {
    assert.deepEqual(snapGraph(readGraph(goldenLog, IDENTITY)), GOLDEN.graphsSeen[GOLDEN.steps.length]);
  }
});

// ── Step 0 — retraction ────────────────────────────────────────────────────────

test('Step 0 — a retracted bond is gone from the fold; a log with no retracts folds as before', () => {
  const log = freshLog();
  const before = readGraph(log);
  assert.equal(before.bonds.length, 3);

  const employsAB = log.snapshot().find((e) => e.op === 'CON' && e.src === 'a' && (e.tgt ?? e.dst) === 'b');
  log.retract(employsAB.seq, 'test');
  const after = readGraph(log);
  assert.equal(after.bonds.length, 2, 'the retracted bond no longer appears');
  assert.ok(!after.bonds.some((b) => b.src === 'a' && b.dst === 'b'));
  assert.ok(after.retracted.has(employsAB.seq));
});

test('Step 0 — a retracted figure is dropped too', () => {
  const log = freshLog();
  const eve = log.snapshot().find((e) => e.op === 'INS' && e.id === 'e');
  log.retract(eve.seq, 'test');
  assert.ok(!readGraph(log).figures.has('e'));
});

// ── Step 1 — upto: memory and revision ─────────────────────────────────────────

test('Step 1 — upto folds only seq <= k; upto:Infinity reproduces today', () => {
  const log = freshLog();
  assert.deepEqual(snapGraph(readGraph(log, { upto: Infinity })), snapGraph(readGraph(log)));
  const early = readGraph(log, { upto: 4 });   // the five INS events only
  assert.equal(early.figures.size, 5);
  assert.equal(early.bonds.length, 0);
  assert.ok(early.events.every((e) => e.seq <= 4));
});

test('Step 1 — revision is the diff of two folds: present then, gone now', () => {
  const log = freshLog();
  const bond = log.snapshot().find((e) => e.op === 'CON' && e.src === 'a' && (e.tgt ?? e.dst) === 'b');
  log.retract(bond.seq, 'revised');
  const then = readGraph(log, { upto: bond.seq });
  const now = readGraph(log);
  const key = (b) => `${b.src}|${b.via}|${b.dst}`;
  const revised = then.bonds.filter((b) => !now.bonds.some((n) => key(n) === key(b)));
  assert.equal(revised.length, 1);
  assert.equal(revised[0].src, 'a');
});

// ── Step 2 — origin: standpoint ────────────────────────────────────────────────

test('Step 2 — origin restricts to the reachable neighborhood; origin:null reweights nothing', () => {
  const log = freshLog();
  assert.deepEqual(snapGraph(readGraph(log, { origin: null })), snapGraph(readGraph(log)));

  const r1 = readGraph(log, { origin: { id: 'a', radius: 1 } });
  assert.deepEqual([...r1.figures.keys()].sort(), ['a', 'b', 'c'], 'a plus its direct bonds');
  const r2 = readGraph(log, { origin: { id: 'a', radius: 2 } });
  assert.deepEqual([...r2.figures.keys()].sort(), ['a', 'b', 'c', 'd'], 'd arrives at two hops');
  assert.ok(!r2.figures.has('e'), 'the isolate stays outside every radius');
});

// ── Step 3 — grain: height ─────────────────────────────────────────────────────

test('Step 3 — the full band drops nothing; a band filters by grain', async () => {
  const log = freshLog();
  await walkReasoning(log, { epsilon: 0.02, maxSteps: 24 });
  assert.deepEqual(snapGraph(readGraph(log, { grain: { min: -Infinity, max: Infinity } })),
    snapGraph(readGraph(log)), 'the full band reproduces today');

  const high = readGraph(log, { grain: { min: 1 } });
  assert.ok(high.figures.size > 0, 'the walk synthesised high-grain figures');
  assert.ok([...high.figures.values()].every((f) => f.grain >= 1), 'only the synthesis band remains');
  const ground = readGraph(log, { grain: { max: 0 } });
  assert.deepEqual([...ground.figures.keys()].sort(), ['a', 'b', 'c', 'd', 'e'], 'the ground band is the corpus');
});

// ── Step 4 — regret: replay of walk state ──────────────────────────────────────

test('Step 4 — replayState at the final k reproduces the state the walk ended with', async () => {
  const log = freshLog();
  const result = await walkReasoning(log, { epsilon: 0.02, maxSteps: 24 });
  const state = replayState(log);

  const recSteps = result.steps.filter((s) => s.op === 'REC');
  const synSteps = result.steps.filter((s) => s.op === 'SYN');
  const conSteps = result.steps.filter((s) => s.op === 'CON');
  assert.equal(state.rules.length, recSteps.length, 'every learned rule refolds');
  assert.equal(state.synthesised.size, synSteps.length, 'every synthesis refolds');
  assert.equal(state.bondsSeen.size, conSteps.length, 'every seen bond refolds');
  const pk = (a, b) => (String(a) < String(b) ? `${a}~${b}` : `${b}~${a}`);
  for (const s of conSteps) assert.ok(state.bondsSeen.has(pk(s.sites[0], s.sites[1])), `bond of step ${s.i}`);
});

test('Step 4 — pastMenu is the roads not taken at step k, read-only', async () => {
  const log = freshLog();
  const corpusLen = log.length;
  await walkReasoning(log, { epsilon: 0.02, maxSteps: 24 });
  const lenBefore = log.length;

  const atStart = pastMenu(log, corpusLen - 1);
  assert.ok(atStart.some((c) => c.op === 'REC' && c.via === 'employs'), 'the rule was on the table');
  assert.ok(atStart.some((c) => c.op === 'CON'), 'unbonded pairs were on the table');
  assert.equal(log.length, lenBefore, 'nothing was committed');
});

// ── Step 5 — scope: the modal family ───────────────────────────────────────────

test('Step 5 — the walk DEVELOPS a supposition under its scope (the Gate B lever)', async () => {
  const log = freshLog();
  const result = await walkReasoning(log, {
    epsilon: 0.02, maxSteps: 40,
    scope: { name: 'S', suppositions: [
      { op: 'INS', id: 'x', label: 'Xenon' },
      { op: 'CON', src: 'x', tgt: 'a', via: 'employs' },
    ] },
  });

  const supposes = result.steps.filter((s) => s.op === 'SUPPOSE');
  assert.equal(supposes.length, 2, 'both suppositions were seeded');
  assert.ok(supposes.every((s) => s.grade === 'conditional' && s.warrant?.scope === 'S'));

  const developed = result.steps.filter((s) => s.scope === 'S' && s.op !== 'SUPPOSE' && s.op !== 'DISCHARGE'
    && s.sites.includes('x'));
  assert.ok(developed.length >= 1, 'the walk developed the hypothetical rather than starving it');
  assert.ok(developed.every((s) => s.grade === 'conditional'), 'in-scope consequences grade conditional');
  assert.equal(noScopeLaunders(result), true, 'no scope launders');
});

test('Step 5 falsifier — an open scope never perturbs the no-scope walk', async () => {
  const clean = freshLog();
  const cleanRun = await walkReasoning(clean, { epsilon: 0.02, maxSteps: 24 });

  const scoped = freshLog();
  const prov = fromEnactor('suppose');
  scoped.append({ op: 'INS', id: 'x', label: 'Xenon', scope: 'S', supposed: true, prov });
  scoped.append({ op: 'CON', src: 'x', tgt: 'a', via: 'employs', scope: 'S', supposed: true, prov });
  const scopedRun = await walkReasoning(scoped, { epsilon: 0.02, maxSteps: 24 });   // NO scope option

  assert.deepEqual(moves(scopedRun), moves(cleanRun), 'the actual walk is identical move for move');
  assert.ok(!readGraph(scoped).figures.has('x'), 'the supposition is invisible to the actual fold');
  assert.deepEqual(openScopes(scoped), ['S'], 'and the scope stands open, inert');
});

test('Step 5 — the partiesOf leak is closed: a stray enactor bond never rides into the actual REC', async () => {
  const log = freshLog();
  const prov = fromEnactor('stray');
  log.append({ op: 'INS', id: 'z', label: 'Zed', prov });                 // untagged supposition,
  log.append({ op: 'CON', src: 'z', tgt: 'a', via: 'employs', prov });    // the Gate B shape
  const result = await walkReasoning(log, { epsilon: 0.02, maxSteps: 24 });

  const rec = result.steps.find((s) => s.op === 'REC');
  assert.ok(rec, 'the rule is still learned');
  assert.ok(!rec.sites.includes('z'), 'the stray figure is not among the rule’s participants');
  assert.equal(noStepLaunders(result), true);
});

test('Step 5 — DISCHARGE folds the scope to one conditional; a discharged consequence never reads grounded', async () => {
  const log = freshLog();
  const result = await walkReasoning(log, {
    epsilon: 0.02, maxSteps: 40,
    scope: { name: 'S', suppositions: [{ op: 'INS', id: 'x', label: 'Xenon' }] },
  });

  const scopedSteps = result.steps.filter((s) => s.scope === 'S');
  assert.ok(scopedSteps.every((s) => s.grade !== 'grounded' && s.grade !== 'warranted-ungrounded'),
    'nothing under the scope reads grounded or warranted');

  const discharge = result.steps.find((s) => s.op === 'DISCHARGE');
  const conditional = discharge ? scopesOf(log).get('S') : dischargeScope(log, 'S');
  if (discharge) {
    assert.ok(conditional.discharged, 'the walk’s own DISCHARGE closed the scope');
  } else {
    assert.equal(conditional.grade, 'conditional');
    assert.equal(conditional.canWitness, false, 'the conditional cannot witness');
    assert.ok(conditional.then.length >= 0);
  }
  assert.deepEqual(openScopes(log), [], 'the scope is closed either way');
  assert.equal(noScopeLaunders(result), true);
});

// ── Step 6 — the enactor DEF at a holon ────────────────────────────────────────

test('Step 6 falsifier — the reseating: an enactor DEF severs the determiners and carries the set value, canWitness false', () => {
  const log = createLog({ docId: 'def-test' });
  seedCorpus(log, [
    { op: 'INS', id: 'X', label: 'DockSiting' },
    { op: 'INS', id: 'A', label: 'Harbor' },
    { op: 'INS', id: 'B', label: 'Traffic' },
    { op: 'CON', src: 'A', dst: 'X', via: 'employs' },   // incoming determiner (untyped → conservative cut)
    { op: 'CON', src: 'X', dst: 'B', via: 'employs' },   // outgoing — never severed
  ]);
  log.append({ op: 'DEF', id: 'X', value: 'relocated', scope: 'W', supposed: true, prov: fromEnactor('design') });

  const scoped = readGraph(log, { scope: 'W' });
  assert.equal(scoped.figures.get('X').term, 'relocated', 'X carries the set value under the scope');
  assert.equal(scoped.terms.get('X').door, 'enactor', 'the door makes it mine — canWitness false by type');
  const incoming = scoped.bonds.find((b) => b.src === 'A' && b.dst === 'X');
  const outgoing = scoped.bonds.find((b) => b.src === 'X' && b.dst === 'B');
  assert.equal(incoming.slack, true, 'the former determiner no longer derives X');
  assert.ok(!outgoing.slack, 'propagation forward is the ordinary walk, unchanged');

  const actual = readGraph(log);   // IDENTITY — the counterfactual world never leaks
  assert.equal(actual.terms.size, 0);
  assert.equal(actual.figures.get('X').term, undefined);
  assert.ok(actual.bonds.every((b) => !b.slack), 'no sever outside the scope');
});

test('Step 6 — causal typing refines the cut: only determiner vias are severed when typing is present', () => {
  const causalVia = [...ESSENTIAL_VERBS][0];
  const log = createLog({ docId: 'def-typed' });
  seedCorpus(log, [
    { op: 'INS', id: 'X', label: 'Crime' },
    { op: 'INS', id: 'A', label: 'Library' },
    { op: 'INS', id: 'B', label: 'Weather' },
    { op: 'CON', src: 'A', dst: 'X', via: causalVia },    // typed determiner
    { op: 'CON', src: 'B', dst: 'X', via: 'borders' },    // untyped incoming
  ]);
  log.append({ op: 'DEF', id: 'X', value: 'fixed-low', scope: 'W', supposed: true, prov: fromEnactor('design') });

  const g = readGraph(log, { scope: 'W' });
  assert.equal(g.bonds.find((b) => b.src === 'A').slack, true, 'the causal-typed determiner is severed');
  assert.ok(!g.bonds.find((b) => b.src === 'B').slack, 'the untyped incoming survives when typing exists');
});

test('Step 6 — a perceiver-door DEF is the corpus setting a term; the door decides the grade side', () => {
  const log = createLog({ docId: 'def-door' });
  seedCorpus(log, [{ op: 'INS', id: 'X', label: 'Thing' }, { op: 'DEF', id: 'X', value: 'witnessed' }]);
  const g = readGraph(log);
  assert.equal(g.terms.get('X').door, 'perceiver', 'the corpus witnessed this term');
  assert.equal(g.figures.get('X').term, 'witnessed');
});

// ── Step 7 — possibility and necessity via the veto ────────────────────────────

test('Step 7 falsifier — the veto FIRES on a contradictory bond', () => {
  const log = freshLog();
  log.append({ op: 'CON', src: 'a', tgt: 'b', via: 'employs', polarity: '−', prov: fromEnactor('t') });
  const conflicts = contradictionsIn(readGraph(log));
  assert.equal(conflicts.length, 1, 'the same bond affirmed and denied is caught');
  assert.equal(conflicts[0].kind, 'polarity-clash');
});

test('Step 7 — possibility is a scope that folds without a veto; necessity is the unsupposable negation', () => {
  const log = freshLog();
  const lenBefore = log.length;

  const fine = possible(log, [{ op: 'CON', src: 'd', tgt: 'e', via: 'trusts' }]);
  assert.equal(fine.possible, true, 'an unopposed supposition is possible');

  const clash = possible(log, [{ op: 'CON', src: 'a', tgt: 'b', via: 'employs', polarity: '−' }]);
  assert.equal(clash.possible, false, 'denying an attested bond cannot be consistently supposed');

  const nec = necessary(log, { op: 'CON', src: 'a', tgt: 'b', via: 'employs' });
  assert.equal(nec.necessary, true, 'what cannot be consistently denied is necessary');
  const open = necessary(log, { op: 'CON', src: 'd', tgt: 'e', via: 'trusts' });
  assert.equal(open.necessary, false, 'an unattested bond is not necessary');
  assert.ok(open.counterexample, 'its negation is the counterexample scope');

  assert.equal(log.length, lenBefore, 'modality is read-only — nothing was committed');
});

// ── Step 8 — reflection: reading turned around ─────────────────────────────────

test('Step 8 — reflection surfaces idle reaches and builtOnSelf chains off the reader’s own acts', async () => {
  const log = freshLog();
  const result = await walkReasoning(log, { epsilon: 0.02, maxSteps: 24 });
  const r = reflect(log);

  const idleCount = result.steps.filter((s) => s.grade === 'idle-ungrounded').length;
  assert.equal(r.idleReaches.length, idleCount, 'every idle reach is surfaced, none invented');
  assert.ok(result.steps.some((s) => s.builtOnSelf), 'the walk built on itself');
  assert.ok(r.builtOnSelfChains.length >= 1, 'and reflection reads the chain off the log');
  assert.deepEqual(r.undischargedScopes, [], 'no scope stands open');
});

test('Step 8 falsifier — stratification: a pass never reads its own committing event', async () => {
  const log = freshLog();
  await walkReasoning(log, { epsilon: 0.02, maxSteps: 24 });
  const stray = log.append({ op: 'CON', src: 'a', tgt: 'e', via: 'undreamt', prov: fromEnactor('t') });

  const before = reflect(log, { upto: stray.seq });      // reads seq < stray.seq
  assert.ok(!before.idleReaches.some((x) => x.seq === stray.seq), 'the pass at k cannot see seq k');
  const after = reflect(log, { upto: stray.seq + 1 });
  assert.ok(after.idleReaches.some((x) => x.seq === stray.seq && x.via === 'undreamt'),
    'the next pass reads it as a prior act');
});

test('Step 8 — an undischarged scope is surfaced', async () => {
  const log = freshLog();
  const prov = fromEnactor('suppose');
  log.append({ op: 'INS', id: 'x', label: 'Xenon', scope: 'S', supposed: true, prov });
  assert.deepEqual(reflect(log).undischargedScopes, ['S']);
});

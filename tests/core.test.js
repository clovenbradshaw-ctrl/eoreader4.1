import { test } from 'node:test';
import assert from 'node:assert/strict';

import { OPERATORS, isOperator } from '../src/core/operators.js';
import { createLog } from '../src/core/log.js';
import { eoAddressOfEvent, eoNotation } from '../src/core/address.js';
import { projectGraph, projectionStats } from '../src/core/project.js';

test('there are exactly nine operators', () => {
  assert.equal(Object.keys(OPERATORS).length, 9);
});

test('every operator is on the ACT grid', () => {
  const modes   = new Set(['Differentiate', 'Relate', 'Generate']);
  const domains = new Set(['Existence', 'Structure', 'Interpretation']);
  for (const o of Object.values(OPERATORS)) {
    assert.ok(modes.has(o.mode),     `mode ${o.mode}`);
    assert.ok(domains.has(o.domain), `domain ${o.domain}`);
  }
});

test('CON is the central bond (Relate × Structure)', () => {
  assert.equal(OPERATORS.CON.mode,   'Relate');
  assert.equal(OPERATORS.CON.domain, 'Structure');
});

test('isOperator rejects unknown ops', () => {
  assert.equal(isOperator('CON'), true);
  assert.equal(isOperator('XXX'), false);
  assert.equal(isOperator(null),  false);
});

test('log: append seals the event and assigns a seq', () => {
  const log = createLog({ docId: 'd1' });
  const e = log.append({ op: 'INS', id: 'a', label: 'A' });
  assert.equal(e.seq, 0);
  assert.throws(() => { e.label = 'X'; });
});

test('log: invalid op throws', () => {
  const log = createLog();
  assert.throws(() => log.append({ op: 'XXX' }), TypeError);
});

test('log: retraction is itself written as a SEG event', () => {
  const log = createLog();
  log.append({ op: 'INS', id: 'a', label: 'A' });
  log.retract(0, 'oops');
  assert.equal(log.length, 2);
  assert.equal(log.events[1].op, 'SEG');
  assert.equal(log.events[1].refSeq, 0);
});

test('eoAddressOfEvent derives the three faces', () => {
  const addr = eoAddressOfEvent({ op: 'INS', id: 'a' });
  assert.equal(addr.operator,    'INS');
  assert.equal(addr.act.mode,    'Generate');
  assert.equal(addr.act.domain,  'Existence');
  assert.equal(addr.site.grain,  'Ground');
  assert.equal(addr.resolution.mode, 'Generate');
});

test('eoNotation emits operator(Site,Stance) — the address the Log view shows', () => {
  // Compact form: operator(Domain, Grain); the operator carries the mode, so
  // all three cube axes are recoverable from the one string the row displays.
  assert.equal(eoNotation({ op: 'INS', id: 'a' }),                       'INS(Exi,Gro)');
  assert.equal(eoNotation({ op: 'CON', src: 'a', tgt: 'b' }),            'CON(Str,Pat)');
  assert.equal(eoNotation({ op: 'DEF', id: 'topps', key: 'predicate' }), 'DEF(Int,Fig)');
  assert.equal(eoNotation(null),                                         '?');
});

test('projectGraph is memoized while the log is unchanged', () => {
  const log = createLog();
  log.append({ op: 'INS', id: 'a', label: 'A' });
  log.append({ op: 'INS', id: 'a', label: 'A' });
  const g1 = projectGraph(log);
  const g2 = projectGraph(log);
  assert.strictEqual(g1, g2);
  assert.equal(projectionStats(log).cached, true);
});

test('projectGraph recomputes after a new append', () => {
  const log = createLog();
  log.append({ op: 'INS', id: 'a', label: 'A' });
  const g1 = projectGraph(log);
  log.append({ op: 'INS', id: 'b', label: 'B' });
  const g2 = projectGraph(log);
  assert.notStrictEqual(g1, g2);
  assert.equal(g2.entities.size, 2);
});

test('projectGraph collapses SYN(merge) via union-find', () => {
  const log = createLog();
  log.append({ op: 'INS', id: 'a', label: 'A' });
  log.append({ op: 'INS', id: 'b', label: 'B' });
  log.append({ op: 'SYN', kind: 'merge', from: 'a', to: 'b' });
  const g = projectGraph(log);
  assert.equal(g.entities.size, 1);
});

test('projectGraph: SEG(retract) drops the referenced event', () => {
  const log = createLog();
  log.append({ op: 'INS', id: 'a', label: 'A' });
  log.append({ op: 'INS', id: 'b', label: 'B' });
  log.retract(1, 'wrong');
  const g = projectGraph(log);
  assert.equal(g.entities.size, 1);
});

test('projectGraph with different frames produces different memo entries', () => {
  const log = createLog();
  log.append({ op: 'INS', id: 'a', label: 'A' });
  log.append({ op: 'INS', id: 'a', label: 'A' });
  const g1 = projectGraph(log, { focus: 'x' });
  const g2 = projectGraph(log, { focus: 'y' });
  assert.notStrictEqual(g1, g2);
  assert.equal(g1.frame.focus, 'x');
  assert.equal(g2.frame.focus, 'y');
});

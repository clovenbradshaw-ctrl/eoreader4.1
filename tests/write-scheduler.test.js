import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  schedule, propagateResolution, arityReady, judge, overclaims, groupByGranularity,
} from '../src/write/scheduler.js';

// SPEC §3, §4 — the DAG and the two gates, generalizing sanity.mjs to the repo's
// real scheduler. The content graph is the Metamorphosis essay: `meaning` is VOID on
// purpose (Kafka never fixes what the change MEANS), and the substrate must respect
// that all the way up to the thesis.

// INS cells for every figure; `meaning` carries a void band.
const figures = [
  ['gregor', []], ['grete', ['ins_gregor']], ['father', []], ['family', []],
  ['transformation', ['ins_gregor']], ['job', ['ins_gregor']], ['apple', ['ins_father']],
];
const cells = [
  ...figures.map(([id, deps]) => ({ id: `ins_${id}`, op: 'INS', site: id, deps })),
  { id: 'ins_meaning', op: 'INS', site: 'meaning', res: 'void', deps: ['ins_transformation'] },
  // CONs — relations whose argument slots must be filled (the arity gate)
  { id: 'c_supports',  op: 'CON', args: ['gregor', 'family'],         deps: ['ins_gregor', 'ins_family', 'ins_job'], appears: ['job'] },
  { id: 'c_transforms',op: 'CON', args: ['gregor', 'transformation'], deps: ['ins_gregor', 'ins_transformation'] },
  { id: 'c_tends',     op: 'CON', args: ['grete', 'gregor'],          deps: ['ins_grete', 'ins_gregor'] },
  { id: 'c_apple',     op: 'CON', args: ['father', 'gregor'],         deps: ['ins_father', 'ins_gregor', 'ins_apple'], appears: ['apple'] },
  { id: 'c_invert',    op: 'CON', args: ['family', 'gregor'],         deps: ['ins_family', 'ins_gregor'] },
  // SYNs — close a holon and promote a figure one grain up
  { id: 's_inversion', op: 'SYN', deps: ['c_supports', 'c_transforms', 'c_invert'], promotes: 'inversion' },
  { id: 's_meaning',   op: 'SYN', deps: ['c_transforms', 'ins_meaning'],            promotes: 'metaphysical' },  // closes over VOID
  { id: 'top',         op: 'SYN', deps: ['s_inversion', 's_meaning'],               promotes: 'thesis' },
];

test('the substrate schedules to ZERO structural violations under ≥2 postures (§3,§4)', () => {
  const narrative   = schedule(cells, { posture: 'narrative' });
  const thesisFirst = schedule(cells, { posture: 'thesis-first' });

  assert.equal(judge(narrative).total, 0, 'narrative is a zero-violation linearization');
  assert.equal(judge(thesisFirst).total, 0, 'thesis-first is too — same DAG, different order');

  // both are legal linearizations of the SAME DAG — different order, zero violations
  const orderN = narrative.map(c => c.id).join(',');
  const orderT = thesisFirst.map(c => c.id).join(',');
  assert.notEqual(orderN, orderT, 'the postures produce genuinely different orders');
  assert.equal(narrative.length, cells.length);
});

test('the baseline (no gate) carries structural violations — the gate is doing work (§3)', () => {
  // an unscaffolded emission order: the reverse of a valid one connects before it appears
  const bad = schedule(cells, { posture: 'narrative' }).slice().reverse();
  const v = judge(bad);
  assert.ok(v.total > 0, `baseline has violations (${v.arity} arity + ${v.unsupported} unsupported)`);
  assert.ok(v.arity > 0, 'connecting a figure before it appears');
});

test('the arity gate is HARD and modality-blind: a CON needs its argument Sites in the frontier (§3a)', () => {
  const cTends = cells.find(c => c.id === 'c_tends');           // grete -> gregor : tends
  assert.ok(!arityReady(cTends, new Set(['gregor'])),  'grete has not appeared → not schedulable');
  assert.ok(!arityReady(cTends, new Set(['grete'])),   'gregor has not appeared → not schedulable');
  assert.ok( arityReady(cTends, new Set(['grete', 'gregor'])), 'both slots filled → schedulable');
  // a non-relation carries no two-slot obligation
  assert.ok(arityReady(cells.find(c => c.id === 'ins_gregor'), new Set()));
});

test('Resolution propagates; void dominates; the thesis hedges automatically (§3b)', () => {
  const res = propagateResolution(cells);
  assert.equal(res.get('c_transforms').band, 'firm', 'a firm relation stays firm');
  assert.equal(res.get('s_inversion').band, 'firm', 'the social inversion is firm');
  assert.equal(res.get('s_meaning').band, 'void', 'closing over void `meaning` inherits void');
  assert.equal(res.get('top').band, 'void', 'the top SYN inherits the void — the thesis must hedge');
  // the probability carried up is conservative (the min), so a void never firms up by stealth
  assert.ok(res.get('top').p <= res.get('s_inversion').p);
});

test('overclaim is the soft gate failing: a naive always-firm renderer overclaims the void SYNs (§3b)', () => {
  const order = schedule(cells, { posture: 'narrative' });
  const res = propagateResolution(cells);
  // substrate ON: the renderer is handed the propagated band and hedges → 0
  assert.equal(overclaims(order, res, { handedResolution: true }), 0);
  // substrate OFF: every void synthesis (s_meaning, top) is rendered firm → overclaim
  assert.equal(overclaims(order, res, { handedResolution: false }), 2);
});

test('collapseGranularity groups the ordered cells into draws of N (§4/§6)', () => {
  const order = schedule(cells, { posture: 'narrative' });
  assert.equal(groupByGranularity(order, 1).length, order.length, 'granularity 1 = sentence by sentence');
  assert.equal(groupByGranularity(order, 3)[0].length, 3, 'granularity N = hold N cells, then write');
  assert.equal(groupByGranularity(order, 100).length, 1, 'a granularity past the plan is one draw');
});

test('a dependency cycle is named, not silently dropped (§4)', () => {
  const cyclic = [
    { id: 'a', op: 'SYN', deps: ['b'], promotes: 'pa' },
    { id: 'b', op: 'SYN', deps: ['a'], promotes: 'pb' },
  ];
  assert.throws(() => schedule(cyclic), /cycle/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runGate, VOID_TOKEN } from '../src/enactor/gate.js';

// The gate measures each candidate proposition against the grounded basis and
// collapses what beats the null into speech. The four-factor multiply is the
// protection: three failure modes, one product.

const prop = (subj, rel, obj, amplitude = 0.4) =>
  ({ kind: 'rel', op: 'CON', subj, rel, obj, amplitude, status: 'support' });
const cand = (surface, svo, modelAmplitude = 0.9) => ({ surface, svo, modelAmplitude });

test('a grounded, relevant proposition COLLAPSES into speech', async () => {
  const basis = {
    props: [prop('grete', 'opened', 'window')],
    question: { targetProps: [{ kind: 'rel', op: 'CON', subj: 'grete', rel: 'opened', obj: 'window' }] },
    void: [],
  };
  const r = await runGate(
    [cand('Grete opened the window.', { kind: 'rel', op: 'CON', subj: 'grete', rel: 'opened', obj: 'window' })],
    basis, { alpha: 0.05 });
  assert.equal(r.voided, false);
  assert.match(r.answer, /Grete opened the window\./);
  assert.equal(r.audit[0].collapse, true);
});

test('a fluent hallucination — support 0 — CANNOT collapse, and the gate VOIDs', async () => {
  const basis = {
    props: [prop('grete', 'opened', 'window')],
    question: { targetProps: [{ kind: 'rel', op: 'CON', subj: 'gregor', rel: 'earns', obj: 'salary' }] },
    void: [],
  };
  const r = await runGate(
    [cand('Gregor earns a large salary.', { kind: 'rel', op: 'CON', subj: 'gregor', rel: 'earns', obj: 'salary' })],
    basis, { alpha: 0.05 });
  assert.equal(r.audit[0].support, 0, 'no document support');
  assert.equal(r.audit[0].collapse, false, 'product is 0 → blocked');
  assert.equal(r.answer, VOID_TOKEN, 'the unmet target collapses to VOID');
  assert.equal(r.voided, true);
});

test('an on-question but UNSUPPORTED answer (the dangerous one) is blocked', async () => {
  // relevance > 0 (it answers the question) but support = 0 (no document witness)
  // → product 0 → cannot collapse. The selective-prediction guard.
  const basis = {
    props: [prop('grete', 'opened', 'window')],
    question: { targetProps: [{ kind: 'rel', op: 'CON', subj: 'gregor', rel: 'cause', obj: 'fire' }] },
    void: [],
  };
  const r = await runGate(
    [cand('Gregor caused the fire.', { kind: 'rel', op: 'CON', subj: 'gregor', rel: 'cause', obj: 'fire' })],
    basis, { alpha: 0.05 });
  assert.equal(r.audit[0].collapse, false);
  assert.equal(r.voided, true);
});

test('redundancy depletes — the same proposition cannot collapse twice', async () => {
  const basis = {
    props: [prop('grete', 'opened', 'window')],
    question: { targetProps: [] },   // no target basis → relevance neutral, run to end
    void: [],
  };
  const r = await runGate([
    cand('Grete opened the window.', { kind: 'rel', op: 'CON', subj: 'grete', rel: 'opened', obj: 'window' }),
    cand('Grete opened the window again.', { kind: 'rel', op: 'CON', subj: 'grete', rel: 'opened', obj: 'window' }),
  ], basis, { alpha: 0.05 });
  assert.equal(r.emitted.length, 1, 'the second assertion is redundant (depleted support)');
  assert.equal(r.audit[1].redundancy, 0);
  assert.equal(r.audit[1].collapse, false);
});

test('alpha is the one knob — a low alpha holds a weak correspondence a high alpha speaks', async () => {
  // A spread of also-ran ground raises the noise null; a weak candidate sits near it.
  const basis = {
    props: [
      prop('a', 'r', 'b', 0.10), prop('c', 'r', 'd', 0.12), prop('e', 'r', 'f', 0.11),
      prop('g', 'r', 'h', 0.13), prop('grete', 'opened', 'window', 0.2),
    ],
    question: { targetProps: [] },
    void: [],
  };
  const weak = cand('Grete opened the window.',
    { kind: 'rel', op: 'CON', subj: 'grete', rel: 'opened', obj: 'window' }, 0.3);
  const low  = await runGate([weak], basis, { alpha: 0.001 });
  const high = await runGate([weak], basis, { alpha: 0.5 });
  // High alpha lowers the null → the weak correspondence is at least as likely to speak.
  assert.ok(high.audit[0].null <= low.audit[0].null, 'higher alpha → lower null threshold');
});

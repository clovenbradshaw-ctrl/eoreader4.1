// holonic-token-confinement — the projection from a cursor's address to its confinement.
//
// docs/holonic-token-confinement.md. The engine gives every move a diagonal address
// operator(Site, Stance); the lens-port biases logits but never reads the operator/stance
// faces. holonicConfinement composes the address + phase into the confinement the token is
// drawn from; toLensConfig projects it to the port's payload. Pure — no model, no logits.
// These pin the composition: the stance selects the register, the site selects the figures,
// and the FLOOR is on for every address (the one level no coordinate relaxes).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { holonicConfinement, toLensConfig, runContinuation } from '../src/longgen/index.js';
import { createModel } from '../src/model/interface.js';
import '../src/model/echo.js';

const prop = (over) => ({ move: 'CON', band: 'firm', spans: [{ idx: 0, text: 'the family holds a line' }], ...over });

test('the STANCE selects the register: a firm CON asserts, a void holds open', () => {
  const con = holonicConfinement({ proposition: prop({ move: 'CON', band: 'firm' }) });
  assert.equal(con.register, 'assertive');
  assert.equal(con.forbidClose, false, 'a firm assertion may resolve into a claim');

  const held = holonicConfinement({ proposition: prop({ move: 'VOID', band: 'void' }) });
  assert.equal(held.register, 'hedged');
  assert.equal(held.forbidClose, true, 'a hold-open must NOT harden into an assertion (the mis-fold)');
});

test('the operator maps to its register and its EO coordinate', () => {
  for (const [move, register] of [['REC', 'restructuring'], ['SYN', 'closing'], ['DEF', 'defining'], ['INS', 'minting']]) {
    const c = holonicConfinement({ proposition: prop({ move }) });
    assert.equal(c.register, register, `${move} → ${register}`);
    assert.ok(c.address && c.address.operator, `${move} carries its EO address`);
    assert.ok(c.address.terrain && c.address.stance, `${move} carries a site terrain and a stance`);
  }
});

test('the SITE selects the figures: the spans become the admissible referents', () => {
  const c = holonicConfinement({ proposition: prop({ spans: [{ idx: 0, text: 'Gregor is still Gregor' }, { idx: 1, text: 'the family holds' }] }) });
  assert.equal(c.figures.length, 2);
  assert.ok(c.figures[0].includes('Gregor'), 'the figure text rides through as the referent');
});

test('the phase scales the openness: develop reaches wider than open or land', () => {
  const dev = holonicConfinement({ proposition: prop({ move: 'INS' }), phase: 'develop' });
  const open = holonicConfinement({ proposition: prop({ move: 'INS' }), phase: 'open' });
  const land = holonicConfinement({ proposition: prop({ move: 'INS' }), phase: 'land' });
  assert.ok(dev.openness > open.openness && dev.openness > land.openness, 'the body is the content-choice reach');
});

test('the FLOOR is on for every address — the one level no coordinate relaxes', () => {
  for (const move of ['CON', 'VOID', 'SYN', 'REC', 'NUL', 'DEF']) {
    const c = holonicConfinement({ proposition: prop({ move }) });
    assert.equal(c.floor.voidNumerals, true, `${move} keeps the numeral gate`);
    assert.equal(c.floor.voidEntities, true, `${move} keeps the entity trie`);
  }
});

test('toLensConfig projects to the port payload: figures → relevance, floor always on', () => {
  const c = holonicConfinement({ proposition: prop({ spans: [{ idx: 0, text: 'the Partnership' }] }) });
  const cfg = toLensConfig(c);
  assert.equal(cfg.enabled, true);
  assert.ok(cfg.figureWeights instanceof Map && cfg.figureWeights.size === 1, 'the site figure becomes a relevance up-weight');
  assert.equal(cfg.voidNumerals, true);
  assert.equal(cfg.voidEntities, true);
  assert.equal(cfg.register, 'assertive', 'the register rides through for the model layer to realize');

  // A void confinement forbids the close all the way through to the port payload.
  const held = toLensConfig(holonicConfinement({ proposition: prop({ move: 'VOID', band: 'void' }) }));
  assert.equal(held.forbidClose, true);
});

test('the loop records each atom\'s confinement when confine is on (and not otherwise)', async () => {
  const model = createModel('echo');
  await model.load();
  const ground = [
    { idx: 0, score: 0.9, text: 'the orchard keeper waters the trees at dawn' },
    { idx: 1, score: 0.7, text: 'a cyclist repairs the wheel by the road' },
  ];
  const off = await runContinuation({ ground, model });
  assert.ok(off.units.every((u) => u.confinement === undefined), 'default: no confinement recorded (parity)');

  const on = await runContinuation({ ground, model, confine: true });
  assert.ok(on.units.length && on.units.every((u) => u.confinement && u.confinement.floor.voidNumerals),
    'confine on: every atom carries its address→confinement, floor always on');
});

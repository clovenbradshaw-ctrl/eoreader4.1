import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  STAGE_FACES, PIPELINE_STAGES, stageFace, notateStage, specCensus,
} from '../src/turn/stage-faces.js';
import { coherence } from '../src/core/cube.js';
import { notate } from '../src/core/faces.js';
import { OPERATORS, GRAINS } from '../src/core/operators.js';

// Migration step 1 of docs/spec-good-watchmaker.md — "Print the faces". Each of the
// 17 pipeline stages carries its canonical operator(Site, Stance) spelling beside
// its human label. Two things must hold or the claim is cosmetic: (1) every spelling
// the trace PRINTS lies on the cube's diagonal — the same guard that rules on every
// emitted event — and (2) the spec's §5 spelling is preserved verbatim and judged by
// that guard, so the census of where §5 spelled off-diagonal is honest, not hidden.

// The pipeline order (turn/pipeline.js `PIPELINE`), which is also the spec's §5 order.
const PIPELINE = [
  'route', 'expect', 'converse', 'retrieve', 'inquire', 'fold', 'predict',
  'answerable', 'gate', 'reason', 'prompt', 'llm', 'bind', 'factcheck',
  'revise', 'veto', 'settle',
];

test('every pipeline stage has a face, in pipeline order', () => {
  assert.deepEqual(PIPELINE_STAGES, PIPELINE, 'the face table covers the pipeline, in order');
  for (const name of PIPELINE) assert.ok(stageFace(name), `${name} has a face`);
});

test('every PRINTED cell lies on the cube diagonal — the confabulation guard passes', () => {
  for (const name of PIPELINE_STAGES) {
    for (const c of STAGE_FACES[name].cells) {
      const v = coherence({ op: c.op, terrain: c.terrain, stance: c.stance });
      assert.ok(v.ok, `${name} prints ${c.op}(${c.terrain}, ${c.stance}) which must be coherent: ${v.reason}`);
      // and the operator/grain it was built from is a real operator at a real grain
      assert.ok(c.op in OPERATORS, `${name}: ${c.op} is an operator`);
      assert.ok(GRAINS.includes(c.grain), `${name}: ${c.grain} is a grain`);
    }
  }
});

test('the printed notation is exactly notate(event) for the operator at its grain', () => {
  for (const name of PIPELINE_STAGES) {
    for (const c of STAGE_FACES[name].cells) {
      assert.equal(c.notation, notate({ op: c.op, grain: c.grain }),
        `${name}: the cell notation is the canonical notate() form`);
    }
  }
});

test('the printed spellings are the coherent faces (locked snapshot)', () => {
  const expected = {
    route:      'EVA(Lens, Binding)',
    expect:     'DEF(Atmosphere, Clearing)',
    converse:   'SIG(Void, Tending)',
    retrieve:   'SIG(Void, Tending) → SEG(Field, Clearing)',
    inquire:    'SIG(Void, Tending)',
    fold:       'SEG(Field, Clearing) + NUL(Void, Clearing)',
    predict:    'EVA(Paradigm, Tracing)',
    answerable: 'EVA(Atmosphere, Tending)',
    gate:       'EVA(Lens, Binding)',
    reason:     'SYN(Network, Composing) · CON(Link, Binding) · REC(Paradigm, Composing)',
    prompt:     'SEG(Field, Clearing)',
    llm:        'INS(Entity, Making)',
    bind:       'CON(Link, Binding)',
    factcheck:  'EVA(Lens, Binding)',
    revise:     'REC(Paradigm, Composing)',
    veto:       'EVA(Lens, Binding) → DEF(Lens, Dissecting)',
    settle:     'DEF(Lens, Dissecting)',
  };
  for (const name of PIPELINE_STAGES) {
    assert.equal(notateStage(name), expected[name], `${name} prints its coherent face`);
  }
});

test('the §5 spelling is preserved verbatim, and the guard judges it honestly', () => {
  // The four stages the spec spelled ON the diagonal: printed face == §5 face.
  const coherentStages = PIPELINE_STAGES.filter(n => STAGE_FACES[n].spec.coherent);
  assert.deepEqual(coherentStages, ['reason', 'llm', 'bind', 'revise'],
    'exactly these four §5 spellings are already coherent');
  for (const name of coherentStages) {
    assert.equal(STAGE_FACES[name].notation, STAGE_FACES[name].spec.notation,
      `${name}: a coherent §5 spelling is printed verbatim`);
  }
});

test('the census surfaces every off-diagonal §5 spelling with the guard\'s reason', () => {
  const census = specCensus();
  const stages = census.map(c => c.stage);
  // the 13 stages whose §5 spelling carries at least one off-diagonal cell
  assert.deepEqual(stages, [
    'route', 'expect', 'converse', 'retrieve', 'inquire', 'fold', 'predict',
    'answerable', 'gate', 'prompt', 'factcheck', 'veto', 'settle',
  ], 'the census is exactly the stages the spec spelled off the diagonal');
  // every reported entry actually fails the guard, and names why
  for (const c of census) {
    for (const od of c.offDiagonal) {
      assert.ok(/mismatch/.test(od.reason), `${c.stage}: ${od.spec} → a mismatch reason`);
    }
  }
  // sanity: no coherent stage leaks into the census
  for (const name of ['reason', 'llm', 'bind', 'revise']) {
    assert.ok(!stages.includes(name), `${name} is coherent and not in the census`);
  }
});

test('unknown steps get no spelling — book-keeping steps stay unspelled', () => {
  for (const name of ['error', 'reflect', 'propose-web', 'nonsense']) {
    assert.equal(stageFace(name), null, `${name} is not a cube stage`);
    assert.equal(notateStage(name), null);
  }
});

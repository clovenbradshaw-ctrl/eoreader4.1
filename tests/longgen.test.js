import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  runContinuation, predictDirection, selfMoveLog, resolveProposition, SEED_MOVE,
} from '../src/longgen/index.js';
import { MOVE_ALPHABET } from '../src/predict/movelog.js';
import { createModel } from '../src/model/interface.js';
import '../src/model/echo.js';

// A ground pool of ranked spans — the continuation's supply, the shape the arc's
// bindable spans have (idx, text, score). Echo phrases a section back as its span
// text verbatim, so each grounded unit binds cleanly against its own span.
const groundOf = () => ([
  { idx: 0, score: 0.9, text: 'The orchard keeper waters the apple trees at dawn.' },
  { idx: 1, score: 0.7, text: 'A cyclist repairs the broken wheel beside the road.' },
  { idx: 2, score: 0.5, text: 'The telescope reveals a faint galaxy near the horizon.' },
]);

// ── direction: the self move-log and p(next) ─────────────────────────────────

test('selfMoveLog reads the floor verdict back as strain — drift IS strain (the weld)', () => {
  const log = selfMoveLog([
    { move: 'CON', boundFraction: 1,   sources: [0] },   // bound clean → no strain
    { move: 'CON', boundFraction: 0.1, sources: [0] },   // drifted → high strain
  ]);
  assert.equal(log.moves.length, 2);
  assert.equal(log.frameByCursor[0].ratio, 0, 'a clean unit carries no strain');
  assert.ok(Math.abs(log.frameByCursor[1].ratio - 0.9) < 1e-9, 'strain = 1 − boundFraction');
});

test('predictDirection seeds on empty history and draws a real move otherwise', () => {
  const seed = predictDirection([]);
  assert.equal(seed.seeded, true);
  assert.equal(seed.move, SEED_MOVE);

  const dir = predictDirection([{ move: 'CON', boundFraction: 1, sources: [0] }]);
  assert.equal(dir.seeded, false);
  assert.ok(MOVE_ALPHABET.includes(dir.move), 'the drawn move is in the alphabet');
});

test('the weld fires: a drifted unit pushes the next draw toward restructuring (REC)', () => {
  // Same move sequence, same everything — only the last unit's verdict differs.
  // The drift must raise REC's posterior mass: the engine that starts to
  // confabulate leans toward a break, not calmly onward.
  const clean   = [{ move: 'CON', boundFraction: 1, sources: [0] }, { move: 'EVA', boundFraction: 1,   sources: [0] }];
  const drifted = [{ move: 'CON', boundFraction: 1, sources: [0] }, { move: 'EVA', boundFraction: 0.1, sources: [0] }];

  const recMass = (units) => {
    const post = Object.fromEntries(predictDirection(units).posterior);
    return post.REC;
  };
  assert.ok(recMass(drifted) > recMass(clean),
    'drift raises REC mass — the floor verdict steers the next prediction');
});

// ── resolve: the minimal plan→proposition step ───────────────────────────────

test('resolveProposition picks the most salient uncovered span, then exhausts', () => {
  const ground = groundOf();
  const covered = new Set();

  const p0 = resolveProposition({ move: 'CON', ground, covered });
  assert.equal(p0.spanSet[0], 0, 'highest score first');
  assert.equal(p0.move, 'CON', 'the move-type rides on the proposition');
  assert.ok(p0.ceiling >= p0.floor, 'a real budget, ceiling above floor');

  covered.add(0); covered.add(1); covered.add(2);
  assert.equal(resolveProposition({ move: 'CON', ground, covered }), null, 'spent ground → no proposition');
});

// ── the loop: emergent length, monotone coverage, honest stop ────────────────

test('runContinuation generates a grounded multi-unit answer and stops on its own', async () => {
  const model = createModel('echo');
  await model.load();

  const res = await runContinuation({ ground: groundOf(), model });

  assert.ok(res.units.length >= 1, 'it produced grounded units');
  assert.ok(res.units.length <= 3, 'never more units than ground — coverage is monotone');
  assert.ok(res.answer.length > 0, 'the assembled answer is non-empty');
  assert.equal(res.stop, 'ground-exhausted', 'it stopped at saturation, not a token count');
  assert.ok(res.units.every(u => u.sources.length >= 1), 'every appended unit earns a citation');
});

test('runContinuation resumes from state across messages — N then M equals N+M', async () => {
  const model = createModel('echo');
  await model.load();

  // One shot.
  const whole = await runContinuation({ ground: groundOf(), model });

  // Two shots: two steps, then resume from the returned state for the rest.
  const first = await runContinuation({ ground: groundOf(), model, maxSteps: 2 });
  const rest  = await runContinuation({ ground: groundOf(), model, state: first.state });

  assert.deepEqual(
    rest.units.map(u => u.text),
    whole.units.map(u => u.text),
    'resuming from state yields the same units as one continuous run',
  );
});

test('runContinuation honours an already-aborted signal without generating', async () => {
  const model = createModel('echo');
  await model.load();
  const ac = new AbortController(); ac.abort();

  const res = await runContinuation({ ground: groundOf(), model, signal: ac.signal });
  assert.equal(res.units.length, 0);
  assert.equal(res.stop, 'aborted');
});

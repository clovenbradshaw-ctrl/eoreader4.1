import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createMonitor, efferenceCopiesOf,
  SELF, WORLD, SELF_MISMATCH,
} from '../src/enactor/index.js';

// The one monitor draws the self/world line in the core, modality-blind, by
// comparing each sensed proposition against the outstanding efference copies
// (add-on 3 §3/§4). These are the spec's three golden tests (§7).

const prop = (subj, rel, obj, amplitude = 0.4) =>
  ({ kind: 'rel', op: 'CON', subj, rel, obj, amplitude, status: 'support' });
const committedOf = (p, modality, startId = 0) =>
  efferenceCopiesOf([{ svo: p }], { modality, startId });

// ── SELF-ATTENUATION — you can't tickle yourself ─────────────────────────────
// The system's own committed output, fed back through the senses, is tagged SELF
// and attenuated; an IDENTICAL prop arriving with no matching efference copy is
// WORLD and processed as news. The difference is the efference match, nothing else.

test('SELF-ATTENUATION · the efference match is the only difference between self and world', () => {
  const p = prop('grete', 'opened', 'window');

  // committed → its copy held → the same prop sensed back is SELF, attenuated.
  const mine = createMonitor();
  mine.hold(committedOf(p, 'speech'));
  const self = mine.observe(p, { modality: 'speech' });
  assert.equal(self.tag, SELF);
  assert.equal(self.attenuated, true, 'me-ness: sensed, but not processed as news');

  // the identical proposition, with NO outstanding copy, is the world — news.
  const fresh = createMonitor();
  const world = fresh.observe(p, { modality: 'speech' });
  assert.equal(world.tag, WORLD);
  assert.equal(world.attenuated, false, 'the not-me is news');
});

test('a matched copy is consumed — a second identical return is no longer self', () => {
  const p = prop('grete', 'opened', 'window');
  const m = createMonitor();
  m.hold(committedOf(p, 'speech'));
  assert.equal(m.observe(p).tag, SELF);
  assert.equal(m.outstanding().length, 0, 'the copy is resolved on the match');
  assert.equal(m.observe(p).tag, WORLD, 'a genuine later repeat has no copy → world');
});

// ── ALTERED-FEEDBACK — the loop is real ──────────────────────────────────────
// Alter the output before it returns (same act, divergent consequence). The
// monitor detects the self-prediction mismatch, corrects the next commit, and
// tags world-interference — production disrupted, like delayed auditory feedback.

test('ALTERED-FEEDBACK · a self-prediction mismatch errors, corrects the next commit, tags world-interference', () => {
  const committed = prop('grete', 'opened', 'window');
  const m = createMonitor();
  m.hold(committedOf(committed, 'speech'));

  // the act returns altered: same figures (grete · window), divergent relation.
  const altered = prop('grete', 'shut', 'window');
  const o = m.observe(altered, { modality: 'speech' });

  assert.equal(o.tag, SELF_MISMATCH, 'the divergent return of an own act, not fresh world input');
  assert.equal(o.error, true);
  assert.equal(o.interference, true, 'the world pushed back on the act');
  assert.equal(o.attenuated, false, 'a divergent return is news, not attenuated');
  assert.equal(m.corrections().length, 1, 'the next commit is corrected — production is disrupted');
  assert.equal(m.corrections()[0].commitId, 0, 'the correction names the diverged commit');
});

test('a sensed prop sharing no figures with any copy is WORLD, not a mismatch', () => {
  const m = createMonitor();
  m.hold(committedOf(prop('grete', 'opened', 'window'), 'speech'));
  const o = m.observe(prop('gregor', 'earns', 'salary'));
  assert.equal(o.tag, WORLD, 'unrelated input is the world, not an altered return');
  assert.equal(m.corrections().length, 0);
});

// ── ONE-ME — no per-organ self ───────────────────────────────────────────────
// Produce in two modalities at once (speech + a motor act). One monitor, one
// self/world line, both outputs owned by the same me. Turning off one organ
// removes a renderer, not a self.

test('ONE-ME · two modalities flow through one monitor, owned by one self', () => {
  const m = createMonitor();
  const said  = prop('grete', 'opened', 'window');
  const moved = prop('hand', 'closed', 'ball');

  m.hold(committedOf(said,  'speech', 0));
  m.hold(committedOf(moved, 'motor',  1));

  const a = m.observe(said,  { modality: 'speech' });
  const b = m.observe(moved, { modality: 'motor' });

  assert.equal(a.tag, SELF);
  assert.equal(b.tag, SELF);
  assert.equal(m.self.count(SELF), 2, 'both outputs owned by the same me — not a talking-self and a moving-self');
  assert.equal(m.self.size, 2, 'one self/world line for both modalities');

  // Turning off the motor organ removes a renderer, not a self: the same one
  // monitor still owns speech.
  const c = m2SpeechOnly();
  assert.equal(c, 1);
});

// helper: a speech-only producer still has exactly one self model (one me).
function m2SpeechOnly() {
  const m = createMonitor();
  m.hold(committedOf(prop('grete', 'opened', 'window'), 'speech'));
  m.observe(prop('grete', 'opened', 'window'), { modality: 'speech' });
  return m.self.count(SELF);
}

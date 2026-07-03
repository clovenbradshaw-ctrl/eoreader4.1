import { test } from 'node:test';
import assert from 'node:assert/strict';

import { composeEssay } from '../src/organs/out/essay.js';

// The stall the screenshot caught: "The essay could not complete: the chat model stalled",
// with nothing streamed. The no-progress stall guard is fed by onToken on the streamed
// section passes — but two decodes stream nowhere: the OUTLINE decode (runs first, before
// onPlan) and the corrective REGEN (its tokens are replaced on finalize, never painted).
// Either one, slow but live, crossed the deadline with zero hook activity and tripped.
// The fix hands the plan call an onToken → hooks.onPlanToken and the regen an
// onToken → hooks.onPulse — liveness-only feeds. These tests hold both there.

test('the outline decode carries a heartbeat (onPlanToken) before onPlan', async () => {
  let firstOpts = null, calls = 0, beats = 0, planned = false;

  // A fake talker: the FIRST call is the plan — stream a token through whatever onToken it
  // was given, then return a minimal arc. Every later (section) call throws; composeEssay
  // absorbs section errors as dead passes and its own dead-talker floor (DEAD_STOP) ends the
  // walk after a handful of calls — the walk RESOLVES, nothing propagates. The test asserts
  // only the pre-onPlan heartbeat, plus a call bound so a future retry change that weakens
  // the dead-talker stop fails loudly here instead of hanging.
  const talker = async (_messages, opts = {}) => {
    calls += 1;
    if (calls > 25) throw new Error('unbounded-walk');
    if (calls === 1) {
      firstOpts = opts;
      if (typeof opts.onToken === 'function') opts.onToken('•');
      return 'Title: The Case\n- one point\nConclusion: the close';
    }
    throw new Error('halt-after-plan');
  };

  await composeEssay({
    topic: 'dolphins',
    talker,
    hooks: {
      onPlanToken: () => { beats += 1; },   // the feed the stall guard rides in the app
      onPlan: () => { planned = true; },
    },
  });

  assert.ok(calls <= 25, 'the dead-talker floor bounded the walk');
  assert.equal(typeof firstOpts?.onToken, 'function',
    'the plan/outline decode must be given an onToken — the heartbeat that was missing');
  assert.ok(beats >= 1,
    'a streamed outline token must reach hooks.onPlanToken so a no-progress guard stays armed before onPlan');
  assert.ok(planned,
    'onPlan still fires once the plan resolves (the fix adds a heartbeat, it does not change the plan contract)');
});

test('the corrective regen decode carries a heartbeat (onPulse) — the other unstreamed decode', async () => {
  let calls = 0, pulses = 0, streamed = 0;
  const opts_ = [];

  // Call 1 is the plan. Call 2 is the opening section's first pass (streamed) — return it
  // deliberately too thin (< MIN_SECTION_WORDS) so composeSection issues the corrective
  // regen. Call 3 is that regen (stream=false): before the fix its opts.onToken was
  // undefined — a slow-but-live regen fed nothing and tripped the guard mid-essay. Every
  // later call throws; the dead-talker floor ends the walk.
  const talker = async (_messages, opts = {}) => {
    calls += 1;
    if (calls > 25) throw new Error('unbounded-walk');
    opts_[calls] = opts;
    if (calls === 1) return 'Title: The Case\n- one point\nConclusion: the close';
    if (calls === 2 || calls === 3) {
      if (typeof opts.onToken === 'function') opts.onToken('•');
      return 'Too thin.';
    }
    throw new Error('halt');
  };

  await composeEssay({
    topic: 'dolphins',
    talker,
    hooks: {
      onToken: () => { streamed += 1; },    // the painted stream (first pass only)
      onPulse: () => { pulses += 1; },      // the liveness-only feed for unstreamed decodes
    },
  });

  assert.ok(calls >= 3, 'the thin first pass provoked the corrective regen');
  assert.equal(typeof opts_[3]?.onToken, 'function',
    'the regen decode must be given an onToken — the heartbeat the first fix missed');
  assert.ok(pulses >= 1,
    'a regen token must reach hooks.onPulse so a no-progress guard stays armed through the second pass');
  assert.ok(streamed >= 1, 'the first pass still streams to the surface through hooks.onToken');
});

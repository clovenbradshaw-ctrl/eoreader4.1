import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseText } from '../src/perceiver/parse/index.js';
import { surfFold, threadBasis, trajectory, speakTrajectory } from '../src/surfer/index.js';

// A trajectory is the arc of ONE identity's relations across a sequence, segmented at the
// frame-breaks (the surf's RECs), with the change read off as an end-to-end delta. It reads
// only operator events — identity · relation · order · turn — never words, so the same
// synthesis works for a story, a video track, an audio motif, or a sensor regime.

test('trajectory segments a narrative arc at the turns (Metamorphosis: Grete)', () => {
  const doc = parseText(readFileSync('data/metamorphosis.txt', 'utf8'), { docId: 'm', genderCoref: true });
  const surf = surfFold(doc, 11, { reach: 'adaptive', thread: threadBasis({ query: "How does Grete's feeling toward Gregor change?", doc }) });
  const traj = trajectory(doc, { focus: 'Grete', segments: surf.recCursors });

  assert.ok(traj.phases.length >= 2, 'the arc is segmented into phases at the turns');
  // the care phase holds "fed"; a later phase holds the rejection ("turned"/"declared") — the
  // arc moved from one to the other, which is the whole answer to "how does she change".
  const fedPhase = traj.phases.find(ph => ph.relations.some(b => b.via === 'fed'));
  const turnPhase = traj.phases.find(ph => ph.relations.some(b => /turned|declared/.test(b.via)));
  assert.ok(fedPhase, 'an early phase has Grete feeding Gregor');
  assert.ok(turnPhase, 'a later phase has Grete turning on / declaring against him');
  assert.ok(turnPhase.phase > fedPhase.phase, 'and the rejection comes after the care — the arc has a direction');
  assert.equal(typeof speakTrajectory(traj), 'string');
});

test('the SAME function reads a non-linguistic event log — omnimodal by construction', () => {
  // A synthetic operator log with no language anywhere: three "channels" and their couplings
  // over time, with a change-point at order 2. This is what a sensor/timeseries front-end would
  // emit. trajectory reads it identically — identity (channelX), relations (couplings), order
  // (sentIdx), turn (the change-point) — and reports the regime shift.
  const sensorDoc = {
    log: { snapshot: () => [
      { op: 'INS', id: 1, label: 'channelX' },
      { op: 'INS', id: 2, label: 'channelY' },
      { op: 'INS', id: 3, label: 'channelZ' },
      { op: 'CON', src: 1, tgt: 2, via: 'coupled', sentIdx: 0 },
      { op: 'CON', src: 1, tgt: 2, via: 'rising', sentIdx: 1 },
      { op: 'CON', src: 1, tgt: 3, via: 'coupled', sentIdx: 2 },   // after the change-point
      { op: 'CON', src: 1, tgt: 2, via: 'decoupled', sentIdx: 3 },
    ] },
  };
  const traj = trajectory(sensorDoc, { focus: 'channelX', segments: [2] });   // change-point at order 2

  assert.equal(traj.focus, 'channelX');
  assert.equal(traj.phases.length, 2, 'two regimes, split at the change-point');
  // the regime shift: it gains a coupling to Z and a decoupling from Y; it loses the rising
  // coupling to Y it had before. The "what changed" of a sensor stream, same code as the story.
  const gained = new Set(traj.gained.map(b => `${b.via} ${b.other}`));
  assert.ok(gained.has('coupled channelZ'), 'the new regime couples to channelZ');
  assert.ok(gained.has('decoupled channelY'), 'and decouples from channelY');
  const lost = new Set(traj.lost.map(b => `${b.via} ${b.other}`));
  assert.ok(lost.has('rising channelY'), 'the old regime — rising coupling to channelY — is gone');
});

test('tracking the whole graph (no focus) — every bond, still segmented at the turns', () => {
  const doc = parseText('Anna saw Ben. Anna trusted Ben. Anna left Ben.', { docId: 'g' });
  const traj = trajectory(doc, { focus: null, segments: [2] });
  assert.equal(traj.focus, null);
  assert.ok(traj.phases.length >= 1, 'the whole-graph arc still segments');
});

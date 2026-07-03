import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createEnactedLoop, replayFrames, loopStats, sameTerms,
  isEnacted, isDepicted, assertSingleRegister, enactedReadingTo,
  DEFAULT_THRESHOLDS,
} from '../src/enact/index.js';
import { parseText } from '../src/perceiver/parse/index.js';

// A deterministic stand-in for the cheap γ-mass surprise: a fixed surprise per
// cursor and an optional terms function. Under test the loop is pure on this.
const fromArray = (arr, termsAt = () => []) =>
  (c) => ({ surprise: arr[c] ?? 0, terms: termsAt(c) });
const ops = (events, op) => events.filter(e => e.op === op);

// §3 — the opening cannot be surprising; it establishes a frame, nothing to test.
test('the opening establishes a frame at every layer — DEF, no EVA, no strain', () => {
  const loop = createEnactedLoop({ read: fromArray([0]) });
  loop.step(0);
  const defs = ops(loop.events, 'DEF');
  assert.equal(defs.length, 2, 'one DEF per layer');
  assert.deepEqual(defs.map(d => d.layer), ['proposition', 'document']);
  assert.ok(defs.every(d => d.producedBy === 'initial'), 'the opening frames are initial');
  assert.equal(ops(loop.events, 'EVA').length, 0, 'nothing to test against yet');
  assert.equal(loop.strainAt('proposition'), 0, 'no strain at the opening');
});

// §6 — a confirming EVA holds the frame; a straining EVA accumulates.
test('confirming EVA holds the frame; straining EVA accumulates', () => {
  const loop = createEnactedLoop({ read: fromArray([0, 0.1, 0.9]) });
  loop.runTo(2);
  const propEvas = ops(loop.events, 'EVA').filter(e => e.frameLayer === 'proposition');
  assert.equal(propEvas[0].verdict, 'confirm', '0.1 < band → confirm');
  assert.equal(propEvas[0].strainDelta, 0, 'a confirming EVA adds no strain');
  assert.equal(propEvas[1].verdict, 'strain', '0.9 > band → strain');
  assert.ok(propEvas[1].strainDelta > 0, 'a straining EVA accumulates');
});

// §3, §6 — a frame breaks two ways: a sustained GRIND (accumulation, Leibniz) or a
// single overwhelming SHOCK (impulse, Newton). A moderate one-off does neither.
test('REC fires on a grind OR a shock — but not on a moderate one-off', () => {
  // a single MODERATE anomaly (above band, below impulse): neither accumulates
  // enough nor shocks — the frame holds.
  const mild = createEnactedLoop({ read: fromArray([0, 0.5]) });
  mild.runTo(1);
  assert.equal(ops(mild.events, 'REC').length, 0, 'a moderate one-off does not restructure');

  // a single OVERWHELMING anomaly: breaks on impact, no accumulation needed (Newton).
  const shock = createEnactedLoop({ read: fromArray([0, 0.99]) });
  shock.runTo(1);
  const shockRecs = ops(shock.events, 'REC').filter(r => r.layer === 'proposition');
  assert.ok(shockRecs.length >= 1, 'a single overwhelming anomaly breaks the frame on impact');
  assert.equal(shockRecs[0].trigger, 'impulse', 'and it is tagged an impulse, not accumulation');

  // a sustained GRIND of moderate anomalies: the leaky running sum breaks it (Leibniz).
  const grind = createEnactedLoop({ read: fromArray([0, 0.9, 0.9, 0.9, 0.9]) });
  grind.runTo(4);
  const recs = ops(grind.events, 'REC').filter(r => r.layer === 'proposition');
  assert.ok(recs.length >= 1, 'the running sum eventually breaks the frame');
  assert.equal(recs[0].trigger, 'accumulation', 'by accumulation, not a single shock');
  assert.ok(recs[0].strainSum >= DEFAULT_THRESHOLDS.proposition, 'REC carries the strain sum at firing');
  assert.ok(recs[0].forcedBy.length >= 2, 'REC references the EVAs that forced it');
});

// §3/§6 — IMPULSE on the reader's OWN scale, BOTH directions on the live signal. A
// fixed 0.95 is an off switch on a COMPRESSED surprise scale: it passes a synthetic
// 0.96 yet never fires on real text, where surprise clusters far below 1. The causal
// impulse is a high quantile of PAST surprise, so a genuine relative shock fires it
// and routine does not — the firing-on-signal-not-on-noise discipline, on the scale
// the reader actually sees rather than a number it never reaches.
test('impulse fires on a relative shock at the live scale, stays quiet on routine', () => {
  // a long COMPRESSED cluster (every value ≤ 0.20, its peak reached early), then a
  // single genuine shock FOR THIS reader (0.6) — still well below the fixed 0.95 gate.
  const cluster = Array.from({ length: 24 }, (_, i) => (i === 0 ? 0 : 0.05 + 0.05 * ((i * 3) % 4)));
  const withShock = [...cluster, 0.6];
  const idx = withShock.length - 1;
  const impulses = (loop) => ops(loop.events, 'REC').filter(r => r.trigger === 'impulse');

  // FIXED gate (non-causal): 0.6 < 0.95, so the shock is invisible — no impulse ever.
  const fixed = createEnactedLoop({ read: fromArray(withShock) });
  fixed.runTo(idx);
  assert.equal(impulses(fixed).length, 0,
    'a fixed 0.95 gate never sees a shock on a compressed scale — the off switch in disguise');

  // CAUSAL gate: the impulse is fit to the cluster, which 0.6 clears decisively.
  const causal = createEnactedLoop({ read: fromArray(withShock), calibrate: { mode: 'causal' } });
  causal.runTo(idx);
  const fired = impulses(causal);
  assert.ok(fired.length >= 1, 'the causal impulse fires on a shock that is large FOR THIS reader');
  assert.ok(fired.every(r => r.cursor === idx), 'and only on the shock, never on the routine cluster');

  // the QUIET direction: the same compressed cluster with NO shock fires no impulse.
  const routine = createEnactedLoop({ read: fromArray(cluster), calibrate: { mode: 'causal' } });
  routine.runTo(cluster.length - 1);
  assert.equal(impulses(routine).length, 0,
    'routine at the same scale shocks nothing — the gate fires on signal, not on the scale itself');
});

// THE LEAK — strain is a leaky integral, so a frame breaks on a CLUSTER of anomaly
// (a crisis), not on a lifetime total. The same number of anomalies, clustered vs
// spread, are opposite events: the cluster breaks the frame; the spread leaks away.
test('the leak — a cluster breaks the frame; the same anomalies spread out do not', () => {
  // three consecutive shocks — they accumulate faster than they leak → REC.
  const cluster = createEnactedLoop({ read: fromArray([0, 0.9, 0.9, 0.9]) });
  cluster.runTo(3);
  assert.ok(ops(cluster.events, 'REC').some(r => r.layer === 'proposition'),
    'a burst of anomaly breaks the frame');

  // three shocks of identical size, spaced six confirming clauses apart — each leaks
  // most of the way to zero before the next lands → the frame absorbs them all.
  const spaced = [0, 0.9, 0, 0, 0, 0, 0, 0.9, 0, 0, 0, 0, 0, 0.9];
  const grind = createEnactedLoop({ read: fromArray(spaced) });
  grind.runTo(spaced.length - 1);
  assert.equal(ops(grind.events, 'REC').filter(r => r.layer === 'proposition').length, 0,
    'the same anomalies, spread out, never break the frame — document length stops setting the break');

  // and with no leak (λ=1) the spread DOES break it — proving the leak is the cause.
  const undamped = createEnactedLoop({ read: fromArray(spaced), strainLeak: 1 });
  undamped.runTo(spaced.length - 1);
  assert.ok(ops(undamped.events, 'REC').some(r => r.layer === 'proposition'),
    'without the leak the lifetime sum breaks it — the leak is what makes it a crisis detector');
});

// §11 — hysteresis: a refractory period after a REC prevents the limit-cycle the
// thrash detector could only report. A sustained shock breaks the frame once, then
// is held — not a REC on every step.
test('hysteresis — a refractory period stops a just-broken frame re-breaking every step', () => {
  const seq = [0, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99];   // an unrelenting shock
  const guarded = createEnactedLoop({ read: fromArray(seq) });        // default refractory
  guarded.runTo(seq.length - 1);
  const guardedRecs = ops(guarded.events, 'REC').filter(r => r.layer === 'proposition').length;

  const unguarded = createEnactedLoop({ read: fromArray(seq), refractoryPeriod: 0 });
  unguarded.runTo(seq.length - 1);
  const unguardedRecs = ops(unguarded.events, 'REC').filter(r => r.layer === 'proposition').length;

  assert.ok(unguardedRecs > guardedRecs, 'without a refractory the frame re-breaks far more often');
  assert.ok(guardedRecs < seq.length - 1, 'with it, a sustained shock does not restructure every step');
});

// §4 — vector strain: a REC restructures along the AXIS that strained, not whatever
// figure happened to be in view at the break. Surprise is split across dimensions by
// their per-figure KL contribution (the `contrib` the real reader supplies as bayesBy).
test('vector strain — a REC restructures along the straining axis, not what is in view', () => {
  // every line shows A and B, but the surprise is driven by B's share of the KL.
  const read = (c) => c === 0
    ? { surprise: 0, terms: ['A'] }
    : { surprise: 0.9, terms: ['A', 'B'], contrib: { A: 0.02, B: 1.0 } };
  const loop = createEnactedLoop({ read });
  loop.runTo(6);
  const rec = ops(loop.events, 'REC').find(r => r.layer === 'proposition');
  assert.ok(rec, 'the frame breaks under sustained strain');
  assert.equal(rec.alongAxis[0], 'B', 'the REC names B as the straining axis (its cause)');
  const installed = loop.events.find(e => e.op === 'DEF' && e.producedBy?.rec === rec.seq);
  assert.equal(installed.frame.terms[0], 'B', 'and restructures along B, not the merely-in-view A');
});

// §4, §11 — the higher layer holds harder: document RECs are rarer.
test('the higher layer holds harder — document RECs are rarer than proposition', () => {
  const surprises = Array.from({ length: 30 }, (_, i) => (i === 0 ? 0 : 0.9));
  const loop = createEnactedLoop({ read: fromArray(surprises) });
  loop.runTo(29);
  const st = loopStats(loop.events);
  assert.ok(st.proposition.recs > st.document.recs, 'the document frame absorbs more before it breaks');
  assert.ok(st.document.recs >= 1, 'but it does break under sustained cross-layer strain');
});

// §4, §7 — the cross-layer EVA: a proposition particular bears on the document
// frame, and only the document layer restructures the document frame.
test('cross-layer EVA — the proposition particular strains the document frame', () => {
  const surprises = Array.from({ length: 12 }, (_, i) => (i === 0 ? 0 : 0.9));
  const loop = createEnactedLoop({ read: fromArray(surprises) });
  loop.runTo(11);
  const crossEvas = ops(loop.events, 'EVA').filter(e => e.cross);
  assert.ok(crossEvas.length > 0, 'there are cross-layer EVAs');
  assert.ok(crossEvas.every(e => e.frameLayer === 'document' && e.testLayer === 'proposition'),
    'a lower particular bears on the higher frame');
  const docRecs = ops(loop.events, 'REC').filter(r => r.layer === 'document');
  assert.ok(docRecs.length >= 1 && docRecs.every(r => r.target === 'document'),
    'only the higher layer restructures the higher frame');
});

// §5, §10 — the arrow of time: forward only, never a future frame.
test('the arrow of time — forward only, never a future frame', () => {
  const loop = createEnactedLoop({ read: fromArray([0, 0.3, 0.3]) });
  loop.step(0); loop.step(2);
  assert.throws(() => loop.step(1), /forward only/, 'cannot step backward into a settled frame');
  for (const e of ops(loop.events, 'EVA')) {
    assert.ok(e.frameCursor <= e.cursor, 'an EVA never tests a frame from the future');
  }
});

// §5 — causal scale: the band that judges a line is an EWMA of PAST surprises only,
// so a later spike cannot reach back through the calibrator and change an earlier
// verdict (what a whole-reading median would do).
test('causal calibration — the future cannot change a past verdict', () => {
  const base      = [0, 0.3, 0.3, 0.3, 0.3];
  const withSpike = [0, 0.3, 0.3, 0.3, 0.3, 0.99, 0.99, 0.99];   // identical to cursor 4, then a shock
  const a = createEnactedLoop({ read: fromArray(base),      calibrate: { mode: 'causal' } });
  const b = createEnactedLoop({ read: fromArray(withSpike), calibrate: { mode: 'causal' } });
  a.runTo(4);
  b.runTo(4);                                                    // stop before the spike
  const evas = (loop) => ops(loop.events, 'EVA').filter(e => e.cursor <= 4)
    .map(e => [e.cursor, e.frameLayer, e.verdict, e.strainDelta]);
  assert.deepEqual(evas(a), evas(b),
    'the EVAs through cursor 4 are identical — the later spike cannot reach back');
});

// §8, §10 — the log is in generation order; the order is constitutive.
test('the log is in generation order — seqs dense, cursors non-decreasing', () => {
  const loop = createEnactedLoop({ read: fromArray([0, 0.9, 0.9, 0.9, 0.9]) });
  loop.runTo(4);
  loop.events.forEach((e, i) => assert.equal(e.seq, i, 'seq is the generation index'));
  let prev = -Infinity;
  for (const e of loop.events) { assert.ok(e.cursor >= prev, 'cursors never go backward'); prev = e.cursor; }
});

// §5, §7 — the fold replays to a cursor; the same frame at two ages is two readings.
test('the fold replays to a cursor — the same frame at two ages is two readings', () => {
  const loop = createEnactedLoop({
    read: fromArray(
      [0, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9],
      (c) => (c < 3 ? ['early'] : ['late']),
    ),
  });
  loop.runTo(6);
  const firstRec = loopStats(loop.events).proposition.cursors[0];
  const young = replayFrames(loop.events, firstRec - 1).frames.get('proposition');
  const old   = replayFrames(loop.events, 6).frames.get('proposition');
  assert.ok(young.cursor < old.cursor, 'folded earlier, the frame is younger');
  assert.ok(!sameTerms(young.terms, old.terms), 'and it stands on different terms');
  assert.equal(replayFrames(loop.events, 0).recs.length, 0, 'at the opening no REC has fired');
  assert.ok(replayFrames(loop.events, 6).recs.length >= 1, 'by the end the loop has restructured');
});

// §2, §10 — the two loops are separated; a depicted REC is not an enacted REC.
test('the two loops are separated — register firewall, depicted REC ≠ enacted REC', () => {
  const loop = createEnactedLoop({ read: fromArray([0, 0.9, 0.9, 0.9]) });
  loop.runTo(3);
  assert.ok(loop.events.every(isEnacted), 'every enacted event is tagged enacted');
  assert.ok(loop.events.every(e => !isDepicted(e)), 'none is a phasepost perception');
  assert.ok(assertSingleRegister(loop.events), 'the enacted log is single-register');
  const depicted = { kind: 'phasepost', pattern: { op: 'REC' } };
  assert.throws(() => assertSingleRegister([...loop.events, depicted]),
    /register mix/, 'a depicted perception cannot enter the enacted chain');

  // A reading whose particulars all confirm never RECs — even if the content it
  // reads depicts a paradigm shift. The enacted loop has no phasepost input.
  const quiet = createEnactedLoop({ read: fromArray([0, 0.1, 0.05, 0.1, 0.0]) });
  quiet.runTo(4);
  assert.equal(ops(quiet.events, 'REC').length, 0,
    'a story about a revolution does not force the reading to restructure');
});

// §8 — the event shapes carry their fields; §9 — the RULES_LEDGER borrow.
test('the event shapes carry the §8 fields and the RULES_LEDGER shape', () => {
  const loop = createEnactedLoop({ read: fromArray([0, 0.9, 0.9, 0.9]) });
  loop.runTo(3);
  const def = loop.events.find(e => e.op === 'DEF');
  assert.ok(def.frame?.terms && def.frame.threshold != null && def.layer && def.cursor != null);
  assert.ok('producedBy' in def, 'a DEF carries what produced it');
  const eva = loop.events.find(e => e.op === 'EVA');
  assert.ok(eva.particular != null && eva.frameLayer && eva.frameCursor != null);
  assert.ok(['confirm', 'strain'].includes(eva.verdict) && typeof eva.surprise === 'number');
  const rec = loop.events.find(e => e.op === 'REC');
  assert.ok(rec.from && typeof rec.strainSum === 'number' && Array.isArray(rec.forcedBy));
  assert.equal(rec.target, 'proposition', 'RULES_LEDGER target (§9)');
  assert.equal(rec.action, 'restructure', 'RULES_LEDGER action (§9)');

  const lines = loop.exportJSONL().split('\n').map(s => JSON.parse(s));
  assert.equal(lines.length, loop.events.length, 'one JSONL line per event');
  assert.ok(lines.find(l => l.op === 'REC').strainSum != null, 'the ledger exports the strain sum');
});

// §11 — convergence reporting: genuine oscillation is a thrash; a rich arc that
// revisits a recurring cast once is NOT (the false alarm a single A→B→A would
// raise, measured against the worked corpus and fixed here).
test('loopStats flags genuine oscillation as thrash, not a rich arc', () => {
  // Build a layer's install sequence (initial DEF, then a REC+DEF per term-set).
  const installs = (...termSets) => termSets.flatMap((terms, i) => [
    ...(i ? [{ op: 'REC', layer: 'l', cursor: i * 3 }] : []),
    { op: 'DEF', layer: 'l', cursor: i * 3, producedBy: i ? { rec: 1 } : 'initial', frame: { terms } },
  ]);

  // A → B → A → B: the frame flips back repeatedly, exploring only two frames.
  assert.equal(loopStats(installs(['A'], ['B'], ['A'], ['B'])).l.thrash, true, 'genuine oscillation');
  // A → B → C → D → E: a settling/wandering reading, every frame distinct.
  assert.equal(loopStats(installs(['A'], ['B'], ['C'], ['D'], ['E'])).l.thrash, false, 'a rich arc');
  // A → B → C → A → D: a recurring cast touched once over a long arc — not thrash
  // (this is exactly what the old single-A→B→A detector mislabelled).
  assert.equal(loopStats(installs(['A'], ['B'], ['C'], ['A'], ['D'])).l.thrash, false, 'one recurrence is not thrash');
});

// The live wiring: the skeleton runs over a real document on the cheap surprise.
test('enactedReadingTo runs the skeleton over a real document on the cheap surprise', () => {
  const STORY = 'Grete Vale entered. Grete sat. Grete read. Gregor Pike arrived. ' +
                'Gregor coughed. Gregor waited. Otto Stein knocked. Otto left.';
  const doc = parseText(STORY, { docId: 'e' });
  const end = (doc.units || doc.sentences).length - 1;
  const r = enactedReadingTo(doc, end);
  assert.ok(r.frames.get('proposition') && r.frames.get('document'), 'frames at both layers');
  assert.ok(r.stats.proposition, 'stats per layer');
  assert.ok(Array.isArray(r.events) && r.events.every(isEnacted), 'a single-register enacted log');
  const open = enactedReadingTo(doc, 0);
  assert.ok(open.recs.length <= r.recs.length, 'the reading at the opening is younger than at the end');
});

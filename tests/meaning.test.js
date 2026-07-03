import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMeaningRead, enactedReadingMeaning, enactedReadingTo, isEnacted,
} from '../src/enact/index.js';
import { parseText } from '../src/perceiver/parse/index.js';

// A deterministic stand-in for MiniLM: each clause embeds to a fixed vector by
// keyword, so meaning-distance is controllable under test. Proves the mechanism
// without the model (which the sandbox can't fetch); the real organ slots in
// unchanged, since the embedder is injected.
const stub = (vecOf) => ({ id: 'stub-mini', measuresMeaning: true, embed: async (t) => vecOf(t) });
const sea = (t) => /ship|harbor|burn|sail|sank/i.test(t);     // the "other sense"

// A GRADED stand-in: each clause embeds to a unit vector at a controlled ANGLE, so the
// meaning surprise (1 − cos vs the γ-decayed prior) is COMPRESSED like real MiniLM — a
// tight cluster, a faint drift, and the odd genuine turn — not the binary 0/1 the
// orthogonal stub gives. This is what lets a test exercise the impulse and the band on
// the scale the live reader actually sees, rather than on a synthetic max-surprise.
const graded = () => {
  const angle = (t) => /arriv|shout|crisis|burn|turn/i.test(t) ? 1.0        // a genuine sense-turn
                     : /walk|stroll|drift|wander/i.test(t)     ? 0.25       // a faint drift
                     : 0.0;                                                 // routine
  const vecOf = (t) => { const th = angle(t); return new Float32Array([Math.cos(th), Math.sin(th)]); };
  return { id: 'graded-mini', measuresMeaning: true, embed: async (t) => vecOf(t) };
};
const ops = (events, op) => events.filter(e => e.op === op);

// §11 — the surprise is the prediction error in meaning space.
test('meaning surprise: the opening is calm, a semantic turn spikes it', async () => {
  const vecOf = (t) => (sea(t) ? new Float32Array([0, 1]) : new Float32Array([1, 0]));
  const doc = { sentences: ['Cat sat.', 'Cat purred.', 'Cat slept.', 'A ship sailed.', 'The ship sank.'] };
  const mr = await buildMeaningRead(doc, stub(vecOf));
  assert.equal(mr.surprise[0], 0, 'the opening cannot surprise (no prior)');
  assert.ok(mr.surprise[2] < 0.1, 'continuing the sense is near-zero surprise');
  assert.ok(mr.surprise[3] > 0.9, 'a turn to an orthogonal sense spikes surprise');
});

// The firewall: meaning-distance is only real in a meaning space.
test('the hash organ cannot measure meaning — buildMeaningRead returns null', async () => {
  const hash = { id: 'hash', measuresMeaning: false, embed: async () => new Float32Array([1, 0]) };
  const doc = { sentences: ['Cat sat.', 'A ship sailed.'] };
  assert.equal(await buildMeaningRead(doc, hash), null, 'falls back to the skeleton (firewall)');
});

// The deepening's whole point: a restructure on a sense-turn the γ-mass reader is
// blind to — same figure throughout, no new name, but the meaning moves.
test('the meaning reader RECs on a turn the γ-mass reader misses', async () => {
  const text = 'Mara Voss waited. Mara Voss waited. Mara Voss waited. Mara Voss waited. ' +
               'The harbor burned. The harbor burned. The harbor burned. The harbor burned.';
  const doc = parseText(text, { docId: 'm' });
  const end = doc.sentences.length - 1;
  const vecOf = (t) => (sea(t) ? new Float32Array([0, 1]) : new Float32Array([1, 0]));
  const th = { thresholds: { proposition: 0.5, document: 2 } };

  const deep = await enactedReadingMeaning(doc, end, { embedder: stub(vecOf), ...th });
  assert.equal(deep.reader, 'meaning');
  assert.ok(deep.frames.get('proposition') && deep.frames.get('document'), 'frames at both layers');
  assert.ok(deep.events.every(isEnacted), 'the same enacted loop, single-register');
  assert.ok(deep.stats.proposition.recs >= 1, 'the semantic turn forces a restructure');

  // The cheap reader sees no new figure across the turn (harbor is no entity), so
  // it does not restructure there — the depth the meaning reader adds.
  const cheap = enactedReadingTo(doc, end, th);
  assert.ok(deep.stats.proposition.recs > cheap.stats.proposition.recs,
    'the meaning reader restructures on a sense-turn the γ-mass reader is blind to');
});

// The calibration discipline is now ONE — CAUSAL — for both readers (the cheap path
// already was; the meaning path had been on a global median that peeked at the future).
// The arrow: the band judging an early line is fit from surprises strictly BEFORE it,
// so a later spike cannot reach back and change a past verdict. The old global-median
// reader survives only as an explicitly-requested numb demonstration, and it VIOLATES
// the arrow — which is exactly why it is no longer the live default (§5, §11).
test('the meaning reader calibrates causally by default; the global median is a numb opt-in', async () => {
  // Two docs sharing a prefix; only B carries the later spikes. Read both to the end of
  // the shared prefix and compare the EVAs over that prefix.
  const mk = (withSpikes, id) => {
    const L = [];
    for (let i = 0; i < 6; i++) L.push('Mara Voss waited.');
    L.push('Mara Voss walked slowly.');                                  // a faint drift in the prefix
    if (withSpikes) for (let i = 0; i < 7; i++) L.push('Otto Stein arrived shouting.');
    return parseText(L.join(' '), { docId: id });
  };
  const docA = mk(false, 'A'), docB = mk(true, 'B');
  const end = docA.sentences.length - 1;
  const prefixEvas = (r) => ops(r.events, 'EVA').filter(e => e.cursor <= end)
    .map(e => [e.cursor, e.frameLayer, e.verdict, e.strainDelta]);

  // CAUSAL (the default): the prefix EVAs are identical whether or not B's future spikes
  // exist — the future cannot reach back through the band.
  const cA = await enactedReadingMeaning(docA, end, { embedder: graded() });
  const cB = await enactedReadingMeaning(docB, end, { embedder: graded() });
  assert.deepEqual(prefixEvas(cA), prefixEvas(cB),
    'causal: a later spike cannot change an earlier verdict — the arrow holds');

  // NUMB (the global median, explicitly requested): the band is the median of the WHOLE
  // reading, so B's future spikes shift the band that judged the prefix — the acausal
  // seam the live path no longer has.
  const nA = await enactedReadingMeaning(docA, end, { embedder: graded(), calibrate: { mode: 'global' } });
  const nB = await enactedReadingMeaning(docB, end, { embedder: graded(), calibrate: { mode: 'global' } });
  assert.notDeepEqual(prefixEvas(nA), prefixEvas(nB),
    'numb: the global median lets the future set the band that judged the past');
});

// §4 / §11 — directional strain on the REAL meaning reader (the parity that was missing).
// The meaning 1−cos says HOW FAR the sense moved; the same reading's bayesBy says along
// WHICH figures belief moved. With contrib wired the REC restructures toward the CAUSE;
// without it (the old meaning path) the axis is empty and the in-view figure stands.
// This is the test that would have caught the gap — it fails unless contrib is fed.
test('the meaning reader restructures along the straining axis, not the in-view figure', async () => {
  const lines = [];
  for (let i = 0; i < 14; i++) lines.push('Mara Voss waited by the window.');   // Mara holds the frame
  lines.push('Otto Stein arrived and the crisis burned.');                      // the sense turns toward Otto
  for (let i = 0; i < 4; i++)  lines.push('Mara Voss waited by the window.');
  const doc = parseText(lines.join(' '), { docId: 'axis' });
  const deep = await enactedReadingMeaning(doc, doc.sentences.length - 1, { embedder: graded() });

  const rec = ops(deep.events, 'REC').find(e => e.layer === 'proposition');     // the first break is the turn
  assert.ok(rec, 'the sense-turn forces a proposition restructure');
  assert.ok(rec.alongAxis.length > 0, 'the REC carries a straining axis — contrib reached the meaning loop');
  const installed = deep.events.find(e => e.op === 'DEF' && e.producedBy?.rec === rec.seq);
  assert.deepEqual(installed.frame.terms, rec.alongAxis.slice(0, 3), 'the axis drove the install, not the in-view terms');
  assert.ok(installed.frame.terms.includes('Otto Stein'), 'it restructures toward Otto, the cause of the break');
  assert.ok(!installed.frame.terms.includes('Mara Voss'), 'not Mara, who was merely in view');
});

// §3 / §6 — the IMPULSE on the meaning path's OWN scale, both directions. The meaning
// surprise clusters far below 1, so a fixed 0.95 gate is silent on it — the shock path
// (Newton) is built but dead, leaving only the grind (Leibniz). Causal fits the gate to
// the reader's scale, so a genuine shock fires it while the fixed reader stays alive on
// accumulation but never shocks — proof the silence is the gate, not a numb reader.
test('the meaning impulse fires on a real shock where a fixed 0.95 gate stays silent', async () => {
  const lines = [];
  for (let i = 0; i < 12; i++) lines.push('Mara Voss waited by the window.');
  for (let i = 0; i < 6; i++)  lines.push('Mara Voss walked slowly along.');     // a drift, so the tail is real
  lines.push('Otto Stein arrived and the crisis burned.');                       // the shock — but 1−cos < 0.95
  for (let i = 0; i < 6; i++)  lines.push('Mara Voss waited by the window.');
  const doc = parseText(lines.join(' '), { docId: 'shock' });
  const end = doc.sentences.length - 1;
  const byTrigger = (r, t) => ops(r.events, 'REC').filter(e => e.trigger === t).length;

  const causal = await enactedReadingMeaning(doc, end, { embedder: graded() });
  assert.ok(byTrigger(causal, 'impulse') >= 1, 'the causal impulse fires on a shock large FOR THIS reader');

  // The same signal under a fixed 0.95 gate (with a live accumulation belt): it still
  // grinds, but the shock path never fires — the meaning surprise never reaches 0.95.
  const fixed = await enactedReadingMeaning(doc, end,
    { embedder: graded(), confirmBand: 0.02, thresholds: { proposition: 0.1, document: 0.4 }, impulseThreshold: 0.95 });
  assert.equal(byTrigger(fixed, 'impulse'), 0, 'a fixed 0.95 gate never fires on the compressed meaning scale');
  assert.ok(byTrigger(fixed, 'accumulation') >= 1, 'yet the fixed reader is alive — the silence is the gate, not the reader');
});

// enactedReadingMeaning degrades honestly: a non-measuring embedder → the skeleton.
test('enactedReadingMeaning falls back to the cheap reader under the hash organ', async () => {
  const doc = parseText('Anna walked. Anna walked. Anna ran. Anna ran.', { docId: 'f' });
  const hash = { id: 'hash', measuresMeaning: false, embed: async () => new Float32Array([1, 0]) };
  const r = await enactedReadingMeaning(doc, doc.sentences.length - 1, { embedder: hash });
  assert.equal(r.reader, 'cheap', 'no meaning organ → the skeleton, not a thrown boot');
  assert.ok(r.frames.get('proposition'), 'still a real reading');
});

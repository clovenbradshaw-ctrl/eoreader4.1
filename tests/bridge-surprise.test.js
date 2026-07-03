import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLog, bridgeSurprise, BRIDGE_DINF } from '../src/core/index.js';
import { parseText } from '../src/perceiver/parse/index.js';
import { readingAt } from '../src/perceiver/index.js';

// THE REGRESSION LOCK for the connectivity surprise (src/core/bridge.js), the structural
// sibling of the mass surprise. Capability: a line whose bond joins two previously-SEPARATE
// regions of the entity graph is a structural reveal; bridgeSurprise fires maximally on it
// and ~0 on the controls a re-bond among adjacent entities, a fresh-entity line, and on
// surface rephrasing. Written to FAIL the day a precondition changes:
//   - if bridge starts firing on a control (the cheap surface explanation), it fails here;
//   - if the mass channel ever starts isolating the reveal (the gap closes), the gap
//     assertion below fails, flagging that the connectivity channel is no longer the only
//     reader of this structure.
// The pressure that grew it: experiments/ledger.jsonl exp-0001 (a random orthogonal
// collision, Maryland Tercentenary half dollar x Marjorie Organ).

// A pure-operator log — no text, no parser, no modality. If bridge reads it, the mechanism
// is interior (the omnimodal claim: the same primitive serves any organ that emits bonds).
const opLog = (events) => {
  const log = createLog({ docId: 't' });
  for (const e of events) log.append(e);
  return log;
};
const INS = (id, label, s) => ({ op: 'INS', id, label, sentIdx: s });
const CON = (src, tgt, via, s) => ({ op: 'CON', src, tgt, via, sentIdx: s });
const SYN = (from, to, s) => ({ op: 'SYN', kind: 'merge', from, to, sentIdx: s });

test('OMNIMODAL: a bond joining two separate components bridges maximally (interior, no text)', () => {
  // component A: a1-a2-a3 ; component B: b1-b2 ; then a3—b1 joins them.
  const log = opLog([
    INS('a1', 'A1', 0), INS('a2', 'A2', 0), CON('a1', 'a2', 'x', 0),
    INS('a3', 'A3', 1), CON('a2', 'a3', 'x', 1),
    INS('b1', 'B1', 2), INS('b2', 'B2', 2), CON('b1', 'b2', 'y', 2),
    CON('a3', 'b1', 'z', 3),                    // the cross-component reveal
  ]);
  const r = bridgeSurprise(log, 3);
  assert.equal(r.bridge, 1, 'different components -> maximal collapse');
  assert.deepEqual(r.axis, ['A3', 'B1'], 'the channel names the bridging pair');
});

test('CONTROL: a re-bond among already-adjacent entities does NOT bridge', () => {
  const log = opLog([
    INS('a1', 'A1', 0), INS('a2', 'A2', 0), CON('a1', 'a2', 'x', 0),
    CON('a1', 'a2', 'x', 1),                    // adjacent re-bond — confirmation, not a bridge
  ]);
  assert.equal(bridgeSurprise(log, 1).bridge, 0);
});

test('CONTROL: a line bonding a brand-new entity is new mass, not a bridge', () => {
  const log = opLog([
    INS('a1', 'A1', 0), INS('a2', 'A2', 0), CON('a1', 'a2', 'x', 0),
    INS('fresh', 'Fresh', 1), CON('a1', 'fresh', 'x', 1),   // 'fresh' did not exist before
  ]);
  assert.equal(bridgeSurprise(log, 1).bridge, 0, 'a fresh endpoint disqualifies the arrival');
});

test('COREF IDENTITY: a reveal that names a standing entity by a NEW surface form still bridges', () => {
  // The class of reveal a raw-id reading misses: 'a1prime' looks brand-new, but a SYN
  // merge (sentIdx <= cursor, causal) collapses it onto the standing 'a1'.
  const log = opLog([
    INS('a1', 'A1', 0), INS('a2', 'A2', 0), CON('a1', 'a2', 'x', 0),
    INS('b1', 'B1', 1), INS('b2', 'B2', 1), CON('b1', 'b2', 'y', 1),
    INS('a1prime', 'A1-again', 2), SYN('a1prime', 'a1', 2), CON('a1prime', 'b1', 'z', 2),
  ]);
  const r = bridgeSurprise(log, 2);
  assert.equal(r.bridge, 1, 'coref-as-identity makes the hidden collapse visible');
  assert.deepEqual(r.axis, ['A1', 'B1'], 'resolved to the standing identity, not the surface id');
});

test('the same-component gradient uses D∞, and a far same-component pair bridges weakly', () => {
  // a chain a0-a1-...-a5 (geodesic 5 between a0 and a5), then bond a0—a5 within the component.
  const ev = [INS('a0', 'A0', 0)];
  for (let i = 1; i <= 5; i++) { ev.push(INS(`a${i}`, `A${i}`, 0), CON(`a${i - 1}`, `a${i}`, 'x', 0)); }
  ev.push(CON('a0', 'a5', 'z', 1));
  const r = bridgeSurprise(opLog(ev), 1);
  assert.ok(r.bridge > 0 && r.bridge < 1, `same-component, geodesic 5 -> weak bridge, got ${r.bridge}`);
  assert.equal(r.bridge, Math.min(1, (5 - 1) / BRIDGE_DINF), 'the (δ-1)/D∞ gradient');
});

// ── The TEXT path, through readingAt — the modality-2 confirmation. ────────────────
// The pressure stimulus, re-derived here so the lock is self-contained. Two casts in
// separate components (a coin domain, a cartoonist domain), then a cross-domain reveal.
const STIM = [
  'Cecil Calvert founded the colony of Maryland.',          // 0
  'The United States Mint honored Calvert in 1934.',        // 1
  'Marjorie Organ drew cartoons for the New York Journal.', // 2
  'Robert Henri married Marjorie Organ in 1908.',           // 3
  'Calvert governed Maryland for decades.',                 // 4  control: adjacent re-bond
  'John Sloan taught a night class in the city.',           // 5  control: fresh entity
  'The coin circulated widely.',                            // 6
  'Calvert commissioned Organ to engrave the obverse.',     // 7  the reveal (cross-component)
];
const REVEAL = 7, ADJ = 4, FRESH = 5;
const bridgeAt = (lines, k) => {
  const doc = parseText(lines.slice(0, k + 1).join('\n'), { docId: 'sr' });
  return readingAt(doc, doc.units.length - 1, { bridge: true });
};

test('TEXT: the connectivity channel isolates the cross-component reveal', () => {
  const bridge = STIM.map((_, k) => bridgeAt(STIM, k).bridge);
  assert.equal(bridge[REVEAL], 1, 'the reveal bridges maximally');
  // the reveal is the UNIQUE maximum — no control ties or beats it
  assert.equal(bridge.filter((v) => v >= bridge[REVEAL]).length, 1, 'reveal is the unique argmax');
  assert.ok(bridge[ADJ] <= 0.2, `adjacent re-bond stays dark, got ${bridge[ADJ]}`);
  assert.ok(bridge[FRESH] <= 0.2, `fresh-entity line stays dark, got ${bridge[FRESH]}`);
  assert.deepEqual(bridgeAt(STIM, REVEAL).bridgeAxis, ['Cecil Calvert', 'Marjorie Organ']);
});

test('TEXT: the GAP — the mass channel does NOT isolate the reveal (why connectivity is needed)', () => {
  const bayes = STIM.map((_, k) => bridgeAt(STIM, k).bayesBits);
  const revealBayes = bayes[REVEAL];
  const outranked = bayes.filter((v, i) => i !== REVEAL && v > revealBayes).length;
  // If this ever fails, the mass channel started seeing the structural reveal — the
  // precondition changed, and that is exactly what this lock should surface.
  assert.ok(outranked >= 1, `at least one fresh-mass line outranks the reveal on bayes (got ${outranked})`);
});

test('TEXT: the connectivity reading is invariant to a surface emphasis cue', () => {
  const marked = STIM.slice();
  marked[REVEAL] = 'Calvert secretly commissioned Organ to engrave the obverse.';
  assert.equal(bridgeAt(STIM, REVEAL).bridge, bridgeAt(marked, REVEAL).bridge,
    'bridge reads the bond structure, not the surface marking');
});

test('PARITY: default readingAt carries no bridge field (the opt-in is byte-identical when off)', () => {
  const doc = parseText(STIM.join('\n'), { docId: 'sr' });
  const out = readingAt(doc, REVEAL);
  assert.ok(!('bridge' in out), 'no bridge key on the default path');
  assert.ok(!('bridgeAxis' in out), 'no bridgeAxis key on the default path');
});

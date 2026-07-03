import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseEOT, eotDoc, emitEot, eotText, tupleToEotLine, tuplesToEot, valueLiteral } from '../src/ingest/index.js';

// EOT emission (docs/eot-surface-syntax.md, ingest/eot-emit.js): the inverse of the ingester.
// A reading rendered BACK into EOT surface, deduped, no-ops dropped, only remap RECs surfaced.

// ── canonical tuple → line, the §8.1/§8.2 inverse ──────────────────────────────
test('each operator renders to its surface shape (§8.7 inverse)', () => {
  const line = (src) => tupleToEotLine(parseEOT(src).events[0]);
  assert.equal(line('Alice : Person'),            'Alice : Person');
  assert.equal(line('Alice.age = 30'),            'Alice.age = 30');
  assert.equal(line('Alice.email = nil'),         'Alice.email = nil');
  assert.equal(line('Alice -> Bob : knows'),      'Alice -> Bob : knows');
  assert.equal(line('Region <- [TN, KY, AL]'),    'Region <- [TN, KY, AL]');
  assert.equal(line('!eva Alice.tier : Bronze -> Gold'), '!eva Alice.tier : Bronze -> Gold');
  assert.equal(line('!rec vocabulary:status {active,inactive} => {enrolled,waitlisted,suspended}'),
                    '!rec vocabulary:status {active,inactive} => {enrolled,waitlisted,suspended}');
});

test('a re-designation renders as !sig so it never recovers as a fresh INS alone', () => {
  // Two IS-As on Alice: the second recovers to SIG. Read back alone it must stay a SIG.
  const evs = parseEOT('Alice : Person\nAlice : VIP').events;
  assert.equal(evs[1].op, 'SIG');
  assert.equal(tupleToEotLine(evs[1]), '!sig Alice : VIP');
  // and !sig round-trips to SIG even with no prior INS in the new pass
  assert.equal(parseEOT('!sig Alice : VIP').events[0].op, 'SIG');
});

// ── the round-trip: emit(parse(src)) re-parses to the SAME operators ───────────
test('operators survive a full surface → tuples → surface → tuples round-trip', () => {
  const src = [
    'Alice : Person',
    'Alice.age = 30',
    'Alice.email = nil',
    'Alice -> Bob : knows',
    'Alice : VIP',
    '!eva Alice.tier : Bronze -> Gold',
    'Region <- [TN, KY, AL]',
    '!rec vocabulary:status {active,inactive} => {enrolled,waitlisted,suspended}',
  ].join('\n');
  const ops1 = parseEOT(src).events.map((e) => e.op);
  const surface2 = tuplesToEot(parseEOT(src).events).join('\n');
  const round = parseEOT(surface2);
  assert.equal(round.diagnostics.length, 0, 'the re-emitted surface is well-formed');
  assert.deepEqual(round.events.map((e) => e.op), ops1, 'same operator sequence after the round-trip');
});

test('a string value that looks like a number is quoted, so its type survives', () => {
  assert.equal(valueLiteral('30'), '"30"');
  assert.equal(valueLiteral(30), '30');
  assert.equal(valueLiteral('hello world'), '"hello world"');
  assert.equal(valueLiteral(true), 'true');
  assert.equal(valueLiteral(null), 'nil');
  // and it round-trips back to a STRING, not a number
  const back = parseEOT(`x.k = ${valueLiteral('30')}`).events[0];
  assert.equal(back.operand.value, '30');
  assert.equal(typeof back.operand.value, 'string');
});

// ── the live engine log → EOT (the reading, read out) ──────────────────────────
test('the live eotDoc log renders back to the reading it came from', () => {
  const src = [
    'Alice : Person',
    'Alice.age = 30',
    'Alice -> Bob : knows',
  ].join('\n');
  const doc = eotDoc(src);                          // surface → live engine log (ids, INS+SIG split)
  const out = emitEot(doc.log);                     // live log → surface again
  // the entity, its property and its bond all return, by LABEL not by id
  assert.ok(out.lines.includes('Alice : Person'), `IS-A returned: ${out.text}`);
  assert.ok(out.lines.includes('Alice.age = 30'), `DEF returned: ${out.text}`);
  assert.ok(out.lines.includes('Alice -> Bob : knows'), `CON returned: ${out.text}`);
  // and the re-rendered surface re-ingests with no diagnostics
  assert.equal(parseEOT(out.text).diagnostics.length, 0);
});

// ── the discipline ─────────────────────────────────────────────────────────────
test('nothing inert: a repeated line and a redundant DEF are dropped', () => {
  const events = [
    { op: 'INS', id: 'a1', label: 'Alice', seq: 0 },
    { op: 'DEF', id: 'a1', key: 'age', value: 30, seq: 1 },
    { op: 'DEF', id: 'a1', key: 'age', value: 30, seq: 2 },   // redundant — slot already holds 30
    { op: 'CON', src: 'a1', tgt: 'b1', via: 'knows', seq: 3 },
    { op: 'CON', src: 'a1', tgt: 'b1', via: 'knows', seq: 4 }, // duplicate line — deduped
  ];
  const out = emitEot(events);
  assert.equal(out.lines.filter((l) => l === 'Alice.age = 30').length, 1, 'the DEF appears once');
  assert.ok(out.skipped.some((s) => s.seq === 2 && /redundant DEF/.test(s.reason)), 'redundant DEF reported');
  assert.equal(out.lines.filter((l) => l.startsWith('Alice -> b1')).length, 1, 'the duplicate CON is deduped');
});

test('a redundant SYN over an already-merged pair is skipped', () => {
  const events = [
    { op: 'INS', id: 'a', label: 'Alice', seq: 0 },
    { op: 'INS', id: 'b', label: 'AliceB', seq: 1 },
    { op: 'SYN', kind: 'merge', from: 'a', to: 'b', seq: 2 },
    { op: 'SYN', kind: 'merge', from: 'a', to: 'b', seq: 3 },  // already merged — inert
  ];
  const out = emitEot(events);
  assert.equal(out.lines.filter((l) => /==/.test(l)).length, 1, 'one identity line');
  assert.ok(out.skipped.some((s) => s.seq === 3 && /already merged/.test(s.reason)));
});

test('only a vocabulary-remap REC surfaces; a rule-ledger REC is reported, not faked', () => {
  const events = [
    { op: 'REC', target: 'vocabulary:status', old_terms: ['active'], new_terms: ['enrolled'], seq: 0 },
    { op: 'REC', kind: 'boundary', token: ';', weight: 0.4, seq: 1 },          // ledger REC, no remap body
  ];
  const out = emitEot(events);
  assert.deepEqual(out.lines, ['!rec vocabulary:status {active} => {enrolled}']);
  assert.ok(out.skipped.some((s) => s.seq === 1 && /surface-expressible/.test(s.reason)),
    'the ledger REC is reported as skipped, never dressed up as !rec');
});

test('a held same_as? (the asterisk) has no surface and is reported as such', () => {
  const events = [
    { op: 'INS', id: 'a', label: 'Tom Turner', seq: 0 },
    { op: 'INS', id: 'b', label: 'Tom Turner', seq: 1 },
    { op: 'SYN', kind: 'same_as?', from: 'a', to: 'b', label: 'Tom Turner', seq: 2 },
  ];
  const out = emitEot(events);
  assert.equal(out.lines.length, 0, 'identity unestablished → no surface line');
  assert.ok(out.skipped.some((s) => s.seq === 2 && /asterisk/.test(s.reason)));
});

test('eotText is just the surface text', () => {
  assert.equal(typeof eotText([{ op: 'CON', src: 'a', tgt: 'b', via: 'knows', seq: 0 }]), 'string');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createFold } from '../src/write/fold.js';
import { openLedger, openResolutions, isOpen, pickVoid } from '../src/write/voids.js';
import { seededRng } from '../src/write/idle.js';
import { firm, voidRes } from '../src/core/index.js';

// SPEC §15, §16 — the open-Resolution query: the idle fuel and the "Open" ledger.
// The voids are where more thinking can still PAY; the firm record is not.

test('openLedger reads the void-set off a fold: void identity, INS-without-DEF, hedged (§15)', () => {
  const fold = createFold();
  // settled — firm descriptor, confident: NOT open
  fold.appear('r#001', { head: 'Gregor Samsa' });
  fold.record('r#001', { t: 8, op: 'DEF', attr: 'confined to the back room', res: 'firm' });
  // void identity — an unsettled (void) attribute
  fold.appear('r#003', { head: 'his transformation' });
  fold.record('r#003', { t: 9, op: 'DEF', attr: 'what it signifies', res: 'void' });
  // INS without DEF — appeared, never characterized
  fold.appear('r#009', { head: 'the LLC behind the MOU' });
  // hedged — firm but low-p
  fold.appear('r#005', { head: 'the $15M figure' });
  fold.record('r#005', { t: 4, op: 'DEF', attr: 'reconciled with the CBID line', res: 'firm' });

  const resolution = new Map([['r#001', firm(0.92)], ['r#005', firm(0.4)]]);
  const ledger = openLedger(fold, { resolution });
  const byId = Object.fromEntries(ledger.map(e => [e.rid, e.band]));

  assert.equal(byId['r#003'], 'void', 'a void attribute is open');
  assert.equal(byId['r#009'], 'void', 'INS without DEF is open');
  assert.equal(byId['r#005'], 'hedged', 'a firm but low-p commitment is hedged-open');
  assert.ok(!('r#001' in byId), 'a firm, confident, characterized referent is SETTLED — not fuel');
});

test('openResolutions reads the same set off a flat item list (§15)', () => {
  const items = [
    { hash: 'r#1', res: voidRes() },
    { hash: 'r#2', res: firm(0.9), hasDef: false },
    { hash: 'r#3', res: firm(0.5) },
    { hash: 'r#4', res: firm(0.95) },
  ];
  const out = openResolutions(items);
  const byId = Object.fromEntries(out.map(e => [e.rid, e.band]));
  assert.equal(byId['r#1'], 'void');
  assert.equal(byId['r#2'], 'void', 'appeared but not characterized');
  assert.equal(byId['r#3'], 'hedged');
  assert.ok(!('r#4' in byId), 'a confident firm commitment is settled');
});

test('pickVoid varies WHICH via seeded noise, never authors content (§15 I5)', () => {
  const ledger = [
    { rid: 'r#1', head: 'a', text: 'a', band: 'void', reason: '' },
    { rid: 'r#2', head: 'b', text: 'b', band: 'hedged', reason: '' },
  ];
  const pick = pickVoid(ledger, seededRng(1));
  assert.ok(isOpen(pick), 'it picks an OPEN entry');
  assert.ok(ledger.includes(pick), 'it only selects an existing void — it never manufactures one');
  assert.equal(pickVoid([], seededRng(1)), null, 'nothing open → nothing to think about');
});

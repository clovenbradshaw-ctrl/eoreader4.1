import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BANDS, makeResolution, firm, voidRes, isFirm, isVoid, weaker, effectiveRes,
  makeSite, siteNotation, isHashId, HASHID_RE, mintHash, fillsTwoSlots,
  makeEvent, sitesOf,
} from '../src/core/event.js';

// SPEC §1, §3 — the formal event op(Site, Resolution, Provenance, t), the two
// independent tiers of identity, and the arity law read off the cube.

test('Resolution is a band + a proper-scorable probability (§1, §10)', () => {
  const f = makeResolution(BANDS.FIRM, 0.8);
  assert.equal(f.band, 'firm');
  assert.equal(f.p, 0.8);
  // bare bands get a default p so every commitment is proper-scorable
  assert.equal(makeResolution('firm').p, 0.9);
  assert.equal(makeResolution('void').p, 0.1);
  // p is clamped to [0,1]
  assert.equal(makeResolution('firm', 5).p, 1);
  assert.equal(makeResolution('firm', -1).p, 0);
  assert.ok(Object.isFrozen(f));
});

test('existence and definiteness are independent tiers — a firm hash with a void Resolution (§1)', () => {
  // "a man, we never learn his name" — firm existence, void identity
  const site = makeSite('r#7f3', 0);
  const ev = makeEvent({ op: 'INS', site, res: voidRes(0.2) });
  assert.equal(site.hash, 'r#7f3');           // firm existence handle
  assert.ok(isVoid(ev.res));                  // void on the name
  assert.equal(ev.res.p, 0.2);
});

test('void dominates: weaker() and effectiveRes() are the min over deps (§3b)', () => {
  assert.equal(weaker(firm(0.9), firm(0.8)).band, 'firm');
  assert.equal(weaker(firm(0.9), firm(0.8)).p, 0.8, 'carries the more conservative p');
  assert.equal(weaker(firm(0.9), voidRes(0.3)).band, 'void', 'one void makes the join void');
  assert.equal(weaker(firm(0.9), voidRes(0.3)).p, 0.3);

  // a SYN over a firm and a void constituent inherits void (the thesis must hedge)
  const eff = effectiveRes([firm(0.9), firm(0.85), voidRes(0.4)]);
  assert.equal(eff.band, 'void');
  assert.equal(eff.p, 0.4);
  // all-firm stays firm at the lowest p
  assert.equal(effectiveRes([firm(0.9), firm(0.7)]).band, 'firm');
  assert.equal(effectiveRes([firm(0.9), firm(0.7)]).p, 0.7);
});

test('Site notation is r#<id>@<grain>; the hashId is opaque base36 (§1)', () => {
  assert.equal(siteNotation(makeSite('r#a3f', 0)), 'r#a3f@0');
  assert.equal(siteNotation(makeSite('r#a3f', 2)), 'r#a3f@2');
  assert.ok(isHashId('r#001'));
  assert.ok(!isHashId('mother'));
  assert.ok(HASHID_RE.test('the cursor r#01a leaked'));
});

test('mintHash is stable and once-only in shape — minted from the appearance seq (§1)', () => {
  assert.equal(mintHash(1), 'r#001');
  assert.equal(mintHash(1), 'r#001', 'same seq, same hash — stable under learning');
  assert.notEqual(mintHash(1), mintHash(2));
  assert.ok(isHashId(mintHash(42)));
});

test('the arity law is read off the cube: only Relate-mode operators fill two slots (§3a)', () => {
  // Relate (reads two): SIG, CON, EVA — the operators whose argument slots must be filled
  assert.ok(fillsTwoSlots('CON'));
  assert.ok(fillsTwoSlots('SIG'));
  assert.ok(fillsTwoSlots('EVA'));
  // Generate (writes new) and Differentiate (reads one) carry no two-slot obligation
  assert.ok(!fillsTwoSlots('INS'));
  assert.ok(!fillsTwoSlots('SYN'));
  assert.ok(!fillsTwoSlots('DEF'));
});

test('makeEvent validates the operator and freezes; sitesOf flattens arity (§1, §3)', () => {
  assert.throws(() => makeEvent({ op: 'NOPE', site: makeSite('r#001') }), /not an operator/);
  const con = makeEvent({
    op: 'CON',
    site: [makeSite('r#001'), makeSite('r#002')],
    res: firm(0.7),
    promotes: makeSite('r#010', 1),
  });
  assert.ok(Object.isFrozen(con));
  assert.equal(sitesOf(con).length, 2);
  assert.equal(con.promotes.hash, 'r#010');
  assert.equal(sitesOf(makeEvent({ op: 'INS', site: makeSite('r#001') })).length, 1);
});

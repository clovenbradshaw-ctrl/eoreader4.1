import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRule, realize } from '../src/write/index.js';

// Every generation grammar rule is held and tested: applied while it reads back, toggled off
// when it fails. Same support/strain/defeat shape the coref gender ledger uses.

test('createRule: a rule toggles off when strain overtakes support, and comes back on a hold', () => {
  const r = createRule();
  assert.equal(r.on, true);
  r.break();                       // strain 1 vs support 1 — still on
  assert.equal(r.on, true);
  r.break();                       // strain 2 > support 1 — DEFEATED
  assert.equal(r.on, false, 'the rule toggled off when its EVA failed');
  r.hold();                        // earns its place again
  assert.equal(r.on, true, 'a hold relaxes strain — the rule comes back on');
});

const G = { id: 'g', gender: 'm', name: 'Gregor' };

test('aggregation is bounded: a long same-subject run splits rather than overrun the reader', () => {
  const plan = ['woke', 'rose', 'ate', 'washed', 'dressed'].map(v => ({ subj: G, verb: v }));
  const out = realize(plan);
  assert.ok(out.sentences.length >= 2, 'the run is split, not joined into one unreadable compound');
  // no sentence conjoins more than the bound (≤ 3 predicates → ≤ 2 commas)
  for (const s of out.sentences) assert.ok((s.match(/,/g) || []).length <= 2, `compound within bound: ${s}`);
  assert.match(out.sentences[0], /^Gregor woke, rose, and ate\.$/, 'first three are held in one compound');
});

test('a short run still aggregates cleanly (the rule is on by default)', () => {
  const out = realize([{ subj: G, verb: 'woke' }, { subj: G, verb: 'rose' }]);
  assert.equal(out.text, 'Gregor woke and rose.');
});

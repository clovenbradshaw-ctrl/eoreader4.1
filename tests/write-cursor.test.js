import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createFold } from '../src/write/fold.js';
import { buildCursor, assertNoLeak, serialize } from '../src/write/cursor.js';
import { firm, voidRes, HASHID_RE } from '../src/core/index.js';

// SPEC §5 — the membrane: the cursor contract. The substrate reasons over hashIds;
// the model sees only surface. Generalizes contract.mjs (the hashId membrane) and
// cursor.mjs (the integral handed at the cursor, multi-Site).

const metamorphosisFold = () => {
  const fold = createFold();
  fold.register('r#001', { head: 'Gregor Samsa', pron: { subj: 'he', obj: 'him' } });
  fold.register('r#002', { head: "Gregor's sister Grete", pron: { subj: 'she', obj: 'her' } });
  fold.appear('r#001'); fold.appear('r#002');
  fold.record('r#001', { t: 8, op: 'DEF', attr: 'now confined to the back room', res: 'firm' });
  return fold;
};

const tendsCell = {
  id: 'c_tends', op: 'CON', args: ['r#002', 'r#001'], edge: 'tends',
  target: 'one plain past-tense sentence — the caretaking and what it costs',
};
const spans = [{ idx: 312, text: 'It was Grete who, in those first weeks, set down the bowl of milk and withdrew to the door.' }];

test('the MEMBRANE INVARIANT: no hashId ever reaches the model input (§5)', () => {
  const cursor = buildCursor(tendsCell, metamorphosisFold(), spans, { resolution: firm() });
  const serial = serialize(cursor.input);
  assert.equal(HASHID_RE.test(serial), false, 'no r#… survives into the prompt');
  // the model saw the surface names and the typed edge, never the hashes
  assert.match(serial, /Gregor Samsa/);
  assert.match(serial, /Grete/);
  assert.match(serial, /-> [^\n:]+ : tends/);   // EOT LINK surface, never the retired flat arrow
  assert.doesNotMatch(serial, /--tends-->/);
});

test('MULTI-SITE: the integral is handed for EVERY argument Site, not just one focus (§5)', () => {
  const cursor = buildCursor(tendsCell, metamorphosisFold(), spans, { resolution: firm() });
  const user = cursor.input.find(m => m.role === 'user').content;
  // both referents' integrals are present — the object's integral prevents mis-bind
  // as much as the subject's
  assert.match(user, /Gregor Samsa — now confined to the back room/, "the object's full integral is handed");
  assert.match(user, /Grete/, "the subject's integral is handed");
  // expect = the union of Sites whose integrals were handed in (the witness's set, §7)
  assert.deepEqual([...cursor.expect].sort(), ['r#001', 'r#002']);
});

test('the audit shows the hashes and the integral; the input shows only surface — one act, two ends (§5)', () => {
  const cursor = buildCursor(tendsCell, metamorphosisFold(), spans, { resolution: firm() });
  // the AUDIT line is for the human: it carries the hashIds and the integral names
  assert.match(cursor.audit.line, /r#001/);
  assert.match(cursor.audit.line, /r#002/);
  assert.match(cursor.audit.line, /Gregor Samsa/);
  // the input never does (asserted above) — same integral, two renderings
  assert.equal(HASHID_RE.test(serialize(cursor.input)), false);
  assert.equal(typeof cursor.budget, 'number');
});

test('a VOID-resolved beat carries a HEDGE instruction; a firm one does not (§3b, §5)', () => {
  const fold = metamorphosisFold();
  const synMeaning = {
    id: 's_meaning', op: 'SYN', args: ['r#001'],
    beat: 'what the transformation signifies', target: 'one sentence',
  };
  const voidCursor = buildCursor(synMeaning, fold, [], { resolution: voidRes() });
  const firmCursor = buildCursor(synMeaning, fold, [], { resolution: firm() });
  assert.match(voidCursor.input.find(m => m.role === 'user').content, /holding-open|not settled/);
  assert.equal(voidCursor.band, 'void');
  assert.doesNotMatch(firmCursor.input.find(m => m.role === 'user').content, /holding-open/);
  assert.equal(firmCursor.band, 'firm');
});

test('assertNoLeak is mechanical and throws on a leak (§5)', () => {
  assert.ok(assertNoLeak([{ role: 'user', content: 'Gregor Samsa tends his sister.' }]));
  assert.throws(
    () => assertNoLeak([{ role: 'user', content: 'the cursor r#001 leaked into the prompt' }]),
    /membrane leak: hashId r#001/,
  );
});

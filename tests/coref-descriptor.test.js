import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCorefField } from '../src/perceiver/parse/coref.js';
import { scanDescriptors } from '../src/perceiver/parse/relations.js';
import { parseText } from '../src/perceiver/parse/index.js';
import { projectGraph } from '../src/core/index.js';
import { areDisjoint, typeOf } from '../src/core/index.js';

// The standing-descriptor channel, at the FIELD layer. These exercise the
// mechanism the pipeline wiring will drive: a role epithet ("his sister")
// accumulates discourse-wide and binds to a later-introduced NAME by role, never
// by recency or adjacency. The conflict predicate is INJECTED — here the real
// bridge `areDisjoint`, the way the (holon-aware) wiring layer would pass it —
// so coref never imports the algebra. roleKeys ("sister"/"mother") happen to be
// surface nouns the bridge types, so areDisjoint is a drop-in rolesConflict.

const rolesConflict = (a, b) => areDisjoint(a, b);

// ---------------------------------------------------------------------------
// The §8 invariant: descriptor mass is warmth, never witness.

test('a descriptor binds at the conversational tier — it can never clear the grounded floor', () => {
  const f = createCorefField();
  // "his sister" fires across the discourse; Grete the NAME is never grounded here.
  for (const i of [71, 110, 150, 188]) f.noteDescriptor('sister', i, 'gregor-samsa');
  const bond = f.unifyDescriptor('sister', 'grete', 189, { compatible: true });
  assert.equal(bond.id, 'grete');
  assert.equal(bond.via, 'descriptor:sister');
  assert.ok(bond.w > 0);
  // The warmth lands in the conversational channel only.
  const cand = f.field(189).find(c => c.id === 'grete');
  assert.ok(cand.conversational > 0, 'descriptor deposits conversational warmth');
  assert.equal(cand.grounded, 0, 'no grounded mass was invented');
  // So the subtract-and-check refuses it as a floor-clearing reading.
  assert.equal(f.survivesSubtraction('grete', 189, 0), false);
  assert.deepEqual(f.fieldGrounded(189), [], 'grounded field is empty — warmth cannot move it');
});

// ---------------------------------------------------------------------------
// The live Grete / Mrs Samsa case: same gender, separated by ROLE alone.

test('role exclusivity separates two same-gender referents (no gender channel needed)', () => {
  const f = createCorefField({ rolesConflict });
  // Both standing descriptions accumulate over the discourse.
  for (const i of [71, 120, 180]) f.noteDescriptor('sister', i, 'gregor-samsa');
  for (const i of [90, 140, 185]) f.noteDescriptor('mother', i, 'grete');   // "Grete ... her mother"

  // Mrs Samsa is admitted and unifies with 'mother'.
  const m = f.unifyDescriptor('mother', 'mrs-samsa', 186, { compatible: true });
  assert.equal(m.id, 'mrs-samsa');

  // She is now the mother — role exclusivity refuses her the disjoint 'sister'.
  assert.equal(f.unifyDescriptor('sister', 'mrs-samsa', 187, { compatible: true }), null);

  // Grete, bearing no conflicting role, binds 'sister' cleanly.
  const s = f.unifyDescriptor('sister', 'grete', 189, { compatible: true });
  assert.equal(s.id, 'grete');

  // The warmth landed where it should and nowhere else.
  assert.ok(f.field(189).find(c => c.id === 'grete').conversational > 0);
  const mrs = f.field(189).find(c => c.id === 'mrs-samsa');
  assert.ok(!mrs || mrs.conversational === 0 || mrs.id !== 'grete');
});

test('without an injected predicate the field asserts no conflict (a leaf claims no knowledge)', () => {
  const f = createCorefField();                              // default rolesConflict → false
  for (const i of [10, 20]) f.noteDescriptor('mother', i);
  for (const i of [11, 21]) f.noteDescriptor('sister', i);
  assert.ok(f.unifyDescriptor('mother', 'x', 22, { compatible: true }));
  // No predicate ⇒ no role exclusivity; the field cannot know sister⊥mother.
  assert.ok(f.unifyDescriptor('sister', 'x', 23, { compatible: true }));
});

// ---------------------------------------------------------------------------
// The guards.

test('the binding guards: owner-distinctness, compatibility, staleness, one-bearer', () => {
  // can't be your own sister
  const a = createCorefField();
  a.noteDescriptor('sister', 50, 'gregor-samsa');
  assert.equal(a.unifyDescriptor('sister', 'gregor-samsa', 60, { compatible: true }), null);

  // an incompatible candidate (caller's gender/role gate) never binds
  const b = createCorefField();
  b.noteDescriptor('sister', 50);
  assert.equal(b.unifyDescriptor('sister', 'grete', 60, { compatible: false }), null);

  // a role gone silent past descMaxDist is too stale to bind
  const c = createCorefField({ descMaxDist: 10 });
  c.noteDescriptor('sister', 10);
  assert.equal(c.unifyDescriptor('sister', 'grete', 60, { compatible: true }), null);

  // one bearer per role: a second name is refused (the documented caveat)
  const d = createCorefField();
  d.noteDescriptor('sister', 50);
  assert.ok(d.unifyDescriptor('sister', 'grete', 60, { compatible: true }));
  assert.equal(d.unifyDescriptor('sister', 'anna', 61, { compatible: true }), null);
});

test('a named owner is sticky and beats a later pronoun-guessed owner', () => {
  const f = createCorefField();
  f.noteDescriptor('sister', 122, 'gregor-samsa', { named: true });  // "Gregor's sister" — a NAMED owner
  f.noteDescriptor('sister', 130, 'klaus-wrong');                    // a later pronoun guess must not overwrite
  // The owner-distinctness guard still keys on the sticky named owner.
  assert.equal(f.unifyDescriptor('sister', 'gregor-samsa', 140, { compatible: true }), null);
});

// ---------------------------------------------------------------------------
// Extraction half (a): role epithets without adjacent names → HELD descriptors.

test('scanDescriptors reads non-apposition role epithets, skipping apposition and plurals', () => {
  assert.deepEqual(scanDescriptors('His sister had left food.'),
    [{ roleKey: 'sister', owner: { kind: 'pron', pron: 'his' } }]);
  assert.deepEqual(scanDescriptors("Gregor's sister was kind."),
    [{ roleKey: 'sister', owner: { kind: 'name', name: 'Gregor' } }]);
  assert.deepEqual(scanDescriptors('his sister Grete left.'), []);      // apposition → kinship CON path
  assert.deepEqual(scanDescriptors('his sister, Grete, left.'), []);    // comma apposition too
  assert.deepEqual(scanDescriptors('his sisters argued.'), []);         // plural is not a single role
  assert.deepEqual(scanDescriptors('The fear of God.'), []);            // not a role term
});

test('extraction records a held descriptor with a sticky named owner, binding no name on its own', () => {
  // No apposition, and no other admitted referent for the trigger to bind to —
  // so the role stays HELD: extraction's job ends at the held descriptor.
  const doc = parseText(
    "Gregor Samsa woke. Gregor dressed. Gregor paced. His sister had left food. Gregor's sister was kind.",
    { docId: 'm' });
  const dr = doc.corefField.descriptorState('sister');
  assert.equal(dr.ownerId, 'gregor-samsa');     // "his" resolved under the margin guard, then
  assert.equal(dr.ownerNamed, true);            // "Gregor's sister" made it sticky/authoritative
  assert.equal(dr.bound, null, 'no admitted bearer candidate → extraction holds, binds nothing');
  // The §8 line: a held descriptor deposits into NO name's channel.
  const gs = doc.corefField.field(4).find(c => c.id === 'gregor-samsa');
  assert.equal(gs.conversational, 0, 'nothing was deposited onto any name');
});

test('the Frame-A margin guard withholds an ambiguous pronoun owner', () => {
  // Two referents equally hot when "his sister" fires → no unambiguous winner.
  const doc = parseText('Gregor Samsa spoke. Klaus Berg spoke. His sister waited.', { docId: 'a' });
  const dr = doc.corefField.descriptorState('sister');
  assert.ok(dr, 'the role is still recorded as held');
  assert.equal(dr.ownerId, null, 'a wrong-but-weak owner is worse than none — held without an owner');
});

// ---------------------------------------------------------------------------
// The trigger (b): role-exclusivity by elimination, end to end, no adjacency.

// "his sister"/"Gregor's sister" and "Grete" never adjacent; the mother is
// established first and, being disjoint, eliminates Mrs Samsa from "sister".
const META =
  'Gregor Samsa woke. Gregor dressed. Gregor worked. His sister had gone. ' +
  "Gregor's mother wept. Mrs Samsa waited. Grete returned. Grete cooked. Gregor's sister smiled.";

test('the trigger binds Grete to sister by elimination — a sibling edge emerges with no adjacency', () => {
  const doc = parseText(META, { docId: 'meta', rolesConflict: areDisjoint });
  // Mrs Samsa is consumed by `mother` first (sole candidate before Grete arrives)…
  assert.equal(doc.corefField.descriptorState('mother').bound, 'mrs-samsa');
  // …which eliminates her from `sister`, leaving Grete as the only survivor.
  assert.equal(doc.corefField.descriptorState('sister').bound, 'grete');

  const g = projectGraph(doc.log);
  const sib = g.edges.find(e => typeOf(e.via)?.type === 'sibling'
    && [e.from, e.to].includes('grete') && [e.from, e.to].includes('gregor-samsa'));
  assert.ok(sib, 'a Grete↔Gregor sibling edge emerges, bound across the epithet→name gap');
  assert.equal(sib.derived, true, 'and it is marked derived — defeasible, conversational-coupled');
  // Mrs Samsa is never bound to sister — the false merge the channel guards against.
  assert.ok(!g.edges.some(e => typeOf(e.via)?.type === 'sibling' && [e.from, e.to].includes('mrs-samsa')));
});

test('without the injected predicate the trigger abstains rather than fabricate', () => {
  const doc = parseText(META, { docId: 'meta2' });   // no rolesConflict → default no-conflict
  // The mother still binds (Mrs Samsa is the sole candidate before Grete arrives)…
  assert.equal(doc.corefField.descriptorState('mother').bound, 'mrs-samsa');
  // …but with no conflict knowledge, sister sees TWO unbound candidates → holds.
  assert.equal(doc.corefField.descriptorState('sister').bound, null);
  const g = projectGraph(doc.log);
  assert.ok(!g.edges.some(e => typeOf(e.via)?.type === 'sibling'), 'no sibling edge is fabricated');
});

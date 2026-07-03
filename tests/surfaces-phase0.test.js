import { test } from 'node:test';
import assert from 'node:assert/strict';

import { typeOf, PRIMITIVES } from '../src/core/index.js';
import { parseHolon, parentOf, holonLevels } from '../src/core/index.js';

// Surfaces · Dials · Holons — Phase 0 gate, pinned as regression locks.
//
// The spec is a build plan (P0→P5) whose first invariant is: "no step is built
// before a cheap read-only measurement on a corpus you can verify by hand has shown
// the step is real." scripts/surfaces-measure.mjs is that measurement; docs/
// surfaces-phase0.md records the numbers. These tests pin the two findings that are
// HERMETIC — true of the ontology and the holon model themselves, independent of the
// corpus or the parser — so the gate they hold is enforced, not just written down.
//
// Like tests/one-cursor-p0.test.js, they are written to FAIL THE DAY the precondition
// changes — when the relation ontology grows a grounding/aboutness primitive, or the
// holon address model gains a second parent — which is the signal to advance the gate
// and reopen Phase 3 (projectContainment / projectHolonPath).

// ── P0.A — the four-way containment split is NOT EXPRESSIBLE ──────────────────────
// Phase 3 wants a classifier sorting containment edges into FOUR types: membership
// (instance-of), condition (enabling-environment), grounding (substrate→type), and
// aboutness (a reading→its target). The measurement found the corpus's containment is
// UNIFORMLY one class. The deeper reason is here, in the ontology: relation-types.js
// has no primitive for grounding or aboutness at all, so the four-way split cannot be
// built — there is nothing for two of the four bins to hold.

test('P0.A: grounding and aboutness have no relation primitive — they type to null', () => {
  // substrate→type (grounding) and reading→target (aboutness) surface nouns, plus the
  // most containment-suggestive ones, are all honestly untyped: the algebra defers,
  // it does not invent a containment type the corpus never licensed.
  for (const noun of ['about', 'regarding', 'concerns', 'made-of', 'composed-of',
                      'instance-of', 'is-a', 'part-of', 'kind-of', 'grounds', 'manifests'])
    assert.equal(typeOf(noun), null, `${noun} must be untyped — no grounding/aboutness primitive exists`);
});

test('P0.A: only TWO of the four containment classes are expressible (membership, condition)', () => {
  // The containment-bearing primitives the ontology DOES carry, rolled up to the spec's
  // four classes. parent/child/ancestor are membership; located/leads are an enabling
  // environment (condition). Nothing rolls up to grounding or aboutness.
  const CONTAINMENT_CLASS = {
    parent: 'membership', child: 'membership', ancestor: 'membership',
    located: 'condition', leads: 'condition',
  };
  const expressible = [...new Set(
    Object.keys(PRIMITIVES).map(p => CONTAINMENT_CLASS[p]).filter(Boolean)
  )].sort();
  assert.deepEqual(expressible, ['condition', 'membership'],
    'the four-way split is half-empty: grounding and aboutness are unreachable until a primitive is added');
  // When this trips — a primitive lands that rolls up to grounding or aboutness — the
  // four-way classifier becomes buildable and Phase 3 is worth re-measuring.
});

// ── P0.B — the holon model is a TREE by construction ──────────────────────────────
// The measurement's verdict: even with cross-source identities folded, every contained
// node has exactly one parent — a tree, not a lattice. The spec's own falsification
// rider then applies: "If most nodes turn out to have one parent the lattice was a tree
// and the original nest was closer to true, and you build the simpler thing." The
// existing nest, core/holon.js, IS that simpler thing, and it is single-parent by
// construction: a holonic path has exactly one parent path. Pin it, so a change to a
// multi-parent address model (a real lattice) trips here and reopens the question.

test('P0.B: a holon path has exactly one parent — the model is a tree, the verdict\'s "simpler thing"', () => {
  assert.equal(parentOf('a.b.c'), 'a.b');                       // one parent, not a set
  assert.equal(parentOf('a.b'), 'a');
  assert.equal(parentOf('a'), null);                            // the root has no parent
  // Every prefix on the path is a single ancestor chain — one parent per level, the
  // defining property of a tree (a lattice would expose a SET of parents per node).
  const levels = holonLevels('customers.profiles.pets');
  assert.deepEqual(levels.map(l => l.segment), ['customers', 'profiles', 'pets']);
  for (const l of levels) {
    const p = parseHolon(l.path).parent;
    assert.ok(p === null || typeof p === 'string', 'parent is a single path or null — never a set of parents');
  }
});

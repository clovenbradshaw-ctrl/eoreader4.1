import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { encodeLevels, attributedEvaluation, surfToAnswer } from '../src/surfer/index.js';

// surfToAnswer assembles the surf's reading into a structured result whose epistemics are
// GATED: a source channel (σ — cited document material + the narrator's attributed stance) and
// an interpretation channel (ρ — the reader's verdict) the surf withholds. These pin the gate.

const DOC =
  'CHAPTER I\n' +
  'The historians tell us the battle was won by genius. They say the great men shaped it.\n' +
  'CHAPTER II\n' +
  'Natasha watched the opera. Natasha saw the smooth boards and the painted cardboard.\n' +
  'CHAPTER III\n' +
  'Tushin loaded the cannon. Tushin cleaned the barrel.\n' +
  'CHAPTER IV\n' +
  'Pierre walked home. Pierre opened the door.';

const ctx = () => {
  const doc = parseText(DOC, { docId: 'a', totalRead: true });
  const encoding = encodeLevels(doc);
  const evaluation = attributedEvaluation(doc, encoding);
  return { doc, encoding, evaluation };
};

test('the result gates THREE levels: verbatim (existence), structure (objective), interpretation (ρ)', () => {
  const c = ctx();
  const r = surfToAnswer('Analyze the defamiliarized opera scene and its moral project.', c);
  assert.ok(r.verbatim && r.structure && r.interpretation, 'three channels');
  assert.equal(r.verbatim.level, 'existence');
  assert.equal(r.structure.level, 'structure');
  assert.equal(r.interpretation.level, 'interpretation');
  assert.ok(Array.isArray(r.verbatim.quotes), 'verbatim carries the source word-for-word');
  assert.ok(Array.isArray(r.structure.regions), 'structure carries the derived relations');
  assert.equal(r.interpretation.stance, null, 'the surf withholds the verdict');
  assert.equal(r.interpretation.surprise, null, 'reader-relative surprise (the me-ness) is filled only by a self');
  assert.match(r.interpretation.basis, /me-ness|subjective/i, 'interpretation is the subjective register');
});

test('verbatim and structure are distinct: a bond cites a verbatim index, not the words inline', () => {
  const c = ctx();
  const r = surfToAnswer('who loaded the cannon?', c);
  const quoted = new Set(r.verbatim.quotes.map((q) => q.sentIdx));
  for (const reg of r.structure.regions)
    for (const b of reg.bonds) {
      assert.ok(Number.isInteger(b.sentIdx), 'a relation points at its source by index');
      assert.equal(b.quote, undefined, 'the relation carries no verbatim words — those live in the verbatim channel');
      assert.ok(quoted.has(b.sentIdx), 'and the cited index is present in verbatim, auditable');
    }
});

test('the narrator stance is STRUCTURE — objective about the source, owner-attributed, never interpretation', () => {
  const c = ctx();
  const r = surfToAnswer('Is the historians\' framing of the battle genuine or undercut?', c);
  if (r.structure.narratorStance)
    assert.ok(/narrator|ambiguous/.test(r.structure.narratorStance.owner), 'attributed to a mind in the text');
  assert.equal(r.interpretation.stance, null, 'the machine\'s verdict is never populated by the surf');
});

test('the modeler is wired into region selection — a meaning question surfaces its evaluative region', () => {
  const c = ctx();
  const r = surfToAnswer('Analyze the defamiliarized opera scene.', c);
  assert.ok(r.structure.regions.some(reg => /CHAPTER II\b/.test(reg.title)), 'the opera region is surfaced');
});

test('structure relations render as EOT LINK triples (Subject -> Object : relation), not arrows', () => {
  const c = ctx();
  const r = surfToAnswer('who loaded the cannon?', c);
  const bonds = r.structure.regions.flatMap((reg) => reg.bonds);
  assert.ok(bonds.length > 0, 'there is a bond to render');
  for (const b of bonds) {
    assert.match(b.eot, /^.+ -> .+ : .+$/, `EOT shape: "${b.eot}"`);
    assert.doesNotMatch(b.eot, /-->/, 'no ad-hoc arrows');
  }
});

test('the cut is SEG and QUERY-BLIND — regions are selected from the pre-computed grain, never re-cut', () => {
  // The firewall invariant: σ is reader-independent only if the grain is. Two different
  // questions over the SAME encoding select different regions, but every region boundary must
  // already exist in the query-blind cut — selection among grains, never shaping them.
  const c = ctx();
  const cutLos = new Set(c.encoding.segments.map((s) => s.lo));
  const a = surfToAnswer('Analyze the defamiliarized opera scene.', c);
  const b = surfToAnswer('who loaded the cannon and cleaned the barrel?', c);
  assert.equal(a.cut.operator, 'SEG');
  assert.equal(a.cut.queryBlind, true);
  for (const r of [a, b])
    for (const reg of r.structure.regions)
      assert.ok(cutLos.has(reg.lo), `region s${reg.lo} is a pre-computed cut boundary, not re-cut for the query`);
  // attention (the grain foregrounded) is the same for both — the Ground was not reshaped by the question.
  assert.equal(a.interpretation.attention.grainForegrounded, b.interpretation.attention.grainForegrounded);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { encodeLevels, attributedEvaluation, surfToAnswer,
         promote, spiralStep, cutIsQueryBlind, provenanceIntact, SELF } from '../src/surfer/index.js';

// The spiral (REC): interpretation at level n becomes Existence at level n+1. These pin the two
// FRACTAL invariants — query-blind cut and provenance re-stamp — that must hold at every storey,
// or the climb degrades to a hall of mirrors (the machine reading its own opinion as found fact).

const DOC =
  'CHAPTER I\nThe historians tell us the battle was won by genius.\n' +
  'CHAPTER II\nNatasha watched the opera. Natasha saw the smooth boards and painted cardboard.\n' +
  'CHAPTER III\nTushin loaded the cannon. Tushin cleaned the barrel.\n' +
  'CHAPTER IV\nPierre walked home. Pierre opened the door.';

const level0 = () => {
  const doc = parseText(DOC, { docId: 's0', totalRead: true });
  const encoding = encodeLevels(doc);
  const evaluation = attributedEvaluation(doc, encoding);
  return surfToAnswer('Analyze the defamiliarized opera scene and its moral project.', { doc, encoding, evaluation });
};

test('promote is REC: an interpretation becomes the next level\'s Existence, stamped, append-only', () => {
  const r0 = level0();
  const before = JSON.stringify(r0);
  const verdict = 'I judge the opera scene defamiliarizes social pretense, and the irony is earned by the montage.';
  const p = promote(r0, { level: 0, verdict });
  assert.equal(p.level, 1, 'the spiral climbed one storey');
  assert.equal(p.existence.level, 'existence', 'the verdict is now a thing-that-exists');
  assert.equal(p.existence.text, verdict, 'indexable verbatim tokens');
  // the provenance re-stamp: it carries the mark that it WAS ρ.
  assert.equal(p.existence.provenance.owner, SELF, 'owner = self (the machine), never a source mind');
  assert.equal(p.existence.provenance.wasLevel, 0);
  assert.equal(p.existence.provenance.wasInterpretation, true);
  // append-only / transcend-and-include: the level below is preserved untouched.
  assert.equal(JSON.stringify(r0), before, 'promote does not mutate the level below');
  assert.equal(p.grounds, r0, 'the whole three-fold below is included');
});

test('promote refuses to climb without a verdict (nothing to turn into existence)', () => {
  assert.throws(() => promote(level0(), { level: 0 }), /verdict/);
});

test('spiralStep re-reads the verdict with a QUERY-BLIND cut and carries the provenance (fractal firewall)', () => {
  const r0 = level0();
  const verdict = 'The opera defamiliarization exposes the pretense of high society; the narrator withholds the frame on purpose. ' +
    'Natasha sees only boards and cardboard, and that flat seeing is the moral point.';
  const p = promote(r0, { level: 0, verdict });
  const r1 = spiralStep(p, 'Was that verdict earned, or is it installed by its own framing?');
  // invariant 1 — the cut at the new storey is query-blind, self-similar to the floor.
  assert.ok(cutIsQueryBlind(r1.cut), 'the SEG cut at level n+1 is query-blind');
  assert.equal(r1.cut.operator, 'SEG');
  // invariant 2 — the provenance stamp survived the level-jump.
  assert.ok(provenanceIntact({ provenance: r1.sourceProvenance }), 'the stamp survives: owner=self, wasLevel set');
  assert.equal(r1.sourceProvenance.owner, SELF);
  assert.equal(r1.level, 1, 'the read is at the storey above');
  // and the new level is itself a three-fold (it can be read and climbed again).
  assert.ok(r1.verbatim && r1.structure && r1.interpretation, 'the next level is itself a full three-fold');
  assert.equal(r1.interpretation.stance, null, 'its own verdict is again withheld — the spiral can climb once more');
});

test('the hall-of-mirrors breach is refused: a promoted existence without a stamp cannot be climbed', () => {
  const r0 = level0();
  const p = promote(r0, { level: 0, verdict: 'a verdict' });
  // strip the provenance — simulate the stamp being dropped (the dreaming-gone-wrong failure).
  const unstamped = { ...p, existence: { ...p.existence, provenance: undefined } };
  assert.throws(() => spiralStep(unstamped, 'meta?'), /provenance|mirror/i,
    'reading self-opinion as found fact is blocked at the level-jump');
});

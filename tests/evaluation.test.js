import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { encodeLevels, attributedEvaluation, NARRATOR } from '../src/surfer/index.js';

// The MODELER (faculty #2): the narrator's evaluative OPERATION, owner-attributed, σ-side,
// divergence-preserving — never the machine's endorsement. These pin the firewall (every
// stance owned by a mind, FID → ambiguous) and the two surviving carriers (framing,
// topic-conditional defamiliarization), not the absolute scores.

// Four short "chapters": a framing-undercut digression, a defamiliarized spectacle (a figure
// perceiving the elevated frame in flat concrete register), a concrete-but-unpretentious
// passage (the false positive a global register prior would catch), and a flat plot beat.
// Headings are isolated by newlines so each chapter folds to one structural unit.
const DOC =
  'CHAPTER I\n' +
  'The historians tell us with assurance it was genius. ' +
  'They say the great men shaped it. The official dispatches reported a triumph.\n' +
  'CHAPTER II\n' +
  'Natasha watched the opera. Natasha saw the smooth boards and the painted cardboard. ' +
  'Natasha saw the bare stage and the wooden benches.\n' +
  'CHAPTER III\n' +
  'Tushin loaded the cannon. Tushin cleaned the heavy barrel. Tushin rolled the iron wheel.\n' +
  'CHAPTER IV\n' +
  'Pierre walked to the house. Pierre opened the door. Pierre sat down.';

test('attributedEvaluation owns every stance — the firewall field is present (no machine claim)', () => {
  const doc = parseText(DOC, { docId: 'ev', totalRead: true });
  const ev = attributedEvaluation(doc, encodeLevels(doc));
  assert.equal(ev.owner, NARRATOR, 'the default attribution is the narrator, a mind in the text');
  for (const s of ev.segments)
    assert.ok(s.owner === NARRATOR || s.owner === 'ambiguous', `every locus is owned (got ${s.owner})`);
  assert.match(ev.note, /not the machine/i, 'it is marked attributed, never the machine\'s endorsement');
});

test('the framing carrier fires on the undercut-source digression, not the plot beat', () => {
  const doc = parseText(DOC, { docId: 'ev', totalRead: true });
  const ev = attributedEvaluation(doc, encodeLevels(doc));
  const framing = ev.segments.find(s => /CHAPTER I\b/.test(s.title));
  const plot    = ev.segments.find(s => /CHAPTER IV\b/.test(s.title));
  assert.ok(framing.framing > plot.framing, 'the historians/dispatches digression frames; the plot beat does not');
  assert.ok(framing.score > plot.score, 'and it scores as the more evaluative unit');
});

test('defamiliarization is TOPIC-CONDITIONAL — the spectacle fires, the bare artillery does not', () => {
  // The precision test: Chapter II (opera, elevated frame, concrete register) and Chapter III
  // (cannon, concrete register, NO pretense) are both concrete. A global register prior cannot
  // tell them apart; the topic-conditional product must.
  const doc = parseText(DOC, { docId: 'ev', totalRead: true });
  const ev = attributedEvaluation(doc, encodeLevels(doc));
  const opera     = ev.segments.find(s => /CHAPTER II\b/.test(s.title));
  const artillery = ev.segments.find(s => /CHAPTER III\b/.test(s.title));
  assert.ok(opera.defamiliarization > 0, 'the spectacle rendered flat registers as defamiliarization');
  assert.equal(artillery.defamiliarization, 0, 'the bare artillery has no elevated frame to deflate — no false positive');
  assert.ok(opera.score > artillery.score, 'the opera is the more evaluative unit, the artillery is not');
});

test('free-indirect discourse hands the owner to ambiguous — divergence is preserved', () => {
  // A spectacle passage carrying free-indirect markers: the valuation may be the character's,
  // so the narrator is NOT forced as the owner.
  const fid = parseText(
    'CHAPTER I\n' +
    'Natasha watched the opera. Natasha saw the stage as if it were nothing but smooth boards and painted cardboard. ' +
    'It seemed to her, no doubt, that the audience evidently admired the spectacle.\n' +
    'CHAPTER II\n' +
    'Anna sat. Boris stood near the door.\n' +
    'CHAPTER III\n' +
    'Carl waited in the hall. Carl left the room.\n' +
    'CHAPTER IV\n' +
    'Dmitri crossed the square. Dmitri entered the house.',
    { docId: 'fid', totalRead: true });
  const ev = attributedEvaluation(fid, encodeLevels(fid));
  const spectacle = ev.segments.find(s => /CHAPTER I\b/.test(s.title));
  assert.equal(spectacle.owner, 'ambiguous', 'FID withholds the owner — capture is refused, the gap is kept');
});

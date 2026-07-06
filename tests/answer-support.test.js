import { test } from 'node:test';
import assert from 'node:assert/strict';

import { groundSpans, groundSummary, supportVerdict, SUPPORT_FLOOR } from '../src/ground/index.js';

// supportVerdict — the ANSWER-GRAIN bind-check the grounding badge reads. A "matched" badge claims
// the passages shown beside the answer are WHERE IT CAME FROM; that is only honest when enough of the
// settled prose actually traces to a source. supportVerdict turns the groundSummary tally into that
// decision, once, so the chat path and the text organ share one rule. These tests pin the exact
// failure that motivated it — a bird question answered over football "Ravens" passages — plus the
// good, partial, and too-short-to-judge cases.

// The namesake trap, verbatim from the ravens-vs-crows audit: the walk froze on the football sense of
// "Ravens", so the grounding passages are about a university football team, while the answer is about
// the birds. A keyword touch on "Ravens" once badged this "matched"; it must read as VOID.
const FOOTBALL_PASSAGES = [
  { u: 'https://en.wikipedia.org/wiki/Carleton_Ravens_football', i: 3,
    text: 'They ended the season in a tie for second place with the Royal Military College, and won the first Panda game in 1955.' },
  { u: 'https://en.wikipedia.org/wiki/Carleton_Ravens_football', i: 9,
    text: 'Predictions from NFL executives to local radio personalities pointed to a Ravens victory.' },
];
const BIRD_ANSWER = [
  'Ravens and crows are both members of the Corvidae family.',
  'Ravens are generally larger than crows, with a heavier bill and a wedge-shaped tail.',
  'Both birds are known for problem-solving and tool use.',
];

test('a bird answer over football "Ravens" passages is VOID — nothing traces, so it is not supported', () => {
  const verd = supportVerdict(groundSummary(groundSpans(BIRD_ANSWER, { passages: FOOTBALL_PASSAGES })));
  assert.equal(verd.kind, 'void');
  assert.equal(verd.supported, false, 'the badge must NOT stand as grounded — the passages are a namesake');
  assert.equal(verd.source, 0, 'not one span of the answer lifts from the football passages');
});

// A genuinely grounded answer: most of its substantive spans lift from the retrieved passages.
const DOLPHIN_PASSAGES = [
  { u: 'https://en.wikipedia.org/wiki/Dolphin', i: 12, text: 'Dolphins range in sizes from the 1.7-metre-long Maui\'s dolphin to the 9.5 m orca.' },
  { u: 'https://en.wikipedia.org/wiki/Dolphin', i: 40, text: 'Dolphins are social animals living in groups called pods.' },
];

test('an answer built from its passages is SOURCED and supported', () => {
  const answer = [
    'Dolphins are social animals living in groups called pods.',              // sourced
    'They range in size from the small Maui\'s dolphin to the much larger orca.', // sourced
    'This sociality shapes how they hunt together.',                          // void (the model\'s own)
  ];
  const verd = supportVerdict(groundSummary(groundSpans(answer, { passages: DOLPHIN_PASSAGES })));
  assert.equal(verd.kind, 'sourced');
  assert.equal(verd.supported, true);
  assert.ok(verd.ratio >= SUPPORT_FLOOR, 'a real share of the substantive claims stands on a source');
});

test('mostly-void, one grounded span among many assertions is PARTIAL — under the floor, not supported', () => {
  const answer = [
    'Dolphins are social animals living in groups called pods.',   // sourced (1)
    'They are widely regarded as highly intelligent.',             // void assertion
    'Some cultures have long revered them.',                       // void assertion
    'Their echolocation is remarkably precise.',                   // void assertion
    'They have featured in art for centuries.',                    // void assertion
  ];
  const verd = supportVerdict(groundSummary(groundSpans(answer, { passages: DOLPHIN_PASSAGES })));
  assert.equal(verd.kind, 'partial');
  assert.equal(verd.supported, false);
  assert.ok(verd.ratio < SUPPORT_FLOOR, '1 of 5 substantive claims traces to a passage — below the floor');
});

test('a SHORT answer is not demoted on ratio alone — one grounded claim keeps it supported', () => {
  const answer = [
    'Dolphins are social animals living in groups called pods.',   // sourced (1)
    'They are also very intelligent.',                             // void assertion
  ];
  const s = groundSummary(groundSpans(answer, { passages: DOLPHIN_PASSAGES }));
  const verd = supportVerdict(s);
  assert.ok(s.source + s.assertion < 3, 'fewer than the minimum claims to judge on ratio');
  assert.equal(verd.supported, true, 'too short to demote on ratio — the one grounded claim stands');
});

test('a SHORT answer that traces to nothing is still VOID — the pure-void gate has no length floor', () => {
  const answer = ['Dolphins have inspired poets for many centuries.'];   // no dolphin passage carries it
  const verd = supportVerdict(groundSummary(groundSpans(answer, { passages: DOLPHIN_PASSAGES })));
  assert.equal(verd.kind, 'void');
  assert.equal(verd.supported, false);
});

test('nothing substantive to judge is a no-op — never falsely demoted', () => {
  const verd = supportVerdict(groundSummary(groundSpans(['In addition,', 'And so,'], { passages: DOLPHIN_PASSAGES })));
  assert.equal(verd.supported, true, 'pure connective scaffolding is not a grounding failure');
});

test('the floor is applied on the SUBSTANTIVE claims, not every span — connectives do not drag it down', () => {
  // Two sourced claims + one connective: connectives are excluded from the denominator, so the
  // verdict is a clean 2/2, not 2/3. A fluent, well-grounded answer is not punished for its glue.
  const answer = [
    'Dolphins are social animals living in groups called pods.',   // sourced
    'In addition,',                                                // connective (excluded)
    'they range in size from the Maui\'s dolphin to the orca.',    // sourced
  ];
  const s = groundSummary(groundSpans(answer, { passages: DOLPHIN_PASSAGES }));
  const verd = supportVerdict(s);
  assert.equal(verd.claims, 2, 'the connective is not counted as a substantive claim');
  assert.equal(verd.ratio, 1);
  assert.equal(verd.supported, true);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sectionAnswer, renderSectioned } from '../src/reader/section-answer.js';

// The MECHANICAL answer sectioner (prototype, not yet wired). The talker writes flat grounded
// prose; the machine that re-reads the answer segments it on the entity-field shift and labels
// each segment from the discourse leads — so headings are an OUTPUT of the reading, not an
// instruction the (small) model has to follow.

const LONG = `The Spirit of St. Louis had no forward windshield; a large fuel tank sat directly ahead of the cockpit, blocking the pilot's forward view entirely. He relied on instruments such as a magnetic compass and an earth-inductor compass to hold his heading when visibility was limited. To see ahead, Lindbergh used a periscope mounted on the left side of the fuselage. He could also bank the aircraft and look out through the side windows.`;

test('a short answer is not sectioned — one idea, a tight paragraph', () => {
  const r = sectionAnswer('Charles Lindbergh made the first solo nonstop transatlantic flight in 1927.');
  assert.equal(r.sectioned, false);
  assert.equal(r.sections.length, 1);
  assert.equal(r.sections[0].heading, null);
});

test('a multi-topic answer is sectioned, and the first segment stays heading-less (the lead)', () => {
  const r = sectionAnswer(LONG, { leads: ['periscope', 'compass', 'instruments', 'windows'] });
  assert.equal(r.sectioned, true);
  assert.equal(r.sections[0].heading, null, 'the direct-answer lead carries no heading');
  const headed = r.sections.filter((s) => s.heading);
  assert.ok(headed.length >= 1, 'at least one segment earns a heading');
  for (const s of headed) assert.match(s.heading, /^[A-Z][\w' -]*$/, 'headings are short title-case phrases');
});

test('headings are earned — drawn from the discourse leads when they land in a segment', () => {
  const r = sectionAnswer(LONG, { leads: ['periscope', 'compass'] });
  const labels = r.sections.map((s) => s.heading).filter(Boolean).map((h) => h.toLowerCase());
  assert.ok(labels.some((h) => /periscope|compass/.test(h)), 'a lead surfaces as a heading');
});

test('renderSectioned emits ## before labelled segments only', () => {
  const r = sectionAnswer(LONG, { leads: ['periscope', 'compass'] });
  const md = renderSectioned(r);
  assert.match(md, /\n## /);                       // at least one heading rendered
  assert.doesNotMatch(md.split('\n')[0], /^## /);  // the lead paragraph is not a heading
});

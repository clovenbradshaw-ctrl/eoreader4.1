import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  composeEssay, planMessages, planOutline, parseOutline, sectionMessages, countWords, ESSAY_MIN_WORDS,
} from '../src/organs/out/essay.js';
import { essay } from '../src/organs/out/index.js';

// A stub talker: it never sees a real model. The planner request (it carries the strict
// "TITLE:" system line) gets a small outline back; every other request is a section, answered
// with `wordsPerSection` words of filler keyed to the section's heading so each section carries
// DISTINCT content — otherwise the novelty gate (correctly) drops sections that only restate.
// This makes the walk deterministic so we can assert it lands and terminates. `onToken` is
// exercised so the streaming contract is covered too.
const stubTalker = (wordsPerSection = 200) => {
  let calls = 0;
  const talker = async (messages, opts = {}) => {
    calls += 1;
    const sys = messages.find((m) => m.role === 'system')?.content || '';
    const usr = messages.find((m) => m.role === 'user')?.content || '';
    let text;
    if (/planning a long-form essay/i.test(sys)) {
      text = 'TITLE: On the Sea\n1. Introduction\n2. The tides\n3. The deep\n4. Conclusion';
    } else {
      // A slug unique to this heading (and to the running call count for extensions) so every
      // section's content words are distinct — the walk keeps them all.
      const heading = (usr.match(/heading: "([^"]+)"/) || [])[1] || `s${calls}`;
      const slug = (heading.toLowerCase().replace(/[^a-z]+/g, '') || `sec${calls}`) + calls;
      text = Array.from({ length: wordsPerSection }, (_, i) => `${slug}tok${i}`).join(' ') + '.';
    }
    if (typeof opts.onToken === 'function') for (const t of text.split(' ')) opts.onToken(t + ' ');
    return text;
  };
  talker.calls = () => calls;
  return talker;
};

test('parseOutline reads a strict planner reply', () => {
  const { title, headings } = parseOutline('TITLE: On the Sea\n1. The tides\n2. The deep\n3. Conclusion', 'the sea');
  assert.equal(title, 'On the Sea');
  assert.deepEqual(headings, ['The tides', 'The deep', 'Conclusion']);
});

test('planOutline pulls the conclusion out and pads a thin plan without a second opener', () => {
  const plan = planOutline('TITLE: X\n1. Intro\n2. Conclusion', 'topic x');
  assert.equal(plan.title, 'X');
  assert.equal(plan.conclusion, 'Conclusion');
  assert.ok(!plan.body.some((h) => /conclu/i.test(h)), 'conclusion is not left in the body');
  assert.ok(plan.body.length >= 3, 'a thin plan is padded to a real body');
  assert.equal(plan.body[0], 'Intro', 'the planner\'s opener stays the opener');
  assert.ok(!plan.body.slice(1).some((h) => /^(?:introduction|background)/i.test(h)),
    'no opener-role heading is backfilled after the planner\'s opener (the doubled-intro cure)');
});

test('planOutline falls back to a full arc when the planner returns nothing', () => {
  const plan = planOutline('', 'dolphins');
  assert.equal(plan.title, 'Dolphins');
  assert.ok(plan.body.length >= 5, 'the default arc supplies a body');
  assert.equal(plan.conclusion, 'Conclusion');
});

test('sectionMessages marks the arc move (open / develop / land)', () => {
  const open = sectionMessages({ topic: 't', title: 'T', heading: 'Intro', role: 'open' });
  assert.match(open[1].content, /OPENING/);
  const land = sectionMessages({ topic: 't', title: 'T', heading: 'Conclusion', role: 'land' });
  assert.match(land[1].content, /CONCLUSION/);
});

test('composeEssay walks the arc, gates each section, and lands on a conclusion', async () => {
  // Length is emergent (saturation-governed), not measured against a floor — with distinct
  // content every section is kept, the walk extends toward the aspiration, and it lands.
  const talker = stubTalker(120);
  const res = await composeEssay({ topic: 'the sea', talker });
  assert.equal(res.aborted, false);
  const last = res.sections[res.sections.length - 1];
  assert.equal(last.heading, 'Conclusion', 'the walk always lands on a conclusion');
  assert.equal(last.role, 'land');
  assert.match(res.text, /^# On the Sea/, 'the piece opens with the title as an h1');
  assert.ok(res.sections.every((s) => s.words > 0), 'no empty section survives into the essay');
  assert.ok(Array.isArray(res.trace) && res.trace.length >= res.sections.length,
    'the length-decision trace records every section, kept or dropped');
});

test('composeEssay terminates on a stalled talker instead of looping to the cap', async () => {
  // A talker that returns nothing for sections: the stall guard must stop the walk.
  const deadTalker = async (messages) => {
    const sys = messages.find((m) => m.role === 'system')?.content || '';
    return /planning a long-form essay/i.test(sys) ? 'TITLE: Void\n1. Intro\n2. Conclusion' : '';
  };
  const res = await composeEssay({ topic: 'nothing', talker: deadTalker });
  assert.ok(res.sections.length <= 4, 'a dead talker does not drive the walk to the section cap');
  assert.equal(res.metWords, false);
});

test('composeEssay respects an abort signal', async () => {
  const ctl = new AbortController();
  let n = 0;
  const talker = async (messages, opts) => {
    const sys = messages.find((m) => m.role === 'system')?.content || '';
    if (/planning a long-form essay/i.test(sys)) return 'TITLE: A\n1. Intro\n2. Body\n3. Conclusion';
    if (++n === 1) ctl.abort();                 // abort after the first section
    return Array.from({ length: 100 }, (_, i) => `w${i}`).join(' ');
  };
  const res = await composeEssay({ topic: 'x', talker, signal: ctl.signal });
  assert.equal(res.aborted, true);
  assert.ok(res.words < ESSAY_MIN_WORDS, 'an aborted walk stops short of the floor');
});

test('the essay is emitted across many messages — kept sections close, dropped ones retract', async () => {
  const talker = stubTalker(200);
  const plans = [];
  const sectionEnds = [];
  const opens = [];
  const drops = [];
  const res = await composeEssay({
    topic: 'the sea',
    talker,
    hooks: {
      onPlan: (p) => plans.push(p),
      onSection: (s) => opens.push(s),
      onSectionEnd: (s) => sectionEnds.push(s),
      onSectionDrop: (d) => drops.push(d),
    },
  });
  // The plan is announced exactly once, before any section.
  assert.equal(plans.length, 1);
  assert.ok(plans[0].title && Array.isArray(plans[0].outline));
  // More than one message; onSectionEnd pairs 1:1 with the KEPT sections in the result.
  assert.ok(sectionEnds.length > 1, 'the essay spans multiple section messages');
  assert.equal(sectionEnds.length, res.sections.length, 'onSectionEnd fires once per kept section');
  // Every opened beat resolves exactly once — it either closes (kept) or retracts (dropped).
  assert.equal(opens.length, sectionEnds.length + drops.length, 'each opened section closes or retracts');
  // onSectionEnd carries a running total that only grows.
  for (let i = 1; i < sectionEnds.length; i++) {
    assert.ok(sectionEnds[i].total >= sectionEnds[i - 1].total, 'the running total only grows');
  }
  // The per-message texts concatenate to the sections in the assembled essay.
  assert.deepEqual(sectionEnds.map((s) => s.text), res.sections.map((s) => s.text));
});

test('a lens config is threaded into each section talker pass (not the plan)', async () => {
  const seen = [];
  const lens = { relevance: 'sea', enabled: true };
  const talker = async (messages, opts = {}) => {
    const sys = messages.find((m) => m.role === 'system')?.content || '';
    const isPlan = /planning a long-form essay/i.test(sys);
    seen.push({ isPlan, lens: opts.lens || null });
    return isPlan ? 'TITLE: Sea\n1. Intro\n2. Conclusion' : Array.from({ length: 200 }, (_, i) => `w${i}`).join(' ');
  };
  await composeEssay({ topic: 'the sea', talker, lens });
  const planCall = seen.find((c) => c.isPlan);
  const sectionCalls = seen.filter((c) => !c.isPlan);
  assert.equal(planCall.lens, null, 'the planning pass is left unsteered');
  assert.ok(sectionCalls.length > 0 && sectionCalls.every((c) => c.lens === lens), 'every section pass carries the lens');
});

test('research ground is woven into the plan and every section, but not the parametric prompts', () => {
  const src = ['Dolphins are marine mammals of the order Cetacea.', 'They use echolocation to hunt.'];
  // With sources: both the plan and a section carry the gathered material.
  const plan = planMessages('dolphins', { sources: src });
  assert.match(plan[1].content, /Research has gathered/);
  assert.match(plan[1].content, /echolocation/);
  const sec = sectionMessages({ topic: 'dolphins', title: 'D', heading: 'Intro', role: 'open', sources: src });
  assert.match(sec[0].content, /Ground the section in the provided source material/);
  assert.match(sec[1].content, /order Cetacea/);
  // Without sources (the default): the prompts are byte-identical to the unresearched organ.
  assert.equal(planMessages('dolphins').at(-1).content, planMessages('dolphins', { sources: null }).at(-1).content);
  assert.equal(
    sectionMessages({ topic: 'dolphins', title: 'D', heading: 'Intro', role: 'open' })[1].content,
    sectionMessages({ topic: 'dolphins', title: 'D', heading: 'Intro', role: 'open', sources: [] })[1].content,
  );
});

test('composeEssay grounds the walk in research excerpts and reports it', async () => {
  const seen = [];
  const talker = async (messages, opts = {}) => {
    const sys = messages.find((m) => m.role === 'system')?.content || '';
    const usr = messages.find((m) => m.role === 'user')?.content || '';
    const isPlan = /planning a long-form essay/i.test(sys);
    seen.push({ isPlan, usr });
    if (isPlan) return 'TITLE: On Dolphins\n1. Introduction\n2. Echolocation\n3. Conclusion';
    return Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ') + '.';
  };
  const ground = [
    'Dolphins are highly intelligent marine mammals that live in social pods.',
    'They navigate and hunt using echolocation, emitting clicks and reading the echoes.',
  ];
  const res = await composeEssay({ topic: 'write me an essay on dolphins', talker, ground });
  assert.equal(res.grounded, true, 'the result reports it was grounded');
  assert.ok(res.sourceCount >= 1, 'it counts the sources it grounded on');
  // Every talker pass (plan + sections) saw the gathered material.
  assert.ok(seen.length > 1);
  assert.ok(seen.every((c) => /echolocation/.test(c.usr)), 'each pass carries the research ground');
});

test('composeEssay stays parametric (grounded:false) when no ground is supplied', async () => {
  const talker = stubTalker(120);
  const res = await composeEssay({ topic: 'the sea', talker });
  assert.equal(res.grounded, false);
  assert.equal(res.sourceCount, 0);
});

test('the organ is re-exported as a namespace off organs/out', () => {
  assert.equal(typeof essay.composeEssay, 'function');
  assert.equal(essay.ESSAY_MIN_WORDS, ESSAY_MIN_WORDS);
});

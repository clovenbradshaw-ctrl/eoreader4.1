// essay-gates — the sourceless arc gates ported into the essay organ.
//
// These pin the three disciplines src/arc/ enforces with a corpus, reproduced here for the
// ungrounded essay surface: strike unwitnessed evidence, drop a section that only restates, and
// hold an objection's stance. The fixtures are the ACTUAL fabricated / repeated / conceding
// prose the dolphins essay produced — the failure these gates exist to catch.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  sentencesOf, evidenceVeto, EVIDENCE_SHAPES,
  contentWords, sectionNovelty,
  isAgainstHeading, concessionSplit,
  planOutline, composeEssay,
} from '../src/organs/out/essay.js';

// ── evidenceVeto: strike the unwitnessed claim ─────────────────────────────────

test('the veto strikes each fabrication the dolphins essay invented, and keeps honest prose', () => {
  const fabrications = [
    'The Mediterranean bottlenose population has declined by as much as 60% since the 1980s.',
    'A study published in the journal Science found a decline in Gulf of Mexico dolphins.',
    'The World Wildlife Fund estimates that up to 30% of coral reefs have been lost.',
    'A study conducted at the Dolphin Research Center revealed the pod chose to starve itself.',
    'According to the WWF, noise pollution disorients dolphins.',
    'Researchers at the Dolphin Research Center observed self-sacrifice.',
  ];
  for (const s of fabrications) {
    const v = evidenceVeto(s);
    assert.equal(v.struck.length, 1, `should strike: ${s}`);
    assert.equal(v.kept, '', 'nothing survives a pure-fabrication sentence');
  }
});

test('the veto leaves honest, sourceless prose intact', () => {
  const honest = 'Dolphins are intelligent, social mammals. They use signature whistles to identify one another, and they hunt cooperatively. Culture — behaviour passed between generations — has been described in several populations.';
  const v = evidenceVeto(honest);
  assert.equal(v.struck.length, 0, 'general knowledge asserts no unwitnessed evidence');
  assert.equal(v.boundFraction, 1);
});

test('the veto surgically removes only the fabricated sentence from a mixed paragraph', () => {
  const mixed = 'Dolphins form long-term bonds. A study published in Nature found this bond lasts decades. Their sociality is well documented.';
  const v = evidenceVeto(mixed);
  assert.equal(v.struck.length, 1);
  assert.match(v.kept, /form long-term bonds/);
  assert.match(v.kept, /well documented/);
  assert.doesNotMatch(v.kept, /published in Nature/);
});

test('the percentage and according-to shapes match despite word-boundary and case pitfalls', () => {
  // Regressions: "%" is not a \w so a trailing \b never matches; "According" at sentence start is
  // capitalised so a case-sensitive \baccording misses it.
  assert.ok(EVIDENCE_SHAPES.some((re) => re.test('lost 60% of the reef')));
  assert.ok(EVIDENCE_SHAPES.some((re) => re.test('According to the WWF, this is true')));
  assert.ok(EVIDENCE_SHAPES.some((re) => re.test('according to the WWF mid-sentence')));
});

test('sentencesOf isolates each sentence for the gates', () => {
  const s = sentencesOf('One claim here. A second claim. And a third!');
  assert.equal(s.length, 3);
});

// ── sectionNovelty: the sourceless coverage gate ───────────────────────────────

test('content words drop stopwords and short tokens', () => {
  const cw = contentWords('The dolphins that they have with them are here.');
  assert.ok(cw.has('dolphins'));
  assert.ok(!cw.has('that') && !cw.has('they') && !cw.has('have'));
});

test('a restating section scores low novelty against the ledger; a fresh one scores high', () => {
  const ledger = contentWords('Dolphins are intelligent and social, forming complex cultural pods.');
  const restate = sectionNovelty('Dolphins are intelligent and social, forming complex cultural pods indeed.', ledger);
  const fresh = sectionNovelty('Ocean acidification threatens the coral reefs where prey species shelter and spawn.', ledger);
  assert.ok(restate < 0.3, `a restatement is low-novelty, got ${restate.toFixed(2)}`);
  assert.ok(fresh > 0.6, `a new line is high-novelty, got ${fresh.toFixed(2)}`);
});

test('an empty ledger makes the opening all fresh; empty text is zero', () => {
  assert.equal(sectionNovelty('anything at all here', new Set()), 1);
  assert.equal(sectionNovelty('', contentWords('some ledger')), 0);
});

// ── the stance gate: an objection must oppose ──────────────────────────────────

test('isAgainstHeading recognises the objection move', () => {
  assert.ok(isAgainstHeading('The Strongest Case Against It'));
  assert.ok(isAgainstHeading('Objections considered'));
  assert.ok(isAgainstHeading('Where it fails'));
  assert.ok(!isAgainstHeading('The central argument'));
});

test('concessionSplit cuts an against-section at the point it caves', () => {
  const caves = concessionSplit('Dolphins may not adapt to a warming ocean. This is not to say that they are not worthy of protection.');
  assert.equal(caves.conceded, true);
  assert.match(caves.kept, /may not adapt/);
  assert.doesNotMatch(caves.kept, /worthy of protection/);
  const holds = concessionSplit('Their intelligence does not guarantee survival, and conservation dollars may be better spent elsewhere.');
  assert.equal(holds.conceded, false);
});

// ── planOutline: the doubled-intro cure ────────────────────────────────────────

test('a real plan is never given a second Introduction (the scaffold-leak bug)', () => {
  const p = planOutline('TITLE: On Dolphins\n1. The Intelligent and Social Nature\n2. The Case For\n3. The Case Against\n4. Conclusion', 'dolphins');
  assert.deepEqual(p.body, ['The Intelligent and Social Nature', 'The Case For', 'The Case Against']);
  assert.ok(!p.body.some((h) => /^introduction$/i.test(h)), 'no duplicate opener is backfilled');
});

test('a thin plan is padded with develop moves only — never a second opener', () => {
  const p = planOutline('TITLE: X\n1. Intro\n2. Conclusion', 'topic x');
  assert.ok(p.body.length >= 3, 'padded to a real body');
  assert.equal(p.body[0], 'Intro', 'the planner\'s opener stays the opener');
  assert.ok(!p.body.slice(1).some((h) => /^(?:introduction|background)/i.test(h)), 'no opener-role heading is appended');
});

test('a bodiless plan walks the full neutral arc (opener included)', () => {
  const p = planOutline('', 'dolphins');
  assert.equal(p.body[0], 'Introduction');
  assert.ok(p.body.length >= 5);
});

// ── the walk under a pathological talker ───────────────────────────────────────
// A stub that reproduces all three small-model pathologies at once: fabricates a statistic,
// concedes in the against-section, and otherwise repeats one paragraph. The gates must produce a
// clean, non-repeating, non-conceding, non-fabricating piece that still lands on a conclusion.

const pathologicalTalker = () => async (messages, opts = {}) => {
  const sys = messages.find((m) => m.role === 'system')?.content || '';
  const usr = messages.find((m) => m.role === 'user')?.content || '';
  const isRevise = /Revise your approach/.test(usr);
  // Key off the precise `heading: "…"` marker — the outline is embedded in every section prompt,
  // so matching on heading words alone would serve the wrong paragraph.
  const heading = (usr.match(/heading: "([^"]+)"/) || [])[1] || '';
  let text;
  if (/planning a long-form essay/i.test(sys)) {
    text = 'TITLE: On Dolphins\n1. Intelligence and society\n2. The case for protection\n3. The case against protection\n4. Conclusion';
  } else if (heading === 'Conclusion') {
    text = 'Weighing the intelligence of these animals against the hard arithmetic of triage, the case for protecting dolphins holds on balance, though the objection sharpens exactly where scarce effort should be spent. What remains, after the noise, is the harder work of choosing well among competing and legitimate claims on finite conservation attention.';
  } else if (heading === 'Intelligence and society') {
    text = 'Dolphins coordinate their hunts, teach one another foraging techniques, and maintain signature whistles that function much as names do for us. Their societies show a fission-fusion structure, durable alliances among males, and behaviours transmitted culturally rather than genetically across successive generations, which together mark a cognitive life of real depth and flexibility.';
  } else if (heading === 'The case for protection') {
    text = 'A population lost to bycatch is not recoverable on any human timescale, and the role these predators play near the top of the web helps stabilise the fisheries that coastal economies quietly depend upon. Protecting the apex protects the whole column beneath it, so even the coldly utilitarian ledger favours conservation well before ethics is allowed to enter the room.';
  } else if (/ADVERSARIAL/.test(usr)) {
    // First adversarial pass concedes; the corrective regen (carrying the stance directive) holds.
    text = isRevise
      ? 'Conservation budgets are finite, and dolphins are charismatic megafauna that crowd out less photogenic but far more imperilled species in every funding decision. Each dollar routed to a dolphin sanctuary is a dollar denied to amphibians and freshwater molluscs collapsing several times faster. Cold triage, not aesthetic sentiment, should govern how scarce protection is rationed across the tree of life.'
      : 'Dolphins face real threats in a changing ocean. This is not to say that they are not worthy of protection, of course they are, and the overwhelming evidence supports safeguarding them wherever we reasonably can afford it.';
  } else {
    // The confabulating default: a fabricated statistic wrapped in filler.
    text = 'The Mediterranean bottlenose population has declined by as much as 60% since the 1980s according to the WWF. The situation is dire, and it demands sustained attention from every quarter of a distracted and forgetful society.';
  }
  if (typeof opts.onToken === 'function') for (const t of text.split(' ')) opts.onToken(t + ' ');
  return text;
};

test('the walk assembles a clean piece from a fabricating, repeating, conceding talker', async () => {
  const drops = [];
  const res = await composeEssay({
    topic: 'write me an essay on dolphins',
    talker: pathologicalTalker(),
    hooks: { onSectionDrop: (d) => drops.push(d) },
  });

  // No fabrication survives anywhere in the assembled text.
  assert.doesNotMatch(res.text, /60%/, 'the fabricated statistic is struck from the whole piece');
  assert.doesNotMatch(res.text, /according to the WWF/i);

  // The against section did not cave: no concession phrase survives it.
  const against = res.sections.find((s) => s.role === 'against');
  assert.ok(against, 'the adversarial section is kept');
  assert.doesNotMatch(against.text, /worthy of protection/i);
  assert.doesNotMatch(against.text, /of course/i);

  // It lands on a conclusion, and the trace is an audit log of why the walk ran as it did.
  assert.equal(res.sections.at(-1).role, 'land');
  assert.ok(Array.isArray(res.trace) && res.trace.length >= res.sections.length);
  assert.ok(res.trace.some((t) => t.status === 'kept'));
});

test('the conclusion still lands even when the gates drop every extension', async () => {
  // A talker that returns the SAME paragraph for every body/extension section after the opener —
  // the novelty gate drops the repeats, saturation stops the walk, and the landing must still fire.
  const repeater = async (messages, opts = {}) => {
    const sys = messages.find((m) => m.role === 'system')?.content || '';
    const usr = messages.find((m) => m.role === 'user')?.content || '';
    let text;
    if (/planning a long-form essay/i.test(sys)) text = 'TITLE: R\n1. Introduction\n2. Body\n3. Conclusion';
    else if (/heading: "Conclusion"/.test(usr)) text = 'Pulling the threads together, the balance of reasoning still favours the modest claim staked at the outset, whatever the noise around it.';
    else text = 'Dolphins are intelligent and social creatures whose cognition, cooperation, and cultural transmission mark them out among marine mammals in ways worth taking seriously and returning to repeatedly here.';
    if (typeof opts.onToken === 'function') for (const t of text.split(' ')) opts.onToken(t + ' ');
    return text;
  };
  const res = await composeEssay({ topic: 'dolphins', talker: repeater });
  assert.equal(res.sections.at(-1).role, 'land', 'the walk lands on a conclusion despite the drops');
  assert.ok(res.sections.some((s) => s.role !== 'land'), 'the floor-of-last-resort keeps a body section');
  assert.ok(res.saturated || res.dropped > 0, 'the walk records that it saturated / dropped repeats');
});

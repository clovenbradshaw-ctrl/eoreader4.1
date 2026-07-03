// essay-fabrication — the two permanent fixtures: the DOLPHINS essay (fabricated statistics and
// institutions) and the MOSQUITO essay (fabricated SCHOLARSHIP — author-date cites, "et al."
// reference lists, expert-attributed quotes — plus fabricated FACT: an invented immunological
// mechanism). Together they exercise the two distinct fabrication paths and the boundary between
// them:
//
//   • the surface VETO (evidenceVeto) strikes fabricated SCHOLARSHIP — a lexical shape gives it
//     away. It runs on the grounded path too, so a fabrication dressed as scholarship is struck
//     even under a "grounded" banner.
//   • the span BINDER (eo-gen.essayBinder, ground/bind.js) strikes fabricated FACT — a claim tied
//     to no source span and making no lexical contact with one. No surface pattern can catch this
//     because the falseness is semantic; only binding to real ingested spans does.
//
// The mosquito essay is the strongest argument for both checks: it wore "grounded in 12 sources"
// while inventing a parallel literature about the very topics its two real Wikipedia sources
// actually covered.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evidenceVeto, composeEssay } from '../src/organs/out/essay.js';
import { essayBinder } from '../src/reader/eo-gen.js';

// ── The mosquito essay's fabricated SCHOLARSHIP — the veto must strike every one ────────────────
// These are the check-resistant shapes the un-patched veto sailed past: parenthetical author-date
// cites, inline "et al." references, and quotes/attributions pinned to named "experts".
const FABRICATED_SCHOLARSHIP = [
  'Mosquito larvae are a key part of the aquatic food web (Williams et al., 2013).',
  'This decline in local populations has been well documented (Patel et al. 2015).',
  'The mechanism was first characterized by Bergland (1984).',
  'A parallel effect was later reported (Lundberg et al., 2005).',
  'As entomologist Thomas R. Unruh has pointed out, the ecological role is underappreciated.',
  'As Dr. Maria Rodriguez notes, the tiger mosquito shapes its local ecosystem in subtle ways.',
  'As noted by Dr. Jane Smith, the larvae are an overlooked link in the chain.',
  '"Mosquitoes are more vital than people realize," says Dr. John Taylor, a biologist.',
  'Research by Kurahashi et al. 2005 supports the same conclusion.',
];

test('the veto strikes every fabricated-scholarship shape the mosquito essay invented', () => {
  for (const s of FABRICATED_SCHOLARSHIP) {
    const v = evidenceVeto(s);
    assert.equal(v.struck.length, 1, `should strike as fabricated scholarship: ${s}`);
    assert.equal(v.kept, '', `nothing survives a pure fabricated-authority sentence: ${s}`);
  }
});

// ── The legitimate-reasoning controls — the veto must leave these untouched ─────────────────────
// This is the boundary: honest argument from general knowledge asserts no unwitnessed authority,
// so it must survive. If these were struck the veto would be gutting real prose.
const LEGITIMATE_REASONING = [
  'A species that sits low in the food web can, when removed, ripple upward in ways that are hard to predict, so its loss is rarely as simple as it looks.',
  'If the larvae feed the fish and the fish feed the birds, then a creature we find merely irritating turns out to be doing quiet ecological work.',
];

test('the veto leaves honest, sourceless reasoning intact (the legitimate controls survive)', () => {
  for (const s of LEGITIMATE_REASONING) {
    const v = evidenceVeto(s);
    assert.equal(v.struck.length, 0, `honest reasoning must survive: ${s}`);
    assert.equal(v.boundFraction, 1);
  }
});

// ── The dolphins essay's fabrications — still struck (no regression) ─────────────────────────────
test('the dolphins essay fixtures still strike (statistics, studies, institutions)', () => {
  const dolphins = [
    'The Mediterranean bottlenose population has declined by as much as 60% since the 1980s.',
    'A study published in the journal Science found a decline in Gulf of Mexico dolphins.',
    'According to the WWF, noise pollution disorients dolphins.',
    'Researchers at the Dolphin Research Center observed self-sacrifice.',
  ];
  for (const s of dolphins) assert.equal(evidenceVeto(s).struck.length, 1, `should strike: ${s}`);
});

// ── Fabricated FACT — the invented mechanism the veto CANNOT catch, but the binder can ──────────
// "The Unlikely Benefits of Mosquito Bites" invented an immunological mechanism. It carries no
// citation shape — it is a fluent false statement — so the surface veto rightly passes it. Only
// binding it against the real sources reveals it rests on nothing.
const FABRICATED_MECHANISM =
  'Tiger-mosquito saliva stimulates antibody production and helps immunocompromised people build lasting resilience against disease.';

// The two real Wikipedia sources' actual, bindable material (Mosquito control · Aedes albopictus).
const MOSQUITO_SPANS = [
  { idx: 3, text: 'Mosquito larvae are an important food source for fish and other aquatic animals in ponds and streams.' },
  { idx: 7, text: 'Ascogregarina taiwanensis is a parasite that infects the larvae of the Asian tiger mosquito, Aedes albopictus.' },
  { idx: 11, text: 'The sterile insect technique releases sterilized males to reduce mosquito populations over successive generations.' },
];

test('the veto passes the fabricated mechanism (its falseness is semantic, not lexical)', () => {
  const v = evidenceVeto(FABRICATED_MECHANISM);
  assert.equal(v.struck.length, 0, 'no surface pattern can flag an invented mechanism — the veto correctly does not');
});

test('the span binder strikes the fabricated mechanism while keeping the bound claim', () => {
  const draft = 'Mosquito larvae are an important food source for fish and other aquatic animals. '
    + FABRICATED_MECHANISM;
  const b = essayBinder(draft, MOSQUITO_SPANS);
  assert.equal(b.struck.length, 1, 'the from-nowhere mechanism sentence is struck');
  assert.match(b.struck[0], /antibody production/);
  assert.match(b.kept, /food source for fish/, 'the sentence that binds to a real span rides');
  assert.doesNotMatch(b.kept, /antibody production/);
  assert.equal(b.boundFraction, 0.5, 'one of two claims tied to a source');
});

test('a wholly bound paragraph keeps every claim; a wholly fabricated one keeps none', () => {
  const allBound = 'Mosquito larvae are an important food source for fish and aquatic animals. '
    + 'The Asian tiger mosquito, Aedes albopictus, is infected by the parasite Ascogregarina taiwanensis.';
  const kb = essayBinder(allBound, MOSQUITO_SPANS);
  assert.equal(kb.struck.length, 0, 'real, bindable prose keeps all its claims');

  const allFake = 'Their saliva rewires the human immune calendar. '
    + 'Blood-meal scattering seeds a counterconditioning response in bystanders.';
  const fb = essayBinder(allFake, MOSQUITO_SPANS);
  assert.equal(fb.struck.length, 2, 'prose grounded in nothing loses every claim');
  assert.equal(fb.kept, '');
  assert.equal(fb.boundFraction, 0);
});

// ── The organ, end to end: a grounded run binds each section and reports the bound share ─────────
test('composeEssay binds each section to real spans, striking fabricated fact and scholarship', async () => {
  // A talker that reproduces BOTH failures in the opener: a bound claim, an invented mechanism,
  // and a fabricated-authority sentence. The corrective regen (carrying the ground + veto fix)
  // returns clean, bound prose, which the walk prefers.
  const talker = async (messages, opts = {}) => {
    const sys = messages.find((m) => m.role === 'system')?.content || '';
    const usr = messages.find((m) => m.role === 'user')?.content || '';
    const isRevise = /Revise your approach/.test(usr);
    const heading = (usr.match(/heading: "([^"]+)"/) || [])[1] || '';
    let text;
    if (/planning a long-form essay/i.test(sys)) {
      text = 'TITLE: On Mosquitoes\n1. Introduction\n2. Conclusion';
    } else if (heading === 'Conclusion') {
      text = 'Weighed whole, the mosquito that feeds the fish and the fish that feed the birds is doing quiet ecological work, and the sterile insect technique shows control need not mean eradication.';
    } else {
      // The opener: first pass mixes a bound claim, a fabricated mechanism, and fabricated
      // scholarship; the regen returns only the bound claims.
      text = isRevise
        ? 'Mosquito larvae are an important food source for fish and other aquatic animals, and the sterile insect technique reduces populations by releasing sterilized males over successive generations.'
        : 'Mosquito larvae are an important food source for fish and other aquatic animals throughout ponds and slow streams. '
          + FABRICATED_MECHANISM + ' '
          + 'As entomologist Thomas R. Unruh has pointed out, the role is underappreciated (Williams et al., 2013).';
    }
    if (typeof opts.onToken === 'function') for (const t of text.split(' ')) opts.onToken(t + ' ');
    return text;
  };

  const ground = MOSQUITO_SPANS.map((s) => ({ text: s.text, i: s.idx, u: 'https://en.wikipedia.org/wiki/Mosquito_control' }));
  const res = await composeEssay({ topic: 'write an essay on the benefits of mosquitoes', talker, ground, bind: essayBinder });

  assert.equal(res.grounded, true, 'the run reports it was grounded');
  assert.equal(typeof res.boundFraction, 'number', 'binding ran, so the bound share is reported (not null)');
  assert.ok(res.boundFraction > 0, 'the kept prose actually bound to the sources');
  // Neither fabrication survives anywhere in the assembled piece.
  assert.doesNotMatch(res.text, /antibody production/, 'the invented mechanism is struck by the binder');
  assert.doesNotMatch(res.text, /Williams et al/, 'the fabricated citation is struck by the veto');
  assert.doesNotMatch(res.text, /entomologist/, 'the fabricated authority is struck by the veto');
  // The bound content rides.
  assert.match(res.text, /food source for fish/, 'the claim tied to a real span survives');
});

test('composeEssay reports boundFraction: null when grounded but no binder is injected', async () => {
  const talker = async (messages, opts = {}) => {
    const sys = messages.find((m) => m.role === 'system')?.content || '';
    if (/planning a long-form essay/i.test(sys)) return 'TITLE: X\n1. Introduction\n2. Conclusion';
    const text = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ') + '.';
    if (typeof opts.onToken === 'function') for (const t of text.split(' ')) opts.onToken(t + ' ');
    return text;
  };
  const res = await composeEssay({ topic: 'the sea', talker, ground: ['A real excerpt about the sea and its tides that is long enough to survive the length filter.'] });
  assert.equal(res.grounded, true, 'prompt-level grounding still reported');
  assert.equal(res.boundFraction, null, 'no binder → no bound share to report (the banner can tell them apart)');
});

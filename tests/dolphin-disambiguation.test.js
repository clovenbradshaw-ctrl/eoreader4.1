import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { leadsOf } from '../src/turn/meta-route.js';

// THE DOLPHINS-DISAMBIGUATION AUDIT (eo-audit "write an essay about dophins").
// "write an essay about dolphins" grounded on the Miami Dolphins, Ecco the Dolphin and the
// Eurocopter Dolphin, and a follow-up "write an essay about this" produced an essay titled
// "Essays on the nature of existence" over dolphin taxonomy. Two leaks, both mechanical:
//
//   1. THE LEADS LEAK. The discourse read's paragraph is prose ABOUT the request — "The user is
//      requesting an essay … which implies …", "essentially … the content I previously wrote". The
//      walk seeded its facet battery with leadsOf(thatParagraph): the paragraph's novel content
//      terms. On a research turn those name what to find out; on a compose/ground turn they are
//      speech-act framing (requesting / implies / essentially / previously / content). Sharpened to
//      "dolphin previously" / "dolphin essentially" they dragged the walk onto namesakes, which the
//      semantic reprieve then kept (dolphin ≈ dolphin regardless of sense). Fix: fold leads into the
//      battery ONLY on route === 'research'; the facet planner carries every other route.
//
//   2. THE SUBJECT LEAK. The essay/walk titled and PLANNED off the raw ask, not the discourse-
//      resolved subject. On the research path the turn is reformulated to a clean subject
//      (q = "dolphin") while ask stays "write an essay about this", which frame-strips only to
//      "This" — and _planFacets("This") handed the small model an empty subject it filled with
//      hallucinated angles ("the nature of existence"). Fix: title/plan off q, keep ask only to read
//      the longform intent.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── 1. The leak source: framing prose surfaces speech-act verbs as its leads ──────────────────────
// The exact discourse-read paragraphs from the audit. leadsOf takes their novel content terms; on
// this kind of paragraph the first ones are the framing verbs, NOT the subject — which is why they
// must never seed the walk off a research route.

test('leadsOf on request-framing prose surfaces speech-act verbs (the leak the reader must gate)', () => {
  const t0 = 'The user is requesting an essay about dolphins, which implies they want a comprehensive ' +
    'and informative piece of writing about these marine mammals.';
  // The typo'd ask ("dophins") is what the read was shown, so "dolphins" is itself novel here.
  assert.deepEqual(leadsOf(t0, { known: 'write an essay about dophins' }).slice(0, 3),
    ['requesting', 'dolphins', 'implies']);

  const t1 = 'The user is essentially asking me to write an essay about the existing content I ' +
    'previously wrote on the topic of dolphins.';
  assert.deepEqual(leadsOf(t1, { known: 'write an essay about this' }).slice(0, 3),
    ['essentially', 'content', 'previously']);
});

// ── 2 & 3. Source contract over BOTH the editable source AND the built artifact ────────────────────
// index.html inlines app.dc.js verbatim (scripts/build-reader.mjs), so a fix that lives only in the
// source but was never rebuilt would ship the old behavior. research-relevance.test.js guards its
// invariants across both files for exactly this reason; these do the same.

// The balanced-brace body of a method, found by its signature opener.
const bodyFrom = (src, opener) => {
  const at = src.indexOf(opener);
  assert.ok(at >= 0, `not found: ${opener}`);
  let i = src.indexOf('{', at), depth = 0;
  for (; i < src.length; i++) { const c = src[i]; if (c === '{') depth++; else if (c === '}' && --depth === 0) break; }
  return src.slice(at, i + 1);
};

for (const page of ['src/reader/app.dc.js', 'index.html']) {
  const src = readFileSync(join(root, page), 'utf8');

  test(`[${page}] the walk folds metacognition leads into the battery ONLY on a research route`, () => {
    const walk = bodyFrom(src, 'async chatResearch(');
    // The leads must be taken behind a route === 'research' guard, never spread unconditionally.
    assert.match(walk, /route===['"]research['"]\s*\)\s*\?\s*\(\(pre\.meta\.leads\)\|\|\[\]\)\s*:\s*\[\]/,
      'leads must be gated by route === "research"');
    assert.doesNotMatch(walk, /\[\s*\.\.\.\(\(\(pre\.meta\.anchorGap\|\|\{\}\)\.missing\)\|\|\[\]\),\s*\.\.\.\(\(pre\.meta\.leads\)\|\|\[\]\)\]/,
      'the old unconditional leads spread must be gone');
  });

  test(`[${page}] the essay + walk title off the resolved subject q, not the raw ask`, () => {
    const essay = bodyFrom(src, 'async _essayReply(');
    const walk = bodyFrom(src, 'async _walkReply(');
    for (const [name, body] of [['_essayReply', essay], ['_walkReply', walk]]) {
      assert.match(body, /const dTitle=this\._docTitle\(q\)/, `${name} must title off q`);
      assert.doesNotMatch(body, /const dTitle=this\._docTitle\(ask\)/, `${name} must not title off ask`);
      // ask is still read for the longform intent / paragraph demand — it is not discarded.
      assert.match(body, /const ask=o\.ask\|\|q/, `${name} must keep ask for the intent read`);
    }
  });
}

// ── 3b. Why titling off the raw ask was the bug: _docTitle on a demonstrative ask degrades ────────
// The real method, run in isolation, shows the gap the fix closes: the raw "…about this" reduces to
// the meaningless "This" (which the planner then filled with hallucinated angles), while the
// discourse-resolved subject reduces to the real "Dolphin".

test('_docTitle: a demonstrative ask degrades to "This"; the resolved subject holds', () => {
  const src = readFileSync(join(root, 'src/reader/app.dc.js'), 'utf8');
  const Cls = new Function(
    'return class H { truncLabel(s,n){ s=String(s); return s.length>n?s.slice(0,n):s; } ' +
    bodyFrom(src, '_docTitle(q){') + ' }')();
  const h = new Cls();
  // The raw follow-up ask: nothing to title with — this is what titling off `ask` produced.
  assert.equal(h._docTitle('write an essay about this'), 'This');
  // The discourse-resolved subject the fix titles off instead.
  assert.equal(h._docTitle('dolphin'), 'Dolphin');
  // The direct path is unchanged: a first-person essay ask still frame-strips to its subject.
  assert.equal(h._docTitle('write an essay about dolphins'), 'Dolphins');
  assert.equal(h._docTitle('write me a report on freshwater dolphins'), 'Freshwater dolphins');
});

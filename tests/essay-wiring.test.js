// The essay-organ WIRING the reader drives (src/reader/app.dc.js _essayReply):
// a spine whose section intents are the research FACETS, a per-section `retrieve`
// that scopes the shared span pool by intent, and the subject pool as the bind
// floor. This is the fix for "a long-form essay came out short and list-like":
// each section drinks its OWN spans, so the piece DEVELOPS across facets instead
// of collapsing to one flowing section that saturates after a paragraph.
//
// It exercises the same call shape _essayReply builds, model-free (the extractive
// floor), so it guards the integration contract without a model in the loop.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runEssay, EKIND } from '../src/essay/index.js';

// A broad subject spread across three facets — the shape of a researched corpus.
const POOL = [
  { idx: 0, text: 'Dolphins are marine mammals that evolved from land-dwelling ancestors around fifty million years ago.' },
  { idx: 1, text: 'The earliest dolphin ancestors were four-legged creatures that gradually adapted to ocean life.' },
  { idx: 2, text: 'Fossil evidence shows dolphins share a common ancestor with modern hippopotamuses.' },
  { idx: 3, text: 'Dolphins communicate through clicks, whistles, and body language in complex social groups.' },
  { idx: 4, text: 'Bottlenose dolphins use signature whistles that function like names within a pod.' },
  { idx: 5, text: 'Dolphin behavior includes cooperative hunting, play, and teaching young to use tools.' },
  { idx: 6, text: 'Several dolphin species face conservation threats from bycatch in commercial fishing nets.' },
  { idx: 7, text: 'The Yangtze river dolphin was declared functionally extinct due to habitat loss and pollution.' },
  { idx: 8, text: 'Conservation programs protect dolphin populations by regulating fishing and reducing ocean noise.' },
];

// A groundNotes-like retrieve: rank the shared pool by term overlap with the
// section intent (what the reader's groundNotes(intent, sources) does), scoped
// per section — exactly the wiring _essayReply injects.
const termsOf = (s) => new Set(String(s).toLowerCase().match(/[a-z]{4,}/g) || []);
const facetRetrieve = (section) => {
  const want = termsOf(section.intent);
  return POOL
    .map((s) => {
      let hit = 0;
      for (const w of termsOf(s.text)) if (want.has(w)) hit++;
      return { ...s, score: hit };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .slice(0, 6);
};

const SPINE = {
  thesis: 'dolphins',
  sections: [
    { id: 'sec:0', intent: 'the origins and evolution of dolphins from land ancestors' },
    { id: 'sec:1', intent: 'dolphin behavior communication and social groups' },
    { id: 'sec:2', intent: 'dolphin conservation threats and protection' },
  ],
};

test('essay wiring: facet intents + per-section retrieve → a developed multi-section essay', async () => {
  const { report, essay, done } = await runEssay({
    spine: SPINE, spans: POOL, retrieve: async (section) => facetRetrieve(section),
  });
  assert.equal(done, true);

  // Every planned facet became an accepted section — the piece DEVELOPS, it does
  // not collapse to one flowing section that saturates. (Bounded spine revision may
  // ADD sections when a bound claim serves the thesis and fits no facet, so it is a
  // floor, not an exact count — the essay grew richer than the three planned facets.)
  const accepted = report.sections.filter((s) => s.state === 'accepted');
  assert.ok(accepted.length >= 3, `all three facets developed into sections (got ${accepted.length})`);
  for (const id of ['sec:0', 'sec:1', 'sec:2']) {
    assert.ok(accepted.some((s) => s.id === id), `facet ${id} developed`);
  }

  // Each section's commitments are bound to spans (the grounding invariant).
  for (const c of report.ledger) assert.ok(c.spanRefs.length >= 1, `${c.claimId} unbound`);

  // The essay spans DIFFERENT facets — evolution, behavior, and conservation each
  // land, in order. This is the "long-form, not a flat list" property: distinct
  // sections drew distinct spans instead of re-serving one fold.
  assert.match(essay, /evolved|ancestor/i);
  assert.match(essay, /communicat|whistle|social/i);
  assert.match(essay, /conservation|extinct|fishing/i);
  assert.ok(essay.search(/ancestor/i) < essay.search(/conservation/i), 'facets land in spine order');
});

test('essay wiring: the spine emits ENTER then ACCEPT per section (the stream contract)', async () => {
  const kinds = [];
  await runEssay({
    spine: SPINE, spans: POOL, retrieve: async (section) => facetRetrieve(section),
    onEvent: (e) => { if (e.kind === EKIND.ENTER || e.kind === EKIND.ACCEPT) kinds.push(`${e.kind}:${e.sectionId}`); },
  });
  // The reader streams on these two events: a heading on ENTER, bound prose on ACCEPT.
  assert.ok(kinds.includes('enter:sec:0') && kinds.includes('accept:sec:0'));
  assert.ok(kinds.indexOf('enter:sec:0') < kinds.indexOf('accept:sec:0'), 'enter precedes accept');
  const accepts = kinds.filter((k) => k.startsWith('accept:'));
  assert.ok(accepts.length >= 3, `one accept per developed section (got ${accepts.length})`);
});

test('essay wiring: a thin reading stops honestly, it does not fabricate sections', async () => {
  // Only origin spans exist; the behavior and conservation facets have nothing to
  // bind, so they must NOT ship padded — the honest-floor the design promises.
  const THIN = POOL.slice(0, 3);
  const { report } = await runEssay({
    spine: SPINE, spans: THIN, retrieve: async (section) => {
      const want = termsOf(section.intent);
      return THIN.filter((s) => { for (const w of termsOf(s.text)) if (want.has(w)) return true; return false; });
    },
  });
  const accepted = report.sections.filter((s) => s.state === 'accepted');
  // At least the origin facet develops; the groundless facets are not shipped as prose.
  assert.ok(accepted.length >= 1, 'the grounded facet develops');
  for (const s of accepted) assert.ok((s.commitments || []).every((c) => c.spanRefs.length >= 1), 'no unbound commitment ships');
});

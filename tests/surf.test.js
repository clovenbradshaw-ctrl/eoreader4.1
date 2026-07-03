import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { surfFold } from '../src/surfer/index.js';
import { readingAt } from '../src/perceiver/index.js';
import { stages } from '../src/turn/stages.js';
import { runTurn } from '../src/turn/pipeline.js';
import { createAuditLog } from '../src/audit/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import '../src/model/echo.js';
import { createModel } from '../src/model/interface.js';

// docs/surfing-the-fold.md — the surfer reads a field the reading already maintains
// and steps down its gradient. Nothing is selected; every axis is read off physics.

const STORY = 'Grete Vale entered. Grete sat. Grete read. Gregor Pike arrived. ' +
              'Gregor coughed. Gregor waited. Otto Stein knocked. Otto left. ' +
              'Otto returned. Mara Cole spoke. Mara left.';

test('surfFold returns the documented shape and rides the bayesian-figure field', () => {
  const doc = parseText(STORY, { docId: 's' });
  const surf = surfFold(doc, 1);
  for (const k of ['anchor', 'stops', 'peak', 'focus', 'field', 'recCursors', 'rode']) {
    assert.ok(k in surf, `surf has ${k}`);
  }
  assert.equal(surf.rode, 'bayesian-figure');
  assert.ok(Array.isArray(surf.stops) && surf.stops.length > 0);
});

test('the anchor is always a stop; every REC cursor is always a stop', () => {
  const doc = parseText(STORY, { docId: 's' });
  const surf = surfFold(doc, 1);
  assert.ok(surf.stops.includes(surf.anchor), 'retrieval set the surfer down at the anchor');
  for (const c of surf.recCursors) {
    assert.ok(surf.stops.includes(c), `a frame broke at ${c}, so it is a stop`);
  }
});

// §4/§11 — the surfer's frame axis now feeds CONTRIB (the per-dimension bayesBy), so a
// local REC restructures ALONG the straining axis, not whatever figures were merely in
// view. The document readers already had this parity; the surfer's own loop had skipped
// it. This is the test that would have caught the gap: without contrib fed, the loop's
// axis is empty and `alongAxis` comes back empty on every REC.
test('the surfer feeds contrib — each REC carries the straining axis (directional strain)', () => {
  const doc = parseText(STORY, { docId: 's' });
  const surf = surfFold(doc, 1);
  assert.ok(surf.recCursors.length > 0, 'STORY breaks at least one local frame');
  assert.ok(Array.isArray(surf.recAxes) && surf.recAxes.length > 0, 'every REC carries a directional record');
  for (const r of surf.recAxes) {
    assert.ok(Number.isInteger(r.cursor) && typeof r.layer === 'string' &&
              (r.trigger === 'accumulation' || r.trigger === 'impulse') && Array.isArray(r.alongAxis),
      'a recAxis carries { cursor, layer, trigger, alongAxis }');
  }
  // the records cover exactly the REC cursors (deduped over layers)
  assert.deepEqual([...new Set(surf.recAxes.map(r => r.cursor))].sort((a, b) => a - b), surf.recCursors);
  // the parity itself: contrib reached the loop, so at least one REC names a real straining
  // axis — without it the REC would fall back to the in-view terms and `alongAxis` is empty.
  assert.ok(surf.recAxes.some(r => r.alongAxis.length > 0),
    'contrib reached the surfer loop — a REC names the dimensions belief moved along');
});

test('the peak is the steepest stop — where the significance reading is taken', () => {
  const doc = parseText(STORY, { docId: 's' });
  const surf = surfFold(doc, 1);
  const bayesAt = (c) => readingAt(doc, c).bayes;
  for (const c of surf.stops) {
    assert.ok(bayesAt(surf.peak) >= bayesAt(c), `peak ${surf.peak} is at least as steep as stop ${c}`);
  }
});

test('the field trace covers the reach with warmth, surprise, and novelty per cursor', () => {
  const doc = parseText(STORY, { docId: 's' });
  const surf = surfFold(doc, 5, { behind: 2, ahead: 3 });
  const idxs = surf.field.map(f => f.idx);
  assert.deepEqual(idxs, [3, 4, 5, 6, 7, 8], 'a little behind, mostly ahead');
  for (const f of surf.field) {
    assert.ok('focus' in f && typeof f.bayes === 'number' && typeof f.surprisalBits === 'number');
  }
});

test('the surf is deterministic — same document, same anchor, same path', () => {
  const doc = parseText(STORY, { docId: 's' });
  assert.equal(JSON.stringify(surfFold(doc, 1)), JSON.stringify(surfFold(doc, 1)));
});

// The arrest threshold can be the DERIVED VOID BOUNDARY (read/voidnull.js) instead of the
// reach median: with opts.alpha set, a cursor arrests only when its bayes beats the noise
// null its own context throws up by chance, and every reach cursor carries a SYN/NUL verdict
// so absence is a record. The default (no alpha) stays byte-identical — the parallel golden.
test('opt-in VOID-boundary arrest tags SYN/NUL per cursor; the default median path is unchanged', () => {
  const doc = parseText(STORY, { docId: 's' });
  const base = surfFold(doc, 1);
  const bnd  = surfFold(doc, 1, { alpha: 0.05 });

  // the default path is untouched
  assert.equal(base.rode, 'bayesian-figure');
  assert.ok(base.field.every(f => f.verdict === undefined), 'no verdict on the default (median) path');

  // the boundary path labels itself and tags every reach cursor with a verdict
  assert.equal(bnd.rode, 'bayesian-void');
  assert.ok(bnd.field.length > 0 && bnd.field.every(f => f.verdict === 'SYN' || f.verdict === 'NUL'),
    'every reach cursor carries a SYN/NUL verdict against the derived null');

  // the surf contract holds in boundary mode, and only SYN (or the forced anchor/REC) arrests
  assert.ok(bnd.stops.includes(bnd.anchor), 'the anchor is always a stop');
  for (const c of bnd.recCursors) assert.ok(bnd.stops.includes(c), `a frame broke at ${c}, so it is a stop`);
  const forced = new Set([bnd.anchor, ...bnd.recCursors]);
  for (const c of bnd.stops) {
    if (forced.has(c)) continue;
    assert.equal(bnd.field.find(x => x.idx === c)?.verdict, 'SYN', `arrested cursor s${c} beat the null`);
  }
  // deterministic, like the default surf
  assert.equal(JSON.stringify(surfFold(doc, 1, { alpha: 0.05 })), JSON.stringify(bnd));
});

test('an empty document surfs to a safe empty result', () => {
  const surf = surfFold({ sentences: [] }, 0);
  assert.deepEqual(surf.stops, []);
  assert.equal(surf.rode, 'bayesian-figure');
});

// The fold stage uses the surfer: the significance reading is taken at the peak, and
// any high-significance line retrieval missed is folded in as a citable span.
test('the fold stage folds surfed stops retrieval missed into the spans (via surf, citable)', async () => {
  const doc = parseText(STORY, { docId: 's' });
  // Retrieval gave only the first line; the surfer should pull in later movers.
  const ctx = { doc, spans: [{ idx: 0, text: doc.sentences[0], score: 1 }] };
  const out = await stages.fold(ctx);

  assert.ok(out.surf && out.surf.rode === 'bayesian-figure', 'the surf rides on the context');
  const surfed = out.spans.filter(s => s.via === 'surf');
  assert.ok(surfed.length > 0, 'lines retrieval missed are folded in');
  assert.ok(surfed.every(s => Number.isInteger(s.idx) && doc.sentences[s.idx] === s.text),
    'each surfed span has a real index + verbatim text, so it is bindable');
  assert.ok(out.note && out.note.text, 'the consciousness folded a note');
});

test('the audit records the surf path (anchor, peak, stops, focus, recs, rode)', async () => {
  const doc = parseText(STORY, { docId: 's' });
  doc.sentenceEmbeddings = async (e) => Promise.all(doc.sentences.map(s => e.embed(s)));
  const model = createModel('echo'); await model.load();
  const audit = createAuditLog();
  await runTurn({ question: 'what happens to Otto?', doc, model, embedder: createHashEmbedder(), auditLog: audit });

  const fold = audit.turns[0].steps.find(s => s.name === 'fold');
  assert.ok(fold?.data?.surf, 'the fold step carries the surf telemetry');
  const surf = fold.data.surf;
  assert.equal(surf.rode, 'bayesian-figure');
  assert.ok(Array.isArray(surf.stops) && surf.stops.includes(surf.anchor));
  assert.ok(Number.isInteger(surf.peak));
});

test('adaptive reach gets as much as it needs — spans the whole arc, the null sets the count', () => {
  // A long arc: an early establishment and a late reversal far apart. The fixed window
  // catches the early cluster; adaptive reach reads the WHOLE field and lets the noise null
  // decide how many stops, so it reaches the distant turn the fixed window misses.
  const filler = Array.from({ length: 22 }, (_, i) =>
    ['A picture hung.', 'A clock ticked.', 'A door stood.', 'A chair waited.', 'A lamp glowed.',
     'A window opened.', 'A floor creaked.', 'A wall loomed.'][i % 8]).join(' ');
  const arc =
    'Grete fed Gregor. Grete tended Gregor. Grete cleaned the room. ' +
    filler +
    ' Grete refused Gregor. Grete renounced Gregor.';
  const doc = parseText(arc, { docId: 'arc' });
  const S = doc.sentences.length;
  const fixed = surfFold(doc, 0);                          // default window, anchored at the start
  const adapt = surfFold(doc, 0, { reach: 'adaptive' });   // as much as it needs

  assert.equal(adapt.rode, 'bayesian-void', 'adaptive rides the noise-null boundary, not the median');
  assert.ok(Math.max(...adapt.stops) > Math.max(...fixed.stops),
    'adaptive reaches further into the document than the fixed window');
  // the late reversal (the last sentences) is reachable by adaptive, beyond the fixed ahead=16
  assert.ok(adapt.stops.some(i => i >= S - 2), 'the distant turn is among the stops');
});

test('adaptive reach leaves the default surf byte-identical (opt-in only)', () => {
  const doc = parseText(STORY, { docId: 'parity' });
  const a = surfFold(doc, 3);
  const b = surfFold(doc, 3);   // same call twice — adaptive is off, nothing changed
  assert.deepEqual(a.stops, b.stops);
  assert.equal(a.rode, 'bayesian-figure', 'default still rides the figure/median rule');
});

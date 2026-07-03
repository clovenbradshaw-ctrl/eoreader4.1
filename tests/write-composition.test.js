import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/pipeline.js';
import { surfFold } from '../src/surfer/index.js';
import { walkComposition, sentenceRenderer, turnNote } from '../src/write/composition.js';
import { stubModel } from '../src/write/spurt.js';
import { HASHID_RE } from '../src/core/index.js';

// The composition walk — the write loop with the renderer at the very end. Same beats as
// streamAnswer (one per surfer arrest, cursor-collapsed, witness-bound), but the realization
// is a SEAM: swap the renderer, keep the walk. Each beat carries the arc context (its phase,
// the turn it crosses and how hard that rewrite was), and the connective leash checks every
// rendered surface against the arc — contrast needs a turn, sequence an order, cause never.

const CHAIN = 'Alice met Bob. Bob trusted Carol. Carol warned Dan. ' +
              'Dan feared Eve. Eve found Frank. Frank thanked Grace.';

const walked = async (text, { renderer, anchor = 1, ...opts } = {}) => {
  const doc = parseText(text, { docId: 'm' });
  const surf = surfFold(doc, anchor);
  const out = await walkComposition({
    doc, surf, renderer: renderer || sentenceRenderer({ model: stubModel() }), ...opts,
  });
  return { doc, surf, out };
};

test('one beat per surfer arrest, each witness-bound, no hashId on any surface', async () => {
  const { surf, out } = await walked(CHAIN);
  assert.equal(out.beats.length, surf.stops.length, 'one beat per arrest');
  for (const b of out.beats) assert.ok(b.witness.bound.length > 0, `${b.cellId} bound its referents`);
  assert.equal(HASHID_RE.test(out.draft), false, 'the membrane holds — no hashId reaches the surface');
});

test('every beat carries its arc context — phase, the crossed turn with its weight, brokeHere', async () => {
  const { surf, out } = await walked(CHAIN);
  for (const b of out.beats) {
    assert.equal(typeof b.arc.phase, 'number', 'the beat knows its phase');
    assert.equal(typeof b.arc.phases, 'number');
    assert.equal(typeof b.arc.brokeHere, 'boolean');
    if (b.arc.turn) {
      assert.ok(Number.isFinite(b.arc.turn.weight) && b.arc.turn.weight >= 0 && b.arc.turn.weight <= 1,
        'a crossed turn carries its rewrite weight, normalized');
    }
  }
  // Every REC the walk rendered across is claimed by exactly one beat.
  const crossed = out.beats.filter(b => b.arc.turn).map(b => b.arc.turn.cursor);
  assert.equal(new Set(crossed).size, crossed.length, 'a turn is rendered as a turn ONCE');
  const recs = (surf.recCursors || []).filter(c => c <= Math.max(...out.beats.map(b => b.stop)));
  for (const c of recs) assert.ok(crossed.includes(c), `REC at ${c} was rendered as a turn`);
});

test('swap the renderer, keep the walk — a non-text renderer sees the same beat cursor', async () => {
  const seen = [];
  // A "shot list" renderer: no prose at all — each beat becomes a shot spec. It witnesses its
  // own output (the walk must not run the prose witness over a non-prose surface).
  const shots = async (view) => {
    seen.push(view);
    return {
      output: { shot: view.index, relation: view.relation.edge || view.relation.op, band: view.relation.band },
      witness: { ok: true, bound: [...view.expect], flagged: [], retractions: [] },
    };
  };
  const { surf, out } = await walked(CHAIN, { renderer: shots });
  assert.equal(out.beats.length, surf.stops.length, 'the walk is unchanged under a swapped renderer');
  assert.equal(out.draft, '', 'no prose surface — the outputs ride the beats');
  for (const [i, b] of out.beats.entries()) {
    assert.equal(b.output.shot, i, 'the renderer output is kept verbatim on the beat');
  }
  for (const v of seen) {
    assert.ok(v.relation && typeof v.relation.op === 'string', 'the one resolved relation');
    assert.ok(['firm', 'void'].includes(v.relation.band), 'with its resolution band');
    assert.ok(Array.isArray(v.spans) && v.spans.length > 0, 'its grounded spans');
    assert.equal(typeof v.tail, 'string', 'the running tail');
    assert.ok(v.arc && typeof v.arc.phase === 'number', 'and the arc context');
    assert.equal(HASHID_RE.test(JSON.stringify(v.input)), false, 'surface only — no hashes in the input');
  }
});

test('a void relation reaches the renderer as void — hedged before it is written', async () => {
  const { out } = await walked('Gregor Samsa might have frightened his mother. Grete fed Gregor. Grete left.', { anchor: 0 });
  const hedged = out.beats.find(b => b.band === 'void');
  assert.ok(hedged, 'the modal connection rides as void');
  assert.match(hedged.text, /hold|suggest|rather than/i, 'the stub renders a holding-open, never a proven claim');
});

test('the connective leash runs per beat — a cause is never licensed by an arc', async () => {
  // A renderer that (wrongly) asserts causation: the leash must flag it, not remove it.
  const causal = async (view) => ({ output: `Therefore ${view.index} follows.` });
  const { out } = await walked(CHAIN, { renderer: causal });
  if (out.arc) {
    assert.ok(out.flags.some(f => f.id === 'connective-unlicensed' && /cause/.test(f.message)),
      'an unlicensed "therefore" is flagged');
    assert.match(out.draft, /Therefore/, 'flag-and-tell — the surface is never un-streamed');
  }
});

test('the sentence renderer reconstructs the draft through its own token stream', async () => {
  const emitted = [];
  const doc = parseText(CHAIN, { docId: 'm' });
  const surf = surfFold(doc, 1);
  const out = await walkComposition({
    doc, surf, renderer: sentenceRenderer({ model: stubModel(), onToken: (t) => emitted.push(t) }),
  });
  assert.ok(out.draft.length > 0);
  assert.equal(emitted.join(''), out.draft, 'the visible stream is exactly the draft');
});

test('turnNote is weight-proportional and licenses only what the leash accepts', () => {
  const heavy = turnNote({ cursor: 3, weight: 1 }, true);
  const light = turnNote({ cursor: 5, weight: 0.1 }, false);
  assert.match(heavy, /strongest turn/);
  assert.match(heavy, /full weight/);
  assert.match(light, /lightly/);
  for (const n of [heavy, light]) assert.match(n, /a cause is not/i);
});

test('walkComposition returns null when nothing resolves — the caller falls back', async () => {
  const out = await walkComposition({
    doc: { sentences: [], log: { snapshot: () => [] } },
    surf: surfFold({ sentences: [] }, 0),
    renderer: async () => ({ output: 'x' }),
  });
  assert.equal(out, null);
});

// ── the omnimodal-core guarantees added with the essay wiring ────────────────────

test('the walk runs on the reader\'s pinned doc shape — a bare {log, units} handle', async () => {
  // the reader app holds no parse artifacts on its merged corpus — only the event log
  // and the sentences. The walk (surfToPlan, trajectory, the cursor) must ride that.
  const parsed = parseText(CHAIN, { docId: 'm' });
  const events = parsed.log.snapshot();
  const doc = {
    log: { events, snapshot: () => events, get length() { return events.length; } },
    units: parsed.sentences, sentences: parsed.sentences,
  };
  const surf = surfFold(doc, 1);
  const out = await walkComposition({ doc, surf, renderer: sentenceRenderer({ model: stubModel() }) });
  assert.ok(out && out.beats.length >= 1, 'the pinned reader shape resolves a plan and composes');
});

test('a renderer with no prose surface and no witness verdict is flagged unwitnessable', async () => {
  const mute = async (view) => ({ output: { kind: 'frame', stop: view.index } });
  const { out } = await walked(CHAIN, { renderer: mute });
  assert.ok(out.flags.some(f => f.id === 'unwitnessable'), 'never silently trusted');
  assert.ok(out.beats.every(b => b.witness === null), 'no verdict is invented');
});

test('abort between beats marks the walk aborted and keeps the partial', async () => {
  const ctrl = new AbortController();
  const stopper = async () => { ctrl.abort(); return { output: 'A beat.' }; };
  const { out } = await walked(CHAIN, { renderer: stopper, signal: ctrl.signal });
  assert.ok(out, 'the partial walk is returned, not thrown away');
  assert.equal(out.aborted, true, 'and marked aborted');
  assert.equal(out.beats.length, 1, 'no beat decoded past the stop');
});

test('a retraction hedges FORWARD and marks the beat\'s effective band void', async () => {
  // A renderer that fabricates: content words with no contact with any span. The witness
  // retracts, the beat's effective band flips to void (asserted-but-unmarked never ships),
  // and the NEXT beat's cursor carries the hedge — nothing is un-streamed.
  const fabricator = async (view) => ({ output: `Quantum blockchain synergy dominates paradigm ${view.index}.` });
  const { out } = await walked(CHAIN, { renderer: fabricator });
  assert.ok(out.retractions.length > 0, 'the fabrication is retracted');
  const voided = out.beats.find(b => b.witness && b.witness.retractions.length);
  assert.ok(voided, 'a witnessed beat carries its retraction');
  assert.equal(voided.effectiveBand, 'void', 'its effective band is void — marked, never silently asserted');
  assert.match(out.draft, /Quantum/, 'flag-and-tell — the surface is never un-streamed');
});

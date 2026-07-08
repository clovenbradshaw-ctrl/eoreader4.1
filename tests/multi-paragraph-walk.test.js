import { test } from 'node:test';
import assert from 'node:assert/strict';

import { walk, progressAgainst, buildSkeleton } from '../src/longgen/index.js';
import { createModel } from '../src/model/interface.js';
import '../src/model/echo.js';

// The multi-paragraph-walk spec contract: walk({ fold, design, model, … }). The
// fold is the ground pool, the design is ordered beats or a { demand, outline }
// the walk carves once. Same falcons fold as the compose tests — every span is
// developable (score ≥ 0.4, length ≥ 24) and ends on a period, so echo phrases the
// slice back verbatim and every unit binds against its own spans.
const foldOf = () => ([
  { idx: 0, score: 0.95, text: 'The peregrine falcon reaches speeds over three hundred kilometres per hour in its stoop.' },
  { idx: 1, score: 0.90, text: 'Falcons show a marked affinity for tall cliffs away from human establishments.' },
  { idx: 2, score: 0.85, text: 'The peregrine has a body length of thirty-four to fifty-eight centimetres.' },
  { idx: 3, score: 0.70, text: 'The Latin term for falcon is related to falx, meaning a curved sickle.' },
  { idx: 4, score: 0.65, text: 'The ancient Egyptian sun deity was often shown with the head of a falcon.' },
  { idx: 5, score: 0.60, text: 'A falcon delivers a knockout blow with a clenched talon against larger prey.' },
  { idx: 6, score: 0.55, text: 'The wingspan of the peregrine ranges from seventy-four to one hundred and twenty centimetres.' },
  { idx: 7, score: 0.50, text: 'Falcons execute sharp aerial manoeuvres to catch highly agile birds in flight.' },
]);

// ── the walk fills a five-region design, each paragraph a distinct region ──────

test('a five-region design yields five paragraphs, each covering a distinct part of the fold', async () => {
  const model = createModel('echo');
  await model.load();

  const res = await walk({ fold: foldOf(), design: { demand: 5, question: 'falcons' }, model });

  assert.equal(res.paragraphs.length, 5, 'five regions → five paragraphs');
  assert.equal(res.progress.complete, true, 'the design is filled — 5 of 5');

  // No paragraph restates another: each cites at least one span no earlier
  // paragraph's anchor claimed (monotone coverage, "a new part of the fold").
  const anchorsSeen = new Set();
  for (const p of res.paragraphs) {
    const beat = res.design.beats.find(b => b.id === p.beat);
    assert.ok(!anchorsSeen.has(beat.idx), `beat ${p.beat} covers a fresh anchor, not a restated one`);
    anchorsSeen.add(beat.idx);
    assert.ok(p.sources.length >= 1, 'every accepted paragraph cites a span');
  }
});

// ── the prose threads: paragraph two opens on paragraph one ────────────────────

test('the prose threads — the prior paragraph is the left-context, with no flow instruction', async () => {
  const model = createModel('echo');
  await model.load();

  const res = await walk({ fold: foldOf(), design: { demand: 3, question: 'falcons' }, model });
  assert.equal(res.paragraphs.length, 3);
  // The joined answer is the accepted paragraphs in walk order — a threaded whole,
  // each opening where the last left off (the render feeds the prior verbatim).
  assert.equal(res.answer, res.paragraphs.map(p => p.text).join('\n\n'));
  assert.equal(res.paragraphs[0].role, 'open', 'the first paragraph opens the piece');
});

// ── no frame leak reaches the output ───────────────────────────────────────────

test('no frame leak reaches the accepted paragraphs', async () => {
  const model = createModel('echo');
  await model.load();

  const res = await walk({ fold: foldOf(), design: { demand: 4, question: 'falcons' }, model });
  for (const p of res.paragraphs) {
    assert.doesNotMatch(p.text, /according to what i (found|read)|as an ai|i (didn'?t|couldn'?t) find|^\s*sure[,!]|^\s*here'?s\b/i,
      'an accepted paragraph carries no assistant-register preamble');
  }
});

// ── a demand past the fold yields fewer paragraphs and a stated reason ─────────

test('a demand past what the fold can ground yields fewer paragraphs, not padding', async () => {
  const model = createModel('echo');
  await model.load();

  const thin = foldOf().slice(0, 2);                    // only two developable regions
  const res = await walk({ fold: thin, design: { demand: 5, question: 'falcons' }, model });

  assert.ok(res.paragraphs.length <= 2, 'never more paragraphs than the fold develops');
  assert.equal(res.progress.short, true, 'the shortfall is stated, not padded to length');
  assert.equal(res.progress.shortfall, 3, 'three regions short of the demand');
});

// ── every accepted sentence cites a span; struck sentences leave only a trace ──

test('every accepted paragraph cites a span; the trace is the only record of a miss', async () => {
  const model = createModel('echo');
  await model.load();

  const res = await walk({ fold: foldOf(), design: { demand: 3, question: 'falcons' }, model });
  assert.ok(res.paragraphs.every(p => p.sources.length >= 1), 'every accepted paragraph earns a citation');
  assert.ok(Array.isArray(res.trace) && res.trace.length >= res.paragraphs.length, 'the trace records every beat walked');
  // sources is the union of cited span indices, sorted.
  const union = [...new Set(res.paragraphs.flatMap(p => p.sources))].sort((a, b) => a - b);
  assert.deepEqual(res.sources, union);
});

// ── the design carves once from either shape ───────────────────────────────────

test('walk carves the design once from a { demand, outline } spec', async () => {
  const model = createModel('echo');
  await model.load();

  const outline = [
    { heading: 'Flight and speed', topic: 'flight', findings: [{ idx: 0 }, { idx: 5 }] },
    { heading: 'Where they live', topic: 'habitat', findings: [{ idx: 1 }, { idx: 7 }] },
  ];
  const res = await walk({ fold: foldOf(), design: { outline }, model });

  assert.equal(res.paragraphs.length, 4, 'four paragraphs across two sections');
  assert.equal(res.design.sections.length, 2, 'the carved design carries two sections');
  assert.deepEqual(res.paragraphs.map(p => p.role), ['open', 'continue', 'open', 'continue']);
});

test('walk accepts an already-carved design and copies it forward', async () => {
  const model = createModel('echo');
  await model.load();

  const carved = buildSkeleton({ ground: foldOf(), question: 'falcons', demand: 3 });
  const res = await walk({ fold: foldOf(), design: carved, model });

  assert.equal(res.design, carved, 'the handed-in design is copied forward, not re-derived');
  assert.equal(res.paragraphs.length, 3);
  assert.equal(res.progress.complete, true);
});

test('walk accepts an Array of ordered beats as the design', async () => {
  const model = createModel('echo');
  await model.load();

  const beats = [
    { idx: 0, topic: 'stoop', role: 'open' },
    { idx: 1, topic: 'habitat', role: 'continue' },
  ];
  const res = await walk({ fold: foldOf(), design: beats, model });

  assert.equal(res.design.planned, 2, 'the design planned count reads back off the beats');
  assert.equal(res.paragraphs.length, 2);
});

// ── the seam: maxBeats writes a bounded run; state is returned, not consumed ────

test('maxBeats is the seam — a bounded run now, the rest resumable from state', async () => {
  const model = createModel('echo');
  await model.load();

  const whole = await walk({ fold: foldOf(), design: { demand: 4, question: 'falcons' }, model });

  const first = await walk({ fold: foldOf(), design: { demand: 4, question: 'falcons' }, model, maxBeats: 2 });
  assert.equal(first.paragraphs.length, 2, 'the bounded call writes exactly its budget');
  assert.ok(first.state && first.state.design && Array.isArray(first.state.covered),
    'state is returned with the carved design and coverage — the seam statistic');

  // The seam works: feeding state back resumes the SAME shape from beat three.
  const rest = await walk({ fold: foldOf(), design: { demand: 4, question: 'falcons' }, model, state: first.state });
  assert.deepEqual(rest.paragraphs.map(p => p.text), whole.paragraphs.map(p => p.text),
    'resuming from state yields the same paragraphs as one continuous run');
  assert.equal(rest.progress.complete, true);
});

// ── an already-aborted signal writes nothing ───────────────────────────────────

test('walk honours an already-aborted signal without generating', async () => {
  const model = createModel('echo');
  await model.load();
  const ac = new AbortController(); ac.abort();

  const res = await walk({ fold: foldOf(), design: { demand: 3, question: 'falcons' }, model, signal: ac.signal });
  assert.equal(res.paragraphs.length, 0);
});

// ── the live walk: the self-read weld — generation drives retrieval per beat ────

test('a refold hook runs the walk live — each paragraph refolds for a new part of the fold', async () => {
  const model = createModel('echo');
  await model.load();

  // The reader's role: hand back a fresh, uncovered slice each beat, focused by the
  // prior paragraph. Here we just serve the fold in order, skipping what's covered —
  // the mechanical stand-in for a re-query that the reader does with groundNotes.
  const pool = foldOf();
  const refoldCalls = [];
  const refold = async ({ prior, index, seen }) => {
    refoldCalls.push({ index, prior });
    const fresh = pool.filter(s => !seen.has(String(s.idx)));
    return fresh.slice(0, 3);
  };

  const seenParagraphs = [];
  const res = await walk({
    fold: [], design: { demand: 4 }, question: 'falcons', model, refold,
    onParagraph: (rec) => seenParagraphs.push(rec.text),
  });

  assert.ok(res.paragraphs.length >= 1 && res.paragraphs.length <= 4, 'the demand caps the live run');
  assert.ok(res.paragraphs.every(p => p.sources.length >= 1), 'every live paragraph is grounded');
  assert.equal(res.design.live, true, 'the design is marked live (self-read weld)');
  assert.deepEqual(seenParagraphs, res.paragraphs.map(p => p.text), 'onParagraph streamed each accepted paragraph');
  // The weld: the FIRST refold opens cold (no prior); every later one is handed the
  // paragraph before it as the retrieval cue.
  assert.equal(refoldCalls[0].prior, '', 'the first beat opens cold — no prior paragraph');
  if (refoldCalls.length > 1) assert.ok(refoldCalls[1].prior.length > 0, 'later beats refold focused by the prior paragraph');
});

test('an empty refold is saturation — the live walk stops and does not pad', async () => {
  const model = createModel('echo');
  await model.load();

  const pool = foldOf().slice(0, 2);                    // only two regions to serve
  const refold = async ({ seen }) => pool.filter(s => !seen.has(String(s.idx)));

  const res = await walk({ fold: [], design: { demand: 5 }, question: 'falcons', model, refold });
  assert.ok(res.paragraphs.length <= 2, 'the fold is spent after its regions — no padding to the demand of 5');
  assert.ok(res.trace.some(t => t.kind === 'saturated'), 'the empty refold is recorded as saturation, honestly');
});

test('the live walk resumes from state — the discovered continuation seeds accepted paragraphs', async () => {
  const model = createModel('echo');
  await model.load();

  // The "discover" path: a single answer already came back as these paragraphs; we
  // continue the walk from them, refolding for more. The seeded paragraphs count as
  // the run's history, so the next beat opens on the LAST of them.
  const seedPara = { beat: 'b0', role: 'open', sources: [0], text: 'The peregrine falcon reaches speeds over three hundred kilometres per hour in its stoop.' };
  const pool = foldOf();
  const refold = async ({ prior, seen }) => {
    // exclude the seeded source too
    return pool.filter(s => !seen.has(String(s.idx)) && s.idx !== 0).slice(0, 3);
  };
  let firstPrior = null;
  const res = await walk({
    fold: [], design: { demand: 3 }, question: 'falcons', model, refold,
    state: { design: buildSkeleton({ ground: pool, demand: 3 }), accepted: [seedPara], covered: [0], done: ['b0'] },
    onParagraph: () => {},
  });

  assert.ok(res.paragraphs.length >= 2, 'the seeded paragraph is kept and the walk continues past it');
  assert.equal(res.paragraphs[0].text, seedPara.text, 'the discovered paragraph leads the continued run');
});

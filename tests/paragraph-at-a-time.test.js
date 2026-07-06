import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSkeleton, renderContinuation, seedFor, leadSentence, connectiveFor,
  progressAgainst, composeParagraphs, evaSplice, frameLeak, SYSTEM_CONTINUE,
} from '../src/longgen/index.js';
import { EXCERPTS_HEADER } from '../src/model/index.js';
import { createModel } from '../src/model/interface.js';
import '../src/model/echo.js';

// A ranked ground pool with more spans than beats, so each beat's slice is its
// anchor plus real supporting neighbours (the cluster-of-commitments grain). Each
// span is developable (score ≥ 0.4, length ≥ 24) and ends on a period so the binder
// splits it as its own claim. Echo phrases the slice back verbatim, so every unit
// binds against its own spans.
const groundOf = () => ([
  { idx: 0, score: 0.95, text: 'The peregrine falcon reaches speeds over three hundred kilometres per hour in its stoop.' },
  { idx: 1, score: 0.90, text: 'Falcons show a marked affinity for tall cliffs away from human establishments.' },
  { idx: 2, score: 0.85, text: 'The peregrine has a body length of thirty-four to fifty-eight centimetres.' },
  { idx: 3, score: 0.70, text: 'The Latin term for falcon is related to falx, meaning a curved sickle.' },
  { idx: 4, score: 0.65, text: 'The ancient Egyptian sun deity was often shown with the head of a falcon.' },
  { idx: 5, score: 0.60, text: 'A falcon delivers a knockout blow with a clenched talon against larger prey.' },
  { idx: 6, score: 0.55, text: 'The wingspan of the peregrine ranges from seventy-four to one hundred and twenty centimetres.' },
  { idx: 7, score: 0.50, text: 'Falcons execute sharp aerial manoeuvres to catch highly agile birds in flight.' },
]);

// ── SEG: the skeleton is the shape, derived and honest-floored ────────────────

test('buildSkeleton with no outline is ONE flowing section — paragraphs, not headed stubs', () => {
  const sk = buildSkeleton({ ground: groundOf(), question: 'falcons', demand: 3 });
  assert.equal(sk.planned, 3, 'the demand caps the total paragraph count');
  assert.equal(sk.beats.length, 3);
  assert.equal(sk.sections.length, 1, 'no invented section breaks — one flowing section');
  assert.equal(sk.beats[0].idx, 0, 'the strongest region leads');
  assert.equal(sk.beats[0].role, 'open', 'the first paragraph opens the section');
  assert.equal(sk.beats[0].heading, null, 'a flowing section carries no per-paragraph heading');
  assert.equal(sk.beats[1].role, 'continue', 'later paragraphs pick up within the section');
  assert.equal(sk.beats[0].kind, 'load-bearing', 'a strong region is pinned tightly');
  assert.equal(sk.short, false, 'the field can supply three of three');
});

test('buildSkeleton from an emergent outline is multi-section — heading only on the opener', () => {
  const outline = [
    { heading: 'Flight and speed', topic: 'flight', findings: [{ idx: 0 }, { idx: 5 }] },
    { heading: 'Where they live', topic: 'habitat', findings: [{ idx: 1 }, { idx: 7 }] },
  ];
  const sk = buildSkeleton({ ground: groundOf(), question: 'falcons', outline });
  assert.equal(sk.sections.length, 2);
  assert.equal(sk.beats.length, 4, 'two paragraphs per section');
  assert.equal(sk.beats[0].role, 'open');
  assert.equal(sk.beats[0].heading, 'Flight and speed', 'the opener carries the section heading');
  assert.equal(sk.beats[1].role, 'continue');
  assert.equal(sk.beats[1].heading, null, 'a continuation paragraph gets no heading');
  assert.equal(sk.beats[2].role, 'open', 'the next section opens a fresh heading');
  assert.equal(sk.beats[2].sectionId, 's1');
});

test('buildSkeleton honours the floor: a demand past what the field develops is not padded', () => {
  const thin = groundOf().slice(0, 2);                 // only two developable regions
  const sk = buildSkeleton({ ground: thin, question: 'falcons', demand: 5 });
  assert.equal(sk.planned, 2, 'planned is the field floor, not the demand ceiling');
  assert.equal(sk.short, true, 'the shortfall is recorded, not padded away');
  assert.equal(sk.shortfall, 3);
});

// ── render: condition the artifact, not the behavior ─────────────────────────

test('renderContinuation is a continuation, not an instruction — no task frame leaks', () => {
  const sk = buildSkeleton({ ground: groundOf(), outline: [{ heading: 'The stoop', topic: 'stoop', findings: [{ idx: 0 }, { idx: 5 }] }] });
  const slice = groundOf().slice(0, 3);
  const msgs = renderContinuation({ beat: sk.beats[0], slice, prior: '', coldStart: true });

  assert.equal(msgs[0].role, 'system');
  assert.equal(msgs[0].content, SYSTEM_CONTINUE);
  const user = msgs[1].content;

  // The facts ride above the line, under the excerpts header (the binder + echo read it).
  assert.ok(user.includes(EXCERPTS_HEADER), 'the source material is present as a Record block');
  assert.ok(user.includes('## The stoop'), 'the section opener rides as a heading (SEG furniture), not a command');

  // None of the inorganic levers — the exact phrases the falcons prompt leaked.
  for (const banned of [
    'Answer', 'answer them', 'in your own words', "don't", 'do not',
    'invent no', 'They asked you', 'voice of a reader', 'research librarian',
  ]) {
    assert.ok(!user.includes(banned), `the frame must not police the model ("${banned}")`);
  }

  // The document trails off on the seed — the model continues from here.
  const seed = seedFor({ beat: sk.beats[0], slice });
  assert.ok(user.trimEnd().endsWith(seed), 'the prompt ends mid-document, on the seed');
});

test('a continuation paragraph renders no new heading — it picks up within the section', () => {
  const sk = buildSkeleton({ ground: groundOf(), outline: [{ heading: 'The stoop', topic: 'stoop', findings: [{ idx: 0 }, { idx: 5 }] }] });
  const slice = groundOf().slice(0, 3);
  const openUser = renderContinuation({ beat: sk.beats[0], slice, prior: '', coldStart: true })[1].content;
  const contUser = renderContinuation({ beat: sk.beats[1], slice, prior: 'The prior paragraph established the dive.', coldStart: false })[1].content;

  assert.ok(openUser.includes('## The stoop'), 'the section opener carries the heading');
  assert.ok(!contUser.includes('## '), 'the continuation paragraph adds no heading — it flows on from the prior');
  assert.ok(contUser.includes('The prior paragraph established the dive.'), 'the prior paragraph is the left-context it picks up from');
});

test('renderContinuation inherits register from the prior paragraph, and only cold-starts a genre', () => {
  const sk = buildSkeleton({ ground: groundOf(), demand: 3 });
  const slice = groundOf().slice(0, 3);
  const cold = renderContinuation({ beat: sk.beats[0], slice, prior: '', coldStart: true, genre: 'The following is an investigative article.' })[1].content;
  const warm = renderContinuation({ beat: sk.beats[1], slice, prior: 'The prior paragraph established the stoop.', coldStart: false })[1].content;

  assert.ok(cold.includes('investigative article'), 'cold-start declares the genre (organic register-setting)');
  assert.ok(warm.includes('The prior paragraph established the stoop.'), 'the prior paragraph is the left-context');
  assert.ok(!warm.includes('investigative article'), 'no genre re-declared once the register can be inherited');
});

test('seedFor: a load-bearing beat gets a grounded topic sentence, a connective beat a dangling connective', () => {
  const slice = groundOf().slice(0, 2);
  const load = seedFor({ beat: { idx: 0, order: 0, kind: 'load-bearing' }, slice });
  assert.equal(load, leadSentence(slice[0].text), 'the tight seed is the text projection of the anchor span (grounded by construction)');

  const conn = seedFor({ beat: { idx: 1, order: 1, kind: 'connective' }, slice });
  assert.equal(conn, connectiveFor(1), 'the loose seed is a dangling connective, no claim');
});

// ── EVA: splice, do not regenerate wholesale ─────────────────────────────────

test('evaSplice keeps the grounded prefix and only regenerates below threshold', () => {
  assert.deepEqual(
    evaSplice({ boundFraction: 1, answer: 'all bound.', bound: [{ claim: 'all bound.', citation: 's0' }] }),
    { action: 'accept', text: 'all bound.' },
  );
  assert.deepEqual(
    evaSplice({ boundFraction: 0.6, answer: 'a b', bound: [{ claim: 'a', citation: 's0' }, { claim: 'b', citation: null }] }),
    { action: 'splice', text: 'a' },
    'the ungrounded tail is struck; the bound prefix survives',
  );
  assert.equal(
    evaSplice({ boundFraction: 0.2, answer: '', bound: [{ claim: 'x', citation: null }] }).action,
    'regen',
    'a mostly-unbound paragraph regenerates',
  );
  assert.equal(
    evaSplice({ boundFraction: 0.5, bound: [{ claim: 'x', citation: null }, { claim: 'y', citation: 's0' }] }).action,
    'regen',
    'no grounded prefix to keep → regenerate rather than ship an ungrounded opening',
  );
});

// ── EVA: the frame leak is a checked property, not a prompt prohibition ───────

test('frameLeak catches the assistant register the falcons run shipped', () => {
  // The exact leaks from the audit — a grounded fact wrapped in a leaked frame.
  assert.ok(frameLeak('According to what I found, falcons dive at 300 km/h.'), 'the turn-0 preamble');
  assert.ok(frameLeak("I didn't find any information in what I read about that."), 'the turn-1 escape hatch');
  assert.ok(frameLeak('This information is mentioned in the text about the Royal National Park.'), 'the mis-framed attribution');
  assert.ok(frameLeak('Sure! Here is a paragraph about falcons.'), 'an assistant preamble');
  // Clean article-voice prose does not trip it.
  assert.equal(frameLeak('The peregrine falcon dives at over three hundred kilometres per hour.'), null);
});

// ── progress: the workspace, not a bar ───────────────────────────────────────

test('progressAgainst folds accepted paragraphs onto the skeleton', () => {
  const sk = buildSkeleton({ ground: groundOf(), demand: 3 });
  const none = progressAgainst(sk, []);
  assert.equal(none.covered, 0);
  assert.equal(none.planned, 3);
  assert.equal(none.complete, false);
  assert.equal(none.sections.length, 1, 'the flowing fallback is one section');
  assert.deepEqual([...none.pending].length, 3, 'every beat is an open debt at the start');

  const two = progressAgainst(sk, [{ beat: 'b0', sources: [0] }, { beat: 'b1', sources: [1] }]);
  assert.equal(two.covered, 2);
  assert.equal(two.remaining, 1);
  assert.equal(two.complete, false);

  const all = progressAgainst(sk, sk.beats.map(b => ({ beat: b.id, sources: [b.idx] })));
  assert.equal(all.complete, true, 'every planned beat covered → shape-complete');
});

// ── the loop: one paragraph per beat, grounded, resumable ────────────────────

test('composeParagraphs writes one grounded paragraph per beat and completes the shape', async () => {
  const model = createModel('echo');
  await model.load();

  const res = await composeParagraphs({ ground: groundOf(), question: 'falcons', demand: 3, model });

  assert.equal(res.paragraphs.length, 3, 'one paragraph per planned beat');
  assert.ok(res.paragraphs.every(p => p.sources.length >= 1), 'every paragraph earns a citation (EVA held)');
  assert.ok(res.answer.length > 0, 'the assembled answer is non-empty');
  assert.equal(res.progress.complete, true, 'the shape is complete — 3 of 3');
  assert.equal(res.progress.covered, 3);
});

test('composeParagraphs over an emergent outline writes multi-paragraph sections', async () => {
  const model = createModel('echo');
  await model.load();

  const outline = [
    { heading: 'Flight and speed', topic: 'flight', findings: [{ idx: 0 }, { idx: 5 }] },
    { heading: 'Where they live', topic: 'habitat', findings: [{ idx: 1 }, { idx: 7 }] },
  ];
  const res = await composeParagraphs({ ground: groundOf(), question: 'falcons', outline, model });

  assert.equal(res.paragraphs.length, 4, 'four paragraphs across two sections');
  assert.equal(res.progress.sections.length, 2, 'two sections in the progress workspace');
  assert.deepEqual(res.paragraphs.map(p => p.role), ['open', 'continue', 'open', 'continue'],
    'the first paragraph of each section opens it; the rest pick up within it');
  assert.equal(res.progress.complete, true, 'every paragraph of every section covered');
});

test('composeParagraphs holds the floor: a demand past the field is not padded to length', async () => {
  const model = createModel('echo');
  await model.load();

  const thin = groundOf().slice(0, 2);
  const res = await composeParagraphs({ ground: thin, question: 'falcons', demand: 5, model });

  assert.ok(res.paragraphs.length <= 2, 'never more paragraphs than the field can develop');
  assert.equal(res.progress.short, true, 'the shortfall is surfaced, not confabulated into five');
});

test('composeParagraphs resumes across messages — N then M equals N+M', async () => {
  const model = createModel('echo');
  await model.load();

  const whole = await composeParagraphs({ ground: groundOf(), question: 'falcons', demand: 4, model });

  const first = await composeParagraphs({ ground: groundOf(), question: 'falcons', demand: 4, model, maxBeats: 2 });
  const rest  = await composeParagraphs({ ground: groundOf(), question: 'falcons', demand: 4, model, state: first.state });

  assert.equal(first.paragraphs.length, 2, 'the first message writes its budget');
  assert.deepEqual(
    rest.paragraphs.map(p => p.text),
    whole.paragraphs.map(p => p.text),
    'resuming from state yields the same paragraphs as one continuous run',
  );
  assert.equal(rest.progress.complete, true, 'the resumed run finishes the same shape');
});

test('composeParagraphs honours an already-aborted signal without generating', async () => {
  const model = createModel('echo');
  await model.load();
  const ac = new AbortController(); ac.abort();

  const res = await composeParagraphs({ ground: groundOf(), question: 'falcons', demand: 3, model, signal: ac.signal });
  assert.equal(res.paragraphs.length, 0);
});

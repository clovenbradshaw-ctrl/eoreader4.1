import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/pipeline.js';
import { fieldVerdict, fieldIsVoid, ANSWERABLE_ALPHA } from '../src/surfer/index.js';
import { answerVoid } from '../src/answer/index.js';
import { answerabilityGate } from '../src/longgen/answerable.js';

// The answerability gate (docs/answerability.md): before the talker is warmed,
// measure whether the field where the question landed holds any structure. When it
// does not, the response is a typed absence (a DEF to VOID), never an invented
// answer. The gate is a MEASUREMENT and is conservative by construction — these pin
// both that it FIRES on an empty field and that it ABSTAINS on a thin/ambiguous one.

// ---- the pure void-boundary math (no document needed) ----------------------

test('fieldIsVoid · a flat field is VOID — its peak does not beat the noise null', () => {
  // Every cursor equally (un)surprising: no peak stands out, so nothing beats what
  // the field's own background throws up by chance.
  assert.equal(fieldIsVoid([0.02, 0.02, 0.02, 0.02, 0.02, 0.02]), true);
});

test('fieldIsVoid · a clear peak is NOT void — structure beats the null', () => {
  assert.equal(fieldIsVoid([0.02, 0.02, 0.02, 0.02, 0.02, 0.9]), false);
});

test('fieldIsVoid · a field too thin to measure is NOT void (abstain, never assert)', () => {
  // Below MIN_SAMPLES the null cannot be known: assume an answer until the void is
  // measured, never void off a null we cannot trust.
  assert.equal(fieldIsVoid([0.02, 0.9, 0.02]), false);
  assert.equal(fieldIsVoid([]), false);
});

test('fieldIsVoid · alpha is honoured and the default is a sane budget', () => {
  // The hallucination budget is a knob (read/voidnull.js). A flat field is void at
  // any budget; a clearly-structured one is void at none — the knob moves only the
  // borderline, and it must be a real number in (0,1).
  assert.equal(fieldIsVoid([0.02, 0.02, 0.02, 0.02, 0.02], { alpha: 0.001 }), true);
  assert.equal(fieldIsVoid([0.02, 0.02, 0.02, 0.02, 0.02], { alpha: 0.2 }), true);
  assert.equal(fieldIsVoid([0.02, 0.02, 0.02, 0.02, 0.9], { alpha: 0.001 }), false);
  assert.ok(ANSWERABLE_ALPHA > 0 && ANSWERABLE_ALPHA < 1);
});

// ---- the verdict composition over a real document --------------------------

const docOf = (text) => parseText(text, { docId: 'a' });

test('fieldVerdict · a resolved referent is never void — the field has it', () => {
  const doc = docOf('Gregor Samsa is a travelling salesman. Gregor waited. Gregor left.');
  const v = fieldVerdict(doc, 'who is gregor', []);
  assert.equal(v.void, false);
});

test('fieldVerdict · a strong retrieval hit is never void', () => {
  const doc = docOf('Alice loves apples. Bob hates broccoli.');
  const v = fieldVerdict(doc, 'apples', [{ idx: 0, score: 0.9 }]);
  assert.equal(v.void, false);
});

test('fieldVerdict · nothing retrieved, no name → NEVER-SET, with a scan receipt', () => {
  const doc = docOf('Alice loves apples. Bob hates broccoli.');
  const v = fieldVerdict(doc, 'unrelated zebra question', []);
  assert.equal(v.void, true);
  assert.equal(v.kind, 'never-set');
  assert.match(v.receipt, /scanned 2 sentences/);
});

test('fieldVerdict · an absent proper noun → ELSEWHERE, naming the term', () => {
  const doc = docOf('Alice loves apples. Bob hates broccoli.');
  const v = fieldVerdict(doc, 'who is Napoleon', []);
  assert.equal(v.void, true);
  assert.equal(v.kind, 'elsewhere');
  assert.equal(v.term, 'Napoleon');
});

test('fieldVerdict · a SHORT field is never false-voided — the talker still answers', () => {
  // Weak span, no referent, no strong hit — but the reach is too short for the null
  // to be measurable. The gate abstains rather than refuse an answerable question.
  const doc = docOf('The room was quiet. The hall was warm. The yard was wide.');
  const v = fieldVerdict(doc, 'explain the financial projections', [{ idx: 0, score: 0.1 }]);
  assert.equal(v.void, false);
});

test('fieldVerdict · no document is never void (pure chat)', () => {
  assert.equal(fieldVerdict(null, 'anything', []).void, false);
});

// ---- the rendered answer ---------------------------------------------------

test('answerVoid · renders the typed absence in the mechanical-answer shape', () => {
  const doc = docOf('Alice loves apples. Bob hates broccoli.');
  const a = answerVoid(doc, 'unrelated zebra question', []);
  assert.equal(a.route, 'void');
  assert.equal(a.sources.length, 0);
  assert.match(a.text, /does not say/i);
  assert.equal(a.void.kind, 'never-set');
});

test('answerVoid · returns null when there is an answer to give', () => {
  const doc = docOf('Gregor Samsa is a travelling salesman. Gregor waited.');
  assert.equal(answerVoid(doc, 'who is gregor', []), null);
});

// ── The named-subject gate: the Grok regression ──────────────────────────────
// A corpus about Errol Musk handed "write a long essay about Grok" must NOT walk:
// the named subject is absent from the ground, so the lenient whole-document type
// cannot license it. The observed failure invented a Robert E. Howard novel.
test('answerabilityGate refuses an essay about a subject absent from the corpus', () => {
  const ground = [
    { idx: 0, score: 0.6, text: 'Errol Musk denied claims' },
    { idx: 1, score: 0.6, text: 'Us Weekly reached Elon' },
    { idx: 2, score: 0.5, text: 'While Errol claimed Tesla' },
  ];
  const graph = { relations: [{ subject: 'Errol Musk', object: 'claims' }, { subject: 'Elon', object: 'Tesla' }] };
  const g = answerabilityGate({ question: 'write me a long essay about Grok', ground, graph });
  assert.equal(g.licensed, false);
  assert.equal(g.reason, 'no-subject');
  assert.deepEqual(g.missing, ['Grok']);
  assert.match(g.refusal.text, /do not contain anything about Grok/);
  assert.ok(g.refusal.sources.length > 0, 'the refusal still cites what the corpus DOES hold');
});

test('answerabilityGate licenses an essay about a subject the corpus DOES name', () => {
  const ground = [{ idx: 0, score: 0.6, text: 'Errol Musk denied claims' }];
  const graph = { relations: [{ subject: 'Errol Musk', object: 'claims' }] };
  const g = answerabilityGate({ question: 'write me a long essay about Errol Musk', ground, graph });
  assert.equal(g.licensed, true);
});

test('answerabilityGate does not falsely refuse a bare whole-document request', () => {
  const ground = [{ idx: 0, score: 0.6, text: 'Errol Musk denied claims' }];
  const graph = { relations: [{ subject: 'Errol Musk', object: 'claims' }] };
  const g = answerabilityGate({ question: 'summarize this', ground, graph });
  assert.equal(g.licensed, true);
});

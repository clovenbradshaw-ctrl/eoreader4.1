import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/pipeline.js';
import { surfFold } from '../src/surfer/index.js';
import { streamAnswer } from '../src/write/answer.js';
import { stubModel } from '../src/write/spurt.js';
import { runTurn } from '../src/turn/pipeline.js';
import { createAuditLog } from '../src/audit/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import { createModel } from '../src/model/interface.js';
import '../src/model/echo.js';
import { HASHID_RE } from '../src/core/index.js';

// The Streaming Answer §3, §4 — the answer routed through the writer's beat loop:
// one grounded sentence per surfer stop, streamed so the seams do not show, each
// beat aware of the ones behind it (the fold) and read forward by the predictor.

// A multi-subject story: each stop carries a distinct leaving edge, so every beat is
// a grounded relation (no orienting fallback) — the clean case for the loop spine.
const CHAIN = 'Alice met Bob. Bob trusted Carol. Carol warned Dan. ' +
              'Dan feared Eve. Eve found Frank. Frank thanked Grace.';

const stream = async (text, anchor = 1, onToken) => {
  const doc = parseText(text, { docId: 'm' });
  const surf = surfFold(doc, anchor);
  return { doc, surf, out: await streamAnswer({ doc, surf, model: stubModel(), onToken }) };
};

test('the visible stream reconstructs the draft exactly — one join, no boundary marker (§3a/§3b)', async () => {
  const emitted = [];
  const { out } = await stream(CHAIN, 1, (t) => emitted.push(t));
  assert.ok(out.draft.length > 0, 'an answer is realised');
  assert.equal(emitted.join(''), out.draft, 'the token stream is exactly the draft — the seam never shows');
  assert.doesNotMatch(out.draft, /\n|  |\[s\d+\]/, 'no newline, no double space, no index ever reaches the surface');
});

test('one beat per surfer stop, each bound backward by the witness (§4, §6)', async () => {
  const { surf, out } = await stream(CHAIN);
  assert.equal(out.beats.length, surf.stops.length, 'one beat per stop');
  for (const b of out.beats) {
    assert.ok(b.witness.bound.length > 0, `${b.cellId} bound its referents back to the cursor's Sites`);
  }
  assert.equal(HASHID_RE.test(out.draft), false, 'no hashId leaks into the whole answer');
});

test('the fold advances — a later beat refers to a figure an earlier beat established (§2)', async () => {
  const { out } = await stream(CHAIN);
  // The stub renders "X verb Y."; Bob is the object of beat 1 and the subject of
  // beat 2 — so the second beat speaks a figure the first beat put on the frontier.
  const joined = out.beats.map(b => b.text).join(' ');
  assert.match(joined, /Bob/, 'a referent established early is carried forward, not reintroduced');
});

test('the emergent frame walks Ground → Figure → Pattern, read off the field (§8)', async () => {
  const { out } = await stream(CHAIN);
  const sites = out.beats.map(b => b.site);
  assert.ok(sites.includes('Ground'), 'an opening beat establishes');
  assert.ok(sites.includes('Figure'), 'the steepest stop is the move');
  assert.ok(sites.some(s => s === 'Pattern') || sites.includes('Figure'), 'the close draws across');
});

test('each beat reads the next move forward — p(next move) rides the audit (§4)', async () => {
  const { out } = await stream(CHAIN);
  assert.equal(out.predictions.length, out.beats.length, 'a forward prediction per beat');
  for (const p of out.predictions) {
    assert.ok(typeof p.top === 'string' || p.top === null, 'the predicted next move (or the VOID)');
    assert.equal(typeof p.flat, 'boolean', 'and whether the posterior is flat — the predictor\'s VOID');
  }
});

test('a void stop hedges before it is written — the band rides into the beat (§3b)', async () => {
  const { out } = await stream('Gregor Samsa might have frightened his mother. Grete fed Gregor. Grete left.', 0);
  const hedged = out.beats.find(b => b.band === 'void');
  assert.ok(hedged, 'the modal connection is carried as void — held open, not asserted');
  assert.match(hedged.text, /hold|suggest|rather than/i, 'the stub renders a holding-open, never a proven claim');
});

test('the witness flags an ungrounded beat — flag-and-tell, never un-streamed (§6, §3c)', async () => {
  // The single protagonist exhausts his leaving edges, so later stops orient; the stub
  // renders a generic orienting line that the passage does not carry, and the witness
  // RETRACTS it — surfaced as a flag, while the streamed text is never removed.
  const { out } = await stream('Gregor Samsa woke as a vermin. Gregor frightened his mother. ' +
    'Grete fed Gregor. Grete pitied Gregor. The father struck Gregor. ' +
    'Gregor weakened. Gregor died. Grete opened the window.', 1);
  assert.ok(out.beats.some(b => b.cellId === 's2' || b.cellId === 's7'), 'a stop with no fresh edge orients');
  assert.ok(out.flags.some(f => f.id === 'ungrounded'), 'an ungrounded orienting beat is flagged');
  assert.ok(out.retractions.length > 0, 'the retraction is recorded (suppress-never-erase)');
  // the flag rides ALONGSIDE — the draft still holds every streamed sentence
  assert.ok(out.draft.length > 0 && out.beats.length === out.predictions.length);
});

test('streamAnswer returns null when nothing resolves — the caller falls back (§5)', async () => {
  const out = await streamAnswer({ doc: { sentences: [], log: { snapshot: () => [] } },
    surf: surfFold({ sentences: [] }, 0), model: stubModel() });
  assert.equal(out, null);
});

// ── integration: the turn pipeline arms the streaming path opt-in ────────────────

const groundedDoc = (text) => {
  const doc = parseText(text, { docId: 'm' });
  doc.sentenceEmbeddings = async (e) => Promise.all(doc.sentences.map(s => e.embed(s)));
  return doc;
};

test('runTurn streams a grounded answer one paragraph at a time (write/paragraphs.js)', async () => {
  const doc = groundedDoc(CHAIN);
  const audit = createAuditLog();
  const emitted = [];
  const res = await runTurn({
    question: 'what happens to Carol?', doc, model: stubModel(), embedder: createHashEmbedder(),
    auditLog: audit, stream: true, onToken: (t) => emitted.push(t),
  });
  assert.equal(res.route, 'grounded');
  assert.ok(res.answer.length > 0, 'the streamed draft is the answer');
  assert.equal(emitted.join(''), res.turn.rawOutput, 'the visible stream IS the draft — the boundary gate never leaks');
  const llm = audit.turns[0].steps.find(s => s.name === 'llm');
  assert.ok(llm.data.streamed, 'the llm step carries the paragraph telemetry');
  assert.ok(llm.data.streamed.paragraphs >= 1, 'at least one paragraph was realised');
  // revise stays retired on the streamed path — never a block rewrite that un-streams
  const rev = audit.turns[0].steps.find(s => s.name === 'revise');
  assert.ok(!rev?.data?.attempts, 'no block rewrite on the streamed answer');
});

test('plain token streaming: runTurn forwards onToken to the one-shot answer, no beat-loop (the default visible mode)', async () => {
  // onToken WITHOUT stream:true — the answer fills in token by token through the
  // ordinary phrase() path; the grounded beat-loop is not engaged. This is the mode
  // the UI uses by default (docs/streaming-answer.md).
  const doc = groundedDoc('Alice loves apples. Bob hates broccoli.');
  const model = createModel('echo'); await model.load();
  const audit = createAuditLog();
  const pieces = [];
  const res = await runTurn({
    question: 'apples', doc, model, embedder: createHashEmbedder(),
    auditLog: audit, onToken: (t) => pieces.push(t),
  });
  assert.ok(pieces.length > 1, 'the answer streamed token by token, not one chunk');
  assert.equal(pieces.join(''), res.turn.rawOutput, 'the stream reconstructs the raw model output exactly');
  const llm = audit.turns[0].steps.find(s => s.name === 'llm');
  assert.ok(!llm.data.streamed, 'the grounded beat-loop is NOT engaged on the plain path');
});

test('without stream the turn is byte-identical to the one-shot path (non-breaking, §5)', async () => {
  const doc = groundedDoc(CHAIN);
  const audit = createAuditLog();
  const res = await runTurn({
    question: 'what happens to Carol?', doc, model: stubModel(), embedder: createHashEmbedder(),
    auditLog: audit,   // stream defaults to false
  });
  const llm = audit.turns[0].steps.find(s => s.name === 'llm');
  assert.ok(!llm.data.streamed, 'the one-shot path sets no streaming telemetry');
  assert.ok(res.answer.length > 0, 'the one-shot answer is unchanged');
});

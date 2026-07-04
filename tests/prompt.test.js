import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGroundedMessages, buildChatMessages, orientationLine, EXCERPTS_HEADER,
  orderSpansForFrame, currentMomentLine, LIBRARIAN_CUE, CAPABILITY_CUE,
} from '../src/model/prompt.js';
import { serializeNotes } from '../src/perceiver/index.js';
import { parseText } from '../src/perceiver/parse/index.js';
import { runTurn } from '../src/turn/pipeline.js';
import { createAuditLog } from '../src/audit/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import '../src/model/echo.js';
import { createModel } from '../src/model/interface.js';

// ---------------------------------------------------------------------------
// Orientation without recognition (§3).

test('orientation is filename · type · length — never a title or author', () => {
  assert.equal(orientationLine({ filename: 'pg5200.txt', type: 'text', length: 757 }),
    'pg5200.txt · text · 757 sentences');
});

// ---------------------------------------------------------------------------
// The notes register — plain-language arrows over the folded graph (§3).

test('serializeNotes renders EOT LINK/IS-A triples, never codes or indices', () => {
  const structure = {
    relations: [
      { src: { id: 'sister', label: 'sister' }, tgt: { id: 'gregor', label: 'Gregor' }, via: 'tends', idx: 330 },
      { src: { id: 'fire', label: 'fire' },     tgt: { id: 'room4', label: 'room4' },   via: 'originated in', idx: 7 },
    ],
    defs: [{ id: 'gregor', label: 'Gregor', value: 'a travelling salesman', idx: 1 }],
  };
  assert.deepEqual(serializeNotes(structure), [
    'sister -> Gregor : tends',
    'fire -> room4 : originated-in',   // multi-word relation hyphenated into one label
    'Gregor : a travelling salesman',
  ]);
});

test('serializeNotes keeps negation as a conscience token (not- prefix), basic otherwise', () => {
  // The model feed is EOT — a negated bond must reach even a tiny talker as a negation,
  // never the bare positive. Modality stays in the rich layer.
  const structure = {
    relations: [
      { src: { id: 'g', label: 'Gregor' }, tgt: { id: 'w', label: 'words' },  via: 'understand', polarity: '−', modality: 'epistemic', idx: 0 },
      { src: { id: 'g', label: 'Gregor' }, tgt: { id: 'gr', label: 'Grete' }, via: 'told',       polarity: '+', idx: 1 },
    ],
  };
  assert.deepEqual(serializeNotes(structure), [
    'Gregor -> words : not-understand',   // negation survives; no modality in the basic feed
    'Gregor -> Grete : told',
  ]);
});

// ---------------------------------------------------------------------------
// The subjective frame (§1) and the ONE channel — verbatim lines, no arrows (§2).

test('the grounded prompt is the subjective frame: the lines you read, no arrows, the question and absence clause last', () => {
  const spans = [
    { idx: 3, text: 'Topps slammed the man to the ground.', score: 0.9 },
    { idx: 7, text: 'The fire started in room four.', score: 0.5 },
  ];
  const [system, user] = buildGroundedMessages({
    question: 'what happened?', spans,
    orientation: 'pg5200.txt · text · 757 sentences',
  });
  assert.equal(system.role, 'system');
  // The boundary is stated honestly, as a reading result: what the reading turned up on this
  // question, not the whole source (§1).
  assert.match(system.content, /your reading turned up/i);
  // The ONE channel — the verbatim lines under the reader-register header (§2).
  assert.match(user.content, new RegExp(EXCERPTS_HEADER));
  assert.match(user.content, /Topps slammed the man to the ground\./);
  // NO arrows reach the talker (§2) — relational structure stays in the grounder.
  assert.doesNotMatch(user.content, /-->/);
  assert.doesNotMatch(user.content, /Notes from the document/);
  // The forbidden register words are kept out of the frame (§1).
  assert.doesNotMatch(user.content, /\b(excerpts?|passages?|sources?)\b/i);
  // The live question, and the answer clause last where a small model attends (§1). The
  // "only from the document" restriction is lifted: if the lines don't cover it, the talker may
  // answer from general knowledge and say so (ungrounded is flagged downstream, not forbidden).
  assert.match(user.content, /They asked you: what happened\?/);
  assert.match(user.content, /answer from general knowledge and say that part isn't from what you read/);
  // Orientation is filename · type · length — no recognition (§3).
  assert.match(user.content, /What it was: pg5200\.txt · text · 757 sentences/);
  // NO length prescription by default — max_tokens is the real bound (the task register)
  assert.doesNotMatch(user.content, /Reply in at most/);
});

// The line ordering (§3, position bias): strongest first, second-strongest last,
// weakest buried in the middle. A read-only permutation — the text is untouched.
test('orderSpansForFrame: strongest first, second-strongest last, weakest in the middle', () => {
  const spans = [
    { text: 'A', score: 0.5 }, { text: 'B', score: 0.9 }, { text: 'C', score: 0.1 },
    { text: 'D', score: 0.8 }, { text: 'E', score: 0.3 },
  ];
  const ordered = orderSpansForFrame(spans).map(s => s.text);
  assert.equal(ordered[0], 'B', 'strongest takes primacy');
  assert.equal(ordered[ordered.length - 1], 'D', 'second-strongest takes recency');
  assert.equal(ordered[Math.floor(ordered.length / 2)], 'C', 'the weakest is buried in the middle');
  // It is a permutation — same multiset, nothing dropped or rewritten.
  assert.deepEqual([...ordered].sort(), ['A', 'B', 'C', 'D', 'E']);
});

// The task register, in the prompt: no length line by default, a summary guard on a
// summary task only, and an explicit caller budget still honoured (docs/prompt-assembly.md).
test('no length prescription by default; an explicit budget re-imposes one for a turn', () => {
  const spans = [{ idx: 0, text: 'x' }];
  const [, plain] = buildGroundedMessages({ question: 'q', spans });
  assert.doesNotMatch(plain.content, /Reply in at most/, 'no default sentence cap — max_tokens is the bound');
  const [, capped] = buildGroundedMessages({ question: 'q', spans, budget: { sentences: 2 } });
  assert.match(capped.content, /Reply in at most 2 sentences\./, 'a caller may still impose a cap');
});

test('the summary degeneracy guard rides on a summary task only — faithfulness, not length', () => {
  const spans = [{ idx: 0, text: 'x' }];
  const [, sum] = buildGroundedMessages({ question: 'summarize this', spans, task: 'summary' });
  assert.match(sum.content, /drawing the lines together/, 'the guard rides on a summary task');
  assert.doesNotMatch(sum.content, /at most \d+ sentence/, 'the guard is faithfulness, not a length cap');
  const [, ans] = buildGroundedMessages({ question: 'what happened', spans, task: 'answer' });
  assert.doesNotMatch(ans.content, /drawing the excerpts together/, 'not on a default answer task');
});

test('the surface discipline holds across the whole prompt: no indices, codes, citation tags, or arrows', () => {
  const spans = [{ idx: 42, text: 'A verbatim sentence.' }];
  const [, user] = buildGroundedMessages({
    question: 'q', spans, orientation: 'f · text · 9 sentences',
  });
  assert.doesNotMatch(user.content, /\[s\d+\]/, 'no sentence-index or citation tags');
  assert.doesNotMatch(user.content, /\b(CON|SEG|SIG|SYN|REC|DEF|EVA|INS|NUL)\b/, 'no operator codes');
  assert.doesNotMatch(user.content, /-->/, 'no arrows — the talker reads the lines, not the graph (§2)');
});

test('absent conversation slots are simply omitted; present ones ride in the reader register', () => {
  const [, withConv] = buildGroundedMessages({
    question: 'q', spans: [{ idx: 0, text: 'x' }],
    conversation: { notes: 'You asked: who is Gregor?', pastTurns: ['You: who is Gregor?'] },
  });
  assert.match(withConv.content, /Earlier in this reading:/);
  assert.match(withConv.content, /They had asked you:/);

  const [, noConv] = buildGroundedMessages({ question: 'q', spans: [{ idx: 0, text: 'x' }] });
  assert.doesNotMatch(noConv.content, /Earlier in this reading/);
});

// The thread-leak fix (the audit's t5): a small talker fed bare "You asked: …" lines
// answered every prior turn as a bulleted list. With a thread present, the block names
// the prior turns as context-only and the closing clause anchors the LIVE question. With
// no thread, the closing clause stays byte-identical (nothing to confuse).
test('a carried thread is framed as context and the closing clause anchors the live question', () => {
  const [, withConv] = buildGroundedMessages({
    question: 'what is an operator?', spans: [{ idx: 0, text: 'x' }],
    conversation: { notes: 'You asked: summarize\nYou asked: protection?' },
  });
  assert.match(withConv.content, /for context only; answer just their latest question/i,
    'prior turns are named as context, not a checklist');
  assert.match(withConv.content, /Answer their latest question now — “what is an operator\?”/,
    'the closing clause anchors the live question so the model does not answer the thread');

  const [, noConv] = buildGroundedMessages({ question: 'what is an operator?', spans: [{ idx: 0, text: 'x' }] });
  assert.match(noConv.content, /^Answer them now, in your own words\./m,
    'with no thread the closing clause is byte-identical to before');
  assert.doesNotMatch(noConv.content, /latest question/, 'no thread → no anchor rephrase');
});

// The reader-chat shape (index.html sendChat) carries a pastTurns-only thread — no `notes`.
// It must get the SAME firewall + live-question anchor as a notes thread, or the prior
// question rides bare and the small talker re-answers it ("it restated the old one").
test('a pastTurns-only thread (reader chat) still gets the firewall and anchors the live question', () => {
  const [, withPast] = buildGroundedMessages({
    question: 'is he still a council member?', spans: [{ idx: 0, text: 'x' }],
    conversation: { pastTurns: ["What's the deal with Freddie O'Connell and Fusus?"] },
  });
  assert.match(withPast.content, /They had asked you:/);
  assert.match(withPast.content, /for context only; answer just their latest question/i,
    'pastTurns-only thread is framed as context, not a checklist');
  assert.match(withPast.content, /Answer their latest question now — “is he still a council member\?”/,
    'the closing clause anchors the live follow-up, not the prior question');
});

// ---------------------------------------------------------------------------
// The grounded window under the subjective frame: the talker is handed the verbatim
// lines it read — and ONLY those, no arrows (§2), no recognition (§3). The fold still
// runs (its note feeds the grounder and the audit), but it never reaches the talker.
// The conversation is carried as the USER's thread only — the talker's own prior
// answers stay withheld, the one channel a small model anchors on.

test('a grounded turn is the subjective frame: the lines you read, no arrows, no recognition, the user thread only', async () => {
  const text = 'Gregor Samsa loved Grete Samsa. Gregor Samsa loved Grete Samsa. Grete Samsa helped Gregor Samsa.';
  const doc = parseText(text, { docId: 'pg5200.txt' });
  doc.metadata = { title: 'The Metamorphosis', author: 'Franz Kafka' };   // recognition bait
  doc.sentenceEmbeddings = async (e) => Promise.all(doc.sentences.map(s => e.embed(s)));
  const model = createModel('echo'); await model.load();
  const audit = createAuditLog();

  const result = await runTurn({
    question: 'what happens to Gregor?', doc, model,
    embedder: createHashEmbedder(), auditLog: audit,
    history: [
      { role: 'user', content: 'who is Grete?' },
      { role: 'assistant', content: 'Some earlier answer about Grete.' },
    ],
  });
  const t = audit.turns[0];
  assert.equal(t.route, 'grounded');
  assert.match(t.prompt, /What it was: pg5200\.txt/, 'orientation, the filename not a title');
  assert.match(t.prompt, new RegExp(EXCERPTS_HEADER), 'the verbatim lines are the talker’s input');
  // NO recognition (§3): the title/author the doc carries never reach the talker's prompt.
  assert.doesNotMatch(t.prompt, /Metamorphosis/, 'the title never enters a content turn');
  assert.doesNotMatch(t.prompt, /Kafka/, 'the author never enters a content turn');
  // NO arrows (§2): the fold's arrows do not reach the talker.
  assert.doesNotMatch(t.prompt, /-->/, 'no arrows in the talker’s window');
  assert.doesNotMatch(t.prompt, /Notes from the document/, 'the notes block is gone');
  // The fold still runs — its note is recorded for the grounder and the audit.
  const fold = t.steps.find(s => s.name === 'fold');
  assert.ok(fold && fold.data.noteLen > 0, 'the fold still runs and its note is recorded for the audit');
  // The USER's own prior turn rides — follow-up continuity, in the reader register.
  assert.match(t.prompt, /You asked: who is Grete\?/, 'the user’s prior question is carried for continuity');
  // The talker's own prior ANSWER is STILL withheld — the poisoning channel stays closed.
  assert.doesNotMatch(t.prompt, /earlier answer about Grete/, 'the talker never sees its own prior answers');
  // The talker never sees a sentence index in its material, and binding still cites.
  const userTurn = t.prompt.slice(t.prompt.indexOf('\n\nuser: ') + 8);
  assert.doesNotMatch(userTurn, /\[s\d+\]/, 'the talker never sees a sentence index in the material');
  assert.ok(result.sources.length > 0, 'the grounder still cites mechanically off the spans');
});

// ── The self-aware register: honest about what a small in-browser reader can output ──
// A longform ask ("write me an essay") over a small model comes out slow, and — worse — padded
// into invention. Rather than fake the long form, the reader admits what it is and gives a short
// grounded rundown. The cue is opt-in (the app folds it in on an explicit longform ask), so it
// must never disturb the default grounded prompt.

test('the capability cue is self-aware: a short grounded rundown, not a padded essay', () => {
  assert.match(CAPABILITY_CUE, /small model reading in the browser/i, 'it names what it actually is');
  assert.match(CAPABILITY_CUE, /short grounded rundown rather than a full essay/i, 'it offers the thing it can do');
  assert.match(CAPABILITY_CUE, /do not (try to spin one out or )?pad/i, 'it refuses to pad to length');
});

test('the capability cue never rides the default grounded prompt (opt-in only)', () => {
  const [, user] = buildGroundedMessages({ question: 'write me an essay about dolphins', spans: [{ idx: 0, text: 'x' }] });
  assert.doesNotMatch(user.content, /small model reading in the browser/i,
    'buildGroundedMessages does not carry the capability cue — the app folds it into `shape`');
});

// The anti-fabrication guard on the librarian cue: permission to quote is bounded to what was
// actually read, and inventing a quotation is named as the failure to avoid (the dolphins run's
// quoted-from-nothing "Dolphins give each other hugs").
test('the librarian cue forbids inventing a quotation', () => {
  assert.match(LIBRARIAN_CUE, /invent no quotations/i, 'inventing a quote is named as the failure');
  assert.match(LIBRARIAN_CUE, /never put quotation marks around wording you did not actually read/i,
    'quoting is bounded to what was actually read');
});

// ── The current-moment line (the running app's clock) ────────────────────────
test('currentMomentLine is empty without a clock and formatted with one (byte-identical default)', () => {
  assert.equal(currentMomentLine(), '');
  assert.equal(currentMomentLine(null), '');
  assert.equal(currentMomentLine('not a date'), '');
  const d = new Date(2026, 5, 27, 14, 5);   // local: Sat 27 June 2026, 14:05
  const line = currentMomentLine(d);
  assert.match(line, /Saturday, 27 June 2026, 14:05/);
  // Ambient context only — no clock-announcement framing for the model to echo back.
  assert.doesNotMatch(line, /clock|real-time|do not say/i);
  assert.match(line, /for context/i);
});

test('buildChatMessages: now folds the moment into the system message; absent → unchanged', () => {
  const plain = buildChatMessages({ question: 'what is today’s date?' });
  assert.doesNotMatch(plain[0].content, /current date and time/);

  const dated = buildChatMessages({ question: 'what is today’s date?', now: new Date(2026, 5, 27, 9, 30) });
  assert.match(dated[0].content, /current date and time .* is Friday|Saturday, 27 June 2026, 09:30/);
  assert.match(dated[0].content, /27 June 2026/);
  assert.equal(dated[dated.length - 1].content, 'what is today’s date?');   // the question still rides last
});

test('buildGroundedMessages: now folds the moment in without disturbing the subjective frame', () => {
  const dated = buildGroundedMessages({ question: 'what day is it?', spans: [{ text: 'a line' }], now: new Date(2026, 5, 27, 9, 30) });
  assert.match(dated[0].content, /the voice of a reader/i);   // the honest frame is intact
  assert.match(dated[0].content, /27 June 2026/);                // the moment is appended
});

// ── The meaning graph in the prompt (the web path feeds the fold's relations) ──
test('buildGroundedMessages: a graph block feeds the typed relations; absent → no block', () => {
  const spans = [{ idx: 0, text: 'Ryan Coogler is developing the revival.' }];
  const plain = buildGroundedMessages({ question: 'who is making it?', spans });
  assert.doesNotMatch(plain[1].content, /What it means/, 'no graph block by default (subjective frame holds)');

  const graph = 'revival -> Ryan Coogler : developed-by\nseries -> 20th Television : produced-for';   // EOT
  const withGraph = buildGroundedMessages({ question: 'who is making it?', spans, graph });
  assert.match(withGraph[1].content, /What it means — the relations that come to mind/, 'the graph block is present');
  assert.match(withGraph[1].content, /EOT triples/, 'the block names the EOT surface');
  assert.match(withGraph[1].content, /revival -> Ryan Coogler : developed-by/, 'the EOT triples are fed verbatim');
  assert.match(withGraph[1].content, /Reason over THESE/, 'the talker is told to reason over the graph');
  // The verbatim lines still ride as grounding beneath the graph.
  assert.match(withGraph[1].content, new RegExp(EXCERPTS_HEADER));
  assert.ok(withGraph[1].content.indexOf('What it means') < withGraph[1].content.indexOf(EXCERPTS_HEADER),
    'the graph leads; the lines follow as its grounding');
});

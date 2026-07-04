import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RKIND, openResearch, pinSource, extractProposition, evaTest, conEdge,
  recFrame, voidAbsence, askUser, answerAsk, promoteProposition, phraseSection,
} from '../src/research/events.js';
import { projectReport } from '../src/research/project.js';
import { runGroundedResearch, addressOfSentence } from '../src/research/driver.js';
import { createResearchSession, formatChatReply } from '../src/research/session.js';
import { liveView } from '../src/research/live.js';
import { renderReportHTML } from '../src/research/render.js';
import { spanFragment, spanAnchor, resolveArchivePin, pinPayload, locateSpan } from '../src/archive/pin.js';

// Deep research as a grounded projection over an append-only log
// (docs/deep-research-log.md). The report is projectReport(log) — never stored,
// always replayed — so provenance, reproducibility, and clickability are one
// property. These tests pin the spec's own test list: the Bieber non-regression,
// importance ordering, coverage/residue triage, the convergence badge, bind-back
// glue, provenance integrity, ask triggers, and the live-surface append.

// ── A hand-written log (Phase 0: a log renders the report) ──────────────────

const handLog = () => {
  let t = 0;
  const span = (text, start = 0) => ({ start, end: start + text.length, text });
  return [
    openResearch({ id: 'root', question: 'What happened with the Falcon budget?', subject: ['falcon', 'budget'], t: t++ }),
    pinSource({ id: 'pin:0', url: 'https://a.example/x', snapshotUrl: 'https://web.archive.org/web/20260101000000/https://a.example/x', snapshotId: '20260101000000', capturedAt: '2026-01-01T00:00:00Z', contentHash: 'fnv:aaaa', t: t++ }),
    pinSource({ id: 'pin:1', url: 'https://b.example/y', contentHash: 'fnv:bbbb', t: t++ }),
    extractProposition({ id: 'prop:0', frameId: 'root', pinId: 'pin:0', span: span('The budget was approved at 40 million.'), terms: ['budget', 'approved', 'million'], address: { op: 'DEF', grain: 'Figure', terrain: 'Lens', stance: 'Dissecting' }, t: t++ }),
    evaTest({ propId: 'prop:0', frameId: 'root', verdict: 'confirm', surprise: 0.1, strainDelta: 0, strain: 0, t: t++ }),
    extractProposition({ id: 'prop:1', frameId: 'root', pinId: 'pin:1', span: span('An undisclosed contract was signed with the city.') , terms: ['undisclosed', 'contract', 'signed', 'city'], address: { op: 'CON', grain: 'Figure', terrain: 'Link', stance: 'Binding' }, t: t++ }),
    evaTest({ propId: 'prop:1', frameId: 'root', verdict: 'strain', surprise: 2.4, strainDelta: 2.1, strain: 2.1, t: t++ }),
    recFrame({ frameId: 'root', forcedBy: ['prop:1'], strainSum: 2.1, from: ['budget'], to: ['contract', 'undisclosed'], t: t++ }),
    extractProposition({ id: 'prop:2', frameId: 'root', pinId: 'pin:0', span: span('The council reviewed the schedule.'), terms: ['council', 'reviewed', 'schedule'], address: { op: 'EVA', grain: 'Figure', terrain: 'Lens', stance: 'Binding' }, t: t++ }),
    evaTest({ propId: 'prop:2', frameId: 'root', verdict: 'strain', surprise: 0.9, strainDelta: 0.6, strain: 0.6, t: t++ }),
    conEdge({ relation: 'corroborate', a: 'prop:0', b: 'prop:2', sim: 0.7, t: t++ }),
    promoteProposition({ propId: 'prop:0', frameId: 'root', t: t++ }),
    promoteProposition({ propId: 'prop:1', frameId: 'root', t: t++ }),
    promoteProposition({ propId: 'prop:2', frameId: 'root', t: t++ }),
    phraseSection({ frameId: 'root', sentences: [
      { text: 'An undisclosed contract reframed the story.', boundTo: 'prop:1', glue: false },
      { text: 'It is a fascinating case.', boundTo: null, glue: true },
    ], dropped: 1, model: 'test', t: t++ }),
  ];
};

test('events are frozen and typed; a malformed event refuses loudly', () => {
  const e = openResearch({ id: 'root', question: 'q' });
  assert.ok(Object.isFrozen(e));
  assert.throws(() => voidAbsence({ frameId: 'f', terrain: 'nope' }), /terrain/);
  assert.throws(() => askUser({ id: 'a', trigger: 'whenever', text: 'x' }), /trigger/);
  assert.throws(() => evaTest({ propId: 'p', frameId: 'f', verdict: 'maybe' }), /verdict/);
});

test('projectReport is a pure, replay-stable fold: same log → byte-identical report', () => {
  const log = handLog();
  const a = JSON.stringify(projectReport(log));
  const b = JSON.stringify(projectReport(log.slice())); // a fresh array, same events
  assert.equal(a, b, 'projection depends on the log alone');
  // and a cursor projects the PREFIX — the live view and the report are one projector
  const early = projectReport(log, 5);
  assert.equal(early.propositions.length, 1);
  assert.equal(early.recs.length, 0);
});

test('importance is EARNED: REC-forcing spans rank first, strain next, confirmations as corroboration', () => {
  const r = projectReport(handLog());
  assert.deepEqual(r.order, ['prop:1', 'prop:2', 'prop:0'],
    'the reframing first, the strainer second, the confirming span last');
  const sec = r.sections[0];
  assert.equal(sec.propositions[0].id, 'prop:1');
  assert.ok(sec.propositions[0].recForcing);
  assert.ok(r.propositions.find((p) => p.id === 'prop:0').corroboratedBy.includes('prop:2'));
});

test('the VERIFY line is read off the phrase event: bound vs glue vs dropped', () => {
  const r = projectReport(handLog());
  assert.deepEqual(r.verify, { sections: 1, sentences: 2, bound: 1, glue: 1, dropped: 1 });
});

test('coverage folds the cube Act face; empty cells are named, never smoothed over', () => {
  const r = projectReport(handLog());
  assert.equal(r.coverage.actFace.DEF, 1);
  assert.equal(r.coverage.actFace.CON, 1);
  assert.equal(r.coverage.actFace.EVA, 1);
  const emptyOps = r.coverage.emptyCells.map((c) => c.op);
  assert.ok(emptyOps.includes('NUL') && emptyOps.includes('REC') && emptyOps.includes('SYN'));
});

test('residue: a proposition off the Object diagonal flags the frame incomplete (coherence fails loudly)', () => {
  const log = handLog();
  log.push(extractProposition({
    id: 'prop:9', frameId: 'root', pinId: 'pin:0', span: { start: 0, end: 5, text: 'xxxxx' },
    // INS is Generate×Existence; 'Paradigm' is an Interpretation terrain → domain mismatch
    address: { op: 'INS', grain: 'Figure', terrain: 'Paradigm' }, t: 99,
  }));
  const r = projectReport(log);
  assert.equal(r.coverage.residue.length, 1);
  assert.equal(r.coverage.residue[0].propId, 'prop:9');
  assert.match(r.coverage.residue[0].reason, /domain-mismatch/);
});

test('the convergence badge: growing REC gaps read converging; dense distinct RECs read contested', () => {
  const conv = handLog();
  const r1 = projectReport(conv);
  assert.ok(['converging', 'settled'].includes(r1.convergence.badge));
  // a contested log: many RECs, all-distinct frames, gaps not growing
  let t = 100;
  const contested = handLog();
  for (let i = 0; i < 4; i++) {
    contested.push(recFrame({ frameId: 'root', forcedBy: ['prop:1'], strainSum: 2, from: ['a' + i], to: ['b' + i, 'c' + i], t: t + [0, 5, 8, 9][i] }));
  }
  const r2 = projectReport(contested);
  assert.equal(r2.convergence.badge, 'contested');
  assert.equal(r2.convergence.thrash, false, 'high frame diversity is turbulence, not thrash');
});

test('thrash is oscillation over few frames — kept apart from honest turbulence', () => {
  const log = handLog();
  const A = ['x', 'y'], B = ['p', 'q'];
  [A, B, A, B, A].forEach((terms, i) => log.push(recFrame({ frameId: 'root', to: terms, t: 50 + i })));
  const r = projectReport(log);
  assert.equal(r.convergence.thrash, true);
  assert.equal(r.convergence.badge, 'thrash');
});

// ── Provenance and permanence ────────────────────────────────────────────────

test('provenance integrity: every promoted fact carries a pin + an embedded span; deleting the source removes nothing', () => {
  const r = projectReport(handLog());
  for (const p of r.propositions.filter((p) => p.promoted)) {
    const pin = r.pinById[p.pinId];
    assert.ok(pin, `${p.id} has a pin`);
    assert.ok(pin.contentHash.length > 4, 'the pin fingerprints the exact bytes');
    assert.ok(p.span.text.length > 0, 'the exact bytes ride in the artifact');
  }
  const html = renderReportHTML(r);
  assert.match(html, /undisclosed contract was signed/, 'the evidence is embedded, not merely linked');
  assert.match(html, /web\.archive\.org/, 'the archive pin is the citation');
});

test('the claim-to-span link is legible: a bound sentence carries its citation, glue carries none', () => {
  const html = renderReportHTML(projectReport(handLog()));
  assert.match(html, /dr-cite" href="#prop:1"/, 'the citation links to the exact proposition block');
  assert.match(html, /dr-glue/, 'glue is marked');
  assert.match(html, /:target/, 'clicking a citation highlights the span it stands on');
});

test('spanFragment / spanAnchor: the offset is the key, the #:~:text= fragment is the affordance', () => {
  assert.equal(spanFragment('a short span'), '#:~:text=' + encodeURIComponent('a short span'));
  const long = 'one two three four five six seven eight nine ten eleven twelve';
  assert.equal(spanFragment(long), '#:~:text=one%20two%20three%20four,nine%20ten%20eleven%20twelve');
  const pin = { snapshotUrl: 'https://web.archive.org/web/2026/https://x' };
  assert.ok(spanAnchor(pin, { text: 'hello there' }).startsWith(pin.snapshotUrl + '#:~:text='));
});

test('resolveArchivePin: offline → a local pin, never a throw; a snapshot hit pins the citation', async () => {
  assert.deepEqual(await resolveArchivePin('https://x', {}), { pinned: false, reason: 'offline' });
  const fakeFetch = async (u) => ({
    ok: true,
    json: async () => ({ archived_snapshots: { closest: { available: true, url: 'http://web.archive.org/web/20250601120000/https://x', timestamp: '20250601120000' } } }),
  });
  const hit = await resolveArchivePin('https://x', { fetch: fakeFetch });
  assert.equal(hit.pinned, true);
  assert.equal(hit.snapshotUrl, 'https://web.archive.org/web/20250601120000/https://x');
  assert.equal(hit.capturedAt, '2025-06-01T12:00:00Z');
  const payload = await pinPayload({ url: 'https://x', text: 'body text', fetch: fakeFetch });
  assert.match(payload.contentHash, /^fnv:/);
  assert.equal(payload.pinned, true);
});

test('locateSpan stores the robust character offsets', () => {
  const text = 'Alpha beta. Gamma delta epsilon. Zeta.';
  const s = locateSpan(text, 'Gamma delta epsilon.');
  assert.equal(text.slice(s.start, s.end), 'Gamma delta epsilon.');
});

// ── The driver: offline runs, ask triggers, the Bieber non-regression ───────

const CORPUS = [
  { url: 'https://a.example/report', title: 'City report', text: 'The Falcon project was launched in 2019 by Acme Corp. The Falcon project budget was 40 million dollars. Critics found the Falcon budget overran badly in 2021. The city council approved the Falcon project schedule.' },
  { url: 'https://b.example/news', title: 'News', text: 'Acme Corp signed an undisclosed contract for the Falcon project with the city. The Falcon project budget was 40 million dollars. The mayor denied the Falcon budget overran.' },
];

test('Bieber non-regression (the founding fixture): an off-topic corpus returns a measured VOID, never a false-matched report', async () => {
  const { report } = await runGroundedResearch('Who is Justin Bieber?', { sources: CORPUS });
  assert.equal(report.propositions.length, 0, 'nothing extracted from an off-topic corpus');
  assert.ok(report.voids.length >= 1, 'the absence is a measured event');
  assert.equal(report.voids[0].terrain, 'elsewhere', 'a real referent, not in this corpus');
  assert.match(report.voids[0].receipt, /scanned \d+ sentences/, 'the void carries its receipt');
  const voidAsk = report.questions.find((q) => q.ask.trigger === 'void');
  assert.ok(voidAsk, 'the VOID gate became a question, not a flat "does not say"');
});

test('an empty corpus with no search fires the corpus preliminary and stops', async () => {
  const { report } = await runGroundedResearch('anything', { sources: [] });
  assert.equal(report.questions[0].ask.trigger, 'corpus');
  assert.equal(report.propositions.length, 0);
});

test('the driver grounds, corroborates, contradicts, RECs, and asks only on measured conditions', async () => {
  const asked = [];
  const { report } = await runGroundedResearch('What happened with the Falcon project budget?', {
    sources: CORPUS,
    ask: async (a) => { asked.push(a.trigger); return null; },
  });
  assert.ok(report.propositions.length >= 5, 'extraction is selection over binding spans');
  assert.ok(report.propositions.every((p) => p.span.text && p.pinId), 'every proposition is a span at a pin');
  const contradicted = report.propositions.filter((p) => p.contradictedBy.length);
  assert.ok(contradicted.length >= 2, 'the denied-overrun contradiction was measured');
  const corroborated = report.propositions.filter((p) => p.corroboratedBy.length);
  assert.ok(corroborated.length >= 2, 'the repeated budget figure corroborates across pins');
  for (const trig of asked) assert.ok(['void', 'fork', 'rec', 'depth', 'corpus', 'disambiguate', 'domain'].includes(trig));
  // every EVA carries the causal scale that judged it — the auditable surf
  const evas = report.pulse;
  assert.ok(evas.length >= 5, 'the strain pulse is in the log');
});

test('bind-back: a summary sentence unsupported by any span greys as glue, and VERIFY counts it', async () => {
  const model = { phrase: async () => 'The Falcon project budget was 40 million dollars. Space aliens are probably responsible.' };
  const { report } = await runGroundedResearch('What happened with the Falcon project budget?', { sources: CORPUS, model });
  assert.equal(report.verify.sections, 1);
  assert.equal(report.verify.glue, 1, 'the alien sentence bound to nothing');
  assert.ok(report.verify.bound >= 1, 'the grounded sentence bound');
  const phrase = report.sections[0].phrase;
  assert.ok(phrase.prompt && phrase.raw, 'the one generative step is fully audited in the event');
  const glue = phrase.sentences.find((s) => s.glue);
  assert.match(glue.text, /aliens/i);
  assert.equal(glue.boundTo, null, 'glue carries no claim and no citation');
});

test("compose:'essay' asks the model to WRITE an essay (no 2-5 sentence cap) and lifts the token budget", async () => {
  let seenOpts = null;
  const model = { phrase: async (messages, opts) => { seenOpts = opts; return 'The Falcon project budget was 40 million dollars, and the overrun reshaped the program.'; } };
  const { report } = await runGroundedResearch('Write an essay about the Falcon project budget', { sources: CORPUS, model, compose: 'essay' });
  const sys = report.sections[0].phrase.prompt[0].content;
  assert.match(sys, /essay/i, 'the system prompt asks for an essay');
  assert.ok(!/2-5 sentences/i.test(sys), 'the terse summary cap is gone in essay mode');
  assert.equal(seenOpts && seenOpts.maxTokens, 900, 'an essay gets room to breathe');
});

test('without compose, the phrasing is byte-identical to the 2-5 sentence summary (no regression)', async () => {
  const model = { phrase: async () => 'The Falcon project budget was 40 million dollars.' };
  const { report } = await runGroundedResearch('What happened with the Falcon project budget?', { sources: CORPUS, model });
  assert.match(report.sections[0].phrase.prompt[0].content, /2-5 sentences/i, 'the default summary prompt is unchanged');
});

test('a leading instruction-echo is stripped from the rendered prose but kept verbatim in raw', async () => {
  const model = { phrase: async () => 'Here is a summary of the excerpts in plain prose, 2-5 sentences: The Falcon project budget was 40 million dollars.' };
  const { report } = await runGroundedResearch('What happened with the Falcon project budget?', { sources: CORPUS, model });
  const phrase = report.sections[0].phrase;
  assert.ok(!phrase.sentences.some((s) => /here is a summary/i.test(s.text)), 'the preamble is gone from the rendered sentences');
  assert.match(phrase.raw, /here is a summary/i, 'the raw model output still carries it (the audit is honest)');
  assert.ok(phrase.sentences.some((s) => /40 million/.test(s.text)), 'the real content survives the strip');
});

test('onSectionToken streams each section as the model phrases it, and the run is byte-identical without it', async () => {
  const model = { phrase: async (messages, opts) => { const out = 'The Falcon project budget was 40 million dollars.'; if (opts && opts.onToken) for (const w of out.split(' ')) opts.onToken(w + ' '); return out; } };
  const streamed = [];
  const { report } = await runGroundedResearch('What happened with the Falcon project budget?', {
    sources: CORPUS, model, onSectionToken: (frameId, piece) => streamed.push([frameId, piece]),
  });
  assert.ok(streamed.length > 1, 'the section streamed in several pieces');
  assert.ok(streamed.every(([fid]) => fid === 'root'), 'each piece is tagged with its section frame');
  assert.equal(streamed.map(([, p]) => p).join('').trim(), 'The Falcon project budget was 40 million dollars.', 'the pieces reassemble to the full section');
  assert.ok(report.sections[0].phrase, 'the phrased section still lands in the projection exactly as before');
});

test('the chat reply quotes the exact span under every citation number — the link is never severed', async () => {
  const model = { phrase: async () => 'The Falcon project budget was 40 million dollars.' };
  const { report } = await runGroundedResearch('What happened with the Falcon project budget?', { sources: CORPUS, model });
  const reply = formatChatReply(report, 'root');
  const m = reply.match(/\[(\d+)\]\s+“([^”]+)”/);
  assert.ok(m, 'a citation quotes its span');
  assert.ok(report.propositions.some((p) => p.span.text === m[2]), 'the quoted bytes are a real extracted span');
  assert.match(reply, /VERIFY: \d+\/\d+ sentences bind/);
});

test('depth guard: more sub-questions than the fanout budget fires the depth ask', async () => {
  const subQuestions = Array.from({ length: 12 }, (_, i) => `Falcon sub-question ${i}?`);
  const { report } = await runGroundedResearch('Falcon project?', { sources: CORPUS, subQuestions });
  assert.ok(report.questions.some((q) => q.ask.trigger === 'depth'));
  assert.ok(report.frames.length <= 9, 'the frame tree is capped at the shared MAX_FANOUT');
});

test('addressOfSentence is deterministic and always on the Object diagonal', () => {
  const a = addressOfSentence('The mayor denied the report.');
  assert.equal(a.op, 'NUL');
  const b = addressOfSentence('Acme signed a contract with the city.');
  assert.equal(b.op, 'CON');
  for (const s of ['x was launched', 'they merged the units', 'it was renamed later', 'plain claim']) {
    const addr = addressOfSentence(s);
    assert.ok(addr.terrain && addr.stance, `${s} → a full cube address`);
  }
});

// ── The live session: the surface is never dead ─────────────────────────────

test('a session appends further asks to ONE log: pins dedupe, roots accumulate, the projection adjusts', async () => {
  const s = createResearchSession({});
  let events = 0;
  s.subscribe((_, e) => { if (e) events++; });
  await s.research('What happened with the Falcon project budget?', { sources: CORPUS });
  const n1 = s.log.length;
  const r2 = await s.research('Who signed the Falcon contract?', { sources: CORPUS });
  assert.ok(s.log.length > n1, 'the second ask appended to the same log');
  assert.equal(events, s.log.length, 'every appended event notified the surface');
  const roots = s.report().sections.filter((x) => x.parentId == null).map((x) => x.frameId);
  assert.deepEqual(roots, ['root', 'r1'], 'each ask is a new frame tree in the same report');
  assert.equal(s.report().pins.length, 2, 'the same sources re-pin to the SAME pins (content hash)');
  assert.match(formatChatReply(r2.report, r2.rootId), /undisclosed contract/);
});

test('liveView is the same projector reshaped: grid states, strain bar, question cards', async () => {
  const s = createResearchSession({});
  await s.research('What happened with the Falcon project budget?', { sources: CORPUS });
  const v = liveView(s.log);
  assert.ok(v.framePanel.terms.length, 'the standing frame panel carries DEF terms');
  assert.equal(v.grid.length, 9, 'one cell per operator');
  assert.ok(v.grid.some((c) => c.state === 'contested'), 'the contradicted operator reads contested');
  assert.ok(v.path.length >= 5, 'the surf is a path of measured surprise');
  assert.ok(v.counts.pins === 2 && v.counts.propositions > 0);
});

test('the log exports as JSONL — the full surf is auditable', async () => {
  const s = createResearchSession({});
  await s.research('What happened with the Falcon project budget?', { sources: CORPUS });
  const lines = s.exportJSONL().split('\n');
  assert.equal(lines.length, s.log.length);
  for (const line of lines) {
    const e = JSON.parse(line);
    assert.ok(e.kind in RKIND || Object.values(RKIND).includes(e.kind));
    assert.ok(Number.isFinite(e.t), 'every event carries its logical time');
  }
});

test('fallback parity: no model → the report stands on exact spans (never worse than today)', async () => {
  const { report } = await runGroundedResearch('What happened with the Falcon project budget?', { sources: CORPUS });
  assert.equal(report.verify.sections, 0, 'no phrasing call was made');
  assert.ok(report.propositions.length > 0, 'the spans still ground the report');
  const reply = formatChatReply(report, 'root');
  assert.match(reply, /“.+”/, 'the reply IS the significance-ordered spans');
});

test('answerAsk lands on its ask; unanswered asks stay open in the questions band', () => {
  const log = [
    openResearch({ id: 'root', question: 'q', t: 0 }),
    askUser({ id: 'ask:0', frameId: 'root', trigger: 'void', text: 'widen?', t: 1 }),
    askUser({ id: 'ask:1', frameId: 'root', trigger: 'fork', text: 'which?', t: 2 }),
    answerAsk({ askId: 'ask:0', reply: 'widen', t: 3 }),
  ];
  const r = projectReport(log);
  assert.equal(r.questions[0].answer.reply, 'widen');
  assert.equal(r.questions[1].answer, null, 'the open question is logged as open');
});

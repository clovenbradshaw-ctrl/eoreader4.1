// The essay organ (docs/longform-generation.md): commitments before prose,
// a small carry across each doorway, bounded spine revision, and a live
// projection over the generation's own event log.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  makeSpine, renderOrder, withState, reorder, replan,
  initCarry, updateCarry, capCarry,
  claimBound, candidateVetoed, threadDeferred, reconcileFinding, spineRevised,
  projectEssay, liveView, describeEvent, reconcile, runEssay, EKIND,
} from '../src/essay/index.js';

// ── fixtures ─────────────────────────────────────────────────────────────────

const SPANS = [
  { idx: 0, text: 'The Meridian lighthouse was built in 1884 on the granite headland.' },
  { idx: 1, text: 'Keeper Alvarez kept the lighthouse logbook for thirty-one years.' },
  { idx: 2, text: 'The logbook records fourteen shipwrecks in the headland channel.' },
  { idx: 3, text: 'A Fresnel lens array replaced the original lighthouse lamp in 1902.' },
  { idx: 4, text: 'Storm surges in 1923 destroyed the keeper cottage beside the tower.' },
];

const PLAN = {
  thesis: 'the Meridian lighthouse logbook records the headland',
  sections: [
    { id: 'sec:origin', intent: 'the Meridian lighthouse construction on the granite headland' },
    { id: 'sec:keeper', intent: 'keeper Alvarez and the lighthouse logbook', dependsOn: ['sec:origin'] },
    { id: 'sec:wrecks', intent: 'the shipwrecks the logbook records in the channel', dependsOn: ['sec:keeper'] },
  ],
};

const run = (opts = {}) => runEssay({ spine: PLAN, spans: SPANS, ...opts });

// ── spine ────────────────────────────────────────────────────────────────────

test('spine: a dependency cycle refuses to build', () => {
  assert.throws(() => makeSpine({
    thesis: 't',
    sections: [
      { id: 'a', intent: 'a', dependsOn: ['b'] },
      { id: 'b', intent: 'b', dependsOn: ['a'] },
    ],
  }), /cycle/);
});

test('spine: render order puts a dependency before its dependent', () => {
  const spine = makeSpine({
    thesis: 't',
    sections: [
      { id: 'late', intent: 'late', dependsOn: ['early'], order: 0 },
      { id: 'early', intent: 'early', order: 1 },
    ],
  });
  assert.deepEqual(renderOrder(spine), ['early', 'late']);
});

test('spine: accepted sections are frozen against reorder and survive replan', () => {
  let spine = makeSpine({ thesis: 't', sections: [{ id: 'a', intent: 'a' }, { id: 'b', intent: 'b' }] });
  spine = withState(spine, 'a', 'accepted');
  assert.throws(() => reorder(spine, ['a', 'b']), /accepted/);
  assert.throws(() => replan(spine, { thesis: 'new', sections: [{ id: 'b', intent: 'b' }] }), /accepted section a/);
  const next = replan(spine, {
    thesis: 'new',
    sections: [{ id: 'a', intent: 'a', state: 'accepted' }, { id: 'c', intent: 'c' }],
  });
  assert.equal(next.thesis, 'new');
});

// ── carry ────────────────────────────────────────────────────────────────────

test('carry: the thesis is copied, never rewritten; the ledger compresses, not forgets', () => {
  const spine = makeSpine({ thesis: 'the through-line', sections: [{ id: 'a', intent: 'a' }] });
  let carry = initCarry(spine);
  carry = updateCarry(carry, {
    terminalClaim: 'end of a',
    commitments: [
      { claim: 'first claim', spanRefs: ['s0'], sectionId: 'a' },
      { claim: 'second claim', spanRefs: ['s1'], sectionId: 'a' },
    ],
    opened: [{ id: 'thread:0', text: 'a debt', openedAt: 'a', dueBy: 'b' }],
  });
  assert.equal(carry.thesis, 'the through-line');
  assert.equal(carry.priorClaim, 'end of a');
  assert.equal(carry.threads.length, 1);

  const capped = capCarry(carry, { maxLedger: 1 });
  assert.equal(capped.ledger.length, 2);
  assert.equal(capped.ledger[0].compressed, true);      // texture gone…
  assert.equal(capped.ledger[0].claim, 'first claim');  // …the claim stays checkable
  assert.deepEqual([...capped.ledger[0].spanRefs], []);
  assert.equal(capped.ledger[1].compressed, undefined);
});

// ── events ───────────────────────────────────────────────────────────────────

test('events: no unbound assertion enters the log, no silent strike, no dropped deferral', () => {
  assert.throws(() => claimBound({ sectionId: 'a', claimId: 'c', claim: 'x', spanRefs: [] }), /span/);
  assert.throws(() => candidateVetoed({ sectionId: 'a', claim: 'x', reason: '' }), /reason/);
  assert.throws(() => threadDeferred({ threadId: 'th', sectionId: 'a', dueBy: null }), /due point/);
  assert.throws(() => reconcileFinding({ kind: 'nonsense' }), /kind/);
  assert.throws(() => spineRevised({ op: 'shuffle' }), /op/);
});

// ── the section loop, spans-only ─────────────────────────────────────────────

test('runEssay: three sections, extractive floor — every commitment bound, carry threaded through', async () => {
  const { log, report, essay, done, carry } = await run();
  assert.equal(done, true);

  assert.equal(log[0].kind, EKIND.PLAN);
  const accepted = report.sections.filter((s) => s.state === 'accepted');
  assert.equal(accepted.length, 3);
  assert.deepEqual(report.order, ['sec:origin', 'sec:keeper', 'sec:wrecks']);

  // Every commitment binds to at least one span (the invariant).
  for (const c of report.ledger) assert.ok(c.spanRefs.length >= 1, `${c.claimId} unbound`);

  // The essay is assembled from the log in render order.
  assert.ok(essay.includes('Meridian lighthouse was built'));
  assert.ok(essay.indexOf('built in 1884') < essay.indexOf('fourteen shipwrecks'));

  // The carry rides the doorways: last terminal claim, thesis untouched.
  assert.equal(carry.thesis, PLAN.thesis);
  assert.equal(carry.priorClaim, accepted[2].terminalClaim);
  assert.equal(report.verify.sections, 3);
  assert.ok(report.verify.commitments >= 3);
});

test('projection: replay-stable and memoized', async () => {
  const { log } = await run();
  const a = projectEssay(log);
  assert.equal(projectEssay(log), a); // memo hit on the same log
  const copy = log.slice();
  assert.equal(JSON.stringify(projectEssay(copy)), JSON.stringify(a)); // byte-identical replay
});

test('the doorway flush: the active fold is lit mid-section and gone at the end', async () => {
  const { log } = await run();
  const spansAt = log.findIndex((e) => e.kind === EKIND.SPANS);
  const mid = liveView(log, spansAt + 1);
  assert.equal(mid.foldLane.sectionId, 'sec:origin');
  assert.ok(mid.foldLane.spanIds.length > 0);

  const end = liveView(log);
  assert.equal(end.foldLane, null); // flushed at the last doorway
  assert.equal(end.carryLane.thesis, PLAN.thesis);
  for (const e of log) assert.equal(typeof describeEvent(e), 'string');
});

// ── consolidation vetoes ─────────────────────────────────────────────────────

test('a bound claim contradicting the ledger is struck, loudly', async () => {
  const { log } = await run({
    explore: async ({ section, spans, width }) => (section.id === 'sec:wrecks'
      ? ['The logbook records fourteen shipwrecks in the headland channel.',
         'The logbook never records shipwrecks in the channel.']
      : spans.slice(0, width).map((s) => s.text)),
  });
  const veto = log.find((e) => e.kind === EKIND.VETO && e.reason.startsWith('contradicts-ledger'));
  assert.ok(veto, 'expected a contradicts-ledger veto');
  assert.match(veto.claim, /never records/);
});

test('a repeat without new grounding is struck; the section still lands', async () => {
  const { log, report } = await run({
    explore: async ({ section, spans, width }) => (section.id === 'sec:wrecks'
      ? ['Keeper Alvarez kept the lighthouse logbook for thirty-one years.', // sec:keeper already bound this to s1
         'The logbook records fourteen shipwrecks in the headland channel.']
      : spans.slice(0, width).map((s) => s.text)),
  });
  const veto = log.find((e) => e.kind === EKIND.VETO && e.reason.startsWith('repeats-ledger'));
  assert.ok(veto, 'expected a repeats-ledger veto');
  assert.equal(report.sections.find((s) => s.id === 'sec:wrecks').state, 'accepted');
});

// ── threads ──────────────────────────────────────────────────────────────────

test('threads: paid when covered, deferred with a new due point when not, unpaid at the end is a finding', async () => {
  const plan = {
    ...PLAN,
    sections: [
      { ...PLAN.sections[0],
        opens: [
          { text: 'fourteen shipwrecks in the channel', dueBy: 'sec:wrecks' },
          { text: 'the Fresnel lens array replacement', dueBy: 'sec:keeper' },
        ] },
      PLAN.sections[1],
      PLAN.sections[2],
    ],
  };
  const { log, report } = await run({ spine: plan });

  const paid = log.find((e) => e.kind === EKIND.THREAD_PAY);
  assert.ok(paid, 'the shipwreck thread should be paid by sec:wrecks');
  assert.equal(paid.sectionId, 'sec:wrecks');

  // The lens thread was due at sec:keeper, which cannot pay it — so it is
  // explicitly deferred (never silently dropped), and reconciliation names
  // the unpaid promise at the end.
  const defers = log.filter((e) => e.kind === EKIND.THREAD_DEFER);
  assert.ok(defers.length >= 1);
  assert.ok(defers.every((d) => d.dueBy));
  const unpaid = report.findings.filter((f) => f.kind === 'unpaid-thread');
  assert.equal(unpaid.length, 1);
  assert.match(unpaid[0].detail.text, /Fresnel/);
});

// ── bounded revision ─────────────────────────────────────────────────────────

test('insert: a bound claim that serves the thesis but fits no intent gets its own section', async () => {
  const plan = {
    thesis: 'the archive records construction and storm surges at the tower',
    sections: [{ id: 'sec:only', intent: 'the Meridian lighthouse construction' }],
  };
  const { log, report } = await run({
    spine: plan,
    knobs: { revisionAggression: 1, thesisFloor: 0.25 },
    explore: async ({ section }) => (section.id === 'sec:only'
      ? ['The Meridian lighthouse was built in 1884 on the granite headland.',
         'Storm surges in 1923 destroyed the keeper cottage beside the tower.']
      : ['Storm surges in 1923 destroyed the keeper cottage beside the tower.']),
  });
  const revise = log.find((e) => e.kind === EKIND.REVISE && e.op === 'insert');
  assert.ok(revise, 'expected an insert revision');
  const inserted = report.sections.find((s) => s.id === revise.sectionIds[0]);
  assert.equal(inserted.state, 'accepted');
  assert.match(inserted.intent, /Storm surges/);
  // The moved claim was not struck — it moved.
  const moved = log.find((e) => e.kind === EKIND.VETO && e.reason.startsWith('moved-to-'));
  assert.ok(moved);
});

test('insert does not fire when revisionAggression is low (drift-resistant, possibly dead)', async () => {
  const plan = {
    thesis: 'the archive records construction and storm surges at the tower',
    sections: [{ id: 'sec:only', intent: 'the Meridian lighthouse construction' }],
  };
  const { log } = await run({
    spine: plan,
    knobs: { revisionAggression: 0, thesisFloor: 0.25 },
    explore: async () => [
      'The Meridian lighthouse was built in 1884 on the granite headland.',
      'Storm surges in 1923 destroyed the keeper cottage beside the tower.',
    ],
  });
  assert.equal(log.find((e) => e.kind === EKIND.REVISE), undefined);
});

test('split: two non-coherent, spine-relevant clusters divide the section', async () => {
  const spans = [
    { idx: 0, text: 'The lighthouse lens was ground in Paris by the Fresnel workshop.' },
    { idx: 1, text: 'A clockwork mechanism rotated the lighthouse lens each night.' },
    { idx: 2, text: 'Herring quotas fell sharply across the northern fishery.' },
    { idx: 3, text: 'The fishery council enforced the herring quotas without appeal.' },
  ];
  const claimsOf = (ss) => ss.map((s) => s.text);
  const { log, report } = await run({
    spine: { thesis: 'the lens and the herring fishery', sections: [{ id: 'sec:mix', intent: 'the lighthouse lens history' }] },
    spans,
    retrieve: () => spans,
    knobs: { candidates: 1, revisionAggression: 1 },
    explore: async ({ section }) => (section.id === 'sec:mix' ? claimsOf(spans) : claimsOf(spans.slice(2))),
  });
  const revise = log.find((e) => e.kind === EKIND.REVISE && e.op === 'split');
  assert.ok(revise, 'expected a split revision');
  const partB = report.sections.find((s) => s.id !== 'sec:mix' && s.state === 'accepted');
  assert.ok(partB);
  assert.match(partB.intent, /[Hh]erring|fishery/);
  assert.equal(report.sections.find((s) => s.id === 'sec:mix').state, 'accepted');
});

test('merge: a thin section folds into the pending section that already covers it', async () => {
  const plan = {
    thesis: 'the lighthouse lens record',
    sections: [
      { id: 'sec:m1', intent: 'the Fresnel lens array' },
      { id: 'sec:m2', intent: 'the Fresnel lens array replacement in 1902' },
    ],
  };
  const { log, report } = await run({
    spine: plan,
    knobs: { candidates: 1 },
    explore: async ({ section }) => (section.id === 'sec:m1'
      ? ['A Fresnel lens array replaced the original lighthouse lamp in 1902.']
      : ['A Fresnel lens array replaced the original lighthouse lamp in 1902.',
         'The Meridian lighthouse was built in 1884 on the granite headland.']),
  });
  const revise = log.find((e) => e.kind === EKIND.REVISE && e.op === 'merge');
  assert.ok(revise, 'expected a merge revision');
  assert.equal(report.sections.find((s) => s.id === 'sec:m1'), undefined);
  assert.equal(report.sections.find((s) => s.id === 'sec:m2').state, 'accepted');
});

test('replan: a bound claim contradicting the thesis rebuilds the spine through the injected fold', async () => {
  const plan = {
    thesis: 'the logbook records shipwrecks faithfully',
    sections: [
      { id: 'sec:a', intent: 'the shipwrecks the logbook records in the channel' },
      { id: 'sec:b', intent: 'doubts about the logbook record' },
    ],
  };
  const contradiction = 'The logbook never records shipwrecks in the channel.';
  const { log, report, carry } = await run({
    spine: plan,
    explore: async ({ section }) => (section.id === 'sec:b'
      ? [contradiction]
      : ['The logbook records fourteen shipwrecks in the headland channel.']),
    replan: ({ spine }) => ({
      thesis: 'the logbook wreck record is disputed',
      sections: spine.sections.map((s) => ({ ...s })),
    }),
  });
  const revise = log.find((e) => e.kind === EKIND.REVISE && e.op === 'replan');
  assert.ok(revise, 'expected a replan revision');
  assert.equal(report.thesis, 'the logbook wreck record is disputed');
  assert.equal(carry.thesis, 'the logbook wreck record is disputed');
  // Accepted sections survived the replan verbatim.
  assert.equal(report.sections.find((s) => s.id === 'sec:a').state, 'accepted');
});

test('replan without the injected fold is recorded, never hidden', async () => {
  const contradiction = 'The logbook never records shipwrecks in the channel.';
  const { log } = await run({
    spine: {
      thesis: 'the logbook records shipwrecks faithfully',
      sections: [{ id: 'sec:a', intent: 'the shipwrecks the logbook never records in the channel' }],
    },
    spans: [{ idx: 0, text: contradiction }],
    explore: async () => [contradiction],
  });
  const finding = log.find((e) => e.kind === EKIND.FINDING && e.finding === 'thesis-contradiction');
  assert.ok(finding);
});

// ── the seam: pause, human correction, resume ────────────────────────────────

test('resume: the log is the state — pausing at a doorway and resuming matches the straight run', async () => {
  const straight = await run();
  const paused = await run({ pauseAfter: 'sec:origin' });
  assert.equal(paused.done, false);
  assert.equal(paused.report.verify.sections, 1);

  const resumed = await runEssay({ spans: SPANS, log: paused.log });
  assert.equal(resumed.done, true);
  const prose = (r) => r.report.sections.filter((s) => s.state === 'accepted').map((s) => s.prose);
  assert.deepEqual(prose(resumed), prose(straight));
});

test('resume: a carry corrected at the seam is honored by the next section', async () => {
  const paused = await run({ pauseAfter: 'sec:keeper' });
  // The human strikes a line into the ledger at the checkpoint: the wrecks
  // claim is disputed. The next section's candidate now contradicts a bound
  // claim and is struck.
  const corrected = {
    ...paused.carry,
    ledger: [...paused.carry.ledger, {
      claim: 'The logbook never records shipwrecks in the channel.',
      spanRefs: ['s9'], sectionId: 'sec:keeper',
    }],
  };
  const resumed = await runEssay({ spans: SPANS, log: paused.log, carry: corrected });
  const veto = resumed.log.find((e) => e.kind === EKIND.VETO && e.reason.startsWith('contradicts-ledger'));
  assert.ok(veto, 'the corrected carry should strike the contradicting candidate');
});

// ── render with a model ──────────────────────────────────────────────────────

const excerptEcho = (extra = '') => ({
  name: 'scripted',
  phrase: async (messages) => {
    // Echo the grounded excerpts back as prose — a faithful talker, with an
    // optional tail the test smuggles in.
    const user = messages.find((m) => m.role === 'user')?.content || '';
    const at = user.indexOf('What I found reading it:');
    const lines = [];
    for (const l of user.slice(at).split('\n').slice(1)) {
      if (!l.trim()) break;
      lines.push(l.trim());
    }
    return [lines.slice(0, 2).join(' '), extra].filter(Boolean).join(' ');
  },
});

test('render: the one prose pass is bound back to the spans it was given', async () => {
  const { log, essay, report } = await run({ model: excerptEcho() });
  const accept = log.find((e) => e.kind === EKIND.ACCEPT);
  assert.ok(accept.raw, 'the raw model output rides in the accept event');
  assert.ok(accept.prompt, 'the exact messages ride in the accept event');
  assert.match(essay, /\[s\d+\]/); // re-cited mechanically, never by the model
  // The claim-grain verdicts ride in the accept event and aggregate honestly.
  assert.ok(accept.sentences.length >= 1);
  assert.ok(accept.sentences.every((s) => s.boundTo || s.glue === true));
  assert.ok(report.verify.sentencesBound >= 1);
});

test('asymmetric granularity: a smuggled assertion is struck, glue rides marked', async () => {
  // The talker writes fluently at paragraph grain — and smuggles in one
  // contentful assertion from nowhere plus one short connective.
  const model = excerptEcho('Space aliens are probably responsible. So the record holds.');
  const { log, essay, report } = await run({ model });

  const struck = log.find((e) => e.kind === EKIND.VETO && e.reason === 'render-unbound');
  assert.ok(struck, 'the smuggled assertion should be struck after render');
  assert.match(struck.claim, /Space aliens/);
  assert.ok(!essay.includes('Space aliens'), 'a struck sentence never ships');

  const accepts = log.filter((e) => e.kind === EKIND.ACCEPT);
  const glue = accepts.flatMap((a) => [...a.sentences]).find((s) => s.glue);
  assert.ok(glue, 'the connective rides as marked glue');
  assert.equal(glue.boundTo, null);
  assert.ok(report.verify.droppedSentences >= 1);
  assert.ok(report.verify.glue >= 1);
});

test('asymmetric granularity: a rendered sentence contradicting the ledger is struck whatever it cites', async () => {
  // The contradiction shares the wrecks span's vocabulary, so it would CITE —
  // the ledger check strikes it anyway.
  const model = excerptEcho('The logbook never records shipwrecks in the channel.');
  const { log, essay } = await run({ model });
  const struck = log.find((e) => e.kind === EKIND.VETO && e.reason === 'render-contradicts-ledger');
  assert.ok(struck, 'the contradicting sentence should be struck after render');
  assert.ok(!essay.includes('never records'), 'a struck contradiction never ships');
});

// ── reconciliation ───────────────────────────────────────────────────────────

test('reconcile: names cross-section contradiction, redundancy, and off-thesis sections', () => {
  const fake = {
    thesis: 'the harbor ledger',
    openThreads: [],
    sections: [
      { id: 'a', state: 'accepted', commitments: [{ claim: 'The harbor ledger lists nine vessels.', spanRefs: ['s0'], sectionId: 'a' }] },
      { id: 'b', state: 'accepted', commitments: [{ claim: 'The harbor ledger never lists nine vessels.', spanRefs: ['s1'], sectionId: 'b' }] },
      { id: 'c', state: 'accepted', commitments: [{ claim: 'The harbor ledger lists nine vessels.', spanRefs: ['s0'], sectionId: 'c' }] },
      { id: 'd', state: 'accepted', commitments: [{ claim: 'Migration patterns of terns are seasonal.', spanRefs: ['s2'], sectionId: 'd' }] },
    ],
  };
  const findings = reconcile(fake);
  assert.ok(findings.some((f) => f.kind === 'contradiction' && f.sectionId === 'b'));
  assert.ok(findings.some((f) => f.kind === 'redundancy' && f.sectionId === 'c'));
  assert.ok(findings.some((f) => f.kind === 'off-thesis' && f.sectionId === 'd'));
});

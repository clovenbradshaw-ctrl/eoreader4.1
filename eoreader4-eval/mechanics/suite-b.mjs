// Suite B — Grounding & the veto battery.
import { setupDoc } from './harness.mjs';
import { PASS, FAIL, INCONCLUSIVE, turn, row, saysAbstain, hasAny, found } from './util.mjs';

const DOCS = {
  surveil: `The Halifax Regional Police deployed automated licence-plate readers at four intersections in March.
The devices scan every passing vehicle and store the plate, time, and location for ninety days.
Councillor Mara Singh requested the retention policy in writing but received no reply for six weeks.
A spokesperson said the readers had flagged eleven stolen vehicles since the program began.
The Nova Scotia Information and Privacy Commissioner opened a review of the retention period in May.
No municipal bylaw currently governs how long the plate data may be kept.`,
  ohs: `WorkSafe NB issued a stop-work order at the Saint John refinery on Tuesday after a scaffold collapse.
Two contractors were treated for fractures and released the same day.
The order halts all elevated work on the north unit until the scaffolding is re-certified.
The refinery operator, Irving Oil, said it was cooperating with inspectors.
The NDP labour critic called for a public inquiry into repeated incidents at the site.
The last stop-work order at the refinery was issued in 2019.`,
};

// A flag-and-tell veto is a REFUSAL when its `refuses` marker is set (unbound / unbound-contact
// / edge-contradicted / empty / declined). The drift catch also surfaces as factcheck
// unsupported/contradicted counts.
const REFUSING = new Set(['empty', 'declined', 'echo', 'unbound', 'unbound-contact', 'edge-contradicted']);
const refusedFlags = (t) => t.flagsFull.filter(f => f.refuses).map(f => f.id);

export const runSuiteB = async (env) => {
  const rows = [];

  // ── B1 — Grounded answer fully binds [veto] ───────────────────────────────
  {
    // A directly-answerable single fact, so the test isolates BINDING (does a grounded
    // answer's clause bind to a resolving, supporting span?) from the model's tendency to
    // wander on a compound question.
    const doc = setupDoc(DOCS.surveil, 'b1');
    const t = await turn(env, doc, 'Who opened a review of the retention period?');
    const claims = (t.bound || []).filter(b => String(b.claim || '').trim().length > 8);
    const cited = claims.filter(b => b.citation);
    // each citation must resolve to a real span whose text SUPPORTS the claim (token overlap)
    const supports = cited.every(b => {
      const idx = +String(b.citation).replace(/^s/, '');
      if (!(idx >= 0 && idx < doc.sentences.length)) return false;
      const span = doc.sentences[idx].toLowerCase();
      return String(b.claim).toLowerCase().split(/\s+/).filter(w => w.length > 4).some(w => span.includes(w));
    });
    const noUnbound = !t.flags.includes('unbound') && !t.flags.includes('unbound-contact');
    const answered = hasAny(t.answer, ['commissioner', 'privacy', 'information']);
    const allCited = claims.length > 0 && cited.length === claims.length;
    const ok = answered && noUnbound && allCited && supports && t.sources.length > 0;
    rows.push(row('B1', 'Grounded answer fully binds', ok ? PASS : FAIL,
      ok ? 'every factual clause carries a citation that resolves to a real, supporting span; veto bound for all (no unbound)'
         : 'a factual clause asserted with no resolving/supporting span, or an unbound veto fired',
      { answer: t.answer.slice(0, 180), sources: t.sources,
        claims: claims.length, cited: cited.length, citations_support: supports,
        no_unbound: noUnbound, bound: claims.map(b => ({ c: b.claim.slice(0, 50), cite: b.citation })).slice(0, 5) }));
  }

  // ── B2 — Out-of-corpus → VOID ─────────────────────────────────────────────
  {
    const doc = setupDoc(DOCS.surveil, 'b2');
    const t = await turn(env, doc, 'What is the population of Halifax?');
    const forbidden = found(t.answer, ['thousand', 'million', '400', '350', '300', 'roughly', 'approximately', 'population is', 'population of halifax is']);
    const abstained = t.void || saysAbstain(t.answer) || t.flags.some(f => f === 'abstained');
    const detected = refusedFlags(t);   // what the scaffold raised even if it did not suppress
    const ok = abstained && forbidden.length === 0;
    rows.push(row('B2', 'Out-of-corpus → VOID', ok ? PASS : FAIL,
      ok ? 'the system abstained (Born-rule VOID / "does not say") and asserted nothing unsourced'
         : (forbidden.length ? 'asserted an unsourced figure that REACHED OUTPUT (fluency, not grounding) — flag-and-tell detected but did not suppress it' : 'did not abstain on an out-of-corpus question'),
      { answer: t.answer.slice(0, 180), void_verdict: t.void, abstained, flags: t.flags,
        scaffold_detected_unbound: detected, forbidden_found: forbidden }));
  }

  // ── B3 — Realizer drift is caught [veto] ──────────────────────────────────
  {
    // Force the surface realizer to OVERSHOOT its spans: a number, a time, a cause, and a
    // duration the document never contains. The veto/factcheck battery must catch it before
    // it ships clean (the answer is flag-and-tell, so "caught" = a refusing veto and/or a
    // factcheck unsupported/contradicted verdict on the invented relations).
    const DRIFT = 'The scaffold collapsed at 3pm because of high winds, and five contractors were hospitalized for several months.';
    const driftModel = { id: 'drift-stub', kind: 'local', isLoaded: () => true, async load() {},
      async phrase() { return DRIFT; } };
    const doc = setupDoc(DOCS.ohs, 'b3');
    const t = await turn(env, doc, 'What happened in the scaffold collapse?', { model: driftModel });
    const refused = refusedFlags(t);
    const fc = t.factcheck || {};
    const fcCaught = (fc.contradicted || 0) > 0 || (fc.unsupported || 0) > 0 || (fc.offDiagonal || 0) > 0;
    const anyFlag = t.flags.length > 0;
    // the drifted specifics must not ride clean: SOME grounding control must have marked them
    const caught = refused.length > 0 || fcCaught || anyFlag;
    // and the unsourced specifics genuinely are absent from the doc (sanity on the fixture)
    const fixtureValid = !DOCS.ohs.includes('3pm') && !DOCS.ohs.includes('wind') && !DOCS.ohs.includes('five');
    const ok = fixtureValid && caught;
    rows.push(row('B3', 'Realizer drift is caught', ok ? PASS : FAIL,
      ok ? 'the veto/factcheck battery flagged the over-reaching clause (realization stays behind the veto)'
         : 'the embellished clause reached the answer with no grounding flag',
      { drifted_output: DRIFT, refusing_vetoes: refused, all_flags: t.flags,
        factcheck: { contradicted: fc.contradicted, unsupported: fc.unsupported, offDiagonal: fc.offDiagonal } }));
  }

  // ── B4 — Partial grounding marks the seam ─────────────────────────────────
  {
    const doc = setupDoc(DOCS.ohs, 'b4');
    // entity (the two contractors) IS in the doc; their names/ages are NOT.
    const t = await turn(env, doc, 'Two contractors were hurt — what were their names and how old were they?');
    const answeredPart = hasAny(t.answer, ['two', 'fracture', 'treated', 'released']);
    const forbidden = found(t.answer, ['named', 'aged', 'years old', 'year-old', 'years of age']);
    // marking the seam = either an explicit abstention on the gap, a void verdict, or a flag
    const marksGap = saysAbstain(t.answer) || t.void || t.flags.length > 0;
    // suppression standard: answers the part, does NOT invent the gap, AND marks it
    const ok = answeredPart && forbidden.length === 0 && marksGap;
    rows.push(row('B4', 'Partial grounding marks the seam', ok ? PASS : FAIL,
      ok ? 'answered the grounded half (the injuries) and abstained on the absent half (names/ages) rather than smoothing the gap'
         : (forbidden.length ? 'invented the missing names/ages that REACHED OUTPUT — flag-and-tell flagged the turn but did not suppress the invention' : (!answeredPart ? 'failed to answer the answerable half' : 'did not mark the gap')),
      { answer: t.answer.slice(0, 200), answered_part: answeredPart, marks_gap: marksGap,
        forbidden_found: forbidden, flags: t.flags }));
  }

  // ── B5 — Right span, not just a span [graph] ──────────────────────────────
  {
    // Two superficially-similar passages with different specifics. The citation must bind to
    // the CORRECT one.
    const text = `The Halifax Regional Police deployed automated licence-plate readers in March and store the plate data for ninety days.
The Dartmouth Transit Authority deployed fare-gate cameras in June and store the rider data for thirty days.`;
    const doc = setupDoc(text, 'b5');               // sentence 0 = Halifax/ninety, sentence 1 = Dartmouth/thirty
    const t = await turn(env, doc, 'How long does the Halifax police store the licence-plate data?');
    const boundToHalifax = t.sources.includes(0);
    const boundToDartmouth = t.sources.includes(1);
    const saysThirty = hasAny(t.answer, ['thirty', '30']);   // the Dartmouth near-miss specific
    // BINDING standard (the test's subject): the citation binds to the correct passage (s0),
    // not the plausible-but-wrong near-miss (s1), and the wrong specific does not leak in.
    const ok = boundToHalifax && !boundToDartmouth && !saysThirty;
    rows.push(row('B5', 'Right span, not just a span', ok ? PASS : FAIL,
      ok ? 'the citation bound to the correct passage (Halifax span s0), not the plausible-but-wrong near-miss (Dartmouth s1); the wrong specific (thirty) did not leak'
         : 'binding accepted a near-miss span or the wrong specific (thirty) reached the answer',
      { answer: t.answer.slice(0, 180), sources: t.sources,
        bound_to_halifax_s0: boundToHalifax, bound_to_dartmouth_s1: boundToDartmouth,
        says_thirty: saysThirty }));
  }

  return rows;
};

// Family C — void detection / abstention — against the real pipeline.
//
// Pure, environment-agnostic module: it imports only browser-safe `src/` ES
// modules (the same ones the site loads via src/main.js) and exports the corpus,
// the runner, and the scorer. No console, no process — a Node CLI (run.mjs) and
// the web page (conformance.html) both import `runFamilyC`.
//
// Deterministic by construction: `echo` model + hash embedder, no network, no
// weights. That determinism is also the ceiling — it measures the `answerable`
// void verdict and the veto flags, but it CANNOT measure FM2 (confabulation at a
// void): the echo model cannot invent. See docs/conformance-spec.md §C.6.
import { parseText } from '../src/perceiver/parse/pipeline.js';
import { runTurn } from '../src/turn/pipeline.js';
import { createAuditLog } from '../src/audit/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import '../src/model/echo.js';
import { createModel } from '../src/model/interface.js';

const setup = (text, docId) => {
  const doc = parseText(text, { docId });
  let p = null;
  doc.sentenceEmbeddings = async (e) => {
    if (p) return p;
    p = Promise.all(doc.sentences.map(s => e.embed(s)));
    return p;
  };
  return doc;
};

// Two domain-style documents (surveillance / OHS-NDP beat, per spec §1.A.2).
export const DOCS = {
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

// expected: 'void' = answer is absent from the doc; 'answer' = present.
// near = a hard near-miss (answer is near but not in the source) — tracked separately.
export const CASES = [
  // --- surveil: answerable ---
  { doc: 'surveil', q: 'How long is the plate data stored?', expected: 'answer' },
  { doc: 'surveil', q: 'Who requested the retention policy in writing?', expected: 'answer' },
  { doc: 'surveil', q: 'How many stolen vehicles were flagged?', expected: 'answer' },
  { doc: 'surveil', q: 'Who opened a review of the retention period?', expected: 'answer' },
  // --- surveil: void ---
  { doc: 'surveil', q: 'How much did the licence-plate readers cost?', expected: 'void' },
  { doc: 'surveil', q: 'What did Premier Houston say about the readers?', expected: 'void', near: true },
  { doc: 'surveil', q: 'Were any privacy lawsuits filed against the police?', expected: 'void' },
  { doc: 'surveil', q: 'What is the population of Halifax?', expected: 'void' },
  // --- ohs: answerable ---
  { doc: 'ohs', q: 'Why was the stop-work order issued?', expected: 'answer' },
  { doc: 'ohs', q: 'Who is the refinery operator?', expected: 'answer' },
  { doc: 'ohs', q: 'How many contractors were injured?', expected: 'answer' },
  { doc: 'ohs', q: 'What did the NDP labour critic call for?', expected: 'answer' },
  // --- ohs: void ---
  { doc: 'ohs', q: 'How long will the refinery be shut down entirely?', expected: 'void', near: true },
  { doc: 'ohs', q: 'What caused the scaffold to collapse?', expected: 'void', near: true },
  { doc: 'ohs', q: 'How much was Irving Oil fined?', expected: 'void' },
  { doc: 'ohs', q: 'What time did the collapse happen?', expected: 'void' },
];

const isVoid = (turn) => {
  const step = turn.steps.find(s => s.name === 'answerable');
  return !!(step && step.data && step.data.terrain === 'void');
};

// Score a set of run rows into the family-C metrics. Pure — testable on its own.
export const scoreRows = (rows) => {
  const goldVoid = rows.filter(r => r.expected === 'void');
  const goldAns  = rows.filter(r => r.expected === 'answer');
  const tp = goldVoid.filter(r => r.predictedVoid).length;
  const fn = goldVoid.filter(r => !r.predictedVoid).length;
  const fp = goldAns.filter(r => r.predictedVoid).length;
  const tn = goldAns.filter(r => !r.predictedVoid).length;

  // Saturated-discriminator gate (spec §C.6): a flag firing on > ~60% of a
  // balanced set is a degraded organ, not a measurement.
  const flagCounts = {};
  for (const r of rows) for (const f of r.flags) flagCounts[f] = (flagCounts[f] || 0) + 1;
  const SATURATION = 0.60;
  const saturated = Object.entries(flagCounts)
    .filter(([, n]) => n / rows.length > SATURATION)
    .map(([id, n]) => ({ id, n, frac: n / rows.length }));

  const nearVoids = goldVoid.filter(r => r.near);
  return {
    cases: rows.length,
    goldVoid: goldVoid.length,
    goldAns: goldAns.length,
    tp, fn, fp, tn,
    voidRecall:     tp / (tp + fn || 1),
    voidPrecision:  tp / (tp + fp || 1),
    overAbstention: fp / (fp + tn || 1),
    nearCaught: nearVoids.filter(r => r.predictedVoid).length,
    nearTotal:  nearVoids.length,
    flagCounts,
    saturated,
    saturationThreshold: SATURATION,
    // The full abstention net = the answerable verdict OR any veto flag. Reported
    // beside the bare verdict so the saturation problem is visible, not hidden.
    voidsNetCaught:  goldVoid.filter(r => r.predictedVoid || r.flags.length).length,
    ansFalseFlagged: goldAns.filter(r => r.flags.length).length,
  };
};

// Run every case through the REAL runTurn pipeline. `onCase` (optional) is invoked
// after each case so a UI can stream progress. Returns { rows, scores, meta }.
export const runFamilyC = async ({ onCase } = {}) => {
  const model = createModel('echo');
  await model.load();
  const embedder = createHashEmbedder();
  const docs = Object.fromEntries(Object.entries(DOCS).map(([k, t]) => [k, setup(t, k)]));

  const rows = [];
  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i];
    const audit = createAuditLog();
    const result = await runTurn({ question: c.q, doc: docs[c.doc], model, embedder, auditLog: audit });
    const aStep = result.turn.steps.find(s => s.name === 'answerable')?.data || {};
    const ret = result.turn.steps.find(s => s.name === 'retrieve')?.data || {};
    const row = {
      doc: c.doc, q: c.q, expected: c.expected, near: !!c.near,
      predictedVoid: isVoid(result.turn),
      kind: aStep.kind || '',
      route: result.route,
      spans: ret.n || 0,
      top: +(ret.top || 0).toFixed(2),
      flags: (result.flags || []).map(f => f.id),
    };
    rows.push(row);
    onCase?.(row, i, CASES.length);
  }

  return {
    rows,
    scores: scoreRows(rows),
    meta: {
      model: 'echo', embedder: 'hash', classifier: 'none (hash organ)',
      // FM2 needs a generative model that can invent; echo cannot. This run is a
      // plumbing/regression check, not the family-C scorecard. Spec §C.6.
      fm2Measured: false,
    },
  };
};

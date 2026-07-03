// Shared scoring + introspection helpers for the Mechanics Test Battery.
import { runTurn } from '../../src/turn/pipeline.js';
import { createAuditLog } from '../../src/audit/index.js';

export const PASS = 'PASS', FAIL = 'FAIL', INCONCLUSIVE = 'INCONCLUSIVE';

// One turn through the real pipeline, returning the answer surfaces AND the
// introspected audit. The battery keys on: answer text, citations (sources),
// veto flags, per-claim bind (bound), edge verdicts, and the fold's significance
// column (atmosphere departure, lenses, lensEntropy, paradigm, stance).
export const turn = async (env, doc, question, { history = [], model = null, now = null } = {}) => {
  const audit = createAuditLog();
  const r = await runTurn({
    question, doc,
    model: model || env.model, embedder: env.embedder,
    geometricEmbedder: env.geometricEmbedder, classifier: env.classifier,
    centroids: env.centroids, auditLog: audit, history, now,
  });
  const steps = r.turn.steps;
  const stepData = (name) => steps.find(s => s.name === name)?.data || {};
  return {
    answer: r.answer || '',
    sources: r.sources || [],
    flags: (r.flags || []).map(f => f.id),
    flagsFull: r.flags || [],
    bound: r.bound || [],
    verdicts: r.verdicts || [],
    route: r.route,
    gated: r.turn?.gated || false,
    // void verdict off the answerable stage (terrain==='void')
    void: stepData('answerable').terrain === 'void',
    answerable: stepData('answerable'),
    fold: stepData('fold'),
    surf: stepData('fold').surf || null,
    factcheck: stepData('factcheck'),
    steps: steps.map(s => s.name),
    raw: r,
  };
};

const ABSTAIN_RX = /\b(does not say|doesn'?t say|not stated|not mentioned|no information|cannot|can'?t|do(?:es)? not (?:contain|provide|specify|mention)|don'?t know|not specified|not in the (?:text|document|article|passage)|the (?:text|document|article|passage) does not|no mention|isn'?t (?:stated|mentioned|specified)|unable to|not (?:given|provided)|no .{0,20} (?:given|provided|mentioned))\b/i;

export const saysAbstain = (text) => ABSTAIN_RX.test(String(text || ''));
export const hasAny = (text, toks) => toks.some(t => String(text || '').toLowerCase().includes(t.toLowerCase()));
export const found = (text, toks) => toks.filter(t => String(text || '').toLowerCase().includes(t.toLowerCase()));

// Result row + pretty print.
export const row = (id, name, verdict, note, evidence = {}) =>
  ({ id, name, verdict, note, evidence });

export const printRow = (r) => {
  const tag = r.verdict === PASS ? '✓ PASS' : r.verdict === FAIL ? '✗ FAIL' : '· INCONCLUSIVE';
  console.log(`\n[${r.id}] ${r.name}`);
  console.log(`   ${tag} — ${r.note}`);
  for (const [k, v] of Object.entries(r.evidence || {})) {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    console.log(`     ${k}: ${s.length > 300 ? s.slice(0, 300) + '…' : s}`);
  }
};

// Count operators off an append-only event log.
export const operatorCounts = (log) => {
  const counts = {};
  for (const e of log.snapshot()) counts[e.op] = (counts[e.op] || 0) + 1;
  return counts;
};

// Entities as an array regardless of Map/array representation.
export const entitiesOf = (graph) =>
  graph.entities instanceof Map ? [...graph.entities.values()] : (graph.entities || []);

// A duck-typed log sliced to the first k events — for time-travel projection over
// the append-only log (projectGraph only reads .length and .snapshot()).
export const logUpTo = (log, k) => {
  const all = log.snapshot();
  const slice = all.slice(0, k);
  return { length: slice.length, snapshot: () => slice };
};

// A duck-typed log with the events matching `drop` removed — reconstructs the document
// state AS OF before some content was ingested (the scrubber's time-travel). The parse
// emits all INS in one pass then all relations in a second, so a raw seq-slice cannot
// separate a sentence's edges from an earlier sentence's; filtering by the predicate does.
export const logExcluding = (log, drop) => {
  const kept = log.snapshot().filter(e => !drop(e));
  return { length: kept.length, snapshot: () => kept };
};

const PRONOUN_RX = /\b(he|she|they|it|him|her|them|his|hers|its|their|theirs)\b/i;
// Does a source span SUPPORT a claim edge whose endpoints carry these labels? The span
// must name the TARGET (the new information), and either name the SOURCE or carry a
// pronoun — because a correctly coref-resolved subject ("He taunted Tomas" → Felix)
// leaves the source as a pronoun in the span, not its proper name. Crediting that is the
// point: the binding resolved the pronoun, and the span genuinely supports the claim.
export const spanSupports = (span, fromLabel, toLabel) => {
  const low = String(span || '').toLowerCase();
  const mentions = (lbl) => String(lbl || '').toLowerCase().split(/\s+/).some(t => t.length > 2 && low.includes(t));
  const targetNamed = mentions(toLabel);
  const sourceNamedOrCoref = mentions(fromLabel) || PRONOUN_RX.test(low);
  return targetNamed && sourceNamedOrCoref;
};

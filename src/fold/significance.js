// fold/significance.js — THE SIGNIFICANCE THE READER INFERS, promoted to the graph WITH its
// provenance. The connections that are not explicitly in the text — "the significance of it all".
//
// deep-reading.js has the reading VOICE a reflection (an EVA — a judgment) as a plain-text note.
// weave.js CONNECTS reflections across the corpus (echo · bears-on · analogy). Both are held only
// as substrate NODES: they never touch the physics, because a reflection is op EVA (projectGraph
// skips it) and a weave connection carries no src/tgt endpoints (so it projects no edge). They
// enrich the reading, but they cannot MOVE it — a claim can't become corroborated or contested by
// a thought that isn't on the graph.
//
// This is the other half: the significance read as a real EDGE. The reading looks across what it
// has witnessed and infers a relation the text never states —
//
//   CONTRADICTS  the same bond affirmed and denied (a polarity clash the text leaves unresolved) —
//                the tension that makes a claim CONTESTED.
//   CONNECTS     two figures that never meet in the text but both bear on a third (a shared
//                neighbour) — the latent link "in potential", made explicit.
//   CORROBORATES the same bond asserted from two places — the convergence that STRENGTHENS a claim.
//
// None of these is in any single sentence; each is the reader's own reading of how the witnessed
// facts relate. So each is promoted as a CON edge that is REAFFERENCE (fromEnactor, canWitness
// false — the §8 firewall), band VOID (held open), and tagged inferred:true. projectGraph depicts
// it BETWEEN THE REAL FIGURES (docs/monologue-significance.md) — so the surf, retrieval and the
// provenance graph read it and MOVE (impact) — while carrying its provenance onto the edge, so the
// witnessed record and the citable-facts grounder can tell it from world and never witness it.
// The firewall audit (fold/audit.js) confirms it: factsAdded 0 (no witnessed edge), inferredAdded
// N (the reader's overlay). Impact without laundering — the version that works.
//
// Deterministic and MODEL-FREE, like the reader it extends: the significance is read off the
// witnessed structure (perceiver/structureSurface), never authored.

import { fromEnactor, canWitness } from '../core/index.js';
import { structureSurface } from '../perceiver/index.js';

export const SIGNIFICANCE = 'significance';

// A light verb stem so "helped" and "did not help" are recognised as the SAME bond with opposite
// polarity (the parser inflects the negated form differently). Deliberately crude — the significance
// read tolerates a loose match; a false pair only ever proposes a VOID edge, never a fact.
const stem = (v) => String(v || '').toLowerCase().replace(/(?:ed|ing|es|s|d)$/, '') || String(v || '').toLowerCase();

// buildSignificanceEdge — the ONE append-only event a significance connection deposits: a CON (the
// bond at Relate × Structure) between two WITNESSED figures, carrying the reader's inference KIND
// and its provenance. Reafference (fromEnactor → canWitness false), band void (held open), tagged
// connection+inferred so the firewall attributes it to the reading and strips it from the record.
// It rides op CON with real src/tgt, so projectGraph DEPICTS it (the impact) carrying its prov (the
// safety) — the two facts the whole design turns on.
export const buildSignificanceEdge = ({
  kind, src, tgt, via, srcLabel = null, tgtLabel = null,
  body = '', sources = [], atSentence = null, strength = 0.5, enactment = SIGNIFICANCE,
} = {}) => {
  const prov = fromEnactor(enactment);
  return Object.freeze({
    op: 'CON', register: 'enacted', connection: true, inferred: true, layer: 'connection',
    kind, src, tgt, via, srcLabel, tgtLabel,
    w: strength, relType: 'inferred',
    body: String(body ?? ''), sources: Object.freeze([...sources]),
    sentIdx: atSentence, cursor: atSentence,
    band: 'void', grounded: false, prov, door: 'enactor',
  });
};

// inferSignificance — read the witnessed structure and surface the connections it IMPLIES but never
// states. Pure over (doc, structure); returns the connection events UNCOMMITTED (weaveSignificance
// commits). maxPerKind bounds the fan-out on a dense graph (a silent cap the caller can widen).
export const inferSignificance = (doc, { structure = null, maxPerKind = 12 } = {}) => {
  const idxs = (doc?.units || doc?.sentences || []).map((_, i) => i);
  const s = structure || (idxs.length ? structureSurface(doc, idxs) : { relations: [], defs: [] });
  const relations = (s.relations || []).filter((r) => r.src?.id && r.tgt?.id);
  const labelOf = new Map();
  for (const r of relations) { labelOf.set(r.src.id, r.src.label ?? r.src.id); labelOf.set(r.tgt.id, r.tgt.label ?? r.tgt.id); }
  const L = (id) => labelOf.get(id) ?? id;
  const out = [];

  // ── CONTRADICTS and CORROBORATES — group the bonds by (src, stem(via), tgt). A group holding
  // both polarities is a contradiction the text never resolves; a group asserting the same
  // polarity at ≥2 distinct places is corroboration.
  const byBond = new Map();
  for (const r of relations) {
    const k = `${r.src.id}|${stem(r.via)}|${r.tgt.id}`;
    if (!byBond.has(k)) byBond.set(k, []);
    byBond.get(k).push(r);
  }
  let nContra = 0, nCorrob = 0;
  for (const group of byBond.values()) {
    const pos = group.filter((r) => r.polarity !== '−');
    const neg = group.filter((r) => r.polarity === '−');
    const r0 = group[0];
    if (pos.length && neg.length && nContra < maxPerKind) {
      nContra++;
      out.push(buildSignificanceEdge({
        kind: 'contradicts', src: r0.src.id, tgt: r0.tgt.id, via: 'contradicts',
        srcLabel: L(r0.src.id), tgtLabel: L(r0.tgt.id),
        body: `the reading holds a tension: the text both affirms and denies that ${L(r0.src.id)} ${r0.via} ${L(r0.tgt.id)} — a contradiction it never resolves.`,
        sources: group.map((r) => r.idx).filter(Number.isInteger), strength: 0.8,
        atSentence: Number.isInteger(r0.idx) ? r0.idx : null,
      }));
    } else if (pos.length >= 2 && !neg.length) {
      const idxsSeen = new Set(pos.map((r) => r.idx));
      if (idxsSeen.size >= 2 && nCorrob < maxPerKind) {
        nCorrob++;
        out.push(buildSignificanceEdge({
          kind: 'corroborates', src: r0.src.id, tgt: r0.tgt.id, via: 'corroborates',
          srcLabel: L(r0.src.id), tgtLabel: L(r0.tgt.id),
          body: `the reading finds ${L(r0.src.id)} ${r0.via} ${L(r0.tgt.id)} asserted from ${idxsSeen.size} places — a corroboration that strengthens it.`,
          sources: [...idxsSeen].filter(Number.isInteger), strength: 0.7,
          atSentence: Number.isInteger(r0.idx) ? r0.idx : null,
        }));
      }
    }
  }

  // ── CONNECTS — the common-neighbour latent link. Two subjects that both relate to a shared
  // target but are NEVER directly related in the text: the reading connects them "in potential".
  const targetsOf = new Map();          // subject id -> Set of target ids
  const direct = new Set();             // ordered pairs the text relates directly (either way)
  const bondIdx = new Map();            // "sub|tgt" -> a sentence idx that asserts it (for sourcing)
  for (const r of relations) {
    if (!targetsOf.has(r.src.id)) targetsOf.set(r.src.id, new Set());
    targetsOf.get(r.src.id).add(r.tgt.id);
    direct.add(`${r.src.id}|${r.tgt.id}`); direct.add(`${r.tgt.id}|${r.src.id}`);
    if (Number.isInteger(r.idx)) bondIdx.set(`${r.src.id}|${r.tgt.id}`, r.idx);
  }
  const subs = [...targetsOf.keys()];
  let nConnect = 0;
  for (let i = 0; i < subs.length && nConnect < maxPerKind; i++) {
    for (let j = i + 1; j < subs.length && nConnect < maxPerKind; j++) {
      const A = subs[i], B = subs[j];
      if (direct.has(`${A}|${B}`)) continue;            // the text already relates them — not latent
      const shared = [...targetsOf.get(A)].filter((x) => targetsOf.get(B).has(x) && x !== A && x !== B);
      if (!shared.length) continue;
      const X = shared[0];
      nConnect++;
      out.push(buildSignificanceEdge({
        kind: 'connects', src: A, tgt: B, via: 'bears-on',
        srcLabel: L(A), tgtLabel: L(B),
        body: `${L(A)} and ${L(B)} both bear on ${L(X)}${shared.length > 1 ? ` (and ${shared.length - 1} more)` : ''} — a connection the text implies but never states.`,
        sources: [bondIdx.get(`${A}|${X}`), bondIdx.get(`${B}|${X}`)].filter(Number.isInteger),
        strength: Math.min(0.4 + 0.15 * shared.length, 0.9),
        atSentence: bondIdx.get(`${A}|${X}`) ?? null,
      }));
    }
  }

  return out;
};

// weaveSignificance — infer the connections and (by default) COMMIT them to the log as reafferent
// edges, so the reading MOVES: the surf, retrieval and the provenance graph now read them. Returns
// the committed connections, a per-kind tally, and canWitness surfaced (false — the firewall).
//   commit:false  returns the events without appending (peek, or hand to a provenance-aware view).
export const weaveSignificance = (doc, { structure = null, maxPerKind = 12, commit = true, enactment = SIGNIFICANCE } = {}) => {
  if (!doc || !doc.log) throw new Error('weaveSignificance: a doc with a log is required');
  const events = inferSignificance(doc, { structure, maxPerKind });
  const connections = events.map((e) => (commit ? doc.log.append(e) : e));
  const kinds = { contradicts: 0, corroborates: 0, connects: 0 };
  for (const c of connections) if (kinds[c.kind] != null) kinds[c.kind]++;
  return Object.freeze({
    connections, count: connections.length, kinds,
    // every promoted edge is reafference — it can never witness world (surfaced for the caller's audit).
    reafferent: connections.every((c) => canWitness(c.prov) === false),
  });
};

// readSignificance — the connections a log already carries (read at read time, like readReflections).
export const readSignificance = (doc) => {
  const events = typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);
  return events.filter((e) => e && e.op === 'CON' && e.inferred === true && e.layer === 'connection');
};

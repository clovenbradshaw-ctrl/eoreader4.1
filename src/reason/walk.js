// reason/walk.js — the reasoning walk: continuous, meaningful output as a loop over the log.
//
// think.js (the inner-speech loop) reorganises attention over structure the corpus ALREADY
// holds: it voices an impression, reads it back through the enactor->perceiver edge, re-focuses,
// and quiesces. Past the ground it emits a VOID — an open question ("What of Klamm?") — never a
// leap into the gap, and it grows a reading by re-parsing grown TEXT (inquire), never committing.
// So it develops attention; it does not develop STRUCTURE, and it never commits.
//
// The walk is the delta. Three moves distinguish it:
//
//   1. IT COMMITS. Each step is a real event appended to the same append-only log the corpus
//      lives on (core/log.js). Step N+1 reads the graph projected over the log INCLUDING step N's
//      event. Continuity is not a string in a context window; it is ACCUMULATION over the log.
//      Step three's conclusion is an admitted span at step four, because it is literally there.
//
//   2. IT REACHES. The moves are SYN / CON / REC — synthesise a figure the corpus never named,
//      bond two figures the corpus left unbonded, learn a rule from a repeated relation. These
//      WRITE NEW and READ-TWO-WRITE-LINK (cube SIGNATURES): structure the corpus did not state.
//      That is the leap the answerability VOID gate would otherwise refuse.
//
//   3. IT CANNOT LAUNDER. Every step is voiced through the ENACTOR door (fromEnactor): reafference,
//      mine. By the provenance type law (core/provenance §8) canWitness(step) is FALSE — not by a
//      flag, by the type. A step can ORIENT the next step (canOrient is true for every provenance)
//      but can never WITNESS a later claim as world. A chain that read its own output as ground
//      would drift into confabulation with perfect internal citations — the worst failure, because
//      it looks audited. The type law makes that drift impossible. This is idle.js's I2 firewall,
//      per committed step.
//
// The grade a step carries (docs/ungrounded-emitted.md) is READ OFF THE LOG, never elected:
//   grounded              an EXAFFERENT event (the corpus, canWitness true) attests this claim.
//   warranted-ungrounded  no exafferent witness, but a prior REC generalises a regularity that WAS
//                         exafferently witnessed (>= 2 corpus pairs), and this step instantiates it.
//   idle-ungrounded       a bare reach: no exafferent witness, no backing rule. Shipped, marked.
//
// Termination is SATURATION, not a token budget: the walk stops when the best available reach adds
// no fresh structure the field did not already hold — the one surprise (core/surprise.js) goes flat.
// A hard maxSteps is the backstop only (arc §5.7: it should never bind if saturation is working).
//
// The loop needs NO model. A `propose` backend may be injected to let a talker RANK the confined
// menu; the loop, the firewall, the grade and the termination are model-independent. The reasoning
// is the walk over the graph, not a draw from a large network.

import { fromPerceiver, fromEnactor, classify, canWitness } from '../core/provenance.js';
import { firm, voidRes, mintHash } from '../core/event.js';
import { surpriseAt } from '../core/surprise.js';

// ── The corpus adapter — appearance events through the PERCEIVER door ─────────
export const seedCorpus = (log, spec = [], { enactment = 'ingest' } = {}) => {
  const prov = fromPerceiver(enactment);
  for (const e of spec) {
    if (e.op === 'INS') log.append({ op: 'INS', id: e.id, label: String(e.label), prov });
    else if (e.op === 'CON') log.append({ op: 'CON', src: e.src, dst: e.dst, via: String(e.via || 'rel'), prov });
    else log.append({ ...e, prov });
  }
  return log;
};

// ── Reading the log back into the sets the walk reasons over ──────────────────
// A figure minted by a WALK step (enactor INS/SYN) is admitted exactly as a corpus figure is, so
// the next step can bond to it (the accumulation). What differs is the DOOR, which the grade
// consults, never the reach.
const readGraph = (log) => {
  const events = log.snapshot();
  const figures = new Map();
  const bonds = [];
  for (const e of events) {
    if ((e.op === 'INS' || e.op === 'SYN') && e.id != null && !figures.has(e.id)) {
      figures.set(e.id, { id: e.id, label: String(e.label ?? e.id), door: e.prov?.door ?? 'perceiver', grain: e.grain | 0, seq: e.seq });
    }
    if (e.op === 'CON' && e.src != null && e.dst != null) {
      bonds.push({ src: e.src, dst: e.dst, via: String(e.via || 'rel'), door: e.prov?.door ?? 'perceiver', canWitness: canWitness(e.prov ?? null) });
    }
  }
  const grains = new Set([...figures.values()].map((f) => f.grain));
  return { events, figures, bonds, grains };
};

const bondKey = (src, dst, via) => `${src}|${via}|${dst}`;
const pairKey = (a, b) => (String(a) < String(b) ? `${a}~${b}` : `${b}~${a}`);

// ── The grade, read off the log (never elected) ───────────────────────────────
const gradeBond = ({ src, dst, via }, { bonds, rules }) => {
  const key = bondKey(src, dst, via);
  const witnessed = bonds.some((b) => b.canWitness && bondKey(b.src, b.dst, b.via) === key);
  if (witnessed) return { grade: 'grounded', band: firm() };
  const rule = rules.find((r) => r.via === via && r.support >= 2);
  if (rule) return { grade: 'warranted-ungrounded', band: voidRes(0.6), warrant: { rule: rule.via, support: rule.support } };
  return { grade: 'idle-ungrounded', band: voidRes() };
};

// ── The confined menu over the live frontier ──────────────────────────────────
// The walk is cheap because the next move is drawn from a SMALL menu the graph defines, not from
// open chain-of-thought over everything sayable. The frontier is the admitted figures; from it:
//   REC  a `via` that bonds >= 2 EXAFFERENT pairs is a rule waiting to be learned (once).
//   CON  bond two admitted figures the graph has not yet bonded (relate the unrelated).
//   SYN  promote a bonded pair not yet synthesised into a higher-grain figure the corpus never
//        named (the accumulation driver — later steps build on it).
// Each candidate carries the `arrival` mass it deposits, so the loop scores it by surprise. A
// rule's mass reflects the observations it subsumes; a synthesis's mass reflects the new grain it
// introduces — so the high-information moves are legitimately surprising, not hand-weighted.
const menu = (graph, { rules, synthesised, bondsSeen }) => {
  const out = [];
  const ids = [...graph.figures.keys()];
  const bonded = new Set(graph.bonds.map((b) => pairKey(b.src, b.dst)));
  const viaCounts = new Map();
  for (const b of graph.bonds) if (b.canWitness) viaCounts.set(b.via, (viaCounts.get(b.via) || 0) + 1);
  const topVia = [...viaCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'rel';

  // REC — learn each repeated exafferent relation, once.
  for (const [via, n] of viaCounts) {
    if (n >= 2 && !rules.some((r) => r.via === via)) {
      const arrival = new Map([[`rule:${via}`, n], [`licenses:${via}`, 1]]);
      out.push({ op: 'REC', via, support: n, arrival, exaFrac: 1, participants: partiesOf(graph.bonds, via),
        note: `learn ${via} as a rule (holds across ${n} attested pairs)` });
    }
  }
  // CON — bond an unbonded admitted pair. `via` is the graph's most-supported relation.
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j];
      if (bonded.has(pairKey(a, b)) || bondsSeen.has(pairKey(a, b))) continue;
      const arrival = new Map([[`bond:${pairKey(a, b)}`, 1]]);
      out.push({ op: 'CON', src: a, dst: b, via: topVia, arrival, exaFrac: exaFracOf([a, b], graph.figures),
        note: `bond ${graph.figures.get(a)?.label} ${topVia} ${graph.figures.get(b)?.label}` });
    }
  }
  // SYN — promote a bonded pair not yet synthesised.
  for (const b of graph.bonds) {
    const pk = pairKey(b.src, b.dst);
    if (synthesised.has(pk)) continue;
    const promotedSeq = graph.figures.size + 1 + out.length;
    const id = mintHash(promotedSeq);
    const newGrain = Math.max(0, ...graph.grains) + 1;
    const arrival = new Map([[`syn:${pk}`, 1]]);
    out.push({ op: 'SYN', id, members: [b.src, b.dst], grain: newGrain, pairKey: pk, arrival, exaFrac: exaFracOf([b.src, b.dst], graph.figures),
      label: `${graph.figures.get(b.src)?.label}+${graph.figures.get(b.dst)?.label}`,
      note: `synthesise a figure over {${graph.figures.get(b.src)?.label}, ${graph.figures.get(b.dst)?.label}}` });
  }
  return out;
};

const exaFracOf = (ids, figures) => {
  if (!ids.length) return 1;
  const exa = ids.filter((id) => (figures.get(id)?.door ?? 'perceiver') === 'perceiver').length;
  return exa / ids.length;
};

const partiesOf = (bonds, via) => {
  const s = new Set();
  for (const b of bonds) if (b.via === via) { s.add(b.src); s.add(b.dst); }
  return [...s];
};

// ── The one surprise, over the walk's own basis (core/surprise.js) ────────────
const surpriseOf = (candidate, profile, gamma) => {
  const { bayesBits } = surpriseAt(profile, candidate.arrival, { gamma });
  return bayesBits;
};

// ── The walk ──────────────────────────────────────────────────────────────────
export const walkReasoning = async (log, {
  gamma = 0.7, epsilon = 0.02, maxSteps = 24, enactment = 'reason', propose = null, selfReachBudget = 3,
} = {}) => {
  const rules = [];
  const synthesised = new Set();
  const bondsSeen = new Set();
  const profile = new Map();
  let selfReach = selfReachBudget;
  const steps = [];
  const saturationTrace = [];

  for (let i = 0; i < maxSteps; i++) {
    const graph = readGraph(log);
    const cands = menu(graph, { rules, synthesised, bondsSeen });
    if (!cands.length) { saturationTrace.push({ i, reason: 'no-admissible-move', bits: 0 }); break; }

    // A bounded reach past the ground: the walk may extrapolate beyond the corpus a fixed number
    // of steps (self-anchored moves, exaFrac < 1), then it must stop reaching and only corpus-
    // anchored structure keeps it alive. This is the policy the analysis named — the decomposable
    // reasoning is surfaced, and the rest is declined rather than spun (arc/saturation.js: saturate
    // on GROUND coverage, not on finding fresh self-symbols).
    const live = selfReach > 0 ? cands : cands.filter((c) => (c.exaFrac ?? 1) >= 1);
    if (!live.length) { saturationTrace.push({ i, reason: 'ground-covered', bits: 0 }); break; }
    const scored = live.map((c) => ({ c, bits: surpriseOf(c, profile, gamma), rank: surpriseOf(c, profile, gamma) * (c.exaFrac ?? 1) }))
      .sort((a, b) => b.rank - a.rank);
    let choice = scored[0];
    if (typeof propose === 'function') {
      const picked = await propose(scored.map((s) => s.c), { graph, profile });
      if (picked) choice = scored.find((s) => s.c === picked) || { c: picked, bits: surpriseOf(picked, profile, gamma) };
    }

    // SATURATION — the best available reach adds no fresh structure. The field ends the walk.
    if (choice.bits < epsilon) { saturationTrace.push({ i, reason: 'saturated', bits: round3(choice.bits) }); break; }
    if ((choice.c.exaFrac ?? 1) < 1) selfReach -= 1;   // spend the reach budget on a self-anchored move
    const cand = choice.c;
    const prov = fromEnactor(enactment);   // mine — canWitness will be false, by type

    let event, grade, warrant = null, sites = [];
    if (cand.op === 'REC') {
      rules.push({ via: cand.via, support: cand.support });
      event = { op: 'REC', via: cand.via, support: cand.support, prov };
      grade = 'warranted-ungrounded'; warrant = { induced_from: cand.support };
      sites = cand.participants.slice();          // keep the rule's figures live on the frontier
    } else if (cand.op === 'SYN') {
      synthesised.add(cand.pairKey);
      const g = gradeBond({ src: cand.members[0], dst: cand.members[1], via: 'coheres' }, { bonds: graph.bonds, rules });
      event = { op: 'SYN', id: cand.id, label: cand.label, members: cand.members, grain: cand.grain, prov };
      grade = g.grade === 'grounded' ? 'warranted-ungrounded' : g.grade;   // a source never mints your figure
      warrant = g.warrant ?? null; sites = cand.members.slice();
    } else { // CON
      bondsSeen.add(pairKey(cand.src, cand.dst));
      const g = gradeBond({ src: cand.src, dst: cand.dst, via: cand.via }, { bonds: graph.bonds, rules });
      event = { op: 'CON', src: cand.src, dst: cand.dst, via: cand.via, prov };
      grade = g.grade; warrant = g.warrant ?? null; sites = [cand.src, cand.dst];
    }

    const sealed = log.append(event);   // COMMIT — step i+1 reads it back off the log

    const builtOnSelf = sites.some((id) => graph.figures.get(id)?.door === 'enactor');
    steps.push(Object.freeze({
      i, op: cand.op, note: cand.note, sites, seq: sealed.seq, grade, warrant,
      prov: sealed.prov, classified: classify(sealed.prov),
      canWitness: canWitness(sealed.prov),   // FALSE, by type — the firewall
      builtOnSelf, bits: round3(choice.bits),
    }));

    for (const [a, m] of cand.arrival) profile.set(a, (profile.get(a) || 0) + m);
    saturationTrace.push({ i, reason: 'reach', op: cand.op, bits: round3(choice.bits) });
  }

  const last = saturationTrace.at(-1);
  const quiesced = !!last && ['saturated', 'no-admissible-move', 'ground-covered'].includes(last.reason);
  const gradeCounts = steps.reduce((m, s) => (m[s.grade] = (m[s.grade] || 0) + 1, m), {});
  const grounded = gradeCounts['grounded'] || 0;
  const groundedFraction = steps.length ? grounded / steps.length : 0;

  return Object.freeze({
    steps, quiesced, saturationTrace, groundedFraction, gradeCounts,
    everyStepIsMine: steps.every((s) => s.canWitness === false),
  });
};

const round3 = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

// noStepLaunders — the type-law guarantee, as a predicate for the conformance battery
// (docs/ungrounded-emitted.md I1/I2): every committed step is reafference (cannot witness), and a
// `grounded` grade can only ever come from an EXAFFERENT witness (gradeBond), never from the walk.
export const noStepLaunders = (result) =>
  result.steps.every((s) => s.canWitness === false);

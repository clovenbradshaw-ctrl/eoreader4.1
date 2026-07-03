import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { projectGraph, typeOf, isObjectFunctional, checkObjectFunctionalConflict } from '../src/core/index.js';
import { factCheck, claimedEdges, VERDICTS } from '../src/factcheck/index.js';
import { surfFold } from '../src/surfer/surf.js';
import { buildBasis } from '../src/enactor/basis.js';
import { ingestText } from '../src/organs/in/text.js';

// §4 (docs/subjective-frame.md) — the parse-layer / algebra unlock the §5 veto depends on,
// behind the RULES_REV flag with golden parity. The bug the audit found: the reading held
// no `Gregor -> insect : transformed-into`, so the talker's `father -> insect :
// transformed-into` corresponded to nothing and drew contradicted:0. These tests pin the unlock: the
// change-of-state algebra marks a different-undergoer claim CONTRADICTED, the coordinated-
// subject reading reaches the convergence the single scan drops, and the basis carries
// kinship/role edges as first-class elements. All flag-driven by an EXPLICIT argument, so
// they are deterministic and the default (flag off) path stays byte-identical.

// ── the change-of-state primitive ────────────────────────────────────────────
test('change-of-state verbs type to the OBJECT-functional `becomes` primitive', () => {
  for (const v of ['transformed', 'became', 'turned', 'metamorphosed', 'changed']) {
    assert.equal(typeOf(v)?.type, 'becomes', `${v} → becomes`);
    assert.ok(isObjectFunctional(v), `${v} is object-functional (one undergoer per resultant)`);
  }
  // The subject-functional flag stays false, so the existing functional-axiom never fires it.
  assert.equal(typeOf('transformed').functional, false);
});

// ── the object-functional clash, on a hand-built graph ───────────────────────
test('checkObjectFunctionalConflict: a different undergoer reaching the same resultant contradicts', () => {
  const graph = {
    representative: (id) => id,
    edges: [{ from: 'gregor', via: 'transformed', to: 'vermin', sentIdx: 1 }],
  };
  // The father claims he reached the resultant Gregor already reached — contradicted.
  const denied = checkObjectFunctionalConflict(graph, { src: 'father', tgt: 'vermin', via: 'transformed' });
  assert.equal(denied?.verdict, VERDICTS.CONTRADICTED);
  assert.equal(denied.reason, 'object-functional-axiom');
  assert.equal(denied.citation, 's1', 'it earns the witnessing sentence');
  // The SAME undergoer reaching the same resultant is corroboration, not a clash.
  assert.equal(checkObjectFunctionalConflict(graph, { src: 'gregor', tgt: 'vermin', via: 'transformed' }), null);
  // A non-change-of-state relation is outside this algebra — defer (null), never false-fire.
  assert.equal(checkObjectFunctionalConflict(graph, { src: 'father', tgt: 'vermin', via: 'tends' }), null);
});

// ── end to end through factCheck: the audit's missing number ─────────────────
test('the §5 veto marks `father -> insect : transformed-into` CONTRADICTED (flag on); INDETERMINATE (flag off — golden parity)', async () => {
  // A controlled reading: Gregor undergoes the transformation; Hermann is a distinct figure.
  // (Active voice, so the parser extracts the edge — Kafka's resultative "found himself
  // transformed" is the harder extraction the flag is benchmarked on before shipping.)
  const doc = parseText('Gregor Samsa woke. Gregor Samsa transformed into a vermin. Hermann Samsa watched Gregor Samsa.',
    { docId: 'meta', referents: true });
  const graph = projectGraph(doc.log, {});
  const prose = 'Hermann Samsa transformed into a vermin.';   // the talker's wrong attribution

  const on = await factCheck({ prose, doc, graph, changeOfState: true });
  assert.equal(on.counts.contradicted, 1, 'the change-of-state clash fires the contradiction the audit was missing');
  assert.ok(on.refuse, 'and it is a REFUSING contradiction — the §5 gate engages on it');
  assert.ok(on.fired.some(f => f.id === 'edge-contradicted' && f.refuses));

  const off = await factCheck({ prose, doc, graph, changeOfState: false });
  assert.equal(off.counts.contradicted, 0, 'flag off → byte-identical: the resultant is not even an endpoint');
  assert.equal(off.counts.indeterminate, 1);
});

// ── coordinated subjects (the colon boundary) ────────────────────────────────
test('coordinated subjects reach the convergence a colon buries (flag on); the single scan misses it (flag off)', () => {
  const text = 'Delgado met Reyes. Reyes trusted Delgado. The filings told the story: Delgado and Reyes betrayed Klaus.';
  const betray = (coordSubjects) => {
    const g = projectGraph(parseText(text, { docId: 'c', coordSubjects, referents: true }).log, {});
    return g.edges.filter(e => /betray/.test(e.via)).map(e => `${e.from}->${e.to}`).sort();
  };
  assert.deepEqual(betray(false), [], 'the colon-introduced coordination is dropped by the single-subject scan');
  assert.deepEqual(betray(true), ['delgado->klaus', 'reyes->klaus'], 'both conjuncts bond to the shared object');
});

test('the text ingest threads coordSubjects (the RULES_REV-driven switch is overridable)', async () => {
  const text = 'Delgado met Reyes. Reyes trusted Delgado. The filings told the story: Delgado and Reyes betrayed Klaus.';
  const doc = await ingestText(text, { coordSubjects: true });
  const g = projectGraph(doc.log, {});
  assert.ok(g.edges.some(e => e.from === 'reyes' && /betray/.test(e.via)), 'the ingest honoured coordSubjects:true');
});

// ── the basis relational / role atom ─────────────────────────────────────────
test('the grounded basis carries kinship/role edges as first-class relation elements', () => {
  const doc = parseText('Gregor Samsa woke. Gregor Samsa transformed into a vermin. His sister Grete watched Gregor Samsa.',
    { docId: 'b', referents: true });
  const basis = buildBasis(surfFold(doc, 0), doc, 'who is gregor’s sister?');
  assert.ok(Array.isArray(basis.relations), 'the relations atom exists');
  assert.ok(basis.relations.some(r => r.type === 'sibling'),
    'a kinship reading now moves mass — the sister edge is a first-class basis element');
  for (const r of basis.relations) assert.ok(typeOf(r.via), 'only TYPED relations enter the atom');
});

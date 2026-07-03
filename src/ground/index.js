// The ground holon: cite-or-veto. The integrity guarantee.

export { bindCitations, renderBound } from './bind.js';
export { runVetoes, VETOES, isUnbound, isAbstention } from './veto.js';
// The per-section cite-then-flag the arc reuses (spec-the-arc §5.5): the turn's
// bind+veto guarantee, run at section grain against a cluster's own span set.
export { bindAndVeto } from './section.js';
// Per-proposition grounding provenance — veto on propositional MEANING, not raw spans. Each
// proposition of a response is verbatim (lifted), grounded (its figures stand in the same
// relation a read span asserts), or grounded-to-the-VOID (witnessed by nothing read — it
// rests on the model's own training). Nothing is groundless: void is the ground of last
// resort, named so the surface can raise it. A response can be a mix; the void-grounded
// propositions are the ones a veto flags.
export { classifyProvenance } from './provenance.js';
// The reflection: parse the model's OUTPUT back into EOT, compare each proposition with
// the document graph, and judge the groundedness of what the graph holds — counting the
// diverse, independent origins that witness each claim (docs/creative-grounded-modes.md).
export { reflectAnswer, eotLineOf } from './reflect.js';

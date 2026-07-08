// reason/index.js — the reasoning-walk holon entrance.
//
// The walk over the append-only log: continuous, meaningful output as ACCUMULATION over
// committed steps, each voiced through the enactor door (canWitness false, by type), each
// graded (grounded / warranted-ungrounded / idle-ungrounded) off the log, terminating on
// surprise-saturation. See walk.js for the full account and docs/ungrounded-emitted.md for the
// resolution lattice it emits into.
//
// Depends on `core` only. No model. A `propose` backend may be injected to let a talker rank
// the confined menu; the loop, the firewall, the grade, and the termination are model-independent.

export { walkReasoning, seedCorpus, noStepLaunders } from './walk.js';

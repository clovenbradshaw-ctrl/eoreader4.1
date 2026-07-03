// The longgen holon — long generation across messages (docs/long-generation.md),
// the planner (docs/spec-planner.md).
//
// spec-generation.md Piece 3 (the autoregressive closure) wired from pieces that
// already exist: the conversation fold (converse), the forward move-predictor
// (predict), and the arc's realize+floor (arc). spec-planner.md turns the same
// closure into the planner — the surfer turned to write — by making its three faces
// real and checkable: Navigate (direction.js), Resolve with the operator HONORED
// (resolve.js), Render under the prompt contract (prompt.js); guarded by the
// answerability gate (answerable.js), shaped by the significance arc (shape.js),
// stopped by saturation/quiesce (continuation.js), and offered as a setting
// (generate.js). `longgen` orchestrates; it imports only public faces.

export { runContinuation } from './continuation.js';
export { predictDirection, selfMoveLog, SEED_MOVE } from './direction.js';
export { fieldStrain, MIN_FIELD } from './field.js';
export { holonicConfinement, toLensConfig } from './confine.js';
export { relax, relaxMove } from './relax.js';
export { exportAudit, diagnose } from './audit.js';
export { nulGate, participationRatio } from './nul.js';
export { resolveProposition, STANCE, EDGE_OPS } from './resolve.js';
export {
  classifyWantedType, groundSupplies, answerabilityGate, refusalAtom,
  developableRegions, followUpOffer, WANTED_TYPES,
} from './answerable.js';
export { arcPhase, phaseBias, applyPhaseBias, shouldCollapse } from './shape.js';
export {
  atomPrompt, stablePrefix, prefixCacheKey, readWindow,
  propositionInstruction, speculateNext, SYSTEM_WRITER,
} from './prompt.js';
export { generate, plainPath, compareModes } from './generate.js';

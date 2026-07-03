// tasks/constants.js — the task graph's guards.
//
// Like the arc's constants, none of these is a length target. Length and shape
// are emergent: the graph is as deep and as wide as `decompose` chooses to make
// it, and `decompose` should split only while a goal is genuinely too big for one
// reach. These are the RUNAWAY guards — if `decompose` never quiesces, depth and
// fanout cap the tree so a confused decomposer cannot fork forever. A trace that
// shows one of these firing is a signal worth reading, not a normal stop.

// MAX_DEPTH — the deepest a goal may nest. At this depth a node is forced to be a
// leaf (the runner stops asking `decompose` and calls `generate`). Three levels —
// goal → section → point — already covers the document-chat shapes the arc
// handles; the guard sits above that so real plans never touch it.
export const MAX_DEPTH = 4;

// MAX_FANOUT — the most children one decomposition may declare. Demand caps
// supply the way the arc's reconcile does: a decomposer that returns more
// sub-goals than this is truncated, and the drop is recorded in the trace.
export const MAX_FANOUT = 8;

// MAX_NODES — the total node backstop across the whole tree, the last line of
// defence against a decomposer that keeps splitting just under the depth and
// fanout caps. Generous; if saturation (a decomposer that returns [] on a small
// goal) is working it never binds.
export const MAX_NODES = 256;

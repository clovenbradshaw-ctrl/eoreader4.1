// tasks/events.js — the append-only TaskEvent log (the generation side's spine,
// one level deeper than the arc).
//
// The document is a fold of its event log; the turn is a fold of its stage list;
// the arc is a fold of its FLAT section plan. A flat plan is one level of
// decomposition — question → sections — and a small model still has to draft a
// whole section in one reach. The task graph adds the missing axis: a goal that
// is too big to draft is DECOMPOSED into sub-goals, each of which may decompose
// again, until every leaf is small enough that a small LLM can produce it in one
// bite. The whole nested structure is PROJECTED from these events (project.js),
// never stored — re-folding the same log yields the identical graph (replay-
// stable), exactly as the parse graph is.
//
// Five kinds, append-only, each frozen at entry and never edited:
//
//   open       a node enters the graph (the goal exists, nothing done yet)
//   decompose  a node is split — its child ids are declared (the children arrive
//              as their own `open` events; this only records the parent→children
//              edge so the projection knows the node is internal, not a leaf)
//   step       progress on a node (a note; marks it active before it completes)
//   complete   a LEAF produced output (the small-LLM reach landed)
//   fail       a node could not be produced (a leaf the model refused, or an
//              internal node whose children all failed)
//
// Ids are PATHS, minted by the runner as `${parentId}.${childIndex}` off a root.
// A path id is its own position in the tree, so the log is order-independent to
// project and trivially replay-stable: same goal, same decomposition, same ids.

export const KIND = Object.freeze({
  OPEN:      'open',
  DECOMPOSE: 'decompose',
  STEP:      'step',
  COMPLETE:  'complete',
  FAIL:      'fail',
});

const freeze = (e) => Object.freeze(e);

// A node enters the graph. `parentId` is null for the root. `depth` is the
// nesting level (root = 0), carried so the runner's depth guard and the UI's
// indent read it straight off the event. `grain` is the planner's DECLARED cube
// Object grain for this goal ('Ground' | 'Figure' | 'Pattern' | null) — the
// projection checks it against the node's structural grain (tasks/grain.js).
// `forced` marks a leaf a guard made out of a still-splitting goal: structurally
// a Figure, declared a Pattern, so the confab guard flags it.
export const openEvent = ({ id, parentId = null, goal, depth = 0, grain = null, forced = false, t = 0 }) => {
  if (!id) throw new TypeError('openEvent: id required');
  return freeze({
    kind: KIND.OPEN, id, parentId, goal: String(goal ?? ''), depth: depth | 0,
    grain: grain ?? null, forced: !!forced, t,
  });
};

// A node is declared internal — these are the children it owns. The children are
// opened by their own `open` events; this edge is what tells the projection the
// node is a branch (rollup status) rather than a leaf (its own complete/fail).
export const decomposeEvent = ({ id, childIds, t = 0 }) => {
  if (!id) throw new TypeError('decomposeEvent: id required');
  return freeze({ kind: KIND.DECOMPOSE, id, childIds: Object.freeze([...(childIds || [])]), t });
};

// Progress on a node — a human-readable note. Marks the node `active` in the
// projection (the reach is underway) before its terminal event arrives.
export const stepEvent = ({ id, note = '', t = 0 }) => {
  if (!id) throw new TypeError('stepEvent: id required');
  return freeze({ kind: KIND.STEP, id, note: String(note), t });
};

// A leaf produced output. `sources` are the cited source indices the generation
// bound to (folded up the tree by the projection), mirroring the arc's
// per-section sources so the task graph carries the same provenance.
export const completeEvent = ({ id, output = '', sources = [], t = 0 }) => {
  if (!id) throw new TypeError('completeEvent: id required');
  return freeze({
    kind: KIND.COMPLETE, id, output: String(output ?? ''),
    sources: Object.freeze([...(sources || [])]), t,
  });
};

// A node could not be produced. The error is recorded, never thrown away — a
// blocked leaf is part of the trace, the same way the audit keeps a refusing
// veto rather than hiding it.
export const failEvent = ({ id, error = '', t = 0 }) => {
  if (!id) throw new TypeError('failEvent: id required');
  return freeze({ kind: KIND.FAIL, id, error: String(error ?? ''), t });
};

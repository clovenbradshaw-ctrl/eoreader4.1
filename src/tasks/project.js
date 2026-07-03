// tasks/project.js — projectTaskGraph: a pure fold of the TaskEvent log into the
// nested graph object.
//
// THIS is the object the request asks for: "a graph object that updates as each
// step is completed." It is never mutated in place — every time an event is
// appended, you re-project and get a fresh tree with the statuses recomputed.
// The runner does exactly that and hands each fresh projection to `onUpdate`, so
// a subscriber (a UI, a log, a test) watches the graph fill in live.
//
// Pure on the log alone (no frame, no module state), memoized by (log, length)
// the same way core/project.js memoizes the parse graph — safe because the log is
// append-only, so a longer log is a strict extension and the cache key is total.

import { KIND } from './events.js';
import { STATUS, rollupStatus, assembleOutput, assembleSources } from './node.js';
import { annotateGrain } from './grain.js';

const memo = new WeakMap(); // log → { length, result }

// computeProjection — the actual fold. Single pass to gather each node's events,
// then a recursive build from the root that derives status bottom-up (a branch's
// rollup needs its children's statuses, so the build returns the status as it
// goes). Leaves carry their own output/sources; branches carry the folded ones.
const computeProjection = (log) => {
  const meta = new Map();   // id → { id, parentId, goal, depth, childIds, note, output, sources, failed, stepped, completed }
  const order = [];         // ids in first-appearance order (open order = tree order)

  const ensure = (id) => {
    let m = meta.get(id);
    if (!m) {
      m = { id, parentId: null, goal: '', depth: 0, childIds: null,
            note: '', output: '', sources: [], failed: false, stepped: false, completed: false,
            grain: null, forced: false };
      meta.set(id, m);
    }
    return m;
  };

  for (const e of log) {
    const m = ensure(e.id);
    switch (e.kind) {
      case KIND.OPEN:
        m.parentId = e.parentId ?? null;
        m.goal = e.goal;
        m.depth = e.depth | 0;
        m.grain = e.grain ?? null;
        m.forced = !!e.forced;
        if (!order.includes(e.id)) order.push(e.id);
        break;
      case KIND.DECOMPOSE:
        m.childIds = [...(e.childIds || [])];
        break;
      case KIND.STEP:
        m.stepped = true;
        m.note = e.note;
        break;
      case KIND.COMPLETE:
        m.completed = true;
        m.output = e.output;
        m.sources = [...(e.sources || [])];
        break;
      case KIND.FAIL:
        m.failed = true;
        m.note = e.error || m.note;
        break;
      default:
        break;
    }
  }

  // The roots: opened nodes with no parent. Usually exactly one (the goal).
  const roots = order.filter((id) => (meta.get(id)?.parentId ?? null) === null);

  const build = (id) => {
    const m = meta.get(id);
    if (!m) return null;
    const childIds = m.childIds || [];
    const children = childIds.map(build).filter(Boolean);

    let status;
    if (children.length) {
      status = rollupStatus(children.map((c) => c.status));
    } else if (m.failed) {
      status = STATUS.BLOCKED;
    } else if (m.completed) {
      status = STATUS.DONE;
    } else if (m.stepped) {
      status = STATUS.ACTIVE;
    } else {
      status = STATUS.PENDING;
    }

    const node = {
      id: m.id,
      parentId: m.parentId,
      goal: m.goal,
      depth: m.depth,
      status,
      note: m.note,
      children,
    };
    if (children.length) {
      // Branch: output and sources are FOLDED from the leaves, not its own.
      node.output = assembleOutput(node);
      node.sources = assembleSources(node);
    } else {
      node.output = m.output;
      node.sources = m.sources;
    }

    // The cube reading — object grain, holonic grain, the cell, coherence. A
    // forced leaf carries a declared Pattern grain (it wanted to keep splitting),
    // so the confab guard flags the Figure-maker that swallowed a Pattern goal.
    const declaredGrain = m.forced ? 'Pattern' : m.grain;
    annotateGrain(node, declaredGrain);
    return node;
  };

  const builtRoots = roots.map(build).filter(Boolean);
  let root;
  if (builtRoots.length === 1) {
    root = builtRoots[0];
  } else {
    root = {
      id: 'forest', goal: '', depth: -1, parentId: null, note: '',
      status: rollupStatus(builtRoots.map((r) => r.status)),
      children: builtRoots,
      output: assembleOutput({ children: builtRoots }),
      sources: assembleSources({ children: builtRoots }),
    };
    annotateGrain(root, null);   // a forest of roots is itself a Pattern over them
  }

  // A flat id→node index over the built tree, for callers that want random access
  // (the UI keys its rendered rows on it) without re-walking.
  const byId = new Map();
  const index = (n) => { if (!n) return; if (n.id) byId.set(n.id, n); (n.children || []).forEach(index); };
  index(root);

  return { root, byId, order: order.slice() };
};

export const projectTaskGraph = (log = []) => {
  const cached = memo.get(log);
  if (cached && cached.length === log.length) return cached.result;
  const result = computeProjection(log);
  memo.set(log, { length: log.length, result });
  return result;
};

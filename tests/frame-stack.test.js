// frame-stack.test.js — the interior frame holon (docs/frame-holon.md, Phase A).
//
// One structure — log → pure projection → active path — entered from different
// membranes. These tests pin: the stack as a projection of open+bind events
// (push, pop, resume, replay); the bind as a NUL-gated coupling argmax with the
// incumbent relaxation (the pinned assertion is the argmax, not a regex); the
// CROSS-MODAL INVARIANCE (the same projection + bind, driven by a text unit
// stream and a note unit stream over isomorphic inputs, produce isomorphic
// frame trees — a text-only change that breaks the invariant fails here); the
// termination guards; the grain-coherence confab flag at the frame grain; and
// the seam itself (src/tasks/ runs on the SAME functions, not copies).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  openEvent, decomposeEvent, completeEvent, bindEvent, KIND,
  projectFrameStack, decideBind, STATUS, MAX_DEPTH,
} from '../src/frame/index.js';
import {
  projectTaskGraph, runTaskGraph,
  openEvent as tasksOpenEvent, KIND as TASKS_KIND, STATUS as TASKS_STATUS,
} from '../src/tasks/index.js';

// ── the term-space, injected: one overlap metric per modality ─────────────────
// The bind measures EVA over props with whatever overlap the modality's
// term-space uses (lexical for text, set overlap = octave-equivalence for
// notes). Here both are the same set overlap — the point of the parity test is
// that the holon only ever sees the resulting NUMBERS.
const overlap = (props, subject) => {
  const A = new Set(props || []), B = new Set(subject || []);
  if (!A.size) return 0;
  let hits = 0;
  for (const x of A) if (B.has(x)) hits += 1;
  return hits / A.size;
};

// ── a minimal driver: measure → decideBind → append → re-project ─────────────
// This is the reactive loop an instantiation runs (Phase B wires it to the
// fold; Phase C to the predictors). It lives in the test because the driver IS
// the membrane-side wiring: the holon itself only sees couplings and events.
const bindStream = (root, units, { nul = 0.2 } = {}) => {
  const log = [openEvent({ id: 'root', goal: root.goal, act: root.act ?? null, subject: root.subject, depth: 0 })];
  const decisions = [];
  const dropped = [];
  const kids = new Map();   // parentId → children pushed so far (path-id minting + fanout guard)
  for (const u of units) {
    const proj = projectFrameStack(log);
    const path = proj.path;
    const leaf = proj.byId.get(path[path.length - 1]);
    const cLeaf = overlap(u.props, leaf.subject);
    const ancestors = path.slice(0, -1).map((id) => ({ id, w: overlap(u.props, proj.byId.get(id).subject) }));
    const novelty = 1 - Math.max(cLeaf, ...ancestors.map((a) => a.w), 0);
    const d = decideBind({ path, leaf: cLeaf, ancestors, novelty, nul, fanout: kids.get(leaf.id) || 0 });
    decisions.push(d);
    if (d.guard) dropped.push(d.guard);
    if (d.move === 'push') {
      const n = kids.get(leaf.id) || 0;
      kids.set(leaf.id, n + 1);
      const id = `${leaf.id}.${n}`;
      log.push(openEvent({ id, parentId: leaf.id, goal: u.goal ?? '', subject: u.props, depth: leaf.depth + 1, t: log.length }));
      log.push(bindEvent({ id, coupling: novelty, channel: 'novelty', t: log.length }));
    } else {
      const w = d.move === 'return' ? (ancestors.find((a) => a.id === d.target)?.w ?? 0) : cLeaf;
      log.push(bindEvent({ id: d.target, coupling: w, channel: d.channel, t: log.length }));
    }
  }
  return { log, decisions, dropped, projection: projectFrameStack(log) };
};

// ── the discourse fixture: compose → digression (push) → return (pop) ────────
const STORY = { goal: 'compose a story about buster', act: 'compose', subject: ['buster', 'cat', 'story', 'name'] };
const TURNS = [
  { props: ['buster', 'name'] },            // the repair: binds the leaf, not a fresh topic
  { props: ['dough', 'bread', 'baker'] },   // a digression: binds nothing in scope → push
  { props: ['bread', 'yeast', 'dough'] },   // develops the digression: binds its leaf
  { props: ['story', 'buster', 'cat'] },    // "back to the story": binds the ancestor → pop
];

test('digression push/pop: the coupling argmax routes repair → push → refine → return', () => {
  const { decisions, projection } = bindStream(STORY, TURNS);

  assert.deepEqual(decisions.map((d) => d.move), ['refine', 'push', 'refine', 'return'],
    'the four moves fall out of the couplings — no regex anywhere');

  // the repair stayed on the composition (c_leaf + the incumbent won)
  assert.equal(decisions[0].target, 'root');
  // the digression pushed a child under the composition
  assert.equal(decisions[1].target, 'root', 'the push opens under the incumbent leaf');
  // its development bound the digression leaf, not the story
  assert.equal(decisions[2].target, 'root.0');
  // the return bound the ANCESTOR — the pop the single-frame model cannot do
  assert.equal(decisions[3].target, 'root');

  // "back to the story" resolves to the COMPOSITION, not the sub-question
  assert.equal(projection.activeId, 'root');
  assert.deepEqual(projection.path, ['root']);
  assert.equal(projection.byId.get(projection.activeId).act, 'compose');

  // the digression is PARKED, not closed: suspended, still pending in the tree
  assert.deepEqual(projection.suspended, ['root.0']);
  assert.equal(projection.byId.get('root.0').status, STATUS.PENDING);
});

test('mid-digression the stack is root → digression, nothing suspended', () => {
  const { projection } = bindStream(STORY, TURNS.slice(0, 3));
  assert.deepEqual(projection.path, ['root', 'root.0']);
  assert.deepEqual(projection.suspended, []);
});

test('cross-level coref: a subject reference pops to the frame that owns it', () => {
  // root (owns buster) → digression → sub-digression; "his name is Buster"
  // arrives at the deepest leaf and must pop TWO levels, to the owner.
  const log = [
    openEvent({ id: 'root', goal: 'story', act: 'compose', subject: ['buster', 'cat', 'name'] }),
    openEvent({ id: 'root.0', parentId: 'root', goal: 'kneading', subject: ['dough', 'bread'], depth: 1 }),
    openEvent({ id: 'root.0.0', parentId: 'root.0', goal: 'yeast', subject: ['yeast', 'starter'], depth: 2 }),
  ];
  const proj = projectFrameStack(log);
  assert.deepEqual(proj.path, ['root', 'root.0', 'root.0.0']);

  const props = ['buster', 'name'];   // "his name is Buster", coref-resolved to props
  const leaf = proj.byId.get('root.0.0');
  const ancestors = proj.path.slice(0, -1).map((id) => ({ id, w: overlap(props, proj.byId.get(id).subject) }));
  const cLeaf = overlap(props, leaf.subject);
  const d = decideBind({
    path: proj.path, leaf: cLeaf, ancestors,
    novelty: 1 - Math.max(cLeaf, ...ancestors.map((a) => a.w)), nul: 0.2,
  });
  assert.equal(d.move, 'return');
  assert.equal(d.target, 'root', 'the same overlap-equivalence that binds a note-run to a phrase');

  log.push(bindEvent({ id: d.target, coupling: 1, channel: 'ancestor' }));
  const after = projectFrameStack(log);
  assert.deepEqual(after.path, ['root']);
  assert.deepEqual(after.suspended, ['root.0', 'root.0.0'], 'the whole digression chain is parked');
});

test('a bind back into a suspended frame resumes it — REC returns to a logged address', () => {
  const log = [
    openEvent({ id: 'root', goal: 'story', subject: ['a'] }),
    openEvent({ id: 'root.0', parentId: 'root', goal: 'digression', subject: ['b'], depth: 1 }),
    bindEvent({ id: 'root' }),     // pop: parks root.0
  ];
  assert.deepEqual(projectFrameStack(log).suspended, ['root.0']);
  log.push(bindEvent({ id: 'root.0' }));   // resume
  const proj = projectFrameStack(log);
  assert.deepEqual(proj.path, ['root', 'root.0']);
  assert.deepEqual(proj.suspended, [], 'reinstated, not re-opened');
});

// ── the invariance pin: one holon, two membranes ──────────────────────────────
test('cross-modal parity: isomorphic text and note streams project isomorphic frame trees', () => {
  // A token bijection is the strongest form of "the holon never sees modality":
  // relabel every text prop as a note and NOTHING about the tree may change,
  // because the interior only ever reads comparable-unit overlap.
  const bij = new Map([
    ['buster', 'E4'], ['cat', 'G4'], ['story', 'C4'], ['name', 'B3'],
    ['dough', 'F#2'], ['bread', 'A2'], ['baker', 'D2'], ['yeast', 'C#2'],
  ]);
  const noteRoot = { goal: 'phrase', act: 'compose', subject: STORY.subject.map((t) => bij.get(t)) };
  const noteUnits = TURNS.map((u) => ({ props: u.props.map((t) => bij.get(t)) }));

  const text = bindStream(STORY, TURNS);
  const note = bindStream(noteRoot, noteUnits);

  assert.deepEqual(
    note.decisions.map((d) => ({ move: d.move, target: d.target })),
    text.decisions.map((d) => ({ move: d.move, target: d.target })),
    'the bind decisions are identical — the couplings never saw the modality',
  );

  const shapeOf = (n) => ({
    id: n.id, parentId: n.parentId, depth: n.depth, status: n.status,
    children: n.children.map(shapeOf),
  });
  assert.deepEqual(shapeOf(note.projection.root), shapeOf(text.projection.root));
  assert.deepEqual(note.projection.path, text.projection.path);
  assert.deepEqual(note.projection.suspended, text.projection.suspended);
  assert.equal(note.projection.activeId, text.projection.activeId);
});

// ── termination + fallback ────────────────────────────────────────────────────
test('all couplings under NUL → hold to the incumbent leaf (the abstention)', () => {
  const d = decideBind({ path: ['root'], leaf: 0.1, novelty: 0.15, nul: 0.2 });
  assert.deepEqual(d, { move: 'hold', target: 'root', channel: null });
});

test('an empty stack holds to nothing — the cold fallback the caller routes', () => {
  assert.deepEqual(decideBind({ path: [] }), { move: 'hold', target: null, channel: null });
});

test('the incumbent relaxes as a resting potential: a marginal novelty does not push', () => {
  const marginal = decideBind({ path: ['root'], leaf: 0.5, novelty: 0.55, nul: 0.2 });
  assert.equal(marginal.move, 'refine', 'out-compete the incumbent, not merely register');
  const clear = decideBind({ path: ['root'], leaf: 0.5, novelty: 0.9, nul: 0.2 });
  assert.equal(clear.move, 'push');
});

test('the depth guard forces a leaf and returns the firing for the dropped trace', () => {
  const path = ['r', 'r.0', 'r.0.0', 'r.0.0.0', 'r.0.0.0.0'];   // leaf depth = MAX_DEPTH
  const d = decideBind({ path, leaf: 0.3, novelty: 0.95, nul: 0.2 });
  assert.equal(d.move, 'refine', 'the push is degraded, not silently taken');
  assert.equal(d.target, 'r.0.0.0.0');
  assert.deepEqual(d.guard, { guard: 'depth', at: MAX_DEPTH, asked: 'push' });
});

test('the fanout guard refuses one more digression under a saturated leaf', () => {
  const d = decideBind({ path: ['root'], leaf: 0.3, novelty: 0.95, nul: 0.2, fanout: 8 });
  assert.equal(d.move, 'refine');
  assert.deepEqual(d.guard, { guard: 'fanout', at: 8, asked: 'push' });
});

// ── grain coherence carries over to the frame grain ──────────────────────────
test('a leaf handed a Pattern-grained frame is flagged like the tasks confab guard', () => {
  const log = [
    openEvent({ id: 'root', goal: 'story' }),
    decomposeEvent({ id: 'root', childIds: ['root.0'] }),
    openEvent({ id: 'root.0', parentId: 'root', goal: 'a digression too big for one reach', depth: 1, grain: 'Pattern' }),
  ];
  const node = projectFrameStack(log).byId.get('root.0');
  assert.equal(node.coherent, false);
  assert.match(node.grainNote, /keep decomposing/);
});

// ── replay stability / persistence: the stack from the log ───────────────────
test('re-folding the same log recovers the identical tree AND stack', () => {
  const mk = () => [
    openEvent({ id: 'root', goal: 'G', subject: ['a', 'b'] }),
    openEvent({ id: 'root.0', parentId: 'root', goal: 'dig', subject: ['c'], depth: 1 }),
    completeEvent({ id: 'root.0', output: 'x' }),
    openEvent({ id: 'root.1', parentId: 'root', goal: 'dig2', subject: ['d'], depth: 1 }),
    bindEvent({ id: 'root', coupling: 0.9, channel: 'ancestor' }),
  ];
  const a = projectFrameStack(mk());
  const b = projectFrameStack(mk());
  assert.deepEqual(a.root, b.root);
  assert.deepEqual(
    { activeId: a.activeId, path: a.path, suspended: a.suspended },
    { activeId: b.activeId, path: b.path, suspended: b.suspended },
    'replay the log, recover the stack (docs/persistence.md)',
  );
  assert.equal(a.activeId, 'root');
  assert.deepEqual(a.suspended, ['root.1'], 'the popped-over open frame is parked; the completed one is terminal, not suspended');
});

test('a bind to a never-opened id is ignored — the projection stays total', () => {
  const log = [openEvent({ id: 'root', goal: 'G' }), bindEvent({ id: 'ghost' })];
  const proj = projectFrameStack(log);
  assert.equal(proj.activeId, 'root');
  assert.equal(proj.byId.has('ghost'), false);
});

// ── the seam: src/tasks/ runs on the SAME holon, not a copy ───────────────────
test('the tasks projection IS the frame projection — one function, pinned', () => {
  assert.equal(projectTaskGraph, projectFrameStack, 'a fork of the projection fails CI here');
  assert.equal(tasksOpenEvent, openEvent, 'one event vocabulary');
  assert.equal(TASKS_KIND, KIND);
  assert.equal(TASKS_STATUS, STATUS);
});

test('a task run (no binds) leaves the stack fields inert: nothing ever suspends', async () => {
  const res = await runTaskGraph({
    goal: 'doc',
    decompose: ({ goal }) => (goal === 'doc' ? ['a', 'b'] : []),
    generate: ({ goal }) => goal,
  });
  const proj = projectTaskGraph(res.log);
  assert.deepEqual(proj.suspended, [], 'suspension is a projection of bind events; a task log has none');
  assert.ok(Array.isArray(proj.path));
  assert.equal(res.graph.root.status, TASKS_STATUS.DONE);
});

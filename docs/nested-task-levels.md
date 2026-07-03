# Nested task levels — the graph that fills in as a small model works

> `src/tasks/` · `tests/tasks.test.js`. One level deeper than the arc: a goal
> too big for one reach is decomposed into sub-goals, recursively, until every
> leaf is small enough for a small LLM to generate in one bite. The whole nest is
> a graph object **projected** from an append-only log, so it updates as each
> step completes.

## The one fact

The spine of this codebase is always the same: **append-only log → pure
projection → a graph object that updates by re-folding, never by mutation.**

- The document is a fold of its event log → `projectGraph`.
- The turn is a fold of its stage list → the audit log.
- The arc is a fold of its **flat** section plan → the assembled long answer.

The arc is one level of decomposition: question → sections. A small model still
has to draft a whole section in one reach, and the sections never nest. Output of
any real size wants more than one cut. The **tasks holon** adds the missing axis:

```
goal ─decompose─▶ sub-goal ─decompose─▶ … ─▶ leaf ─generate─▶ output
              (recursive, bounded)                (a small LLM, one bite)
```

A goal that is too big becomes a branch with child goals; a goal small enough to
state becomes a leaf the generative engine writes directly. The nesting is
whatever the planner asks for — three levels (document → section → point) covers
the shapes the arc handles, and the depth guard sits above that so real plans
never touch it.

## The graph object that updates

`projectTaskGraph(log)` is a **pure fold** of the `TaskEvent` log into a nested
tree. Each node carries one derived field that moves — `status` — and a leaf's
status is read straight off its own terminal event while a **branch's status is a
pure rollup of its children**:

| children | branch status |
| --- | --- |
| all `done` | `done` |
| all `blocked` | `blocked` |
| all `pending` | `pending` |
| anything in between | `active` |
| mix of `done` + `blocked`, none pending | `done` — it landed something |

No node is ever *told* to update. A leaf completes, its status flips, and every
ancestor's rollup recomputes the next time you project — which the runner does
after **every** appended event, handing the fresh graph to `onUpdate`. A UI
subscribed to `onUpdate` watches the tree fill in live; a completed leaf is
append-only and never reverts, so the completed-leaf count only ever climbs
(`progressOf` reads it straight off the tree).

The long output is not stored either: `assembleOutput` projects it by an
in-order walk that joins every leaf's text — the arc's section join, only the
leaves now come from arbitrary depth. Re-folding the same log yields the
identical tree and the identical text (replay-stable, `tests/tasks.test.js`).

## The five events

Append-only, frozen at entry, never edited (`src/tasks/events.js`):

- **open** — a node enters the graph (its goal exists, nothing done).
- **decompose** — a node is split; its child ids are declared. This is the edge
  that makes a node a *branch* rather than a leaf.
- **step** — progress on a node (marks it `active` before it settles).
- **complete** — a **leaf** produced output (with the source indices it bound to,
  folded up the tree the way the arc folds `arcSources`).
- **fail** — a node could not be produced. The error is **kept in the trace**, a
  blocked leaf beside its done siblings — the same way the audit keeps a refusing
  veto rather than hiding it. A blocked leaf does not sink a branch that landed
  something.

Ids are **paths** (`root`, `root.0`, `root.1.2`): a node's id is its own position
in the tree, so the log is order-independent to project and trivially
replay-stable.

## Small LLMs as the generative engine

`runTaskGraph` imports no model. The intelligence arrives as **two injected
faces**, so the holon stays pure and testable and the small model is wired by the
caller:

```js
runTaskGraph({
  goal,
  decompose: (view) => [subGoal, ...] | [],   // the planner: split while too big, [] when small enough
  generate:  (view) => string | { output, sources },  // run ONCE PER LEAF
  onUpdate:  (graph, event) => render(graph),  // the live graph, after every event
});
```

`view` is `{ id, goal, depth, parentId, ancestry }` — `ancestry` is the goal
chain root→parent, the context a leaf sits inside.

This is the whole point of nesting. "Write the long answer" is a reach a small
model fumbles; decomposition turns it into a forest of one-bite generations it
can each do well. Wiring it to this repo's grounded talker is a few lines — the
planner is a small-model call (or a heuristic over retrieval, the way the arc
clusters), and the leaf generator is the arc's own grounded sub-turn:

```js
import { buildGroundedMessages } from '../model/index.js';

const generate = async ({ goal, ancestry }) => {
  const spans = retrieveFor(goal);                         // this leaf's evidence only
  const messages = buildGroundedMessages({ question: goal, spans, task: 'answer' });
  const output = await model.phrase(messages, { maxTokens: ceilingFor({ spans }) });
  return { output, sources: spans.map(s => s.idx) };       // folds up the tree
};
```

Each leaf is grounded on its **own** spans — nothing else — so a section speaks
the same language as a turn, exactly as `arc/generate.js` already arranges. The
ceiling scales with that leaf's evidence; you cannot faithfully say more than the
spans support.

## Cube-aware — a task knows its grain

A task is a holon, and every holon operates **at a grain**. The tasks holon reads
each node onto the [EO cube](cube.md), reusing `core/cube.js` as the authority
rather than minting a second vocabulary (`src/tasks/grain.js`). **The three task
acts are cube operators** on the Act face:

| task act | operator | Mode × Domain |
| --- | --- | --- |
| decompose a goal into parts | **SEG** | Differentiate × Structure |
| generate the one specific thing | **INS** | Generate × Existence |
| compose the children into a whole | **SYN** | Generate × Structure |

Two senses of grain, both already in the vocabulary:

- **Object grain** (the cube's third axis: Ground / Figure / Pattern) — the
  categorical role. A **leaf is a Figure**: a specific thing one generation
  *makes*. `INS` at Figure is the **Making / Entity** cell — "the gravity well,
  the densest cell" (`cube.js`), the single small-LLM reach that produces text. A
  **branch is a Pattern**: a regularity *composed* from its children (`SYN` at
  Pattern → **Composing / Network**) and *unravelled* into them (`SEG` at Pattern
  → **Unravelling / Network**). The ambient goal the whole tree rides in is the
  **Ground** — the document, the conversation field; the frame, not a node.
- **Holonic grain** (the integer of `core/event.js`: 0 at first appearance, +1
  each `SYN` promotion) — a leaf is grain 0; each assembly up the tree is a `SYN`
  that promotes one grain, so a node's holonic grain is its **height above the
  leaves**, the number of promotions it took to build it.

Every projected node carries `object`, `holonGrain`, `cell` (its primary cube
cell), and `acts` (every cell it operates in). The runner hands each face its
grain: the **decomposer sees the goal's declared grain**, and the **leaf
generator knows it is a Figure-maker** (`object: 'Figure'`, `cell:` INS @ Figure,
`holonGrain: 0`) — neither has to guess its place on the cube.

### The confabulation guard becomes the stopping rule

The cube's highest-leverage rule is *"the grain of the move must match the grain
of the terrain"* — `INS` asked to make a **Ground** (Making at a Void) is the
Kafka confab `coherence()` rejects off-diagonal. For tasks that is exactly: **a
Figure-maker handed a goal that is really Pattern/Ground-grained** — a goal too
big for one reach, jammed into a single generation because a guard capped the
decomposition or the planner stopped splitting too early.

`grainCoherence` flags it, and the projection sets `node.coherent = false` with a
`grainNote`; `runTaskGraph` collects them in `result.incoherent`. The decomposer
reads this as a **stopping rule**: keep splitting while a goal is Pattern-grained,
make a leaf only once it is Figure-grained. A cube-aware planner can declare each
sub-goal's grain — `decompose` may return `{ goal, grain }` — and if it labels a
goal `Pattern` then fails to split it, the confab is surfaced. A plain planner
omits the grain and its genuine (self-chosen) leaves stay coherent Figures, so
the guard never raises a false alarm.

## Omnimodal: the same grains improve prediction (music)

Generation here *is* prediction (`spec-generation.md`'s autoregressive closure),
and prediction is over **moves at a grain**, so the grain stack carries straight
into the predictor — `src/predict/grained.js`, tested in
`tests/predict-grained.test.js`, demo `npm run grained`.

A melody is grained (note → phrase → piece). The flat sequence reader
(`surfer/sequence.js`) predicts from **one** grain — an order-k note n-gram — and
its own comment names the wall: *"order 1 cannot hold a melody, whose figure is
the PHRASE."* `predictGrained` composes two grains:

- **Figure (note)** — `INS`: the existing note n-gram.
- **Pattern (phrase)** — `SYN/REC`: a phrase model learned online, with phrases
  identified by **overlap equivalence** (the same Level-1 set/prefix overlap that
  discovers octave equivalence) so non-identical repeats still generalise, plus a
  phrase-transition n-gram for the boundary notes.

**The cube guard is the composition gate:** route to the Pattern grain only where
the note grain is *unsure* (its top pick holds little mass) — a committed note
prediction is never overridden ("do not apply a Pattern fix where the note grain
holds"). The gate reads the note grain's own confidence, never the actual that
landed, so it is strictly causal. Composed through the task graph
(`predictionTaskGraph`), each phrase is a Pattern branch and each phrase-boundary
note is a leaf **declared Pattern** — so the holon's grain-coherence flags it: the
surprise the note grain can't absorb, routed up.

Measured on *Frère Jacques ×2* (the engine's own predictor, deterministic):

| predictor | next-note hit rate |
| --- | --- |
| flat n-gram order 1 (Markov) | 25% |
| flat n-gram order 2 | 37% |
| flat n-gram order 3 | 37% (no gain) |
| **grain-nested: order-1 Figure + Pattern** | **43%** |
| grain-nested: order-2 Figure + Pattern | 46% |

**Composing a small note model with a phrase grain (43%) beats the bigger flat
order-2 and order-3 models (37%).** Raising the n-gram order saturates — it cannot
reach the phrase grain at any order; adding a grain does. This is the "small
models as the engine" thesis on prediction, and it is **falsification-checked**: a
random signal gets no spurious lift (≤3%) and a periodic signal the note grain
already reads is never harmed (composite = figure exactly) — both asserted in the
tests.

### Learned segmentation — the SEG cut, derived

Finding the phrases is the separate SEG problem. The boundaries above were given;
`src/predict/segment.js` now learns them from the note grain's own surprise
(`npm run segment`). A flat surprise threshold over-fired (46 cuts, F1 0.50 — a
cold model is surprised everywhere). The fix mirrors the engine's
`void-boundary`: the threshold is a **readout the signal computes from its own
surprise background** (a high quantile, the only human number being `alpha`, the
tolerated false-cut rate), and two signal-derived guards turn the plateau into
cuts — a boundary must be a **local peak** in surprise, and a **minimum phrase
length** keeps cuts from crowding.

| segmenter | cuts | F1 vs 16 true |
| --- | --- | --- |
| naive flat threshold (0.7) | 46 | 0.50 |
| **learned (signal-derived)** | **15** | **0.83** |

End-to-end, with **no human boundaries**, the predictor learns its own cuts and
still lifts over the flat baseline:

| predictor | hit rate |
| --- | --- |
| flat n-gram order 1 | 25% |
| flat n-gram order 2 | 37% |
| grain-nested o1, hand boundaries | 43% (ceiling) |
| **grain-nested o1, learned boundaries** | **33%** |

**Honest limits.** Self-supervised, the predictor beats flat order-1 (+8 pts) but
the segmentation error (F1 0.83, not 1.0) still costs the gap to the hand-fed
ceiling — it does not yet beat flat order-2 without given boundaries. And
boundary-note prediction stays weak (each phrase transition is seen only a few
times, so the transition model rarely commits). The grain *composition* and a
signal-derived SEG cut are the results here; a sharper cut (peak shape, not just
height) and warm transition models are the next levers.

## The guards (runaway only)

Length and shape are emergent — the tree is as deep and wide as `decompose`
chooses. `src/tasks/constants.js` holds only the backstops, and every firing is
**recorded** in the run's `dropped` list, never silent:

- `MAX_DEPTH` (4) — at the floor a node is forced to be a leaf; the planner is not
  even consulted, so a planner that never quiesces still terminates.
- `MAX_FANOUT` (8) — demand caps supply, the way the arc's `reconcile` does: a
  wider decomposition is truncated.
- `MAX_NODES` (256) — the last line against a planner splitting just under the
  other two caps.

If the planner returns `[]` on a small goal — the equivalent of the arc's
saturation stop — none of these ever binds. A trace that shows one firing is a
signal worth reading, not a normal stop.

## What does not change

`tasks` orchestrates; it imports no other holon's internals. Parse, core,
retrieve, ground, model, the UI — untouched. The degenerate task graph (a planner
that never splits) is a single leaf: one goal, one `generate` call, byte-identical
to calling the small model once. The nesting is additive, the same way the arc is
additive over the turn.

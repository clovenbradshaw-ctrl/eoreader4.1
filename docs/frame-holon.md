# The frame holon — one interior structure, instantiated per modality at the membrane

> The frame stack is not a chat feature and not a text feature. It is an **interior**
> structure — it lives between `organs/in` and `organs/out`, on the unit/prop stream,
> below where modality is visible — so it is **modality-blind by construction**, the same
> way `core/unit.js` "carries no modality, so it cannot leak" and the tasks grain tree
> "never mentions text." Discourse routing (`frame-binding-route.md`), long generation
> (`src/tasks/`), and sequence prediction (`src/predict/grained.js`) are the **same
> holon** over different `organs/in` membranes. What varies per modality is the raise
> (SIG) and, for a generative frame, the render (INS @ Figure's terrain). Binding, push,
> pop, and return do not vary. This is the continuation of `frame-binding-route.md`'s
> proposed Phases 2–3 — the frame promoted from a cell to a stack — pitched at the grain
> where it is one implementation across every modality instead of one per modality.

Status: **Phase A shipped** — the shared interior holon (`src/frame/`: the five events +
`bind`, the pure projection carrying the active path, the NUL-gated bind argmax with the
incumbent relaxation, the guards and the cube grain), with `src/tasks/` delegating its
spine to it and `tests/tasks.test.js` + `tests/frame-stack.test.js` pinning parity and the
invariance. Phases B–C proposed. Extends `docs/omnimodal-core.md`,
`docs/omnimodal-task-language.md`, `docs/nested-task-levels.md`, `docs/holons.md`,
`docs/cube.md`, `docs/proposition-equivalence.md`; sequels `docs/frame-binding-route.md`
and reuses the `src/tasks/` log/projection discipline unchanged. Generalizes
`frame-binding-route.md`'s proposed Phase 2 (`focus → Frame`, the cell) and Phase 3 (the
bind measurement) with the interior-holon framing below.

---

## The one fact, one level up

The spine of this codebase is invariant (`nested-task-levels.md`): **append-only log →
pure projection → an object that updates by re-folding, never by mutation.** The document
is a fold of its event log; the turn is a fold of its stage list; the arc is a fold of a
flat section plan; the tasks graph is a fold of a nested `TaskEvent` log.

`omnimodal-core.md` adds the axis this note runs on: the whole system is two membranes
around a modality-blind interior.

```
  MODALITY        INGESTION           EMERGENCE           MODALITY
  text  ┐                                                      ┌ speech
  audio ┤─ organs/in ─▶ [ unit stream ] ─▶ CORE ─▶ [ props ] ─┤─ organs/out
  vision┘   (ingest)     comparable+        discovers  triadic └ music/action
                         ordered            structure  minimum
```

- The **floor of ingestion** is the bare unit (`core/unit.js`): comparable and ordered and
  nothing else, so it carries no modality and *cannot leak*.
- The **floor of meaning** is the proposition (`core/proposition.js`): the triadic minimum,
  the first emergent product, discovered by the core above the unit stream.
- The interior runs the **DEF·EVA·REC loop** (`core/conventions/`): DEF holds, EVA tests →
  reinforce or strain, REC revises → defeat or reinstate.

`src/tasks/` proves the *nesting* in that interior is already modality-neutral: the same
`createTaskSpec` / `runTaskGraph` plans and runs a **melody budgeted in beats** and an
**essay budgeted in tokens**, and `omnimodal-task-language.md` states exactly where the
coupling remains — *"the grain tree above the leaves is already modality-blind;
**only the leaf's render is coupled**."*

**The frame stack is that same nested holon used for the discourse/routing axis instead of
the generation axis.** Because it is interior, it inherits modality-invariance for free.
The task is not to make it cross-modal. The task is to recognize it as interior and factor
it so every axis names it.

---

## Why "how similar across modalities" is the wrong question

The similarity is not a resemblance to engineer. It is **identity by position**: anything
in the interior cannot see modality, so there is nothing to make similar — there is one
object, entered from different edges. Five things already in the repo say so:

1. **The unit cannot leak.** `core/unit.js` is comparable + ordered and nothing else. A
   structure built on the unit stream is modality-blind because its inputs are.
2. **The grain tree never mentions text.** `runTaskGraph`, the cube machinery, and
   `assembleOutput` (`src/tasks/`) contain no text fact. The leaf contract
   (`{ goal, maxTokens, format, contextSpans }`) is the *only* coupled surface —
   `maxTokens`, `prose`, an English goal — and `omnimodal-task-language.md` exists to
   decouple it.
3. **The same nesting lifts text and music.** Grain-nested prediction (note Figure +
   phrase Pattern) scores **43%** on *Frère Jacques ×2*, beating the bigger flat order-2
   (37%) and order-3 (37%) note models — *the identical grain composition that structures
   an essay's sections* (`nested-task-levels.md`, `tests/predict-grained.test.js`).
4. **The boundary is a readout of the signal's own surprise.** `predict/segment.js` finds
   phrase cuts from a high quantile of the note grain's surprise background (the only human
   number is `alpha`, the tolerated false-cut rate) — the same `void-boundary` the engine
   uses everywhere. A boundary detector that reads its own surprise is modality-blind: it
   works on notes, tokens, or frames without knowing which.
5. **Binding is one operation.** Phrase-repeat detection uses *"the same Level-1 set/prefix
   overlap that discovers octave equivalence"* (`nested-task-levels.md`,
   `proposition-equivalence.md`). Binding a note-run to a phrase, corefering "his name" to
   Buster, and corroborating an entity across sources are **one overlap-equivalence
   measurement** (`perceiver/proposition-equivalence.js`, `perceiver/equivalence.js`).

So the frame holon does not need to be *made* cross-modal. It needs to be *recognized* as
interior and factored so the discourse axis, the generation axis, and the prediction axis
all import one structure.

---

## The holon

A **Frame** is a standing DEF — an *act* plus a *subject-set of props* — that can nest. The
**stack** is the active path root → current-open-leaf: it *is* what "in scope" means. The
frame holon reuses the `src/tasks/` discipline exactly — **path ids** (`root`, `root.1.2`),
**pure projection**, **depth guards** — and adds one thing the generation side never needed.

### Events (the five, plus one)

The generation side is *eager and top-down*: a planner decomposes a known goal to leaves,
then `assembleOutput` walks them. The frame stack is *lazy and reactive*: it pushes and pops
as the stream arrives, because you do not know in advance you will digress. The five
`TaskEvent` kinds carry over unchanged (`open`, `decompose`, `step`, `complete`, `fail`);
one event is added:

- **bind** — records the CON that an incoming event landed on a frame: *event `e` bound to
  frame `F` at coupling `w`*. This is the reactive analogue of the planner's `decompose`:
  where the generation side *declares* the tree top-down, the discourse side *discovers*
  which level the next event belongs to. (Correspondingly, the shared projection derives
  the parent→child edge from an `open`'s `parentId` as well as from a declared
  `decompose`, so a planner-declared tree and a push-discovered tree project identically.)

There is **no explicit pop**. A `bind` to an ancestor *is* the pop — the active leaf moves
up, and the projection marks the frames above the bound ancestor `suspended`. The stack
shape is a **pure projection** of the bind and open events (the path to the
most-recently-bound open frame), so it is replay-stable, and Phase-7 persistence
(`docs/persistence.md`) falls out for free: replay the log, recover the stack.

### The bind, generalized from `frame-binding-route.md`

`frame-binding-route.md` measured one `c_frame` against a single frame. With a stack, there
is one coupling **per node on the active path**, plus the novelty channel, each NUL-gated
(`core/voidnull.js`), argmax:

```
c_leaf        EVA(e | current leaf)         → REC-refine   (repair/continue this frame)
c_subj[i]     EVA(e | subject_i of leaf)    → REC-elaborate (same subject, asked/developed)
c_anc[k]      EVA(e | ancestor frame k)     → REC-return    (pop the digression: "where were we")
c_new         novelty(e)                    → SEG a child   (push: digression / decomposition)
(all under NUL)                             → hold to the incumbent leaf
```

Every coupling is EVA over **props** (the floor of meaning), which are modality-blind by
construction — so the bind is interior and *identical across modalities*. The relaxation is
the incumbent-as-resting-potential one already in `longgen/relax.js`: a push (SEG a child)
or a pop (REC to an ancestor) must out-compete the current leaf's refine through lateral
inhibition, not merely register. (Shipped as `frame/bind.js`'s `decideBind` — pure on the
couplings; the term-space that measures them stays at the membrane.)

---

## The operators, one mapping, cross-modal

| operator | the move | where modality enters |
| --- | --- | --- |
| **SIG** | designate: raise the raw stream to units/figures | **`organs/in`** — the one per-modality face on the read side (word tokenizer / note events / pixel patches / audio frames) |
| **SEG** | open/segment a level (push a child; find a boundary) | none — the cut is a readout of the signal's own surprise (`predict/segment.js`) |
| **INS** | make the one leaf (INS @ Figure — the gravity-well cell) | **`organs/out`** — the one per-modality face on the write side (the leaf's *render*, `omnimodal-task-language.md`) |
| **SYN** | compose children up; promote a grain (height above leaves) | none |
| **REC** | return to a level (pop); revise a frame (defeat/reinstate) | none — this *is* the core loop's REC |
| **DEF** | hold the standing frame | none — the carried context, `conventions/` DEF |
| **EVA** | the bind coupling; reinforce or strain | term-space only (which overlap metric), not the operation |
| **NUL** | hold the uncohered (abstain to the incumbent) | none |
| **CON** | the join — what binds to what | none |

The load-bearing line: **DEF·EVA·REC is already the core's loop** (`omnimodal-core.md`:
`def` / `eva(kind, token, holds)` / `rec`). So "continue this frame · return to a level ·
revise a frame" is not new machinery — it is the same three verbs the core already runs
over conventions, applied at the **frame** grain. Continuation is DEF (hold), a repair is
EVA reinforcing the frame, a topic switch is REC defeating it and DEF-ing a new one, a pop
is REC reinstating a suspended one.

---

## The cross-modal table

One holon, five instantiations. The columns that **vary** are exactly three — the unit
(`organs/in`), the bind's term-space (EVA), and the leaf render (`organs/out`) — and all
three sit *at a membrane*. Every other column is one implementation.

| | unit (`organs/in`, **varies**) | a frame is | a subject is | bind measures (**term-space varies**) | a leaf is (`organs/out`, **varies**) | push = SEG | pop = REC |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **text · discourse** (chat) | word tokens | an activity (compose / ground) | entities / props in scope | lexical Born overlap (`surfer/salience.js`) | a grounded small-LLM reach | a digression sub-question | "where were we" / "back to the story" |
| **text · generation** (`tasks/`) | word tokens | a goal | the goal's evidence spans | span / prop overlap | a section or point draft | `decompose` a goal | roll the branch up (SYN) |
| **music** (`predict/grained`) | note events | a phrase / the piece | a pitch-set / interval profile | set/prefix overlap = octave-equiv | a note prediction | a phrase boundary (`segment.js`) | phrase end → the piece |
| **video** | frame / patch stream | a scene / shot | tracked visual entities | visual-feature overlap | a frame / region prediction | a shot cut | scene end → the sequence |
| **image · region** | patch grid | a region / composition | visual figures | feature overlap | a region fill | a sub-region | region done → the composition |

Read the table by its **shared** columns — *a frame is*, *a subject is*, *push*, *pop* —
which are structural and interior, one implementation for all five rows. The three varying
columns are the two membranes plus the metric's term-space. The whole architecture of
`omnimodal-core.md` is that claim; this table is the frame holon obeying it.

---

## The discourse instantiation — what comes after `frame-binding-route.md`

`frame-binding-route.md` carries the frame as `fold.focus` (a cell: `{ act, subject, kind }`
in its Phase-2 form). Generalize it to the stack:

- **`computeFold` / `projectFold`** (`core/conversation-fold.js`) carry the **active path**,
  not a cell — a projection of the frame-open and `bind` events, exactly as
  `projectTaskGraph` projects the node tree.
- **The bind argmaxes over the path** (the couplings above), so a repair binds the leaf, a
  reference to a lower subject pops to it, and a net-new subject pushes a child.
- **Push = SEG a child frame** (a digression opened inside an ongoing activity: "wait, do
  cats actually knead?" mid-story). The parent is *suspended*, not closed.
- **Pop = REC to an ancestor** ("ok, back to the story" · "anyway" · "where were we"): the
  return-from-digression the single-frame model cannot do.
- **Cross-level subject bind** — "his name is Buster," when Buster is the subject of a
  *lower* frame, pops to that frame. Coref across the stack is the same overlap-equivalence
  that binds a note-run to a phrase (item 5 above); one measurement, two grains.
- **Confinement** (`docs/holonic-token-confinement.md`, discourse side): ground/research
  inside a pushed frame is confined to that frame — a sub-question's fetched pages do **not**
  enter the parent's subject set unless explicitly carried up, which is a **SYN** (join the
  child's resolved prop into the parent). This is holonic token confinement applied to
  discourse instead of generation: what is admitted in a child holon stays in the child.

The Buster regression is now doubly closed: the repair binds the leaf (`c_leaf`) with strong
subject reinforcement (`c_subj[Buster]`), `c_new ≈ 0`, so there is no push and no research
subject — *and* had a real digression occurred, popping back would restore the composition
rather than stranding it, which the current router cannot do at all.

---

## What is deliberately NOT here

- **This is not KOINÉ.** KOINÉ *maps* a structure across modality renders — a cross-modal
  translation, one render to another. The frame holon **never sees modality to map**: it is
  interior, below the membrane. Distinct organs; do not conflate. (KOINÉ operates on what
  `organs/out` produce; the frame holon operates on props, before any render exists.)
- **No new loop.** The stack is a *projection*; the bind is once per turn; DEF·EVA·REC is
  the existing core loop at the frame grain — no recursion, no mutable global state. REC
  returns to a **logged address**; it does not spin. Termination is the `tasks/constants.js`
  guards reused unchanged — `MAX_DEPTH` (4), `MAX_FANOUT` (8), `MAX_NODES` (256), every
  firing recorded in `dropped` — plus NUL as the dissipation on binding. (The standing
  answer to "loops that self-emerge": the control is one measurement over logged objects,
  so it can neither out-vote itself nor fail to halt — the frame stack is the *bounded*
  form of the recursion, not the unbounded one.)
- **The membranes are untouched.** `organs/in` (7: text · image · music · frequency · video
  · codon · code) and `organs/out` (speech · music) are where modality lives; this note is
  interior. Adding video routing later is an `organs/in` plug plus a bind term-space, **not
  a subsystem** — which is the entire payoff of writing it here.
- **Subject extraction is still the precondition** (`frame-binding-route.md`'s dependency):
  with an empty `frame.subject`, `c_leaf` still routes a repair correctly, but the `c_subj`
  reinforcement and cross-level coref are lost. Track separately.
- **The operator mapping is the natural reading**, offered for grounding, not asserted as
  settled doctrine; the mechanics (project a stack, bind by EVA over props, NUL-gate,
  argmax, incumbent-relax) stand under whatever glyphs label them.

---

## Migration — three phases, each proving the structure over one more edge

**Phase A — factor the interior holon (shipped).** The log / projection / active-path /
bind lifted into a shared holon (`src/frame/`) with `src/tasks/`'s discipline: path ids,
pure projection, depth guards, the five events + `bind`. `src/frame/events.js` (the six
kinds), `src/frame/project.js` (`projectFrameStack` — the tasks projection taught the
active path and suspension), `src/frame/bind.js` (`decideBind` — the NUL-gated argmax with
the incumbent relaxation), `src/frame/node.js` / `grain.js` / `constants.js` (statuses,
cube grain, guards). Parity is proved the strong way: `src/tasks/` re-exports the shared
functions — `projectTaskGraph` *is* `projectFrameStack`, one function object — and
`tests/tasks.test.js` passes unchanged (the full suite stays green);
`tests/frame-stack.test.js` pins the identity so a fork of the projection fails CI. No
behavior change; this is the seam the whole note is about.

**Phase B — instantiate discourse over it.** `Frame → FrameStack` in the fold; carry the
active path in `computeFold` / `projectFold`; the bind argmaxes over the path; push/pop by
`bind`. Bench against `frame-binding-route.md`'s fixtures **plus** digression fixtures
(push, pop, cross-level coref, confinement). This is the shipped discourse capability.

**Phase C — retrofit the prediction edges to name the shared holon.** `predict/grained.js`
and the video/audio predict tests already *run* this structure with their own bespoke
nesting; point them at the shared holon so the invariance is **pinned in CI**, not just
true by inspection. Bookkeeping, but it is what turns "the same object" from a claim in this
doc into a test that fails when someone breaks it.

Each phase is independently reversible, and each lands the same structure over one more
`organs/in`: Phase A over generation, Phase B over discourse, Phase C over prediction.

---

## Tests

Landed with Phase A (`tests/frame-stack.test.js`):

- **Digression push/pop** (at the holon grain): compose → a sub-question (push, `c_new`
  dominates) → "back to the story" (pop, `c_anc` binds) resolves to the *composition*, not
  the sub-question; the pinned assertion is the coupling argmax, not a regex. The parked
  digression is `suspended`, still open; a later bind resumes it (REC to a logged address).
- **Cross-level coref**: a subject reference (`"his name is Buster"`) pops to the frame that
  owns Buster — two levels in one bind — via the same overlap-equivalence as the music
  phrase-repeat test.
- **Cross-modal parity — the invariance pin**: the *same* projection + bind, driven once by
  a text unit stream and once by a note unit stream over isomorphic (token-bijected) inputs,
  produce isomorphic frame trees and identical bind decisions. A text-only change that
  breaks the invariant fails CI. (This is the test that makes "one structure across
  modalities" enforceable rather than aspirational.)
- **Termination + fallback**: the depth and fanout guards force a leaf and return the firing
  for the `dropped` trace; an empty stack or all-under-NUL holds to the incumbent (the
  caller's baseline routing — the fallback contract); a marginal novelty does not out-compete
  the incumbent's resting potential.
- **Grain coherence carries over**: a leaf handed a Pattern-grained frame (a digression too
  big for one reach) is flagged the same way `nested-task-levels.md`'s confab guard flags a
  Figure-maker handed a Pattern goal.
- **Replay stability / persistence**: re-folding the same log recovers the identical tree
  *and* stack (`activeId`, `path`, `suspended`); the seam identity
  (`projectTaskGraph === projectFrameStack`, one event vocabulary) is pinned; a task run's
  bind-free log never suspends anything.

Awaiting Phase B (the discourse instantiation):

- **Fold-level digression fixtures** driving the real `computeFold` / `projectFold` and the
  reader's chat path, benched against `frame-binding-route.md`'s fixtures.
- **Confinement**: a pushed frame's fetched sources do not enter the parent's subject set
  unless a SYN carries them up (`tests/holonic-confine.test.js`, extend).
- **Byte-parity fallback**: cold model / empty stack / all-under-NUL reproduces today's
  routing byte-for-byte on the shipped chat path (`tests/conversation-fold.test.js`,
  `tests/stance.test.js`).

---

## Files

- the interior floors the invariance rests on: `src/core/unit.js` (the leak-proof unit),
  `src/core/proposition.js` (the prop the bind measures over), `src/core/conventions/`
  (DEF·EVA·REC — the loop the frame stack runs at the frame grain)
- **the shared interior holon (Phase A, shipped)**: `src/frame/` — `events.js` (five events
  + `bind`), `project.js` (`projectFrameStack`: pure projection + active path + suspension),
  `bind.js` (`decideBind`: the NUL-gated coupling argmax, incumbent relaxation via
  `longgen/relax.js`), `node.js` (statuses/rollups/folds), `grain.js` (cube grain + confab
  guard), `constants.js` (the guards)
- the discipline it was factored from, now delegating: `src/tasks/` (`events.js`,
  `project.js`, `node.js`, `grain.js`, `constants.js` re-export the shared holon;
  `runner.js` — the inject-the-faces pattern — and `spec.js` stay generation-specific)
- the discourse instantiation (Phase B): `src/core/conversation-fold.js` (`computeFold`
  :143, `projectFold` :196 — `focus` → `FrameStack` / active path; the `bind` event), the
  fold's consumer in `src/reader/app.dc.js` (the bind replaces the `_continuesCompose`
  fork's seed and drives push/pop)
- the bind, one metric per term-space: `src/surfer/salience.js` (Born, text),
  `src/perceiver/equivalence.js` + `src/perceiver/proposition-equivalence.js`
  (overlap-equivalence — coref, phrase-repeat, cross-source, one operation),
  `src/core/voidnull.js` (NUL), `src/longgen/relax.js` (incumbent relaxation)
- the prediction edge already running the structure (Phase C): `src/predict/grained.js`
  (note+phrase grains), `src/predict/segment.js` (the signal-derived SEG cut —
  modality-blind boundary)
- the membranes (untouched, where modality lives): `src/organs/in/` (7 raises),
  `src/organs/out/` (speech · music), `src/perceiver/` (the SIG faces)
- distinct organ, not this one: KOINÉ (cross-modal *mapping*, on `organs/out` products)
- docs: extends `docs/omnimodal-core.md`, `docs/omnimodal-task-language.md`,
  `docs/nested-task-levels.md`, `docs/holons.md`, `docs/cube.md`,
  `docs/proposition-equivalence.md`, `docs/holonic-token-confinement.md`; sequels
  `docs/frame-binding-route.md`; relates to `docs/persistence.md` (the stack from the log),
  `docs/nul-hold-the-uncohered.md`
- tests: `tests/frame-stack.test.js` (new, Phase A), `tests/tasks.test.js` (the parity pin),
  `tests/predict-grained.test.js`, `tests/holonic-confine.test.js`,
  `tests/conversation-fold.test.js`, `tests/stance.test.js`,
  `tests/proposition-equivalence.test.js`

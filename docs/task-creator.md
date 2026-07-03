# The task creator — "write an essay" becomes a shaped, budgeted plan

> `src/tasks/spec.js` · `tests/task-creator.test.js`. The planning face of the
> [tasks holon](nested-task-levels.md): a generative request is read for its
> **kind**, **length**, and **subject**, given an artifact **shape** — one the machine
> has **learned** (and cached in [`templates/`](../templates/README.md)) or, for an
> unknown kind, **researches from the internet on demand** — and handed to
> `runTaskGraph` as a decomposition whose every leaf is sized for a small model. No
> artifact-specific guide is shipped; only the universal arc, as an offline floor.

## The one fact

The tasks holon drives a goal down to leaves and generates each one, but it
**imports no model and chooses no shape** — `decompose` and `generate` arrive
injected. The runner's own doc names the gap: `decompose` *"may be a small LLM, or
a heuristic, or a fixed plan."* The task creator is the **fixed-plan face for
generative artifacts**.

When the request is *"write an essay"*, an essay is not a shapeless reach. It has

- a **length** — sized, not left to run on;
- a **format** — prose, or markdown headings, or bullets;
- a **structure** — open with a thesis, develop it in ordered paragraphs, close
  without a new claim.

The creator reads the kind off the request, looks up that shape, and hands the
runner a decomposition that already embodies it.

```
"write a long essay about the sea"
        │  classifyArtifact → essay   subjectOf → "the sea"   readLength → ×1.8
        ▼
  spec { kind: essay, format: prose, tokens: 1260, sections: [
          introduction · body 1 · body 2 · body 3 · conclusion ] }
        │  planArtifact → { decompose, generate-budgets }
        ▼
  runTaskGraph(goal, decompose, generate)  ── the existing holon, unchanged
```

## Why this is not the anti-canon `longgen/shape.js` forbids

`longgen/shape.js` refuses a canon of response shapes, and is right to: there the
system answers a question **from a document**, and a fixed schema is a lie — it
supplies a balance the evidence cannot earn (McKeown's schemata, *"a void gate run
backwards"*). That argument is about a **grounded reading**: the shape must fall
out of what the field offers.

This is the opposite case — a **generative artifact the user asked for by name**.
*"Write an essay"* **is** a request for the essay shape; supplying it honors the
ask, it does not impose a frame on evidence. The grounding discipline still rides
underneath: each leaf the runner generates is grounded on **its own spans**
(`nested-task-levels.md`), so the spec chooses the **skeleton** while the evidence
still fills each bone.

## The small-model constraint is the whole point

A small model can be handed only so much context and can emit only so much output
in one reach. So every section carries a **token budget**, and the budget drives
the grain — the same stopping rule the [cube](cube.md) already names:

| section budget | grain | what the runner does |
| --- | --- | --- |
| `tokens ≤ LEAF_MAX_TOKENS` | **Figure** | a leaf — one small-model reach writes it whole |
| `tokens >  LEAF_MAX_TOKENS` | **Pattern** | too big for one bite — split into leaf-sized parts |

*Keep decomposing while a goal is Pattern-grained; make a leaf only once it is
Figure-grained* — here read off a **real budget**, not guessed. A normal essay's
sections all fit the ceiling, so the plan is flat. Ask for a **long** essay and the
body paragraphs overflow the ceiling and nest **one level deeper**, each part still
a one-reach generation. Length scales the budget; the budget scales the tree; the
tree keeps every generation inside what a small model can actually produce. The
runner's grain-coherence backstop confirms it: a section that overflowed and was
**split** stays coherent; one the depth guard had to **jam** into a single leaf is
flagged in `result.incoherent` — the honest "this was too big for the room left."

Each leaf is also handed its **context width** (`contextSpans`) — how wide the
caller should retrieve for that one generation — so a leaf's *input* stays inside
the model's window the same way its *output* stays inside the ceiling.

## The internet is the brain — we ship no artifact guide

There is **no stored guide for any specific artifact**. The kind is
**open-vocabulary** — `artifactKindOf` reads whatever noun the request names (essay,
sonnet, lab report, cover letter, press release), not a fixed enum. The only shape
shipped in code is the **universal arc** — open → develop → close — which is not an
artifact canon but the significance row's intrinsic order (the same arc
`longgen/shape.js` derives rather than imposes). It is an **offline floor**, identical
for every kind until that kind is learned.

> *"if something needs to be made, go learn how to make it well."*

So `createTaskSpec` resolves a shape in just two tiers — **learned → arc floor** — and
the learning is acquired on demand:

1. **Learned / installed** — a shape the machine has built, or one a person dropped
   into the `templates/` folder (the library; see below). Used whenever present.
2. **The universal arc** — the floor, when the kind has not been learned and no
   research is available.

The acquisition is `acquireSpec` (folded into `runArtifact`), and it prefers **learning
from examples over trusting an authority**:

1. **Examples (preferred)** — handed an injected `exampleSearch`, it finds good
   *examples* of the kind (`exampleQuery`) and **the core engine learns the form from
   them** (`learnStructureFromExamples`, `src/tasks/learn.js`). It reads actual Emily
   Dickinson poems, not an essay about how they work; the line/stanza cut is the SEG
   learner's (`predict/segment.js` — `learnBoundariesFromSurprise`, the same cut that
   finds musical phrases), not a regex. Nothing about the form is pre-loaded: reading
   Dickinson yields 4-line quatrains in 8-6-8-6 common meter ending on her dash; reading
   limericks yields five lines; reading haiku yields three — each read off its own
   examples. The learned regularities ride in a `form` field (lines per stanza, syllable
   pattern, terminator) — the seam to **logit control**: the constraints a `propose()`-
   gated generator would bias toward (the next slice).
2. **Definition (fallback)** — handed a `webSearch`, it fetches a how-to and parses the
   structure with `deriveSpecFromDefinition`, mapping each found section to a neutral
   directive act by its place in the arc.

Either way the learned shape is cached in the library, which persists it to `templates/`. The next request, this session or a future one, reads it back with no
search. The engine never touches the network itself: `webSearch` is injected
(proposer-only, the [web-search](web-search.md) discipline), exactly as the runner
never imports a model. `deriveSpecFromDefinition` is guarded like
`formulateSearchQuery` — a definition it cannot parse into at least two roles returns
`null`, and the arc floor stands; behaviour only improves, never regresses.

### `templates/` — the durable memory

Learned and installed shapes live as small JSON files in the repo's
[`templates/`](../templates/README.md) folder, keyed by kind. The machine **writes**
what it learns there (`templatePersister` → `saveTemplate`); a person **installs** a
shape by dropping a `<kind>.json` in; a session **loads** the folder as the library's
seed (`loadTemplatesDir`). A template stores its sections as **neutral directives**, so
an installed shape is modality-neutral and the output organ lowers it at run time. The
knowledge is **data — learned or shared — never code**.

```js
const library = createSpecLibrary({
  seed:    await loadTemplatesDir('templates'),   // installed + previously-learned
  onLearn: templatePersister('templates'),        // persist whatever it learns next
});
await runArtifact({ request: 'write a sonnet about the sea', library, webSearch, generate });
// "sonnet" unknown → researches it → writes templates/sonnet.json → builds with it.
// next time: no search.
```

## The API

```js
import {
  artifactKindOf, subjectOf, readLength,      // the three reads off the request
  createTaskSpec, planArtifact, withBudgets,  // request → spec → runTaskGraph faces
  runArtifact,                                // the convenience: create + run (researches on demand)
  createSpecLibrary, acquireSpec, deriveSpecFromDefinition, needsResearch, researchQuery,  // internet-as-brain
  loadTemplatesDir, templatePersister,        // the durable templates/ store
} from '../tasks/index.js';
```

Wiring a small model to it is a few lines — `generate` is the only injected face that
touches a model, `webSearch` the only one that touches the network. `runArtifact`
researches an unknown kind itself before planning, so the caller just supplies the two
injected faces (see `npm run task-creator` for the full end-to-end demo):

```js
const lib = createSpecLibrary({
  seed:    await loadTemplatesDir('templates'),
  onLearn: templatePersister('templates'),
});

const res = await runArtifact({
  request: 'write a sonnet about the sea',
  library: lib,
  webSearch,                                                // injected: learns an unknown kind first
  generate: async (view) => {                               // run ONCE PER LEAF
    const spans = retrieveFor(view.goal, { k: view.contextSpans });   // this leaf's evidence only
    const messages = buildGroundedMessages({ question: view.goal, spans, format: view.format });
    const output = await model.phrase(messages, { maxTokens: view.maxTokens });  // the leaf's ceiling
    return { output, sources: spans.map(s => s.idx) };
  },
  onUpdate: (graph) => render(graph),                       // the live tree, after every event
});

res.spec;     // the structure it planned — kind, sections, budgets
res.output;   // the assembled artifact
res.progress; // leaves done / total
```

The view each leaf receives is the runner's Figure-maker identity **plus the
small-model contract** the creator adds: `role` (where it sits in the artifact),
`format` (how to render), `maxTokens` (this leaf's output ceiling), `contextSpans`
(how wide to retrieve), and `spec` (the whole plan, for context).

## What does not change

`spec.js` is additive. The runner, the projection, the events, the grain machinery
— untouched. A request that names no artifact classifies as `answer`, a
single-section plan whose **root is the leaf** — byte-identical to one small-model
call, the degenerate task graph the tasks holon already promised. The shape is a
plan over the existing holon, the same way the arc is a plan over the turn.

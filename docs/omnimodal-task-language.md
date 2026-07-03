# The omnimodal task language — lowering a task onto an output organ

> The [task creator](task-creator.md) plans a generative artifact as a grain tree of
> budgeted leaves; this note specifies the **modality-neutral task IR** and the
> **`organs/out` conversion** that lowers each leaf onto whatever output organ renders
> it — the mirror of how `organs/in` raises a modality onto the spine.
>
> **Status — first slice landed** (`src/organs/out/`, `src/tasks/spec.js`,
> `tests/output-organs.test.js`). The output membrane, the `withOrgans` dispatch, and
> a second (music) organ exist: the same `createTaskSpec`/`runTaskGraph` now plan and
> run a **melody** (budgeted in beats) as well as an essay (budgeted in tokens),
> differing only in which renderer the leaves dispatch to. What is built and what is
> still deferred is summarized in [§ Status](#status--what-landed) at the end.

## The asymmetry to close

The [omnimodal core](omnimodal-core.md) draws the whole system as two membranes
around a modality-blind interior:

```
  MODALITY        INGESTION           EMERGENCE           MODALITY
  text  ┐                                                      ┌ speech
  audio ┤─ organs/in ─▶ [ unit stream ] ─▶ CORE ─▶ [ props ] ─┤─ organs/out
  vision┘   (ingest)     comparable+        discovers  triadic └ music/action
                         ordered            structure  minimum
```

The input membrane is built out; the output membrane is not:

```
src/organs/in/   text · image · music · frequency · video · codon · code   ← 7
src/organs/out/  speech                                                     ← 1
```

And the [task creator](task-creator.md) — which plans *what to generate* — sits on
the right edge, between `CORE` and `organs/out`. But its leaf contract leaks the one
output organ that exists:

```js
// what the task runner hands generate() today (tasks/spec.js → withBudgets):
{ goal: "Develop point 2 …",  maxTokens: 150,  format: "prose",  contextSpans: 4 }
//        ^ an English string   ^ tokens         ^ a text format   ^ text spans
```

`maxTokens`, `prose`, and an English `goal` are text facts. The grain tree above
them is already modality-blind (`runTaskGraph`, the cube grain machinery, and
`assembleOutput` never mention text). **Only the leaf's render is coupled.** The
conversion this note specifies decouples it.

## The principle: the cube already supplies the neutral verb

A task leaf is **INS @ Figure** — *"make the one specific thing"* (`tasks/grain.js`).
That verb is modality-blind: making a sentence, making a note, making an image
region are all INS @ Figure. What differs across modalities is **only the terrain of
"the thing"** — and terrain is the cube's own third axis, the same axis the input
organs already turn (text → sentences, music → notes, vision → regions).

So the output organ is not a new concept bolted on; it is the **terrain supplier**
for the leaf's existing cube cell. `organs/in` lowers a modality *onto* the spine;
`organs/out` lowers a task directive *onto* a modality. Symmetric membranes, one
interior.

| direction | organ | contract | unit it speaks |
| --- | --- | --- | --- |
| in (raise) | `ingest<Modality>(source)` | `source → doc on the spine` | sentences / notes / regions / frames / codons |
| out (lower) | `render<Modality>(view)` | `task leaf → { atom, sources }` | the same native units, produced |

The enactor is already the **modality-blind commit step**, and `out/speech` is
already described as a **bare renderer** (props → language, no judging). The seam
exists; the task language simply does not feed it per-modality yet.

## 1. The task IR — a modality-neutral leaf

Generalize the leaf contract from three text facts to three neutral ones:

```js
// the omnimodal task leaf (the IR the runner hands to render):
{
  organ:    "music",                 // which output organ renders this leaf
  directive: <Directive>,            // the figure/proposition to instantiate (not English)
  extent:   { share: 1.2 },          // an ABSTRACT size — the organ converts it (see §3)
  // unchanged from today:
  role, id, depth, ancestry, object: "Figure", cell: INS@Figure, holonGrain: 0,
}
```

Three replacements, each removing a text assumption:

- **`format: "prose"` → `organ: "<id>"`.** The leaf names its output organ. The
  current essay spec is simply every leaf tagged `organ: "text"`.
- **`goal: "<English>"` → `directive`.** A directive is the modality-neutral thing
  to make — at minimum a proposition (the core's floor of meaning,
  `core/proposition.js`) plus a role. The **text** organ renders a directive as a
  sentence; the **music** organ renders the same shape as a phrase; the **image**
  organ as a region. English instructions become the *text organ's* lowering of a
  directive, not the IR itself.
- **`maxTokens: 150` → `extent: { share }`.** The IR carries an **abstract size**,
  not a token count. The conversion to a native budget is the organ's job (§3).

Everything else — the grain, the cube cell, the ancestry, the Figure/Pattern
stopping rule — is already neutral and stays exactly as it is.

## 2. The `organs/out` contract — mirror of `organs/in`

Each output organ exposes one function, the inverse of an ingester:

```js
// organs/out/<modality>/index.js
export const render<Modality> = async (view) => ({
  atom:    <native artifact>,   // the produced unit: a sentence, a phrase, a region…
  sources: [<idx>, …],          // what it grounded on — folds up the tree unchanged
  extent:  { unit, produced },  // what it actually emitted, in native units
});
```

and declares how it converts an abstract share to its native budget (§3):

```js
export const budgetOf = (share, total) => ({ unit: "tokens", budget: 150 });
```

A registry maps `organ → { render, budgetOf }`. The runner's `generate` becomes a
**dispatch**, replacing the text-only `withBudgets`:

```js
// tasks/spec.js — the conversion, generalized:
export const withOrgans = (plan, registry) => async (view) => {
  const sec   = plan.budgetFor(view.directive ?? view.goal);
  const organ = registry[view.organ] ?? registry.text;      // default: today's behaviour
  const extent = organ.budgetOf(sec.share, plan.spec.total); // share → native unit
  return organ.render({ ...view, extent });                  // the organ makes the atom
};
```

`runTaskGraph`, `assembleOutput`, `assembleSources`, the live `onUpdate` projection,
and the grain-coherence backstop **do not change** — they fold leaves whose `atom`
happens to be text today and a note tomorrow. (`assembleOutput`'s string join is the
one text assumption left in the runner; the omnimodal version asks the leaf's organ
to **compose** its children, so SYN @ Pattern becomes organ-supplied too — a separate,
smaller follow-up.)

## 3. Extent — per-organ native units (the decided shape)

The IR carries an **abstract size** (a `share` of the artifact, exactly the
template shares the creator already normalizes). Each organ owns its **native unit**
and the conversion. The spec author never writes tokens; the organ turns the neutral
share into its own budget, and **drives the same Figure/Pattern stopping rule off
it** — a leaf whose native budget exceeds the organ's single-reach ceiling is a
Pattern goal the decomposer splits, just as a 270-token essay paragraph splits today.

| organ | native unit | single-reach ceiling (analogue of `LEAF_MAX_TOKENS`) | over-ceiling → split into |
| --- | --- | --- | --- |
| text | tokens | a paragraph (~256 tok) | sub-points |
| speech | tokens / utterances | one utterance | clauses |
| music | beats / notes | one phrase (~a bar or two) | sub-phrases |
| image | regions | one composed region | sub-regions / layers |
| video | frames / shots | one shot | shots within a scene |
| code | functions / statements | one function body | statements / helpers |

So `LEAF_MAX_TOKENS` and `CONTEXT_SPANS` (today global constants in `tasks/spec.js`)
become **per-organ declarations** on the registry. The budget math moves out of
`createTaskSpec` (where it is text-coded) and into each organ's `budgetOf` — the one
real refactor this conversion requires.

## What stays, what moves

**Stays (already neutral):** `runTaskGraph`, the five `TaskEvent`s, the projection
and rollups, the cube grain machinery (`tasks/grain.js`), the learned/web spec
library, and the whole "shape → decompose → small-reach leaf" thesis. The
[task creator](task-creator.md)'s classifier, subject/length reads, and the artifact
templates are unchanged — an essay template is just a tree of `organ: "text"`
directives.

**Moves (the text leak, localized):**
1. The leaf contract gains `organ` / `directive` / `extent.share`; loses
   `maxTokens` / `format`.
2. `withBudgets` → `withOrgans` (a dispatch on `view.organ`).
3. Share→budget conversion and the single-reach ceiling move from `tasks/spec.js`
   globals into per-organ `budgetOf` declarations.
4. A new `organs/out/<modality>/` per output modality, each a bare `render` (the
   judging stays in the modality-blind enactor, exactly as `out/speech` already
   arranges).

**Migration is non-breaking.** Define `organs/out/text` as today's behaviour
(`directive` = the English goal, `budgetOf` = the current share→token math,
`render` = the grounded sub-turn). Tag every existing template leaf `organ: "text"`.
The essay path is then byte-identical; a second organ (music, image) is purely
additive — the falsifiable proof that the task language is no longer text-shaped is
a non-text artifact planned by the *same* `createTaskSpec` and run by the *same*
`runTaskGraph`, differing only in which `organs/out` renderer the leaves dispatch to.

## Status — what landed

The first slice is the seam, proven by a non-text artifact:

- **`src/organs/out/`** — the output membrane. `text.js` (today's behaviour, native
  unit tokens) and `music.js` (native unit beats) each export a pure plan-time
  **descriptor** (`unit`, `ceiling`, `minBudget`, `contextOf`) and a run-time
  **render** factory built from an injected generator. `index.js` is the registry
  (`organFor`, `createOutputRegistry`) — model-free, the runner's discipline kept.
- **`src/tasks/spec.js`** — the budget math now reads off the leaf's organ descriptor
  instead of text-coded globals: `createTaskSpec` sizes the artifact in the organ's
  unit, and the Figure/Pattern split fires off the organ's own `ceiling`. The leaf
  contract gained `organ` / `extent` / `unit` (with a back-compat `tokens` alias on
  the text path). `withOrgans(plan, registry)` is the dispatch; `runArtifact` takes
  `organs:` for the omnimodal path and keeps `generate:` as the text shorthand.
- **A melody runs end-to-end** through the *same* `runTaskGraph`: a long melody's
  development section overflows the 16-beat phrase ceiling and nests into sub-phrases,
  exactly as a long essay paragraph splits — `incoherent: []` confirms it split rather
  than jammed.

- **The directive is now modality-neutral.** A section declares a move
  (`{ act: 'open' | 'develop' | 'close' | … }`), not English; each organ's
  `lower(directive)` renders it — text to a sentence, music to a phrase. The melody
  template carries *no English at all*; the same directive handed to the text organ
  lowers to a sentence, which is the proof that the IR is not text-shaped. (The
  English-rich text templates keep their hand-tuned `goal` builders, which simply *are*
  the text organ's lowering — back-compat, `directive: null`.)
- **End-to-end harness** (`scripts/task-creator-e2e.mjs`, `npm run task-creator`): an
  essay rendered through the *real* model interface (the echo backend, grounded on
  per-leaf spans, cited) and a melody composed from neutral directives — both through
  the same `runArtifact`/`runTaskGraph`.

Deferred (the open questions below): per-organ SYN composition (`assembleOutput` still
string-joins — music should concatenate phrases, image should layer regions); and
cross-modal bundles. The seam is crossed and the directive is neutral; these refine how
leaves COMPOSE back, not how they are made.

## Open questions for the build

- **Directive shape.** *(first form landed: `{ act, role, subject, detail }`, lowered
  per organ.)* The remaining question is depth — does a generative directive need more
  than the move + role it carries now (e.g. an INS *target* proposition the ground does
  not yet contain)? The enactor's efference (`src/enactor/efference.js`) is the likely
  home for "intend to make X," and `act` is the natural slot to carry the cube move it
  names.
- **Composition (SYN @ Pattern).** `assembleOutput` joins leaf text with `\n\n`.
  Per-organ composition (concatenate notes into a phrase, layer regions into a
  frame) is the symmetric follow-up once `render` exists.
- **Cross-modal artifacts.** A leaf tree whose leaves use *different* organs (a
  report with a chart) — the registry already allows it; the open question is
  whether `assembleOutput` returns a single modality or a typed bundle.

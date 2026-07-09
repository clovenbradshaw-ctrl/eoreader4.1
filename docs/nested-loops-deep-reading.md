# Nested loops of deep reading — metacognition and cross-connections

> `src/fold/weave.js` · `tests/weave.test.js`. Deep reading (`deep-reading.md`) is one loop:
> when not otherwise busy, the reading surfs to the place of most interest, folds it, and deposits
> a reflection. This makes it a **nest** — a loop over that loop's output (metacognition), and
> bonds *between* its held interpretations (cross-connections) — without ever breaching the firewall.

## The three concentric loops

```
research session (across corpuses)            ← one log, frames = topics   (research/)
  └─ deep reading (loop 1, per document)       ← surf → fold → EVA reflection   (fold/deep-reading.js)
       └─ metacognition (loop 2)               ← fold the reflections → EVA about the pattern
            + cross-connections                ← CON bonds between held interpretations
```

Each loop **quiesces on its own physics**, so an outer loop never has to police an inner one:
deep reading habituates on the *place* and stops when no fresh peak beats its band; metacognition
habituates on the *pattern* and stops when no fresh pattern remains; connection is a single fold
over what already exists (it links, it does not loop).

## Metacognition — the reflection about the reflections (loop 2)

`deepReading` folds the **document** at its peak. `metaReflect` folds the reading's **own
reflections** (`readReflections`) and evaluates their pattern — the same **EVA** operator one grain
up, a pattern (SYN grain) over `layer:'reflection'` events. Model-free by default ("thinking needs
no model"), reading two patterns straight off the log:

| pattern | what it names |
|---|---|
| **recurring-focus** | the reading returned to the same figure ≥ `minRecur` times |
| **standing-strain** | a focus that *only* ever strained, never confirmed — an open question, or a place the reading cannot resolve (also the honest rumination tell) |

Each meta-reflection is sourced to the prior reflections it folds — **claim-src on its own acts**.
It is tagged `meta:true, order:2, layer:'metacognition'` and, crucially, **not** `reflection:true`,
so `readReflections` never folds it back in: loop 2 reads loop 1, never itself. `createMetaReader`
is the governed loop (the metacognitive sibling of `createDeepReader`); it habituates on the pattern
*signature*, so a pattern is noticed at most once — the cure for meta-rumination.

## Cross-connections — CON bonds between held interpretations

A connection is **CON** (Relate × Structure — the central operator), carried at band `void`,
reafferent, sourced to *both* endpoints, and **never upgraded** (the no-upgrade discipline of
`dag/stance.js`). Three kinds:

- **echo** — two reflections that are the **same proposition** (`perceiver/proposition-equivalence`,
  **Born-rule gated** — no hand threshold). A cross-*document* echo is a genuine cross-**corpus**
  connection: the reading found the same idea in two texts.
- **bears-on** — a reflection whose focus touches a held `eo:Tension` or an earlier `eo:Reframing`
  (pure, no embedder).
- **analogy** — same *relational* structure, *different* surface entities (structure-mapping). The
  seam is defined below; this first cut ships **echo + bears-on**, analogy is the next layer.

`connect` folds the reflections across one doc or many. Echo is **firewalled**: under a
spelling-space embedder (`measuresMeaning === false`) a cosine measures nothing, so nothing is
asserted (`live:false`). Same-doc echoes land on that doc's log; a multi-doc corpus has no shared
log, so pass one via `log:` (as a `research` session does) or take the returned events uncommitted.

## The epistemics — the firewall holds at every level

A meta-reflection and a connection are **both reafference** (`fromEnactor`, `canWitness === false`,
§8). A meta-reflection reads the reading's own prior EVAs but never promotes them; a connection
links two `void` nodes and is itself `void`. `projectGraph` skips EVA/CON-at-void, so — exactly like
a first-order reflection — they can **only** surface as substrate nodes (`eo:MetaReflection`,
`eo:Connection`, beside `eo:Reflection`/`eo:Tension`/`eo:Reframing`), never as depicted facts. Only a
human's witness act could ever promote any of them. So the whole nest can run unattended without
laundering self-talk into record — the firewall is the **type**, not a flag, and it is preserved by
composition rather than re-checked at each level.

## The API

```js
import {
  metaReflect, createMetaReader, connect, weaveReading,
  readReflections, readMetaReflections, readConnections, buildSubstrate,
} from '../fold/index.js';
import { surfFold } from '../surfer/index.js';

// loop 2 alone — fold the reading's own reflections, notice a pattern, hold it void
const m = metaReflect(doc);                        // { pattern, focus, sources, event, canWitness:false }
createMetaReader({ doc }).arrive();                // the governed loop — habituates, quiesces

// cross-connections over one doc (echo + bears-on), or a corpus (cross-doc echo)
const substrate = buildSubstrate({ structure, reflections: readReflections(doc) });
const { connections } = await connect(doc, { embedder, substrate });     // embedder must measure meaning
const cross = await connect([docA, docB], { embedder });                 // cross-corpus echoes

// the whole nest in one call — loop 1 → loop 2 → connections, every product held void
const woven = await weaveReading(doc, { surf: surfFold, embedder });
```

## The analogy seam (the next layer)

Analogy in the structure-mapping sense is a partial **isomorphism between two asserted sub-DAGs**
(`dag-corpus.md`): same edge-stance shape, different node labels. It reuses the same DEF·EVA·REC loop
as `proposition-equivalence`, but the similarity signal is over the **relational signature**
(edge-types + DAG neighborhood) rather than content cosine — matching two reflections by the *role*
they play in their local structure while their entities differ. It rides the same firewall (an
`eo:Connection` of `kind:'analogy'`, band `void`, sourced to both passages it bridges) and the same
Born-rule gate. `connect` already carries the `kind` and the dual `claim-src`; wiring the relational
signature into the echo path is additive.

## Where it lives

| concern | file |
|---|---|
| metacognition (loop 2) + cross-connections | `src/fold/weave.js` |
| the new substrate nodes + the log readers | `src/fold/substrate.js` (`eo:MetaReflection`, `eo:Connection`, `readMetaReflections`, `readConnections`) |
| loop 1 it composes over | `src/fold/deep-reading.js` |
| the Born-gated sameness echo rides | `src/perceiver/proposition-equivalence.js` |
| the firewall every level rides | `src/core/provenance.js` (§8, `canWitness`) |
| tests | `tests/weave.test.js` |

Relates to: `deep-reading.md`, `significance-loop.md`, `dag-corpus.md`, `proposition-equivalence.md`,
`nested-task-levels.md`, `subjective-frame.md`.

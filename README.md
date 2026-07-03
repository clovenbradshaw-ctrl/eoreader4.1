# eoreader4.1

Holonic document-chat over an append-only event log. Import anything — text,
markdown, HTML, PDF, spreadsheets, images, audio, video, a live web page, a
Gutenberg book — and it becomes one reading spine you can browse, chat with,
cite from, and write out of. One self-contained app (`index.html`), no runtime
npm dependencies; heavy extractors lazy-load from a CDN only when the matching
file type is imported.

This is the **essential** 4.1 build — the deployed reader app and everything it
needs to run, build, and be verified. What stayed behind in the 4.0 archive, and
how the repo is organized as holons, is mapped in
[`MIGRATION-POINTER.md`](MIGRATION-POINTER.md).

## Three principles

**The low sets the possibility for the high.**
A turn can only retrieve what parse admitted. A model can only phrase what
retrieval surfaced. A citation can only bind to a span that exists. Each
lower holon constrains what a higher one is allowed to do.

**The high sets the probabilities for the low.**
The grounding envelope re-weights retrieval. The conversation field biases
entity admission. The audit's history shapes which routes the next turn
will try. Higher holons influence lower ones — without violating their
contracts, only by changing the priors they operate under.

**Each holon is whole at its own scale.**
Open `src/core/`, run its tests, replace it — without touching `perceiver/`,
`retrieve/`, or the shell. The boundaries are real. If a change to attribution
risks the projector, or a change to retrieval risks the grounder, we have
a watch that collapses when the bench is jogged — not a nest of holons.
(See Koestler's parable in [`docs/holons.md`](docs/holons.md), and the whole-repo
holon map in [`MIGRATION-POINTER.md`](MIGRATION-POINTER.md).)

## The spine

```
any modality ─adapter─▶ append-only event log ─project─▶ graph
   (text · image · …)        │  (nine operators)
                             ├─▶ route ─▶ converse ─▶ retrieve ─▶ fold ─▶ prompt ─▶ llm ─▶ bind ─▶ veto ─▶ answer
                             │   (intent)  (session    │       (the surfer +      │
                             │              fold)      │        the consciousness)│
                             └─▶ audit ────── (projection of the stages.reduce fold) ──────────────────────┘
```

The append-only log is the single source of truth. The graph is a fold of the
log; you can lose it at any moment and rebuild it by replay. `projectGraph` is
memoized on `(events.length, frameSig)` — safe because the log is append-only
and the frame (including its rules) is fully in the key.

**Modality-universal.** `perceiver/parse` is the *text adapter*; image ingest is
the *image adapter* (a vision model's detections, injected). Both emit the same
nine operators onto the same log, so the graph, the reading cursor, the three
reading levels and the fold all work unchanged whether the units are sentences
or image regions. New modalities are new adapters, not a new spine.

## Three levels of reading — three kinds of math

The same log is read at three grains, each a different mathematics over the same
events: **existence** (what is there — set membership and admission),
**structure** (how it is connected — the graph projection), and **significance**
(what matters now — the weighted, frame-relative surprise the reading cursor
rides). It is all physics, not decisions: a route is a relaxation, a length is a
demand read off the discourse field, a citation holds or it doesn't. See
[`docs/reading-levels.md`](docs/reading-levels.md) and
[`docs/significance-loop.md`](docs/significance-loop.md).

## The sub-assemblies (each a holon)

Regenerated from the real `src/` layout. Each subdirectory's `index.js` is its
entrance; no file imports another holon's internals — a discipline enforced by
inspection.

| Holon | Role | Depends on |
|---|---|---|
| `core` | log · address · the nine operators · `projectGraph` (memoized, rules in frame) · the EO cube | nothing |
| `perceiver` (incl. `parse/`) | the text adapter + the existence/structure/significance reading surfaces + phasepost perception | `core` |
| `classify` | the phasepost classifier + bands (the 27-cell geometric read) | `core` |
| `converse` | the session fold · conversational events · coreference perception | nothing |
| `retrieve` | hybrid retrieval over the read sources | `core`, `perceiver` |
| `ground` | bind citations to real spans · run the vetoes (bind-or-veto) | `core`, `perceiver`, `factcheck` |
| `factcheck` | the fact-check / veto pipeline · edge-grounding corroboration | `core`, `classify`, `converse` |
| `surfer` | the surfer + the reading trajectory (arrest where the reading was rewritten) | `perceiver`, `enact` |
| `fold` | `foldNote` · the impression query | `surfer` |
| `enact` / `enactor` | the enacted DEF·EVA·REC loop · reader calibration · frame replay | `perceiver` |
| `answer` | mechanical short-circuits (math computed, not researched) | `core`, `perceiver` |
| `arc` | the long-generation arc (`runContinuation`) · span-veto · saturation gate | `ground`, `surfer` |
| `longgen` | long-form generation support · answerability gate | `arc` |
| `organs` | the output organs — text, publish, limner, and the shared composition contract (the essay organ is gone: long output is the deep-research projection) | `write`, `surfer` |
| `write` | the omnimodal composition walk (`walkComposition`) · cursor register · lens port | `surfer`, `ground` |
| `model` | chat backends (WebLLM, Qwen, echo) + embedders (hash, MiniLM) — dependency-injected | nothing |
| `predict` | the cursor predictor | `perceiver` |
| `tasks` | the learned task-template library · spec | `core` |
| `turn` | the pipeline as `stages.reduce(...)` · meta-route (intent + length demand) | all above |
| `ingest` | text / image / web-source adapters · EoT surface syntax | `perceiver`, `core` |
| `audit` | the append-only audit log (a projection of the fold) | nothing |
| `reader` | the **shell build source** (`app.dc.js`, `view.xdc.html`) · `eo-gen` · the geometric reader bundle · file import · `eo/` cells & centroids | the engine |
| `research` | **deep research as a grounded projection over an append-only log** (`docs/deep-research-log.md`): events · `projectReport` · driver · live view · the mountable surface (in-app overlay + standalone `deep-research.html`) | `archive`, `surfer`, `turn`, `core` |
| `archive` | archive.org pinning: dated snapshots, content hashes, span anchors (`#:~:text=`) | `ingest` |
| `credence` | belief / credence detection (carried for the eval battery — see the pointer) | `core` |

## The nine operators

The vocabulary the whole system speaks (the ACT face of the EO cube):

|               | Existence           | Structure          | Interpretation   |
|---------------|---------------------|--------------------|------------------|
| Differentiate | **NUL** hold¹       | **SEG** resplit    | **DEF** assert²  |
| Relate        | **SIG** attribute   | **CON** bond       | **EVA** evaluate |
| Generate      | **INS** instantiate | **SYN** synthesize | **REC** learn    |

¹ NUL is **non-transformation** — a thing held as-is — *not* clearing.
² Clearing/voiding is a **DEF to VOID** (an assertion), never a NUL.

**CON** — the binding bond at Relate × Structure — is the central operator. It is
what makes a citation hold a claim to a source. See
[`docs/operators.md`](docs/operators.md) for the full address derivation.

## Grounded, and auditable

Every bound claim rides a citation that jumps to the source passage, behind a
veto/fact-check pipeline; a claim tied to no span is struck, not shown. The turn
is a literal `stages.reduce(...)`, and the audit is a projection of that fold —
same spine, two levels — so every route, retrieval, and veto is inspectable
after the fact. See [`docs/edge-grounding.md`](docs/edge-grounding.md),
[`docs/audit-schema.md`](docs/audit-schema.md), and
[`docs/subjective-frame.md`](docs/subjective-frame.md).

## Run

    # tests — the green gate (pure Node, no network, no model)
    npm test

    # build the app from its source (never hand-edit index.html)
    npm run build

    # serve the app
    npm run serve        # python3 -m http.server 8000
    # then visit http://localhost:8000
    # deep research standalone (just the research surface):
    #   http://localhost:8000/deep-research.html

    # optional acceptance battery
    npm run mechanics    # needs devDependencies installed

The deeper design is in [`docs/`](docs/) (35 specs); the holon map, the PR #341
reconciliation, and what stayed in the 4.0 archive are in
[`MIGRATION-POINTER.md`](MIGRATION-POINTER.md).

## License

MIT.

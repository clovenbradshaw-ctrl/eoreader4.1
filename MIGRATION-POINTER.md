# EO Reader 4.1 — Holon Map & Migration Pointer

> **Koestler's two watchmakers.** Hora and Tempus both made watches of a thousand
> parts. Tempus built each watch as one long sequence, so every interruption
> collapsed the whole assembly and he began again from nothing. Hora built stable
> sub-assemblies of ten, then assembled ten of those, then ten of those — each an
> intermediate *whole* that held together on its own. When the phone rang, Hora
> lost only the sub-assembly in hand. He prospered; Tempus went broke.
>
> 4.1 is assembled the Hora way. It is not a flat dump of surviving files — it is a
> set of **holons**: self-contained wholes that are *also* parts, each verifiable on
> its own, each composing into the product without reaching into another's insides.
> This file is the assembly map. If a holon breaks, you rebuild it from its own
> source without disturbing the others — that is the whole point of building it this
> way, and the thing a flat migration would have thrown away.

This is the **pointer** promised for the move: what each holon is, where its single
source of truth lives, what stayed behind in 4.0 and why, and what's still open. The
full reachability trace and the original survival plan are carried in
[`docs/UPGRADE-4.1-MANIFEST.md`](docs/UPGRADE-4.1-MANIFEST.md) — read it when this
summary isn't enough. The archive repo (`clovenbradshaw-ctrl/eoreader4`, "4.0") holds
everything not carried, at full fidelity, in its history.

---

## The holons

Each holon below lists its **boundary** (what's inside), its **interface** (the
janus-faced contract — what it offers *up* to the whole and asks *down* of its
parts), its **source of truth**, and how to **verify it alone**.

### 1. Shell holon — the served app
- **Boundary:** `index.html` (the shipped artifact) ← built by
  `scripts/build-reader.mjs` from `src/reader/app.dc.js` + `src/reader/view.xdc.html`
  + `src/reader/app.props.txt` + `vendor/phosphor/phosphor.css`. Plus the embedded
  `templates.html` panel and the icon set (`favicon.ico/.svg`, `apple-touch-icon.png`).
- **Interface:** *up* — a self-contained browser app (browser-style tabs, multimodal
  import, grounded chat, essay organ, reader view). *down* — it reaches the engine
  only through `window.__resources` handles and the `window.eoGen` global, and
  dynamic `import()` of `src/`. It never imports engine internals statically.
- **Source of truth:** `app.dc.js` + `view.xdc.html`. **`index.html` is a generated
  artifact — never hand-edit it.** (This rule is the whole reason PR #341 existed; see
  *The reconciliation* below.)
- **Verify alone:** `npm run build` regenerates `index.html` byte-for-byte; CI fails
  if the working tree changes (`.github/workflows/pages.yml`), so the artifact can
  never drift from its source again.

### 2. Engine holon — the nine-operators spine
- **Boundary:** `src/` (292 modules). Every adapter emits the same nine operators
  onto one append-only event log; the graph is a replayable fold of that log. Each
  subdirectory is itself a sub-holon with one responsibility: `perceiver/` (parse),
  `ground/` (bind-or-veto), `retrieve/`, `surfer/` (the reading trajectory),
  `organs/` (output kinds incl. the essay organ), `write/` (composition walk),
  `turn/` (the pipeline), `answer/`, `arc/`, `longgen/`, `converse/`, `factcheck/`,
  `audit/`, `fold/`, `model/`, `classify/`, `enact/`, `enactor/`, `predict/`,
  `tasks/`, `core/`, `reader/` (the shell's build source + the geometric reader).
- **Interface:** *up* — consumed by the shell via dynamic import; new modalities are
  new adapters, not a new spine. *down* — pure ES modules, no DOM, no network in the
  hot path; heavy extractors (transformers.js, pdfjs, tesseract, xlsx, …) lazy-load
  from CDN only when their file type is imported.
- **Source of truth:** itself.
- **Verify alone:** `npm test` — 214 pure-Node suites (echo model + hash embedder, no
  network). This is the green gate; it does not need a browser or a model.

### 3. Data holon — the resources the engine reads
- **Boundary:** `data/` (runtime + build inputs) and `src/reader/eo/` (the browser
  twin of the phasepost cells / centroids). Runtime: `exemplars.jsonl`,
  `phasepost-cells.json`, `centroids-27.json`, `conventions/corpus-relations.json`.
  Test fixtures: `esker.txt`, `metamorphosis.txt`, `pantheon.json`, root `pg5200.txt`.
  Build input: `archetypes-27-*.json`.
- **Interface:** fetched via `__resources` paths (browser) or `import.meta.url`
  (Node/tests). *down* — plain data files, no code.
- **Source of truth:** itself (the `archetypes` file is the seed the build scripts
  bake `centroids-27.json` from).
- **Verify alone:** covered transitively by the engine's tests, which read the fixtures.

### 4. Verification holon — the acceptance surfaces
- **Boundary:** `tests/` (the green gate) + `eoreader4-eval/` (the end-to-end
  battery: grounding, void/abstention scoring, mechanics suites A–D) + `conformance.html`
  + `src/core/resolution-spectrum.js` + `docs/conformance-spec.md`.
- **Interface:** *down* — it depends on the engine; **nothing depends on it.** That
  one-way edge is what lets you change any other holon and ask this one whether you
  broke something.
- **Verify alone:** `npm test`; `npm run mechanics`; open `conformance.html`.

### 5. Build / repro holon — deterministic regeneration
- **Boundary:** `scripts/` — `build-reader.mjs` (the app builder), `build-centroids.mjs`,
  `build-morphology.mjs`, `learn-grammar.mjs`.
- **Interface:** *up* — regenerates the shell artifact and the baked data; *down* —
  reads the engine + `data/` seeds.
- **Verify alone:** `npm run build` (+ the CI diff-check) proves the shell is
  reproducible.

### 6. Knowledge holon — the specs a developer needs
- **Boundary:** `docs/` (35 files: the core spine + the second-tier docs whose
  subsystems ship) + this pointer + the manifest.
- **Interface:** prose only; cited from code comments, never fetched at runtime.

### 7. CI holon — test + scoped deploy
- **Boundary:** `.github/workflows/test.yml` (runs the gate) and `pages.yml` (rebuilds
  `index.html`, fails on drift, and deploys **only** the shipped file set — not the
  whole repo root as 4.0 did).

---

## The reconciliation (PR #341, now resolved)

PR #341 recorded a blocker: the shipped `index.html` and its build source
(`app.dc.js` + `view.xdc.html`) had **diverged in both directions** — neither was a
superset of the other, so a naïve rebuild would strand shipped features while
resurrecting reverted ones.

**Resolution — source-canonical (manifest §6.4a), integrating both sides.**
`app.dc.js` was made a true superset and `index.html` was rebuilt from it. Both
feature sets now ship:

- **Folded in from the served `index.html`:** the `_wantsLongform` / `_explicitLongform`
  physics-based longform routing (it reads the develop/brief demand off the discourse
  metacognition instead of a keyword cliff), the `lengthDemand`/`developDrive` the
  read carries to feed it, and the "N of 2,500 words" floor-relative essay progress
  (now walk-aware: shown for the flat floor walk, suppressed for the grounded walk,
  which has its own target).
- **Preserved from `app.dc.js` (PR #341's stranded work, now shipped):** the grounded
  essay walk (`composeEssayGrounded` + witness/leash beat audit), the `essayArmed`
  arm-to-write toggle, the `_logDoc` composition handle, WebGPU prewarm, the
  "same text twice" thinking-trail fix (`bf038a4`), and the header generic-status fix
  (`bd21a60`).

**Two live essay-organ bugs fixed** (they ship regardless of the build question):
- **Heading echoed as prose** — `stripSectionHeading` stripped only a *markdown*
  heading; a plain-text echo of the title/heading rendered twice. It now strips a
  leading run of markdown-or-plain lines matching the known heading/title.
- **Subject change not detected** — an essay ask naming a genuinely new subject stayed
  bound to the thread's standing subject and grounded in the wrong sources.
  `runOrganEssay` now commissions on the clean own-subject and, on a real switch (no
  content-word overlap with the standing subject), suppresses the standing-corpus
  grounded walk so the piece stands on sources gathered for the new subject.

Landed in 4.0 as commit `d5b4b20` and carried here. Verified: `app.dc.js` parses,
`index.html` rebuilds identically with both feature sets present, and the full suite
is green.

**The permanent fix** is structural: `index.html` is now a generated artifact, and CI
(`pages.yml`) fails if it drifts from `app.dc.js`. The "editing the surface that isn't
served" failure cannot recur.

---

## What stayed behind in 4.0 (the pointer "in case we forget anything")

Nothing below is lost — it lives at full fidelity in the 4.0 repo's history. Pull any
item forward deliberately if a 4.1 roadmap item needs it.

| Left behind | What it is | Pull forward if… |
|---|---|---|
| `chat.html`, `src/main.js`, `src/ui/`, `src/mind/`, `src/boot/`, `src/rest/` | The older modular "views" chat app — superseded by `index.html` as the product | you want the **Mind** (OPFS parquet cross-session memory) or a chat-side view |
| `src/bench/`, `src/persist/`, `src/plexus/`, `src/probe/`, `src/thalamus/` | Node-only research subsystems with no browser path | a roadmap item needs durable corpora (persist drivers) or the audio backend |
| `eoPlayer.html`, `transcribe.html`, `essay.html`, `curio.html` + `eo-companion.js`, `idle-ux.html`, `boot-animation.html` | Standalone demo/design pages; none linked from the app | you want a demo surface back |
| `experiments/`, ~46 research scripts, genome/reveal/structural-reveal data | Research instruments & measurement dumps; their confirmed capabilities are already locked as regression tests that ship | you're reproducing a specific measurement |
| ~49 research-essay docs | How 4.0 was *discovered*, not how it *works* | you're doing the archaeology |
| The 320 PRs / branch graph | The commit narrative | you need the provenance of a specific change |

### Deviations from the manifest that reality forced
The manifest was written from a static trace; three of its calls were adjusted so the
green gate stays green and the recommended battery stays runnable:

1. **`data/esker.txt`, `data/metamorphosis.txt`, `data/pantheon.json`, root `pg5200.txt`
   are kept.** The manifest listed them as leave-behind corpora, but they are live
   **test fixtures** for ~10 kept engine suites (predict, surprise, relation,
   gutenberg, trajectory, voice, metadata, frame, prompt, …). Dropping them would
   redden the gate.
2. **`src/credence/` is kept** (with its 5 unit tests), even though it's node-only
   research, because the kept eval battery's Mechanics **Suite D** imports it. It is a
   justified dependency of the verification holon, not runtime code.
3. **`scripts/learn-conventions.mjs` and `scripts/preparse-corpus.mjs` were dropped**
   (and their npm scripts, and `hyparquet` from devDependencies). They depend on
   `src/mind/` (the left-behind Mind). Their baked output
   (`data/conventions/corpus-relations.json`) is carried as a static file; regenerating
   it requires pulling the Mind forward from 4.0.
4. **`src/ui/prefetch.js` was promoted, not dropped** — it's shared engine code
   (`normalizeQuery`, needed by `src/turn/{research,deep-research}.js`), so it moved to
   `src/turn/prefetch.js` and its importers + test were rewired.

---

## Still open (flagged, not blocking — manifest §4)

Carried forward as known-open cleanups for a later pass:

1. **Dead `__resources` keys** — `eoPhase` / `eoEmbed` / `eoCells` / `eoCentroids` are
   declared in the shell but the bundle inlines its own phasepost path. Wire or drop them.
2. **Duplicate data** — `phasepost-cells.json` and `centroids-27.json` exist in both
   `data/` and `src/reader/eo/` (verified byte-identical). Both are carried to preserve
   the browser-fetch vs node-read paths exactly; unify to one canonical copy.
3. **`svo-llm.js` second reader** is gated on `window.claude.complete`, dormant in real
   deployments — port the gate to a real backend or leave it.
4. **Pleias/wllama backend** is imported by `model-entry.js` but absent from the backend
   dropdown (it's the no-WebGPU fallback) — expose it or drop the import.
5. **Proxy dependency** — all web fetch/search/gutenberg traffic is hardcoded to one
   external webhook. Make it configurable.

---

## The watchmaker's rule

- **Never hand-edit `index.html`.** Edit `app.dc.js` / `view.xdc.html`, run
  `npm run build`. CI enforces it.
- **Each holon rebuilds from its own source without touching the others.** The shell
  from its build source; the baked data from its seeds and scripts; the graph from the
  log. Keep the interfaces (the nine operators, `__resources`, `window.eoGen`, the
  one-way test→engine edge) clean, and an interruption only ever costs you the
  sub-assembly in your hand.

# EO Reader 4.1 — Survival Manifest

What carries into the net-new 4.1 repo, and what stays behind. The organizing
principle: **the deployed `index.html` app is the product.** Everything that app
needs to run, build, and be verified survives. Research instruments, superseded
surfaces, one-off measurement dumps, and history-narrating documentation stay
here in the 4.0 repo as the archive.

Derived from a full reachability trace of the current tree (345 source files,
230 test files, 80 docs, ~50 scripts, 9 secondary HTML pages). PR history does
not migrate — the current tree is the sum of all 320 merged PRs; the new repo
starts from this manifest, not from the branch graph.

---

## 0. The one decision baked into this manifest

The repo contains **two front-ends** sharing one engine:

1. **`index.html`** — the shipped app. A self-contained ~704 KB bundle built by
   `scripts/build-reader.mjs` from `src/reader/app.dc.js` +
   `src/reader/view.xdc.html`. Browser-style tabs, multimodal import, grounded
   chat, essay organ, web research, reader view. This is what users use.
2. **`chat.html` → `src/main.js` → `src/ui/`** — an older modular "views" app
   (Text / Graph / Log / Feed / Predict / Replay / Surfer / Idle / Gates /
   Audit tabs). `chat.html` itself says: *"the reader (index.html) is the
   primary surface; this chat app is kept reachable here."*

**4.1 ships `index.html` only.** The views app and its exclusive modules stay
behind. Features exclusive to it that may be worth porting later are flagged in
§6 so nothing is lost silently.

> ⚠️ **Before the move: `index.html` and its build source have DIVERGED — reconcile them.**
> The clean story above ("`index.html` is built by `build-reader.mjs` from `app.dc.js` +
> `view.xdc.html`") is no longer true in practice. The shipped `index.html` has been
> **hand-edited directly**, while `app.dc.js` / `view.xdc.html` were edited independently,
> so the two drifted apart **in both directions**. Running `node scripts/build-reader.mjs`
> on the current tree rewrites the shipped `index.html` with a **152-insertion /
> 84-deletion** diff — it is *not* a no-op, and it regresses recent direct edits.
> Verified on this tree:
>
> | Change | In served `index.html` | In `app.dc.js` source |
> |---|---|---|
> | "N of 2,500 words" essay progress (direct edit) | ✅ | ❌ |
> | `essayArmed` arm-to-write toggle | ❌ | ✅ (×7) |
> | `_logDoc` omnimodal composition handle | ❌ | ✅ (×3) |
> | Thinking-trail "same text twice" fix (`bf038a4`) | ❌ | ✅ |
> | Header "generic status when trail open" fix (`bd21a60`) | ❌ | ✅ |
>
> **Neither file is a superset of the other.** Fixes committed to `app.dc.js` — including
> the literal *"same text twice"* thinking-trail fix the reader still sees — never shipped,
> because the served `index.html` is not rebuilt from source; and edits made straight to
> `index.html` are missing from source. **Do not carry both as-is, and do not blindly
> rebuild.** Pick ONE source of truth and three-way reconcile first (§6.4). This divergence
> is the root cause of "we keep editing the surface that isn't served."

---

## 1. The functionality that survives (the index.html feature set)

This is the capability inventory 4.1 must preserve — every item below is live
in the shipped app today.

### Ingest — any modality into one reading spine
- **Import any file**: `.txt` `.md` `.html` `.pdf` `.csv` `.tsv` `.xlsx`
  `image/*` `audio/*` `video/*` — routed by `src/reader/import-file.js`, which
  lazy-loads the right extractor per type.
- **Audio/video transcription**: whisper (`onnx-community/whisper-base`,
  transformers.js, WebGPU→WASM fallback), with a playable media handle and an
  aligned transcript; optional **two-witness audit** (a second whisper pass
  with different chunking so divergent transcriptions become auditable).
- **Image OCR**: Tesseract.js. **PDF**: pdfjs-dist text layer.
  **Spreadsheets**: SheetJS; CSV/TSV via PapaParse. **Web pages**:
  Readability + Turndown.
- **Live web browsing**: fetch any URL (through the proxy), rendered as a
  native page or a stripped reader view.
- **Web search** (DuckDuckGo via proxy, Wikipedia direct) and **Gutenberg book
  search/import** (gutendex), with random start suggestions.
- **Import ledger**: sources land in the panel the instant they're picked,
  with live per-source extraction progress.
- All adapters emit the same nine operators onto one append-only log — new
  modalities are new adapters, not a new spine.

### Reading surfaces
- Native-website view vs book-like **reader view**, per tab, persisted.
- Reader typography (font size, line height, light/sepia/dark, column width,
  serif/sans), reading-position memory per URL, TOC/chapter detection and
  jump, bookmark rail.
- Entity **name-linking** in page text: clickable known figures, hover pivots.
- **Browser-style tabs** (browse / chat / new kinds), per-tab back/forward
  history; panes for sources / doc / chat / spine, responsive down to phone.

### Grounded chat
- Per-scope chats (this page / chosen sources / all sources / isolated),
  "Ask this page."
- Grounded answering: retrieval over read sources → meaning-graph context →
  grounded prompt → streamed tokens, live thinking narration, stall guard,
  stop button.
- **Per-claim citations**: inline cite pills that jump to the source passage,
  hover cite cards. Veto/fact-check pipeline behind every bound claim.
- Research depth cycle (shallow / deep / obsessive), web-brain toggle,
  curiosity walk with saliency leash and per-hop feed lines.
- Mechanical short-circuits: math computed not researched
  (`src/answer/math.js`), office/role fact audits.

### Generation
- **Writer path**: compose verbs route to plain generation, write-first with
  before/after revision affordance.
- **Essay organ** (`/essay` or essay intent): plans an outline, researches the
  subject first, walks sections to a ≥2500-word floor with span-binding to
  real sources, streams across chat messages; **learned essay types** with
  per-type profiles that improve with use; anti-fabrication /
  anti-repetition / dialectic-closure gates ported from the arc.
- **Longgen arc**: `runContinuation` over a reading ground (self-register,
  dynamics, NUL, field-read) when the essay pipeline toggle is on.
- **`/svg` Limner**: deterministic grounded SVG of the reading's EO graph
  (graph / timeline / void_map / path), no model in the loop.
- **Templates**: learned task-template library, viewed in-app
  (`templates.html` iframed as a modal panel).

### Audit & provenance
- Audit mode with fold-vs-Wikipedia definition compare; copy-audit-text.
- Export the reading/graph as JSON.
- Append-only event log as the single source of truth; the graph is a
  replayable fold of the log.

### Model stack (the multimodal power)
- **Chat backends** via `src/model/`: WebLLM (Llama-3.2-3B, WebGPU, default),
  Qwen2.5-Coder 0.5B/1.5B/7B, `echo` offline stub. (Pleias/wllama GGUF is
  wired but not exposed — see §6.)
- **Embedders**: hash embedder + MiniLM meaning embedder.
- **Geometric EO reader** (`src/reader/eoreader4-bundle.js` + `src/reader/eo/`
  phasepost cells and centroids): reads with no model in the loop.
- All heavy dependencies (transformers.js, pdfjs, tesseract, xlsx, papaparse,
  readability, turndown) lazy-load from CDN only when the matching file type
  is actually imported. The app itself has **no runtime npm dependencies**.

### Personalization / chrome
- Accent color, highlight style, hover behavior, panel widths, layout swap,
  muted sources, settings panel, onboarding/landing with start suggestions,
  boot animation — all persisted in `localStorage` (`eo_*` keys).

---

## 2. Files that survive

### 2.1 App + runtime assets (must-carry)

| Path | Why |
|---|---|
| `index.html` | The shipped app (built artifact; rebuildable from src). |
| `templates.html` | The only secondary page the app embeds (iframe modal, `index.html:1530`). |
| `templates/` | Runtime persistence target for learned task templates (`src/tasks/templates.js`). |
| `vendor/` (react, react-dom, dc-runtime, phosphor) | Loaded by `index.html` directly; the only vendored deps. |
| `favicon.ico`, `favicon.svg`, `apple-touch-icon.png` | App chrome. |
| `src/reader/eo/phasepost-cells.json`, `src/reader/eo/centroids-27.json` | The two data files the shipped app actually fetches (`__resources`). |
| `data/exemplars.jsonl` | Fetched at runtime by the live turn pipeline (`src/turn/shape.js` resolves it via `import.meta.url`). |
| `data/phasepost-cells.json`, `data/centroids-27.json` | Node-side twins of the `src/reader/eo/` copies (used by src under Node/tests; keep in sync or unify to one copy in 4.1). |
| `data/conventions/corpus-relations.json` | Opt-in relation-convention prior; small, produced by a kept script. |

### 2.2 Source — the live engine (~269 of 345 files)

Everything reachable from `index.html`'s dynamic imports survives, i.e. the
whole engine:

**Fully live subdirs** — `answer/`, `arc/`, `audit/`, `converse/`, `enact/`,
`enactor/`, `factcheck/`, `fold/`, `ground/`, `longgen/`, `model/`, `organs/`,
`perceiver/` (incl. `parse/`), `predict/`, `retrieve/`, `surfer/`, `tasks/`,
`turn/`, `write/`.

**Mostly live** —
- `core/`: all except `resolution-spectrum.js` (conformance.html only — keep
  it with the conformance harness, §2.4).
- `classify/`: `bands.js` is live; `bandpull.js` / `centroids.js` /
  `index.js` / `phasepost.js` are chat.html-only (stay behind unless the
  Node/test paths need them — several tests do; simplest is to carry the
  whole small dir).
- `ingest/`: `eot.js`, `eot-emit.js`, `websource.js` live; `index.js`,
  `opfs-store.js`, `webfetch.js` are chat-only; `plaintext.js` test-only.
- `reader/`: `eo-gen.js`, `eoreader4-bundle.js`, `model-entry.js`,
  `svo-llm.js`, `import-file.js`, `eo/*` live; **`app.dc.js` +
  `view.xdc.html` are the *intended* build source of index.html but have
  DIVERGED from the shipped file in both directions (see §0 callout, §6.4) —
  carry only after reconciling to a single source of truth**;
  `cross-source.js` test-only; **`engine-entry.js` is orphaned — delete**.

### 2.3 Build chain + CI (dev-tooling that survives)

| Path | Why |
|---|---|
| `scripts/build-reader.mjs` | **THE builder of index.html — currently BYPASSED.** Running it on today's tree rewrites the shipped `index.html` (152 ins / 84 del) and regresses direct edits; source and artifact have diverged (§0, §6.4). In 4.1: reconcile first, then wire it up as `npm run build` and never hand-edit `index.html` again. |
| `scripts/build-centroids.mjs` + `data/archetypes-27-*.json` | Rebuilds centroids-27.json (carry only if you want centroid rebuilds). |
| `scripts/build-morphology.mjs`, `scripts/learn-conventions.mjs`, `scripts/learn-grammar.mjs`, `scripts/preparse-corpus.mjs` | Produce baked source/data artifacts (reproducibility chain). |
| `tests/` (all 230 files) | Pure-Node engine suite (echo model + hash embedder, no network); the green gate. Prune only tests whose src module is dropped. |
| `.github/workflows/test.yml` | CI for the suite. |
| `.github/workflows/pages.yml` | The deploy. **Fix in 4.1:** it currently uploads the whole repo root; scope it to the shipped files. |
| `package.json` | Trim npm scripts to: `test`, `serve`, `build` (build-reader), `build:centroids`, `learn:grammar`, `preparse` + the eval entries if the battery is kept (§2.4). Keep devDependencies as-is (`@huggingface/transformers`, `hyparquet`) — only needed for preparse/eval, never at runtime. |

### 2.4 Optional but recommended: the conformance battery

`eoreader4-eval/` + `conformance.html` + `src/core/resolution-spectrum.js` +
`docs/conformance-spec.md`. Nothing in the app depends on it — it depends on
the app — but it is the only end-to-end acceptance harness (grounding
battery, void/abstention scoring, mechanics suites A–D). **Recommendation:
carry it, minus the committed result dumps** (`surf-wnp-results.*`,
`*.audit.json`, `*.trace.json` — baselines that belong to 4.0 history).

### 2.5 Docs that survive (~18 core + 10 second-tier of 80)

**Core spine** (a developer needs these to work on 4.1):
`architecture.md`, `operators.md`, `holons.md`, `reading-levels.md`,
`cube.md`, `audit-schema.md`, `phasepost.md`, `significance-loop.md`,
`edge-grounding.md`, `pocket-universe-grounding.md`, `subjective-frame.md`
(supersedes prompt-assembly.md), `conformance-spec.md`, `structure.md`,
`persistence.md`, `reader.md`, `surfing-the-fold.md`, `nested-task-levels.md`
+ `task-creator.md`, `eot-surface-syntax.md`.

**Second tier** (carry because their subsystems ship in 4.1):
`long-generation.md`, `holonic-token-confinement.md`,
`nul-hold-the-uncohered.md`, `spec-enacted-writer.md`, `limner.md`,
`omnimodal-core.md`, `omnimodal-task-language.md`, `web-search.md`,
`curiosity-research.md`, `answerability.md`, `answer-expectation.md`,
`conversation-fold.md`, `proposition-equivalence.md`, `large-models.md`
(operational model-loading notes).

**README.md**: rewrite, don't copy. Keep the three principles, the spine
diagram, the three-levels-of-reading and subsystem narrative, and the Run
instructions. Drop the eoreader3 `engine.js` line-number archaeology and the
"what was kept, what was cut" eoreader3 migration diff. Regenerate the holon
table from the real `src/` layout (the current table lists dirs that no
longer exist and omits a dozen shipped holons).

---

## 3. What stays behind (and why)

### 3.1 The second front-end
`chat.html`, `src/main.js`, `src/ui/` (16 chat-only view modules), `src/mind/`
(OPFS parquet corpus memory), `src/boot/index.js` + `install.js`,
chat-only parts of `classify/` and `ingest/` (`opfs-store.js`,
`webfetch.js`), `src/rest/index.js`. Superseded by index.html as the product
surface. See §6 for the three features worth cherry-picking later.

### 3.2 Standalone demo/design pages (all self-contained, none linked from the app)
- `eoPlayer.html` — text-to-music experiment ("The Seam").
- `transcribe.html` — audio transcription demo; superseded by in-app import.
- `essay.html` — essay-only chat surface; the essay organ lives in the app now.
- `chat.html` — see §3.1.
- `curio.html` + `eo-companion.js` — the "Eo" curiosity creature page
  (verified: `index.html` never loads `eo-companion.js`).
- `idle-ux.html` — idle-state design mock (the logic lives in src + tests).
- `boot-animation.html` — dev preview of a component already in the app.

### 3.3 Research instruments
- `experiments/` — the blind-experiment bundles (exp-0002…0009) and ledgers.
  Their confirmed capabilities are already locked as regression tests in
  `tests/` (novelty-reserve, surfaces-phase0, one-cursor-p0, bridge-surprise,
  appearance-time), which survive. The bundles are provenance, not code.
- ~30 unreferenced `scripts/*.mjs` measurement/demo scripts (abstain,
  asterisk-measure, genome-rho, structural-reveal*, reveal-discrimination,
  surfaces-measure, refusal-trace, entity-horizon, discover-harmonics, …).
- Node-only src subsystems with no browser path and no 4.1 feature attached:
  `src/bench/`, `src/credence/`, `src/persist/` (+ drivers incl. Matrix),
  `src/plexus/`, `src/probe/`, `src/thalamus/` (+ CANTOR audio backend),
  `src/rest/cycle.js`, `src/ingest/plaintext.js`, `src/reader/cross-source.js`.
  Each has docs and tests that stay behind with it. (If any of these is a
  4.1 roadmap item — e.g. persistence drivers — pull it forward then, from
  this repo's history.)
- `src/reader/engine-entry.js` — orphaned (imported by nothing). Delete.

### 3.4 Research data & corpora
`data/esker.txt`, `data/metamorphosis.txt` (bench corpus — goes with
`bench/`), `data/genome/` (E. coli, φX174, MS2 — genome-rho research),
`data/reveal-*` and `data/structural-reveal-*` dumps, `data/form-genres.jsonl`
(orphan, no consumer), `data/voice-cartridge.json` + `data/pantheon.json`
(distill-voice outputs; pantheon is "λ off in production" and never fetched),
root `pg5200.txt` (manual import-testing sample; referenced only in
comments).

### 3.5 Documentation that stays
The ~21 research essays (bayesian-surprise stays live-adjacent but the essay
set includes: genetic-code, genome-rho, significance-column-measurement,
surfaces-phase0, metamorphosis-battery, ai-user-battery, novelty-reserve,
nanopublications, internet-native, common-sense, decision-as-relaxation,
appearance-time, born-edge-weight, cube-geometry, essay-backwards,
generation-by-field-reading, one-cursor, spec-one-surprise, spec-planner,
surfing-next, INTEGRATION-AMINO) and the 3 superseded specs
(prompt-assembly, grounded-speech, spec-generation). They document how 4.0
was discovered, not how 4.1 works. They remain readable here.

### 3.6 History
The 320 PRs, their branches, and the commit narrative stay with this repo.
4.1 starts with an initial commit of the manifest set above.

---

## 4. Known live-app quirks to fix during the move

1. **Dead `__resources` keys**: `eoPhase` / `eoEmbed` / `eoCells` /
   `eoCentroids` are declared in `index.html:38` but never consumed by the
   bundle (it inlines its phasepost path). Either wire them or drop them at
   rebuild.
2. **Duplicate data**: `phasepost-cells.json` and `centroids-27.json` exist in
   both `data/` and `src/reader/eo/`. Unify to one canonical location.
3. **SVO-LLM second reader** (`svo-llm.js`) is gated on `window.claude.complete`
   and therefore dormant in every real deployment. Decide: port the gate to a
   real backend, or leave the module behind.
4. **Pleias/wllama backend** is imported by `model-entry.js` but absent from
   the backend dropdown. Expose it or drop the import (wllama + GGUF is the
   no-WebGPU fallback story, so probably expose).
5. **Proxy dependency**: all web fetch/search/gutenberg traffic goes through
   `https://n8n.intelechia.com/webhook/feed` — a single external point of
   failure, hardcoded. Make it configurable in 4.1.
6. **`pages.yml` deploys the entire repo**, including every leave-behind page
   and corpus. Scope the artifact to the §2 file set.
7. **`build-reader.mjs` isn't in package.json** — add `npm run build`.
8. **`index.html` ↔ source divergence (blocker).** The shipped `index.html` and its
   build source (`app.dc.js` + `view.xdc.html`) have drifted apart in both directions
   (§0). Reconcile to one source of truth before 4.1's initial commit, or the move will
   either strand shipped features or resurrect reverted ones.
9. **Fixes stranded in the un-built source.** Committed to `app.dc.js` but never reached
   the served `index.html`; re-land them during reconciliation: the thinking-trail
   *"same text twice"* fix (`bf038a4` — the live discourse read was written to *both* the
   header and the trailing trail beat), the "header shows generic status when the live
   trail is open" fix (`bd21a60`), the `essayArmed` arm-to-write toggle, and the `_logDoc`
   omnimodal composition handle. (The "same text twice" the reader still sees is exactly
   this: the fix exists — on the surface that isn't served.)
10. **Live essay-organ bugs in shipping code** (`src/organs/out/essay.js`, loaded live via
    `eo-gen.js` — these ship regardless of the build question, so they follow the app into
    4.1 unless fixed):
    - **A section body echoes its own title/heading as prose.** `stripSectionHeading`
      strips only a *markdown* (`#`) heading line; when the small model re-emits the title
      or heading as plain text at the top of a section, it survives and renders twice
      (the `#`/`##` heading, then the same line again as the first body paragraph — the
      duplicate seen in "write me an essay about dolphins"). Fix: strip a leading run of
      lines matching the known title/heading, markdown **or** plain.
    - **A subject change is not detected.** An essay ask that names a genuinely new subject
      ("write an essay on the relationship between fission and fusion in energy") stays
      bound to the thread's standing subject (dolphins) and is answered grounded in the
      wrong sources. The turn should recognize the new own-subject — and, lacking sources
      for it, gather/ask rather than reuse the standing subject. See `runOrganEssay`'s
      subject resolution + `docs/discourse-routing.md`.

---

## 5. The numbers

| Category | Total today | Survives | Stays behind |
|---|---|---|---|
| src `.js` files | 345 | ~272 (269 live + 2 build sources †) | ~73 (chat-only UI/mind + node-only research) |
| Secondary HTML pages | 9 | 1 (`templates.html`) + `conformance.html` if eval kept | 7 |
| scripts/ | ~50 | ~7 build scripts | ~43 research/demo |
| docs/ | 80 | ~28 | ~52 |
| tests/ | 230 | ~200+ (all minus dropped-module tests) | remainder |
| data/ + corpora | ~20 items | 5–6 runtime/build files | research dumps & corpora |
| GitHub PRs / branches | 320 | 0 | all |

† The 2 "build sources" (`app.dc.js` + `view.xdc.html`) only count as sources once
reconciled with the shipped `index.html` — today they've diverged from it (§0, §6.4).

---

## 6. Flagged decisions (not blocking, but decide before 4.1 freezes)

1. **Cherry-picks from the left-behind chat.html app** — three features exist
   there and not in index.html: the **Mind** (OPFS parquet corpus memory with
   recall/weave), **deep research** (`/research`, `turn/deep-research.js` —
   the module survives; only the UI hook is chat-side), and **speculative
   prefetch** (`ui/prefetch.js` — actually already shared with index).
   Recommendation: port the Mind if persistent cross-session memory is a 4.1
   goal; otherwise leave with confidence.
2. **Keep or drop the eval battery** (§2.4). Recommendation: keep.
3. **`persist/` drivers** (IndexedDB/Matrix/memory) are node-only today but
   are the obvious substrate if 4.1 wants durable corpora beyond
   localStorage. Leave behind now, pull forward deliberately if needed.
4. **Single source of truth for the app shell (decide before the move).** `index.html`
   and `app.dc.js` / `view.xdc.html` have diverged (§0). Two clean end states:
   - **(a) Source-canonical** — three-way reconcile the direct `index.html` edits back
     into `app.dc.js` + `view.xdc.html`, re-establish `build-reader.mjs` as `npm run
     build`, and treat `index.html` as a generated artifact never edited by hand. Keeps
     the ergonomic split source (600 KB structured `app.dc.js` beats a 776 KB inline
     blob); costs one reconciliation pass now.
   - **(b) Artifact-canonical** — declare the built `index.html` the source of truth,
     drop `app.dc.js` + `view.xdc.html` + `build-reader.mjs` as legacy, and hand-edit
     `index.html` thereafter. Cheaper now, worse to maintain.

   **Recommendation: (a).** It preserves the reason the build exists and permanently ends
   the "editing the surface that isn't served" failure — *provided* the rule "never
   hand-edit `index.html`" is enforced. A CI check that `git diff` is empty after
   `npm run build` makes it self-policing and is cheap to add in 4.1.

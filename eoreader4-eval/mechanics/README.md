# Mechanics Test Battery harness

An AI-tester harness for the **Mechanics Test Battery** — a black-box-where-possible
acceptance battery that drives eoreader4 as a user and exercises three mechanics
(document reading / the fold · grounding / the veto battery · web search / SURF) plus
cross-cutting integrity. It scores each test **PASS / FAIL / INCONCLUSIVE** with the
introspected surface the rubric keys on.

## Run

```sh
# all four suites (A document-reading · B grounding · C web/SURF · D integrity)
node eoreader4-eval/mechanics/run.mjs ABCD

# a subset
node eoreader4-eval/mechanics/run.mjs AB
```

First run downloads two small models to the transformers.js cache (SmolLM2-360M ≈ 0.4 GB,
MiniLM ≈ 0.1 GB) and reuses them thereafter. C1 makes one live web request.

## What it is

Unlike `eoreader4-eval/ai-user-battery.mjs` (which can run a deterministic *structural*
check on echo + hash), this harness stands up a **valid scorecard** config on CPU:

- **a real generative talker** — `HuggingFaceTB/SmolLM2-360M-Instruct` (q8), run through
  transformers.js / onnxruntime-node. The "cpu based llm to get answers." It can invent,
  so the confabulation tests are real (echo cannot confabulate → FM2 trivially 0).
- **the MiniLM organ live** — `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (q8), the
  same space the 27-cell centroids were built in, so the classifier's cosines mean
  something and the significance column / relational vetoes fire.

Both replace the browser's CDN/`fetch` loaders with the locally-installed
`@huggingface/transformers` and a direct JSON read — the **models and the centroid
bundle are byte-identical** to what the app loads.

## Files

| file | what |
|---|---|
| `harness.mjs` | builds the env (CPU LLM + MiniLM organ + classifier + centroid prior), parses docs with the sentence-embedding cache the pipeline reads |
| `util.mjs` | `turn()` (one real `runTurn` + introspected surfaces), scoring helpers, time-travel log slicing, coref-aware span support |
| `suite-a.mjs` | A1–A6 — operator counts off the log, memo determinism, span resolution, append-only + time-travel, operational lens, prompt-injection |
| `suite-b.mjs` | B1–B5 — binding, out-of-corpus VOID, realizer-drift veto, partial-grounding seam, right-span |
| `suite-c.mjs` | C1–C7 — live web provenance envelope, self-corroboration firewall, and the significance column (ρ, Born weights, commutator, atmosphere departure) over constructed retrieved sets |
| `suite-d.mjs` | D1–D4 — reliability vs the field, reliability earned (credence track-record), audit replay, grounding under time-travel |
| `run.mjs` | the runner — assembles the env, runs the selected suites, prints the scorecard |
| `RESULTS.md` | a recorded run's results and analysis |
| `smoke.mjs` | a one-turn end-to-end check that the harness is sound |

## Surfaces introspected

- **log** — `doc.log.snapshot()` (operator counts, append-only check, web provenance)
- **graph** — `projectGraph(doc.log, frame)` (entities/edges, span resolution, memo, time-travel)
- **veto** — `runTurn` → `flags` (with `refuses`), `bound` (per-claim citation), `verdicts`
- **significance** — the `fold` audit step's `surf` (atmosphere · lenses · paradigm · stance)
  and direct `src/core/spectral.js` measurements (`buildDensity`, `eigenLenses`, `relEntropy`,
  `commutator`) over MiniLM-embedded sets — the exact machinery the surfer rides
- **reliability** — `src/credence` (`createCredenceBook` → `at()`)
- **scrubber / time-travel** — projecting the append-only log sliced/filtered to an earlier state

## Dependency

Needs `@huggingface/transformers` (CPU inference, dev-only — the app itself has no
runtime deps). Install with `npm i -D @huggingface/transformers`. `node_modules/` is
gitignored.

# The flow prior — corpus → 15 KB → per-beat witness

A book is a **path** through shape-space, not a point. This is the loop that learns
how competent long-form prose *moves*, compresses that into a small loadable prior,
and hands it to the generation loop as a witness that knows whether each new
paragraph moves the way the corpus moves — and whether the piece is building on
schedule.

```
corpus.jsonl ─▶ eo_trajectory.mjs ─▶ trajectories.jsonl ─▶ flow_distill.py ─▶ flow-prior.json
                (parse each book,        (one 102-dim           (PCA + per-position         (15 KB,
                 segment into NATURAL      vector per section)    arc & delta stats,          provenance-stamped)
                 sections, one vec each)                          resampled onto a grid)
                                                                                    │
                            src/flow/index.js ◀──────────── loads ──────────────────┘
                            (the drop-in holon: sectionize / scoreTrajectory / flowVerdict / arcTarget)
```

## Segmentation — one vector per NATURAL section, not per grid cell

A fixed grid of *N* equal slices is arbitrary: a slice is a different-sized chunk of
reading in every document, and the delta between two slices is partly an artifact of
where the grid line fell. The reading articulates itself instead. `sectionize()`
reads the event log's **dominant-operator runs** — the INS↔SEG alternation
(introducing-mode vs segmenting/narrative-mode) — bounded by **NUL births** (the part
boundaries), and cuts a section at each mode change once a minimum length is met.

On *Metamorphosis* that recovers ~45 variable-length sections (8–66 sentences),
labelled `NUL SEG INS INS SEG DEF SEG INS …` — the text's own structure, with the
three Parts falling on NUL births. The delta between consecutive sections is then a
**real structural transition** — the discourse genuinely changed mode there.

`trajectoryFromDoc(doc)` defaults to this. Two other modes stay available:

| `opts` | segmentation | use |
|---|---|---|
| `{segment:'sections'}` *(default)* | the reading's own sections | book/whole-piece scoring |
| `{perSentences:N}` | a fixed *N*-sentence window | the running paragraph-at-a-time critic (short drafts have few sections, so a window gives it more points) |
| `{segment:'equal',steps:N}` or a number | *N* equal slices | legacy comparability |

## The three layers

**1 — Extraction (`tools/flow/eo_trajectory.mjs`).** Parses each book through
`parseText`, segments it (default: natural sections), and emits one 102-dim vector
per section — `[0:9]` local operator distribution, `[9:90]` local bigram
transitions, `[90:102]` *cumulative* graph features — plus each section's fractional
reading position `pos`, dominant-operator label, and length. `--resume` skips
already-extracted ids and appends, so a large pass is interruptible for free.

**2 — Distillation (`tools/flow/flow_distill.py`).** Sections are variable-count per
book, so the per-position statistics resample each book onto a canonical position
grid (`--grid`, default 24) by `pos`, while the manifold and the delta distribution
pool the sections directly (order-free). The prior:

- **manifold** — PCA mean + top components + explained variance + residual quantiles.
- **buildArc** — per-grid-position mean/sd of each cumulative graph feature.
- **delta** — per-grid-position mean/sd + global quantiles of *section-to-section* change.
- **sections** — section-length quantiles, sections-per-book, and the dominant-op mix
  + transition matrix (the INS↔SEG alternation, measured).
- **books** — book-level flow-score quantiles.

Provenance-stamped: corpus size, segmentation, grid, source SHA-256, timestamp.

**3 — The scorer holon (`src/flow/index.js`).** Pure JS, zero imports, browser-safe.
`trajectoryFromDoc(doc)` takes the same `doc` `parseText` returns and returns steps +
`pos`; `scoreTrajectory(prior, steps, pos)` maps each section to the prior's grid by
reading position, so a variable-count trajectory aligns to a fixed prior.

## The shipped prior (provenance & honesty)

`data/flow-prior.json` is a **bootstrap** prior distilled from **36 public-domain
Project Gutenberg books** (natural sections, `--min-sent 300`, grid 24, top-10 PCs).
Median ~150 sections/book; section length median 14 sentences (p10 8, p90 42); the
dominant-op mix is **INS 50% · SEG 38% · DEF 8% · NUL 4%** — the introducing/
segmenting alternation as a corpus statistic. Top-10 PCs capture **86%** of section
variance; the whole model is **15 KB**.

It is deliberately **not** definitive: it encodes *its* corpus (19th–early-20th-c.
narrative). Regenerate for any register (retains no text — only statistics):

```
node tools/flow/eo_trajectory.mjs corpus.jsonl --eoreader . --sample 0 --resume
python3 tools/flow/flow_distill.py trajectories.jsonl --min-sent 300 --grid 24 --out data/flow-prior.json
```

## Wiring into eoreader4.1 (all opt-in, default-off)

| Hook | Call | What it adds |
|---|---|---|
| `src/write/witness.js` | `witness(text, expect, source, fold, { flow: { prior, prevStep, doc } })` | Per-beat flow verdict on `w.flow`; a lurch (delta > p90) or off-manifold step (residual > p95) is **surfaced** to EVA, never a hard fail. `ok` unchanged. |
| `src/longgen/shape.js` | `arcPhaseTarget(prior, { remainingFrac })` | The corpus-typical cumulative state at the arc position — the measured *target* for the phase, beside `phaseBias`. |
| `src/longgen/audit.js` | `exportAudit(result, { flow: { prior, doc } })` | Ships the whole-piece flow report (`audit.flow`) beside `diagnose()`. |

Live witness wiring: after `spurt.js` renders a beat and the cumulative draft
re-parses, thread `ctx.witnessOpts.flow = { prior, prevStep, doc, perSentences:N }`
(a sentence window suits the incremental path) and carry `prevStep = w.flow.step`
forward. Browser load: `loadPrior(await (await fetch('data/flow-prior.json')).json())`.

## Validation (36-book prior, this repo)

Scoring the corpus against its own prior ranks *The Prince*, *Grimms' Fairy Tales*,
*Emma*, *Moby Dick* smoothest and *An Occurrence at Owl Creek Bridge* (206
sentences), *Meditations*, and *The Turn of the Screw* most lurching — aphoristic and
argumentative texts genuinely change mode more often; steady narratives don't. Owl
Creek Bridge topping the list is the `--min-sent` caveat in miniature: a short text
has too few sections for its section-to-section deltas to be stable.

## Two things you now own

1. **The prior encodes its corpus.** A Gutenberg-1900s prior scores a modern or
   avant-garde writer as deviant because they *are* deviant relative to it. Distil
   register-specific priors for your actual targets.
2. **The thresholds (p90 / p95) are defaults, not truths.** Tune them once the
   witness is wired and you can feel the flags. The one test only you can run:
   machine flags vs. your editorial eye.

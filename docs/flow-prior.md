# The flow prior — corpus → 18 KB → per-beat witness

A book is a **path** through shape-space, not a point. This is the loop that
learns how competent long-form prose *moves*, compresses that into a small
loadable prior, and hands it to the generation loop as a witness that knows
whether each new paragraph moves the way the corpus moves — and whether the
piece is building on schedule.

```
corpus.jsonl ─▶ eo_trajectory.mjs ─▶ trajectories.jsonl ─▶ flow_distill.py ─▶ flow-prior.json
                (parse each book,        (one 102-dim           (PCA + per-position         (17 KB,
                 40 steps, per-step        vector per step)       arc & delta stats)          provenance-stamped)
                 operator + graph vec)
                                                                                    │
                            src/flow/index.js ◀──────────── loads ──────────────────┘
                            (the drop-in holon: scoreTrajectory / flowVerdict / arcTarget)
```

## The three layers

**1 — Extraction (`tools/flow/eo_trajectory.mjs`).** For each book: parse the full
text through eoreader's `parseText`, split the sentence stream into `--steps`
equal segments, and emit one vector per segment — `[0:9]` local operator
distribution, `[9:90]` local bigram transitions, `[90:102]` *cumulative* graph
features (entities, relations, coref, spans accumulated so far). The trajectory is
those vectors in reading order; deltas between consecutive steps are where flow
lives, the cumulative block is the build arc. `--resume` skips already-extracted
ids and appends, so a large pass is interruptible for free.

**2 — Distillation (`tools/flow/flow_distill.py`).** Compresses the corpus's flow
structure into `flow-prior.json`:

- **manifold** — PCA mean + top-K components + explained variance + residual
  quantiles. *Is a new step on the corpus manifold or off it?*
- **buildArc** — per-step mean/sd of each cumulative graph feature. *Is structure
  accumulating on the corpus schedule?*
- **delta** — per-position mean/sd + global quantiles of step-to-step change. *Is
  this transition a move the corpus makes, or a lurch?*
- **books** — book-level flow-score quantiles (for a whole-document percentile).

Provenance-stamped: corpus size, step config, source SHA-256, timestamp.

**3 — The scorer holon (`src/flow/index.js`).** Pure JS, zero imports,
browser-safe. `trajectoryFromDoc(doc)` takes the same `doc` `parseText` returns, so
inside eoreader there is no re-parsing. Whole-document scoring
(`scoreTrajectory`) and a running paragraph-at-a-time verdict (`flowVerdict`) share
one step-construction core, byte-identical to the extractor.

## The shipped prior (provenance & honesty)

`data/flow-prior.json` is a **bootstrap** prior distilled from **36 public-domain
Project Gutenberg books** (novels, plays, and nonfiction across authors and eras),
`--min-sent 300`, top-10 PCs. It reproduces the thesis empirically: the top-10 PCs
capture **91 %** of step variance and the whole learned model fits in **17 KB** —
smaller than a favicon.

It is deliberately **not** a definitive prior. It encodes *its* corpus:
19th–early-20th-century published narrative. That is the register to be honest
about — see the caveats below — and the reason to distill your own.

Regenerate (from the repo root):

```
node tools/flow/eo_trajectory.mjs corpus.jsonl --eoreader . --sample 0 --resume
python3 tools/flow/flow_distill.py trajectories.jsonl --min-sent 300 --out data/flow-prior.json
```

`corpus.jsonl` is one JSON object per line with `{ id, title, text }`. Point it at
any register: a few hundred pieces you respect → a prior in an afternoon. Because
the pipeline retains **no text** — only operator distributions and transition
statistics — the prior contains the *shape* of how words were arranged, not the
words. For distilling structural features and discarding the source, CC and
public-domain corpora (ProPublica, CRS reports, Wikipedia Featured Articles, The
Conversation, Standard Ebooks) are all clean inputs; swap the corpus, rerun the two
commands.

## Wiring into eoreader4.1 (all opt-in, default-off)

Each hook is additive and no-op without a prior — with none wired, behavior is
byte-identical to before.

| Hook | Call | What it adds |
|---|---|---|
| `src/write/witness.js` | `witness(text, expect, source, fold, { flow: { prior, prevStep, doc } })` | Per-beat flow verdict on `w.flow`. Delta > p90 or residual > p95 is **surfaced** (to EVA), like a source finding — never a hard fail. `ok` is unchanged by flow. |
| `src/longgen/shape.js` | `arcPhaseTarget(prior, { remainingFrac })` | The corpus-typical cumulative state at this arc position — the measured *target* for the phase (condition the artifact), beside `phaseBias` (condition the behavior). |
| `src/longgen/audit.js` | `exportAudit(result, { flow: { prior, doc } })` | Ships the whole-piece flow report (`audit.flow`) beside `diagnose()`. |

To wire the witness live: after `spurt.js` renders a beat and the cumulative draft
re-parses, thread `ctx.witnessOpts.flow = { prior, prevStep, doc }` and carry
`prevStep = w.flow.step` to the next beat. The prior loads in the browser with
`loadPrior(await (await fetch('data/flow-prior.json')).json())`.

## Validation (36-book prior, this repo)

Scoring the corpus against its own prior (`tools/flow/flow_scorer.mjs
--trajectories`):

- **Smoothest:** *Anne of Green Gables*, *Huck Finn*, *Tom Sawyer*, *Dubliners*,
  *War and Peace*, *Moby Dick* — long, steady-building narratives.
- **Most lurching:** *An Occurrence at Owl Creek Bridge* (206 sentences), *The Turn
  of the Screw*, *Heart of Darkness*, *The Time Machine*, *Jekyll and Hyde*.

*Owl Creek Bridge* topping the lurching list is the `--min-sent` caveat in
miniature: a short text sliced into 40 segments has artifactually large
step-to-step deltas. That is why the distiller excludes short texts from the prior,
and why rhetorical/short registers need their own prior rather than being scored
against narrative.

**Discrimination control.** Sentence-shuffling a coherent book (destroying its
arc) moves the axes exactly as designed: manifold residual rises (0.21 → 0.28) and
build-arc adherence worsens (0.56 → 0.77) — the structure axes catch the destroyed
arc — while step-delta *drops*, because random shuffling homogenizes local texture.
The lesson to carry: **delta measures texture variation; residual and arc measure
structure.** Read all three, not delta alone.

## Two things you now own

1. **The prior encodes its corpus.** A Gutenberg-1900s prior scores a modern or
   avant-garde writer as deviant because they *are* deviant relative to it. Distill
   register-specific priors for your actual targets.
2. **The thresholds (p90 / p95) are defensible defaults, not truths.** Tune them
   against your own tolerance once the witness is wired and you can feel the flags.
   The one test only you can run: machine flags vs. your editorial eye.

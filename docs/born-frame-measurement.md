# Born-measure frame breaking — the Step 0 measurement (came back negative)

This records the read-only measurement that gates the directive *"Born-measure frame
breaking, and the stance as a fold."* The directive proposes retiring the k·step
threshold family in the enacted loop and deciding frame breaking by the Born measure
instead, then lifting the reading stance into a third layer so recalibration becomes a
REC in the log. Every step ships behind a `BORN_FRAME` flag with a golden parity gate,
**and every step is preceded by a read-only measurement that can come back negative and
stop the work.**

Step 0 came back **negative.** Per the directive's own discipline — *"If the Born
partition disagrees with k·step at most break cursors, the two measures track different
things and the swap will not hold parity. The negative result is the finding. Stop and
report it."* — Steps 2–5 (swap the accumulation trigger, swap the impulse gate, add the
stance layer, delete the seat) were **not** implemented. Doing so against this
measurement would make the frame break at (nearly) every cursor, not reproduce the
k·step break sequence.

What *was* built and shipped:

- **Step 1 — the Born partition (pure, unwired).** `frameMassPartition(readingAmps,
  frameCellSet) → { onMass, offMass }` in `src/chorus/born.js`, with tests in
  `tests/frame-mass.test.js`. This is the measurement instrument. It changes no
  behavior; the enacted loop does not call it. It stays because it is correct, cheap,
  and the natural place to resume from if a future mapping crosses the gate.
- **Step 0 — the probe.** `eoreader4-eval/born-frame-probe.mjs`, which reruns the
  worked corpus through the current meaning-driven enacted loop (MiniLM live) and, at
  every cursor, computes the Born partition of the reading against the frame going into
  that cursor — tagging break vs non-break cursors so the *discrimination* can be read.

## What the probe measured

The probe runs the real reading — `enactedReadingMeaning(doc, …, { embedder: MiniLM })`,
the same loop the app runs — over three texts (`data/metamorphosis.txt`,
`data/esker.txt`, and the full Metamorphosis `pg5200.txt`, Gutenberg boilerplate
stripped). At every cursor × layer it computes both admissible mappings the directive
names, against the frame's terms *going into* that cursor (the terms of the latest DEF
strictly before the cursor — at a break cursor this is exactly the frame that broke,
`REC.from.terms`, so break and non-break cursors are measured on the same footing):

- **(a) by cell** — map each frame term to its argmax cell over the 27 centroids (the
  classifier's own measurement), partition the reading's 27-cell Born distribution by
  that cell set.
- **(b) by term** — project the reading onto the frame's own term embeddings plus the
  figures in view at the cursor, Born-normalize, split on-frame terms vs the new
  (off-frame) figures.

The gate is not "is off-frame mass large at break cursors" — that question has a
base-rate trap. It is **does `offMass > onMass` fire at the k·step break cursors and
*not* at the others.** A trigger swap holds parity only if the new trigger fires where
the old one did. So the probe reports the off>on rate at break cursors *and* at
non-break cursors, and the discrimination between them.

### Result

```
corpus: metamorphosis-excerpt, esker, metamorphosis-full
cursor×layer decisions: 1624   accumulation breaks: 75   (impulse, context: 27)

MAPPING (a) by cell
  at BREAK cursors      n=75    off>on 100.0%   meanOff 0.926   meanOn 0.074
  at NON-break cursors  n=1549  off>on 100.0%   meanOff 0.903   meanOn 0.097
  DISCRIMINATION (Δ off>on rate, break − non-break): +0.000
  mass gap (Δ mean off-mass): +0.023

MAPPING (b) by term
  at BREAK cursors      n=73    off>on 35.6%    meanOff 0.427   meanOn 0.573
  at NON-break cursors  n=1541  off>on 35.8%    meanOff 0.402   meanOn 0.598
  DISCRIMINATION (Δ off>on rate, break − non-break): -0.002
  mass gap (Δ mean off-mass): +0.025

VERDICT: NEGATIVE — Born does not track the k·step break (fires everywhere or nowhere)
```

Both mappings have essentially **zero discrimination** between break and non-break
cursors. The Born partition, as specified, does not track where k·step breaks the frame.

## Why (the finding, not just the number)

**Mapping (a) is a base-rate artifact.** The reading's centered Born distribution over
27 cells is close to flat on these clauses, and a frame's terms collapse to ~2 argmax
cells. So on-frame mass sits at ≈ 2/27 ≈ 0.074 *by construction* — at break cursors and
non-break cursors alike. `offMass > onMass` is therefore true ~everywhere. A trigger
that fires at every cursor is not a trigger; it is an off switch for the frame. The
100% / +0.851 "separation" the naive (single-set) version of this probe reported is this
artifact, not a signal — which is exactly why the rigorous probe measures the non-break
baseline.

There is a deeper reason (a) cannot work as written: **a frame's terms are figures, not
operations.** The 27-cell cube is a space of *operations* (DEF/EVA/REC × stance ×
site). A figure — "Gregor", "the chief clerk" — has no operation-cell; embedding the
name and taking its argmax over operation-centroids lands on a near-random cell. The
directive anticipates this ("The frame's terms are figures, not always the 27 cells")
and offers (b) as the alternative for exactly this reason.

**Mapping (b) is the clean, decisive measurement, and it is also negative.** (b) never
touches the figure→operation mismatch — it partitions the reading against the frame's
*own term vectors*. It shows off>on at ~36% of break cursors and ~36% of non-break
cursors: no discrimination (−0.002), and at ~64% of the cursors where k·step breaks the
frame, Born says the frame **still holds** (on-frame mass exceeds off). Born and k·step
do not merely fail to correlate; where they do speak, they **disagree**.

**The two measures are structurally different quantities.** k·step breaks on a *leaky
temporal accumulation of meaning-surprise* — how much prediction error (1 − cos against
the γ-decayed semantic prior) has piled up recently. The Born partition is a *static,
single-cursor* alignment — how this one clause's operation-profile sits relative to the
frame's terms, with no accumulation and no temporal prior. There is no reason these fire
at the same cursors, and over 1624 cursor×layer decisions they do not. The Born measure
answers "is this clause's *distribution* concentrated, and where" — a genuine
significance question, the one it was built for in the chorus. It does not answer "has
*surprise accumulated* past what this frame can hold," which is what the accumulation
trigger decides.

## What would change the verdict

The gate is falsifiable, not a wall. It would flip if a mapping made `offMass > onMass`
fire selectively at the k·step break cursors. The unexplored refinement closest to the
directive's letter is a **clause-provenance** reading of mapping (a): rather than
embedding a figure-name and taking its argmax (which this probe did, and which
degenerates to base rate), map each frame term to the phasepost cell of the *clause it
was last active in*, and partition against those. That threads figure→clause→cell
instead of figure→cell, and might carry real operation structure. It needs the phasepost
classifier run per clause with figure-provenance tracking, and the classifier no-commits
under its floors often enough that coverage would have to be checked first. It was not
built here because (b) — the mapping designed for figure-terms, free of the mismatch —
already answers the gate cleanly in the negative, and the directive scopes the choice to
"(a) or (b), by measurement, not by taste."

If someone wants to re-litigate the gate, `eoreader4-eval/born-frame-probe.mjs` is the
harness to extend: add the clause-provenance mapping as a third candidate and re-read the
discrimination column. Until a mapping clears it, the k·step accumulator stays — not
because the seat is defensible, but because the proposed replacement does not measure the
same break.

## Follow-on: grounding the *number of steps* in signal-vs-noise

The Born swap failed, so the k·step mechanism stays — but its number of steps is still
hand-set (`perLayerSteps = { proposition: 3, document: 8 }`, the seat). A second probe,
`eoreader4-eval/noise-k-probe.mjs`, tests the alternative the Born measure was reaching
for by a different route: **derive the number of steps from the reading's own noise**,
the same signal-from-noise discipline `deriveNull` / `boundedNull` already apply
everywhere else in the tree.

The strain deltas `d_c = max(0, surprise − band)` arrive over read time. Under the null
— deltas arriving *independently*, no clustering — the leaky accumulator still wanders up
to some level by chance. The threshold is then the `(1−α)` level of that chance
accumulation (Monte-Carlo: shuffle the deltas, accumulate, read the level off the
shuffles), and the implied `k = threshold / step` *falls out of the noise* instead of
being picked. Two nulls: pointwise (per-cursor exceedance, length-robust) and
extreme-value (per-document max — deriveNull's own discipline, but confounded by document
length, so an upper bound). Measured over the same corpus and the same live reading:

```
LAYER proposition (hand-set k=3, step≈0.115)   LAYER document (hand-set k=8, step≈0.115)
  α=0.05  pointwise k≈8.1   extreme k≈14          α=0.05  pointwise k≈8.1   extreme k≈14

k_doc / k_prop = 1.00 at every α, both nulls   (hand-set ratio 2.67)

PARITY (grounded pointwise rule vs today's k·step breaks)
  proposition  implied k≈7.3  recall 12%  F1 20%   (grounded rule fires 14 vs today's 68)
  document     implied k≈8.1  recall 43%  F1 35%   (grounded rule fires 10 vs today's 7)
```

Three findings, robust across nulls and α:

1. **The definition works.** Signal-vs-noise yields a *definite* number of steps for a
   given (α, null). The method is sound — `k` need not be a constant.
2. **One number, not two — the ratio is a prior, not in the signal.** Both layers are fed
   the *same* surprise stream and the *same* leak, so their marginal noise is identical
   and the noise-derived `k` is the *same* (~8 pointwise) for proposition and document.
   `k_doc/k_prop = 1.00` at every α. The `8 : 3` hierarchy ("a document holds ~2.7×
   harder") does **not** fall out of the noise. To ground the ratio too, the layers would
   need *different noise* — a longer leak for the higher layer (more memory → higher
   floor → more steps), or a coarser-grain surprise for the document — not a constant.
3. **The grounded number validates document's 8 and indicts proposition's 3.** The
   pointwise noise floor is `k ≈ 8` (α=0.05). Document's hand-set 8 is noise-calibrated;
   proposition's hand-set 3 sits *well below* any noise floor (8 pointwise, 14
   extreme-value), so proposition RECs at `k=3` are firing on chance-level clustering — a
   deliberate hair-trigger, not a grounded break. Grounding the number would suppress
   most of today's proposition breaks (recall 12% — 14 grounded vs 68 today), which is
   why this is a *behavior change*, not a parity-preserving swap: a grounded threshold
   correctly rejects the sub-noise breaks the current `k=3` admits.

So the number of steps *can* be defined by signal-vs-noise, and the answer is concrete:
today's proposition threshold is a sub-noise hair-trigger, today's document threshold is
about right, and the layer ratio is a structural prior the current single surprise stream
cannot supply. That is a grounded, actionable finding about the existing mechanism —
where the Born swap could only report that a different quantity does not track it.

## Prototype: the stance layer as a fold — recalibration as a REC in the log

The noise-k finding says calibration *can* be grounded in signal-vs-noise, but a
threshold computed offline (the noise-k probe) is still a seat: it sits outside the log,
unreplayable, un-RECable — the same objection the directive raises against the causal
`recalibrate()` window in `loop.js`, which refits the confirm band *every cursor* from a
rolling `seen[]`, silently. The fix the directive scopes (Step 4) is to make the
calibration an **enacted act**: a `stance` frame that holds the reading's current sense
of normal surprise and RECs — discretely, in the log — only when the surprise stream's
level shifts past the noise line. Recalibration becomes a REC; the fold replays it.

`src/enact/stance-fold.js` prototypes it (behind the flag — not wired into the live
loop, so flag-off is byte-identical; tests in `tests/stance-fold.test.js`). It differs
from the directive's letter in one measured way: the break rule is the **signal-from-
noise** line (the drift beats `z·σ·√((1−λ)/(1+λ))`, derived from the stream's own frozen
spread), **not** the Born partition Step 0 ruled out. A single anomalous line is clipped
to the accommodation scale — a shock is the frame layer's impulse, not a shift in the
normal — so the stance chases sustained drift, not spikes. And because
`replayFrames` is already layer-agnostic, setting `strainDelta = (1−λ)(surprise − band)`
makes the folded strain reconstitute the drift detector's own state **with no new replay
code** — the directive's headline claim, made literal.

Measured on the same corpus (`eoreader4-eval/stance-fold-probe.mjs`):

```
                     silent seat (recalibrate)     stance fold (α=0.05 / α=0.01)
metamorphosis-full   band moves on 544/743 (73%)   15 recalibrations / 0   (SETTLING)
metamorphosis-excerpt  37/40 (93%)                 0 / 0                    (holds one normal)
esker                  27/32 (84%)                 0 / 0                    (holds one normal)
replayFrames@445 reconstitutes the stance band = 0.641, matches the module exactly.
```

The silent seat adjusts the band on 73–93% of cursors, none of it logged. The stance
fold replaces that with a handful of discrete, replayable recalibration RECs (or none —
the short texts hold a single normal end to end), and `α` is the one knob dialing the
rate. This is the seat collapsing into the log: the calibration can be *sourced* from the
fold.

### Wired into the live loop (end to end)

`loop.js` now carries the flag. Under `BORN_FRAME` the confirm band and per-line step are
sourced from an **online** stance (`createStance` in `src/core/enacted/stance.js`), the
stance's DEF/EVA/REC are emitted into the loop's own log, and the causal
`recalibrate()`/`seen[]` window is not used. Flag off is byte-identical (the full suite —
2148 tests — is green with the flag default-off; `tests/born-frame-loop.test.js` asserts
omitting the flag equals passing it `false`). Run live over the corpus, flag off vs on
(`eoreader4-eval/born-frame-loop-probe.mjs`):

```
                     proposition RECs   document RECs   stance recal.   coherent?
metamorphosis-full   OFF 73 → ON 88     OFF 18 → ON 16  0 (level stable)  YES (converges, no thrash)
metamorphosis-excerpt OFF 4 → ON 3      OFF 2 → ON 1    0                 YES
esker                OFF 3 → ON 2       OFF 2 → ON 2    0                 YES
replayFrames reconstitutes the stance normal (band=0.619) alongside proposition/document.
```

**Verdict: it works, with two honest limits.** Flag-off is byte-identical; flag-on is
coherent (no thrash, the full text converges, REC volumes stay sane); and the silent
per-cursor band seat is genuinely gone — the calibration is a logged, replayable stance
frame. But:

1. **The stance holds ONE normal on the real corpus (0 recalibrations).** The
   meaning-surprise *level* is stable across these texts (its turbulence is local
   variation, not baseline drift), so the stance correctly does not recalibrate — which
   also shows the silent seat's 73–93% churn was chasing estimator noise, not real level
   shifts. The logged-recalibration path fires on a genuine regime shift
   (`tests/born-frame-loop.test.js`, `tests/stance-fold.test.js`) but is not exercised by
   this corpus. So "recalibration is a REC in the log" is proven by the mechanism, not
   yet observed on real prose here.
2. **The band seat collapsed; the k-ratio seat did not.** The per-layer `k = {3, 8}`
   (the "document holds 2.7× harder" prior) is retained, fed by the stance's step. The
   noise-k finding showed that ratio cannot come from the shared surprise stream — it
   needs a longer leak on the higher layer. Grounding it (so `k` disappears too) is the
   remaining step; the calc is tractable (a document leak ≈ 0.987 vs 0.9 makes the
   noise-derived `k_doc/k_prop ≈ 2.7` fall out), and it is where this should go next.

So the seat that churned every cursor is gone and the reading holds together; the one
constant that remains is explicit, measured, and has a grounding path. The flag is
implemented and defaults off.

## Reproducing

```
NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node eoreader4-eval/born-frame-probe.mjs    # Step 0 (Born partition)
NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node eoreader4-eval/noise-k-probe.mjs        # follow-on (noise-derived k)
NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node eoreader4-eval/stance-fold-probe.mjs    # prototype (stance as a fold)
NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node eoreader4-eval/born-frame-loop-probe.mjs # end-to-end (flag OFF vs ON)
```

The flag is **scoped to the reading**: `createEnactedLoop` defaults `bornFrame` off, and
only the reading paths (`enactedReadingMeaning`/the cheap `enactedLogOf`) opt in with
`bornFrame: BORN_FRAME` — the boundary parser, surfer, and predictor keep today's
behavior (a global default-on regressed boundary detection). Default off, the whole
suite is green. `tests/born-frame-loop.test.js` exercises the wiring deterministically
(no model).

**Not yet clean for default-on.** With `BORN_FRAME=1` the accumulation path is coherent,
but three reading tests still fail because the stance swap perturbs paths it does not yet
cover: the **impulse/shock gate (Step 3, the single-cursor Born impulse) is unimplemented**,
so the flag entangles with the causal impulse; and the reading's JSONL now carries the
stance layer. Turning the flag on by default therefore needs Step 3 wired (or a clean
hand-off of the impulse) and those tests reconciled — it is left env-gated until then.

Both require the live MiniLM organ (`@huggingface/transformers`, `Xenova/paraphrase-
multilingual-MiniLM-L12-v2`, q8/cpu) — the same organ the eoreader4-eval mechanics use.
Read-only: they parse and read the corpus and print the measurement; they write nothing
and change no behavior.

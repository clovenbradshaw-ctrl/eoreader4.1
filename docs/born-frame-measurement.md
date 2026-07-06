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

## Reproducing

```
NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node eoreader4-eval/born-frame-probe.mjs
```

Requires the live MiniLM organ (`@huggingface/transformers`, `Xenova/paraphrase-
multilingual-MiniLM-L12-v2`, q8/cpu) — the same organ the eoreader4-eval mechanics use.
Read-only: it parses and reads the corpus and prints the partition; it writes nothing
and changes no behavior.

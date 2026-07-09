# Move the fold on surprise, not similarity — the Step 0 measurement (came back POSITIVE)

This records the read-only measurement that gates the directive *"Move the Fold on
Surprise, Not Similarity."* The directive's claim: the reading walk advances by
**groundable surprise** (`_leads`: `novelty = 1/(1+had)`, `weight = count·novelty`,
boosted when the term resolved as an entity — curiosity steers, competency leashes),
but the writing walk advances by **similarity** — `refold` builds its cue as the prior
paragraph's tail plus the question and hands it to `groundNotes`, which ranks spans by
proposition corroboration then keyword overlap. Both are similarity measures; novelty
enters only as the downstream `seen` exclusion. So the ranking pulls toward the
most-similar unseen span — the second-most-redundant move — with an exclusion filter
bolted over the wrong instrument.

Per the directive's own discipline — *"Do not rewire `refold` yet. Run the version that
can come back negative."* — the measurement ran first. It came back **positive**, so the
rewire is justified; it has **not** been built yet (this commit is the probe and the
finding only).

## What the probe measures

`eoreader4-eval/fold-advance-probe.mjs`. Read-only; no behavior change; `refold` is not
touched. Over the worked corpus (full Metamorphosis, esker), each with a broad question
(the shape a longform ask hands the walk), it builds a fold — the top-24 sentences by
relevance — and simulates the walk's **anchor selection** across 5 beats under two
rankings, both starting from the same top-relevance span:

- **SIMILARITY (today's `refold`)** — cue = prior anchor text + question; pick the unseen
  span with the highest cosine to that cue. This is what `groundNotes` returns: the span
  most *like* the cue.
- **GROUNDABLE SURPRISE** — prediction error against the **running document** (the mean of
  the spans chosen so far): `error_i = 1 − cos(span_i, doc)`. Born-scored (`bornWeights`:
  amplitude², self-normalizing, no hand-set threshold — the same rule significance uses),
  then **leashed** to spans still on the question's topic (question-cosine ≥ 0.5 × the
  fold's max), so surprise cannot select a non-sequitur. Surprise steers, groundability
  leashes — the reading walk's two-term shape, ported across the seam.

It works at **selection grain**, model-free (MiniLM only): the question is which spans the
fold-advance reaches, and generating prose would only layer the talker's noise over the
selection being tested.

### The gate (the directive's falsifier)

Predictive fold-advance is justified only if, relative to similarity: (a) the two rankings
pick **different** spans often enough to matter (agreement < 80%), **and** (b) surprise
**lowers** inter-paragraph redundancy (cited-slice overlap and consecutive-pick cosine) and
raises coverage spread. If they agree, or surprise does not lower redundancy, predictive
processing adds nothing and the rewire is not justified.

## Result

```
corpus: metamorphosis-full, esker   beats: 5   fold: top-24   (refold NOT rewired)

                        sliceOverlap%   trigram%   adjCos%   spread%   picks
  metamorphosis-full  SIM   30.0        0.0        65.5      39.4      [292,54,265,492,511]
                      SUR    5.0        0.0        38.9      56.4      [292,342,526,240,353]
  esker               SIM   35.0        1.8        48.3      65.5      [0,27,8,4,12]
                      SUR    5.0        0.0        27.9      72.5      [0,4,8,27,13]

AGGREGATE Δ (surprise − similarity)
  slice-overlap Δ −27.5   trigram Δ −0.9   adjCos Δ −23.6   spread Δ +12.0
  ranking agreement: 12.5%  (1/8 beat transitions pick the SAME span)

VERDICT: POSITIVE
```

Three findings:

1. **The rankings genuinely differ.** 12.5% agreement — only one of eight beat transitions
   picks the same next span. Similarity and groundable-surprise are not the same instrument
   wearing two names; they select different fold regions. (Both agree on beat 1 by
   construction — same seed — so the real disagreement is even higher.)

2. **Surprise lowers redundancy, substantially.** Cited-slice overlap between consecutive
   paragraphs falls from 30–35% to **5%** (Δ −27.5), and consecutive-pick semantic cosine
   falls Δ −23.6. Similarity selection re-serves neighbouring, overlapping slices; surprise
   selection does not. Trigram overlap was already near zero under both (these folds share
   little surface n-gram), so the redundancy the walk actually produces is *semantic*, which
   is exactly what the surprise measure reduces.

3. **Surprise covers more distinct ground.** Coverage spread (1 − mean pairwise cosine across
   the chosen anchors) rises Δ +12.0. This is the walk's own stated goal — *"five paragraphs
   cover five regions"* — restated as a measurement and met by the surprise ranking, not the
   similarity one.

The picks make the mechanism legible. On Metamorphosis, similarity chases a local
neighbourhood (292 → 54 → 265 …), each step landing near the last; surprise jumps to the
span the running document least predicts next (292 → 342 → 526 → 240 → 353), spreading across
the fold. This is the directive's expected signal, confirmed: *surprise selection lowers
overlap and covers more distinct regions of the fold.*

## What the positive verdict licenses (not yet built)

The gate is cleared, so the rewire is justified. Per the house discipline (the born-frame
precedent), it should ship behind a flag with **flag-off byte-identical** to today's
similarity `refold`, in the directive's stated order of least-to-most change:

1. **Score `refold`'s candidates by prediction error, not similarity.** Take the spans
   `groundNotes` already returns and re-rank them by Born-scored surprise against the running
   document. Smallest change; flips the ranking from redundancy-seeking to information-seeking.
   Needs the meaning embedder warm; a cold embedder falls back to similarity (honest degrade).
2. **Leash by groundability.** Among high-surprise spans keep the ones `bindAndVeto` can cite;
   drop the leaps the fold cannot settle. The competency term — stops surprise selecting a
   non-sequitur. (The probe's topic-leash is the read-only stand-in for this.)
3. **Let the carry's open threads set the top-level prediction.** `carry.js` `threadsDue` and
   the unpaid ledger name the most overdue commitment; select the beat that pays the most
   overdue groundable thread. Free-energy minimization at the discourse level — and it is edge
   grain, because an open thread is a commitment between two referents.

Each step wants its own golden-parity gate and, ideally, a live-walk redundancy re-read (this
probe, run on the real generated paragraphs rather than selection-only) to confirm the
selection-grain win survives contact with the talker.

## Step 1 — built behind a flag; the live re-read says NOT YET default-on

Step 1 of the rewire is implemented: `_surpriseRerank` in `src/reader/app.dc.js` re-orders
the refold's candidate spans by Born-scored prediction error against the running document,
and the walk's `refold` calls it when `this._foldSurprise` is set. The flag defaults **OFF**
and flag-off is byte-identical to the similarity refold (same top-6 similar spans, same
order); a cold meaning embedder or any fault degrades to similarity. Toggle with
`localStorage 'eo_fold_surprise'='1'`. The candidates are already leashed by groundability —
`groundNotes` only returns on-topic, citable spans — so this supplies just the surprise term.

Before defaulting it on, the finding above asked for a **live-walk re-read**: does the
selection-grain win survive the talker? `eoreader4-eval/fold-advance-live-probe.mjs` runs the
real walk engine with a real CPU talker under each ranking over the same fold and measures
redundancy of the **generated paragraphs** (consecutive-paragraph cosine + trigram), paired
and averaged over runs to cancel the talker's sampling noise.

```
source: metamorphosis-full   beats: 4   talker: SmolLM2-360M base   6 paired runs
  mean Δ consec-cosine  (surprise − similarity)  +6.4   (surprise slightly MORE redundant)
  runs where surprise lowered cosine redundancy:  3/6
  per-run Δcos: [-5, 7, 39, 10, -4, -8]

VERDICT: INCONCLUSIVE / NEGATIVE — keep the flag OFF; re-read on the deployed 3B.
```

The variance is enormous (one +39 outlier; median ≈ 0), and the mean does not favour surprise.
On the 360M base talker the selection-grain win **does not cleanly survive into the output** —
the tiny model's prose is incoherent enough that paragraph-level semantics are dominated by its
register and degeneration, not by which span it was seeded from. So the selection is better
(Step 0, deterministic, decisive) but the writing does not carry the difference *on this talker*.

This is the flag doing its job: the capability is built and measurable, and the live gate held
it back from becoming the default. The remaining step before flipping the default is the same
re-read on the **deployed Llama-3.2-3B**, whose coherent prose tracks its seed spans far more
faithfully — not runnable in this CPU harness. Until then, `_foldSurprise` stays off.

## Reproducing

```
NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node eoreader4-eval/fold-advance-probe.mjs        # Step 0 (selection grain)
LIVE_RUNS=6 COMPLETER_TEMP=0.4 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt \
  node eoreader4-eval/fold-advance-live-probe.mjs                                              # Step 1 gate (live output)
```

Both need the live MiniLM organ (the meaning embedder the surprise/similarity cosines run in);
the live probe also loads the CPU completion talker. Read-only: they measure and print, and
write nothing. The Step 1 code change is `_surpriseRerank` + the `_foldSurprise` flag (default
off, byte-identical), so the shipped behavior is unchanged until the 3B re-read clears the gate.

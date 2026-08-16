# The third triad (Significance) is sparse in text — measured (2026-07-09)

A correction to how the flow prior was read, checked against the corpus. The three
triads are **ground = Existence**, **figure = Structure**, **pattern = Significance
(interpretation/judgment)**. The claim under test: the Significance operators
(DEF/EVA/REC) are the *reader's actions*, sparse where text is ingested and dense where
a reader acts — so a Significance arc **cannot be distilled from a text corpus**, and the
flow prior (built from text) is structurally blind to it.

## Finding 1 — operator density at ingest (16 corpus docs, 15,232 sentences, 26,764 events)

| triad | operators (%) | share |
|---|---|---|
| **Existence** (ground) | INS 39.9 · SIG 1.4 · NUL 0.2 | **41.5%** |
| **Structure** (figure) | SEG 24.2 · CON 22.4 · SYN 1.8 | **48.4%** |
| **Significance** (pattern) | DEF 6.6 · EVA 2.3 · REC 1.2 | **10.1%** |

The prediction holds, with the honest edge: Significance is ~10% of what text emits, and
within it **DEF 6.6%** (text does define itself) but **EVA + REC together 3.5%** — the
*test* and the *reframe*, the operators that turn the interpretive cycle, are nearly
absent in prose. So it is the reader's axis by **density**, not by construction. A
Significance-arc prior distilled from books would fit the judgment cycle to ~3.5% of the
signal — you cannot build it from a text corpus.

(Note: the flow prior is not *fully* blind — `def_dens` is one of its 12 graph features and
rises correctly across the corpus arc, 0.03 → 0.26. It has the term-setting mode (DEF); it
has no EVA/REC — the cycle's moving parts.)

## Finding 2 — the flow features do not separate churn from development

Re-reading the flow-shaping A/B (`docs/flow-shaping-ab-2026-07.md`) through the
Significance lens: the failure mode ("shaping told the model to *conclude* over spent
terrain, so it looped in judgment without descending to INS/CON — restatement") is real,
but the Existence/Structure graph features the prior is built on **do not detect it**:

- `printing_press` shaped churns (maxPair 0.77) with *higher* rel_dens (0.45 vs 0.33)
- `glaciers` is a good piece (maxPair 0) with *low* rel_dens (0.14)
- `honeybees` shaped (maxPair 1.0, pure restatement loop) has *higher* ent_dens than its
  clean twin

Only the prior-independent repetition metric separates churn from development; the flow
features do not. The quality signal lives on an axis the prior cannot read — which is why
shape-steering improved `arcAdh` (the Existence/Structure metric) and left prose quality
untouched. **The A/B was measuring the wrong axis.**

## Consequence

The missing prior is over **readings, not texts** — reason-walk traces, answer traces,
audit/credence logs, where EVA and REC are dense (the reader judging). The conjecture worth
testing next: DEF→EVA→REC as a *cycle*, and a prior over how many times it turns across a
piece and whether it **descends** (returns to INS/CON to rebuild) between turns. A flat
piece runs it zero times or spins without descending (churn); a developing piece turns it
and descends each time. That prior would predict what the shape prior structurally can't —
genuine development vs churn.

First cheap, decisive test before building it: measure EVA/REC density in the existing
reason-walk / answer / audit traces and confirm they are dense enough to distill from — the
direct test of "sparse in text, dense in readings." **Run below — confirmed.**

## Finding 3 — the reading generates the Significance stream; text does not (12 docs)

Drove the reader's enacted judgment loop (`src/core/enacted/loop.js` — it emits DEF at
frame-set, EVA at every cursor, REC at each reframe) over real corpus docs, feeding it a
real per-sentence surprise (operator-distribution change from the parse). Counted the
Significance operators the *reading* generates vs. what the *text* contains at ingest:

| | at text ingest | in a reading |
|---|---|---|
| Significance density | 8.8% of events (~0.14/sentence) | **2.57 ops/sentence (~18×)** |
| EVA (test) | ~0.04/sentence | ~2.0/sentence (per cursor × 2 layers) |
| **REC (reframe / cycle-turn)** | **0 across all 12 docs** | **47–837 per doc** |

The load-bearing number is **REC = 0 at ingest, in every doc**. The reframe — the operator
that turns the interpretive cycle — does not exist in parsed text; it exists only when a
reader runs. You cannot distill a turn/reframe signal from a text corpus because it is not
there. This is the mechanism behind Findings 1–2: the flow prior is built from text, text
has no REC, so the prior has no cycle-turn signal, so it cannot tell development from churn.

**Descent has a metric.** In the readings, **DEF ≈ REC in every doc** (372/370, 334/332,
493/491, 71/69, …): each reframe is paired with a re-definition — the cycle turns *and
descends*, re-setting its terms. So the conjecture is operational:
- `DEF:REC ≈ 1:1` — every reframe re-grounds → **development**
- `REC ≫ DEF` — reframing that never rebuilds → **churn** (the honeybees failure)

A Significance-cycle prior would distill exactly this — a prior over (turns per piece,
DEF:REC descent ratio) — from reading traces, the data the text corpus structurally lacks.
The build is now well-posed: harvest enacted-loop traces over a corpus, distill the
turn-count × descent distribution, and that is the quality instrument the flow prior isn't.

(Honest edges: the EVA/sentence ≈ 2.0 is partly the loop's two-layer construction, not a
deep constant; and the absolute REC count depends on the surprise proxy — a jumpier signal
reframes more. The robust findings are REC=0-in-text vs dense-in-reading, and DEF≈REC descent.)

## Finding 4 — the reading read DETECTS churn where the flow features don't (partial)

The test of "does this improve things": re-read each flow-shaping A/B output through the
enacted loop and correlate a reading-derived signal with the independent churn metric
(maxPair), against the flow features that failed in Finding 2.

| signal | correlation with churn (maxPair, n=16) |
|---|---|
| flow Existence/Structure features (Finding 2) | ~0 — no separation |
| `meanSurprise` (reader's surprise over the piece) | **−0.34** |
| `recPerSent` (reframes / sentence) | **−0.59** |
| `descent` (INS+CON rebuild after each reframe) | 0.06 — **did not validate** |

Pointing the instrument at the *reading* recovers a quality signal where the text-structure
features had none (`recPerSent` −0.59 vs ~0). The mechanism is the churn picture: restatement
is low-surprise to a re-reader, so it reframes less — the honeybees pure-churn case is cleanly
isolated (lowest `meanSurprise` 0.69 and lowest `recPerSent` 0.317 of all 16 outputs).

**Two honest edges.** (1) The clean *descent* formalization (rebuild-after-reframe, the DEF:REC
conjecture operationalized) did NOT track churn (r=0.06) — the working signal is the cruder
"the reader isn't surprised," which is partly circular with surface repetition. So the
cycle-turn-*with-descent* conjecture is not yet validated; the simpler reframe-density carries
the −0.59. (2) It is moderate, not a clean gate — it catches egregious churn but overlaps on
moderate cases (`aqueducts` shaped churns at maxPair 0.62 with a normal `recPerSent` 0.44).

So: the axis is confirmed right (reading-derived beats text-structure for the quality
question), the elegant descent metric is not, and this is still DETECTION — the generation
test is the model-in-the-loop gate: flag a beat whose re-read reframes too little, regenerate
it, and A/B the shipped prose. That is the next experiment and it needs the CPU model back.

## Reproduce

Operator density: parse a corpus sample with `src/perceiver/parse/index.js` and count
`doc.log.events` by `op` (the 9 operators). Churn-vs-features: `arcState` per section over
the A/B outputs vs the `maxPair` repetition metric.

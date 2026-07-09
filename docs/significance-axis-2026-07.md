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
direct test of "sparse in text, dense in readings."

## Reproduce

Operator density: parse a corpus sample with `src/perceiver/parse/index.js` and count
`doc.log.events` by `op` (the 9 operators). Churn-vs-features: `arcState` per section over
the A/B outputs vs the `maxPair` repetition metric.

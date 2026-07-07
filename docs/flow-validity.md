# External validity — does a flow flag track where prose reads badly?

Every other validation in this project is *intrinsic* (the instrument vs. itself:
corpus rankings, split-half agreement, manifold separability). This is the one test
that matters for the stated goal — a witness that flags bad prose — and it uses an
**external** criterion: badness that we impose and therefore know the location of.

## Setup

- **Register-matched prior.** 32 expository Wikipedia articles (science/explanatory),
  born-rule sections, distilled the same way as `data/flow-prior.json`. This removes
  the register-mismatch confound: expository text is scored against an expository
  prior. 8 further articles were **held out** (never seen by the prior).
- **Controlled degradations** of each held-out article, scored against the prior:
  1. **section-shuffle** — reorder its natural sections (destroy the global arc).
  2. **alien-splice** — insert 3 topically-unrelated paragraphs at 25/50/75%.
  3. **sentence-scramble** — shuffle *every* sentence (maximal local-flow destruction).

If the instrument tracks coherence, degraded versions should score worse, and the
per-beat flag should fire *at* the spliced-in alien sections.

## Result — negative, on all three

| test | expectation | result |
|---|---|---|
| section-shuffle worse than good | most of 8 | **3–4 / 8** (chance is 4/8) |
| sentence-scramble worse than good | most of 8 | **3 / 8**; mean flowScore *fell* 0.351 → 0.338 |
| flag fires on alien sections | P(flag\|alien) ≫ P(flag\|native) | **0%** vs **14%** (alien flagged *less*) |
| register-matched prior cuts saturation | big drop | 28% vs 22% (narrative) — **no drop** |

The instrument does not distinguish a coherent expository article from a shuffled or
spliced version of itself, and does not localize inserted foreign material.

## Why — and it is not a bug

The flow vector abstracts text into **discourse-operator structure**: which operators
fire, in what distribution, rhythm, and cumulative build. Shuffling sentences
*preserves the operator set* and even homogenises it — every window drifts toward the
corpus mean — so measured delta and residual go *down*, not up. Alien paragraphs in
the same register have the *same* operator structure as native ones, so no anomaly
registers.

Human-perceived "reads badly" is largely a **semantic / referential** failure — this
sentence doesn't follow from the last, a referent doesn't resolve, the argument
doesn't build. That signal lives in the *content* the operator abstraction discards.
So the instrument is a faithful measure of a real thing that is **orthogonal to the
coherence signal we hoped it tracked.**

## What this means for the system

**Do not wire `flowVerdict` as a quality critic.** On this evidence it will not catch
bad prose; it will fire on register/rhythm difference, not on incoherence. The
`write/witness.js` hook should be read as a **register/shape-conformance** signal
("does this beat move like the target corpus"), never as a "reads badly" veto.

**What the instrument *is* validated for** (evidenced elsewhere in these docs):

- **Register / discourse-shape discrimination** — speeches lurch against a narrative
  prior; the atlas splits a corpus into stable operator-shape regions; expository text
  has a distinct signature (INS 55% vs narrative 48%). This works.
- **Reproducing real structure** — born-rule recovers *Metamorphosis*'s three Parts at
  their NUL births.
- **Conditioning generation toward a measured shape** — `longgen/shape.js` `arcTarget`
  ("build like this exemplar's operator rhythm") is a legitimate, in-scope use, because
  it conditions on structure, and structure is exactly what the instrument measures.

The honest one-line verdict: the segmentation and representation improvements are real
and make the instrument a *better measure of discourse structure* — but discourse
structure is not writing quality, and the controlled test says so plainly.

Reproduce: `node tools/flow/validity_test.mjs --prior <expo-prior.json> --test <held-out.jsonl> --baseline data/flow-prior.json`
(build the expository prior with the standard pipeline over a corpus of the target register).

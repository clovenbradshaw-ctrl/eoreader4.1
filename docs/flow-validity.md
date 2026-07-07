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

## Result — weak, split by axis, and underpowered (N = 8)

Counts are "of 8 held-out documents, how many had the DEGRADED version score worse",
averaged over 6 shuffle seeds (chance = 4/8):

| manipulation | axis | mean / 8 | reading |
|---|---|---|---|
| section-shuffle (destroy global arc) | manifold residual | **5.3** | weak but real — reordering pushes steps off-manifold |
| section-shuffle | delta / flowScore | 4.2 | at chance — the delta axis doesn't see it |
| sentence-scramble (maximal local destruction) | flowScore | **2.3** | *below* chance — scrambling **homogenises** and scores *smoother* |
| sentence-scramble | residual | 2.8 | below chance |
| alien-splice | P(flag\|alien) vs P(flag\|native) | **0% vs 14%** | no localization (also underpowered) |
| — | good-article saturation | 28% vs 22% | register-matched prior did **not** cut the flag rate |

So it is not a clean zero: **destroying section *order* leaves a faint print on the
manifold residual (~5/8).** But the delta / "lurch" axis — the one we headline — is at
chance on reordering and is *actively fooled* by scrambling (homogenised text looks
smoother). And nothing localizes an inserted foreign paragraph. At N = 8 none of these
counts is statistically strong; treat them as directions, not proofs.

## Why — and it is not a bug

The flow vector abstracts text into **discourse-operator structure**: which operators
fire, in what distribution, rhythm, and cumulative build. Human-perceived "reads
badly" is largely a **semantic / referential** failure — this sentence doesn't follow
from the last, a referent doesn't resolve, the argument doesn't build — and that
signal lives in the *content* the operator abstraction discards.

The split in the results falls straight out of this:

- **Local scrambling** *preserves and homogenises* the operator stream — every window
  drifts toward the corpus mean — so the delta axis scores maximally-scrambled text as
  *smoother*, not worse. The instrument is not just blind here; it is fooled.
- **Destroying the global order of whole sections** perturbs the *cumulative* build
  enough to read as off-manifold, so the residual axis catches it ~5/8 of the time —
  a weak, real signal, and the only place coherence leaves a print.
- **Alien paragraphs in the same register** carry the *same* operator structure as
  native ones, so nothing localizes them.

## What this means for the system

**Do not rely on `flowVerdict` as a quality critic.** On this evidence it is, at best,
a weak detector of *gross global-structure* disruption (via residual, ~5/8), and it is
blind to — or fooled by — local incoherence. It will fire on register/rhythm
difference, not on whether the prose makes sense. The `write/witness.js` hook is
honestly a **register/shape-conformance** signal ("does this beat move like the target
corpus"), not a "reads badly" veto.

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
structure is largely not writing quality. The controlled test (underpowered at N = 8)
finds only a faint global-structure print on the residual axis and no reliable
coherence signal, so the improvements helped the instrument, not the original goal.

Reproduce: `node tools/flow/validity_test.mjs --prior <expo-prior.json> --test <held-out.jsonl> --baseline data/flow-prior.json`
(build the expository prior with the standard pipeline over a corpus of the target register).

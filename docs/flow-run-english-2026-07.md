# English corpus → installable flow structures — run report (2026-07-08)

Go/no-go on whether the English corpus supports installable, navigable flow
structures, per the corpus-to-flow spec. Every build step was gated behind a
read-only measurement. **Verdict: go, with one structural split.** Two priors
installed (`mixed-en-pooled`, `reference-en-gov`), one cluster split confirmed
(book-like vs reference), two slices dropped at the collapse gate (both wiki
registers), and an inspectable DAG produced for both surviving clusters.

Each result below is stated at its tier: **measured** (established on this
corpus by this run), **defensible** (synthesis supported by measurement but
under-powered or one-sided), or **projection** (first output of a tool never
run on this corpus, to be inspected, not trusted).

## Input

The working corpus was `corpus.zip` (1.3 GB, Google Drive), which arrived
pre-sliced by `(source, lang, register, era)` — ten English slices of 300
documents each (3,000 English docs), already carrying `{id, title, text}` plus
facets. This is smaller than the ~4,500-doc English subset the spec describes
for `corpus.clean.jsonl`; the run used what was shared. The format adapter
(`tools/flow/corpus_adapt.py`) only normalizes CRLF, strips the Federal
Register HTML wrapper, and makes a deterministic 80/20 distill/held-out split
keyed on each document's content hash. No document appears in both sets.

## Task 1 · Collapse rate under natural-section segmentation — **measured**

`eo_trajectory.mjs --segment sections`, sample-60 first, then the full 300
docs per surviving slice. "<4 sec" is the fraction of extracted documents
whose trajectory has fewer than four sections (the manifold tools' floor;
the distiller's own floor is two). "skipped" = document under 3,000 chars or
80 sentences — never forms a trajectory at all.

Full-slice numbers (300 docs each):

| slice | extracted | skipped | median sections | <4 sec (extracted) | <4 sec incl. skipped |
|---|---|---|---|---|---|
| fiction pre-1900 | 300 | 0 | 157 | 0.7% | 0.7% |
| fiction c20 | 299 | 1 | 161 | 0.7% | 1.0% |
| essays pre-1900 | 297 | 3 | 124 | 1.3% | 2.3% |
| essays c20 | 300 | 0 | 118 | 0.3% | 0.3% |
| nonfiction pre-1900 | 300 | 0 | 95 | 3.3% | 3.3% |
| nonfiction c20 | 300 | 0 | 91 | 4.0% | 4.0% |
| poetry pre-1900 | 299 | 1 | 93 | 9.4% | 9.7% |
| regulatory (gov) | 152 | 148 | 9 | 15.8% | 57.3% |
| wiki encyclopedic (sample-60) | 60 | 9 | 1 | **93.3%** | 94.2% |
| wiki popular (sample-60) | 60 | 29 | 1 | **91.7%** | 94.4% |

Gate (>30% below four sections): **both wiki slices fail** — 75–78% of their
documents collapse to a *single* born-rule section (flat register, no NUL
re-groundings), exactly the failure mode the extractor's own warning
describes. They were dropped from everything downstream and no full run was
spent on them. **Poetry passes** (9.4%) — the spec expected it to fail; it
does not, under the reading's own segmentation. **Regulatory passes among
readable documents** (15.8%) with a real caveat: 148 of 300 gov documents are
too short to read at all, so over the whole slice a majority forms no usable
trajectory. The eight survivors: fiction ×2, essays ×2, nonfiction ×2, poetry,
regulatory.

## Task 2 · Candidate priors — built

2,247 trajectories extracted (distill + held-out separately). Three
candidates distilled with `flow_distill.py` at its defaults (`--min-sent 300`,
`--grid 24`):

| candidate | books distilled | top-10 PCs | dominant-op mix |
|---|---|---|---|
| all-english (pooled, incl. poetry + gov) | 1,626 | 80% | INS 59 / SEG 31 / SIG 7 |
| book (fiction+essays+nonfiction) | 1,376 | 80% | INS 58 / SEG 32 / SIG 7 |
| reference (regulatory) | 36 | 87% | INS 83 / SEG 10 / SIG 7 |

The reference prior distills from only 36 documents because the distiller's
300-sentence floor removes most short gov notices. That floor was left at its
default rather than tuned.

## Task 3 · Controls — **measured**

**Reading probe** (must be positive to install): corrupt the reading — drop
CON relations, fragment coreference — in a known region (0.4–0.6), 12 held-out
docs per prior. All three priors show the documented bootstrap shape: the
residual rise is monotonic in dose and localizes inside the corrupted region.

| prior | inside-Δ at f=0.1→0.8 | peak inside/outside ratio | docs localizing |
|---|---|---|---|
| all-english | 0.007 → 0.161 | 161× | 10–11 / 12 |
| book | 0.017 → 0.174 | 88× | 11 / 12 |
| reference | 0.006 → 0.162 | 64× | 8–10 / 12 |

(Bootstrap reference: clean, monotonic, ~190×.) All three carry
reading-quality signal. **Positive — gate passed.**

**Validity test** (text corruption; bootstrap result was negative and a
negative does not kill a prior): negative here too, in the documented shape.
The flow axis is at or below chance on every manipulation (0–4 of N docs);
nothing localizes an alien splice (P(flag|alien) = 0% on every prior); only
the manifold-residual axis sees gross section reordering (shuffle: 9–11 of
11–12 docs — somewhat stronger than the bootstrap's 5.3/8). Consistent with
the documented conclusion: the flag is a reading instrument, not a
prose-quality instrument.

**Split decision** (own-cluster vs pooled mean residual on held-out
trajectories, ≥4 sections, paired per document):

| held-out set | own prior | pooled prior | Δ (own−pooled) | own wins |
|---|---|---|---|---|
| book (n=375) | 0.4078 | 0.4054 | **+0.0024** (own is *worse*) | 46% |
| regulatory (n=24) | 0.3603 | 0.4271 | **−0.0668** (~16% relative) | **24/24** |

Cross-checks: the reference prior beats the book prior on gov docs (0.360 vs
0.429, 24/24) and the book prior beats the reference prior on book docs
(0.408 vs 0.485, 96.5% of 375). So the two clusters are mutually distinct in
both directions — **but a separate book prior buys nothing over the pooled
prior** (books are 85% of the pooled mass; the pooled prior *is* the book
prior). Decision, per the gate: install **one general English prior (the
pooled one) plus the reference prior**; no standalone book prior. The
book/reference distinction is **measured** on this corpus; treating it as the
full two-cluster hypothesis is **defensible** — the reference side rests on
n=24 held-out documents from a single source (Federal Register), so read the
effect as indicative, not final.

## Task 4 · Installed — **measured facts about the registry**

- `mixed-en-pooled` — 1,626 books, facets `{lang:en, region:global, era:mixed, domain:general, register:mixed}`
- `reference-en-gov` — 36 books, facets `{lang:en, region:us, era:contemporary, domain:government, register:reference}`

Both land in `data/flow-priors/` and `index.json` rebuilt to list four priors
(alongside the two bootstrap installs). Registry-only change; no predictive
path touched.

## Task 5 · DAG — **projection**

`extract_dag.mjs` had not been run on this corpus before. Two extractions,
held-out docs only:

- **reference** (all 63 gov held-out docs): 527 nodes, 524 asserted edges,
  9 confounding candidates, 2 reverse-causation flags, 14 articulated
  mechanisms, 87 construct notes, 15 cross-source disagreements each with a
  Pearl distinguishing question.
- **book** (12 held-out docs): 416 nodes, 268 edges, 14 construct notes, no
  cross-doc structure (expected — novels don't share claims).

Both are inspectable in populated copies of the viewer at
`tools/dag/examples/dag-reference-en-gov.view.html` and
`tools/dag/examples/dag-book-en.view.html` (verified to render headless with
no JS errors; the 12-doc book DAG is a capped sample, stated here so it is
not read as full coverage). These are first projections to inspect, not
finished templates: the discourse-DAG cursor in the CLI output covers one
document per run, and no aggregation of section-to-section moves across
documents exists yet — that aggregation is next-phase work, not this run's.

## Task 6 · Exemplar route — **run (addendum, 2026-07-09)**

The required human selection arrived as eight candidates. Two fail the same
structural floors the corpus was gated on and got no spec: the Peirce
blog exposition (under the 80-sentence read floor) and the Reuters Institute
News Atom piece (2 natural sections — flat, the wiki failure mode). Six form
real arcs and were overlaid onto `mixed-en-pooled`:

| spec (`data/flow-spec-*.json`) | nSent → sections | own-spec arc | vs pooled arc |
|---|---|---|---|
| `bergman-triadic` | 204 → 8 | 0.03 | 1.43 |
| `jazz-omni-american` | 353 → 16 | 0.02 | 0.82 |
| `omeally-ellison` | 244 → 9 | 0.01 | 0.66 |
| `bergson-laughter` | 1,652 → 153 | 0.04 | 0.97 |
| `bergson-time-free-will` | 2,274 → 137 | 0.04 | 0.78 |
| `rovelli-reality` | 3,264 → 137 | 0.04 | 0.29 |

Calibration is clean on all six (own-spec `meanArcAdherence` 0.01–0.04; the
committed viruses example reads 0.06). The "vs pooled" column is how
off-schedule each piece's build reads against the general English corpus —
Bergman's essay is the most distinctive build (1.43), Rovelli's the most
corpus-like (0.29). Specs retain operator statistics plus attribution only,
no text (the O'Meally piece is an interview — its arc is dialogue-shaped;
stated so it is not mistaken for essay build). Which spec drives generation
is an editorial choice, not a measured one — all six load unchanged via
`src/flow/index.js`.

## Reproduction

Corpus slices → `tools/flow/corpus_adapt.py` (adapter + 80/20 split) →
`eo_trajectory.mjs --segment sections` per slice → `flow_distill.py` on
distill sets → `reading_probe.mjs` / `validity_test.mjs` on held-out raw docs
→ `tools/flow/score_compare.mjs` (own vs pooled residual on held-out
trajectories) → `install_prior.mjs` → `extract_dag.mjs --json` +
`tools/dag/dag_view_adapt.py` to populate the viewer. Corpus and
trajectories are not in the repo (1.3 GB); the Drive link is in the task
spec.

## Out of scope, restated

Wiring these priors or the DAG into the essay organ / paragraph loop is the
next phase (needs the self-read weld, the plan-to-proposition resolver, a rev
flag, and golden parity). Nothing in this run touched a predictive path.

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

The required human selection arrived as eight candidates. Two failed the same
structural floors the corpus was gated on and got no spec: the Peirce
blog exposition (under the 80-sentence read floor) and the Reuters Institute
News Atom piece (2 natural sections — flat, the wiki failure mode). Three more
were built and then **dropped on provenance**: the sources are copyrighted with
no reuse license, so no spec derived from them ships here — Rovelli's *Reality
Is Not What It Seems* (book), the "Jazz, the Omni-American Ideal" essay
(Substack), and the O'Meally Ellison interview (magazine). The specs retain no
text — only operator statistics plus an attribution stamp — but the rule for
this repo is public-domain / freely-licensed sources only. That leaves the two
Bergson essays, both Project Gutenberg (public domain):

| spec (`data/flow-spec-*.json`) | nSent → sections | own-spec arc | vs pooled arc | source |
|---|---|---|---|---|
| `bergson-time-free-will` **(selected)** | 2,274 → 137 | 0.04 | 0.78 | Gutenberg (PD) |
| `bergson-laughter` | 1,652 → 153 | 0.04 | 0.97 | Gutenberg (PD) |

`bergson-time-free-will` is the selected driving spec — the target build the
generator aims for (a long, developed philosophical argument); `bergson-laughter`
is the installed alternative and the more distinctive build (0.97 vs 0.78 off the
general English corpus). Calibration is clean on both (own-spec
`meanArcAdherence` 0.04; the committed viruses example reads 0.06). Both load
unchanged via `src/flow/index.js`. Which drives generation is an editorial
choice, not a measured one.

The `data/flow-spec-viruses.json` example predates this run (Wikipedia, CC BY-SA,
attributed, statistics-only) and is referenced by `tests/flow.test.js`; it is
kept as the test fixture, flagged here for the same provenance review.

## Reproduction

Corpus slices → `tools/flow/corpus_adapt.py` (adapter + 80/20 split) →
`eo_trajectory.mjs --segment sections` per slice → `flow_distill.py` on
distill sets → `reading_probe.mjs` / `validity_test.mjs` on held-out raw docs
→ `tools/flow/score_compare.mjs` (own vs pooled residual on held-out
trajectories) → `install_prior.mjs` → `extract_dag.mjs --json` +
`tools/dag/dag_view_adapt.py` to populate the viewer. Corpus and
trajectories are not in the repo (1.3 GB); the Drive link is in the task
spec.

## Wiring the prior into the walk — **done (addendum, 2026-07-09)**

The load-and-thread weld the earlier "out of scope" note deferred is now built,
at the amodal seam (details: `docs/flow-prior.md`, "Wiring into eoreader4.1"):

- **`src/flow/select.js` · `loadInstalledPrior`** — the missing caller. Resolves
  an installed prior by facets (`selectPrior` → fetch → `loadPrior`), null-safe;
  `{lang:'en'}` → `mixed-en-pooled`. `loadPrior` is no longer zero-caller.
- **`src/longgen/walk.js`** — the live essay walk takes a `flow = { prior, parse,
  perSentences }` bundle. `parse` is **injected** (the perceiver's `parseText`), so
  the flow engine reads the build in operator space and never touches text — the
  membrane the omnimodal reframing asks for, honored at the one seam it touches.
  - OBSERVE (live): each accepted paragraph is scored; a per-beat flow record and a
    whole-piece `res.flow` roll-up ride the trace. Changes no tokens.
  - SHAPE (`flowShape`, rev-flag, default-off): the arc-demanded move (`arcGapMove`)
    is fed into the beat prompt as one soft directive.
- **`src/reader/app.dc.js:_walkReply`** — loads the prior once (`_flowBundle`,
  memoized) and turns OBSERVE on live: the reader now surfaces its own build as a
  `flow` audit stage instead of shipping a flat one silently. SHAPE stays off.

Golden parity: with no prior served, or `flow` unset, `walk`/`renderContinuation`
are byte-identical to before — pinned by `tests/flow-walk.test.js` (5 tests: loader
selection, graceful null, observe-changes-no-tokens, prompt parity, shape injection).
Full suite 2,316 pass, 0 fail.

Demonstration (deterministic, no model): running `arcGapMove` over the dolphin
essay's own trajectory shows the split — at 86% and 100% through the piece the text
is still `INS` (introduce) while the arc demands `SYN` (synthesize/close), the top
gap `mention_conc` at +29σ early. The flat "convergent evolution" refrain, read in
operator space, is exactly a build that never stops introducing. OBSERVE surfaces
that; SHAPE would push against it. The live prose before/after needs a browser-model
run (the reader's Llama path) — the engine and the witness are in place for it.

## Out of scope, restated

Turning SHAPE on live (token-steering the reader's essays) and wiring the DAG into
the paragraph loop remain next-phase — SHAPE needs the browser-model before/after to
validate that the soft directive helps rather than just moves tokens, and the DAG
side still needs the plan-to-proposition resolver. The self-read weld is already
built (`weld.js`); the load-and-thread weld is now built too (above).

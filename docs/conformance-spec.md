# eoreader4 Conformance Test Specification

**Status:** Draft v0.1
**Scope:** Validation of the eoreader4 12-stage turn pipeline against established NLP / RAG / grounded-QA evaluation standards.
**Repo:** clovenbradshaw-ctrl/eoreader4

---

## 0. Purpose and reading guide

This is a work-doc, not a conformance certificate. It defines the test corpora, gold-annotation format, metrics, scorer tooling, pass thresholds, and harness layout needed to measure eoreader4 against the standards the field actually uses. Each section is self-contained: a tester should be able to read one section and stand up that test family without the others.

The pipeline under test has twelve stages (`src/turn/pipeline.js`):

```
route → converse → retrieve → fold → answerable → prompt → llm → bind → factcheck → revise → veto → settle
```

Each test family below targets specific stages. The mapping is given per family and consolidated in §7.

---

## 1. Test family A — Coreference resolution

Targets the referent-clustering behavior surfaced after `bind` (mention → referent assignment), upstream of which sit the SIG/INS/EVA tiers of the coref cascade.

### A.1 Standard

The field reports four cluster-comparison metrics, conventionally averaged as **CoNLL F1**:

| Metric | Unit of evaluation | What it rewards | Known weakness |
|---|---|---|---|
| **MUC** (Vilain 1995) | Links between mentions | Correct coreference links | Ignores singletons; favors fewer/larger entities; weakest discriminator |
| **B³** (Bagga & Baldwin 1998) | Individual mentions | Correct per-mention clustering | Mis-handles repeated mentions; edge-case inflation |
| **CEAFₑ** (Luo 2005) | Discourse entities | Cluster-to-cluster alignment (bipartite) | Treats all clusters equally regardless of size; ignores unaligned-response correctness |
| **LEA** (Moosavi & Strube 2016) | Links + entities, importance-weighted | Long-distance / large-entity resolution | Newer; less universally reported |

**CoNLL F1 = mean(MUC F1, B³ F1, CEAFₑ F1).** Report LEA alongside, not inside, the average. The CoNLL-average convention is standard but contested in the literature, so report the four component scores individually, never the average alone.

### A.2 Reference corpus

- **Primary:** OntoNotes 5.0 via the CoNLL-2012 shared-task split (newswire, broadcast, weblog, magazine, telephone). This is the genre mix eoreader4 actually ingests.
- **Long-document stress:** LitBank coref split (book-length chains) to exercise LEA-sensitive long-distance resolution.
- **Domain corpus (eoreader4-specific):** a hand-annotated set of 15–20 articles drawn from the working beat (NDP/OHS/surveillance reporting), to measure on-distribution rather than borrowed-distribution performance. This is the corpus that actually predicts production behavior.

### A.3 Gold-annotation format

CoNLL-2012 column format (mention spans grouped into bracket-numbered clusters). For the domain corpus, annotate the three coref subtypes separately so the cascade tiers can be scored in isolation:

| Subtype | Example | Cascade tier responsible |
|---|---|---|
| Nominal alias | `Trump` / `President Trump` / `Donald Trump` | Deterministic strip + token-subset match |
| Pronominal anaphora | `she` / `he` / `they` → antecedent | Centering slot binder |
| Set / group reference | `Republicans` vs `Republican-led House` vs `House Democrats` | LLM EVA (must NOT fully merge) |

### A.4 Scorer

- **Tool:** the official `corefeval` / the reference scorer used by CoNLL-2012 (computes MUC, B³, CEAFₑ, CoNLL F1; LEA via the Moosavi reference implementation).
- **Inputs:** gold CoNLL file + eoreader4 referent assignments exported in the same column format.
- **Per-subtype scoring:** run the scorer three times, filtered to each subtype, to catch the specific failure mode where the system over-merges set/group references (the documented `Republicans` ≡ `Republican-led House` error).

### A.5 Pass thresholds (initial, to be ratified)

| Metric | Target on OntoNotes | Target on domain corpus |
|---|---|---|
| CoNLL F1 | ≥ 0.75 (within ~13pt of SOTA sieve systems) | ≥ 0.70 |
| Set/group over-merge rate | n/a | ≤ 5% of set references wrongly merged into a person/party entity |
| Nominal alias recall | ≥ 0.90 | ≥ 0.90 |

### A.6 Acceptance criteria

- All four component metrics reported individually, never only CoNLL F1.
- Per-subtype breakdown present.
- Over-merge of set/group references treated as a **hard fail** regardless of aggregate F1 — this is the failure the architecture exists to prevent.

---

## 2. Test family B — Retrieval quality

Targets `retrieve` and the excerpt selection feeding `fold`.

### B.1 Standard

RAGAS retrieval metrics:

- **Context Precision** — fraction of retrieved spans that are relevant to the question (signal vs noise in the retrieved set).
- **Context Recall** — fraction of the information needed to answer that was actually retrieved.
- **Context Entities Recall** — fraction of gold entities present in retrieved context (relevant given eoreader4's entity-centric graph).

These are reference-light: precision is computable reference-free; recall needs a gold answer or gold relevant-span set.

### B.2 Reference corpus

- **Synthetic:** RAGAS synthetic test-set generation over the domain corpus (question + ground-truth + relevant spans, generated then human-verified).
- **Established:** a slice of a public RAG benchmark (e.g. an open-domain QA set with marked supporting passages) for cross-comparability.

### B.3 Scorer

RAGAS library (`ragas`), LLM-judge backend pinned to a fixed model + temperature 0 for reproducibility. Record judge model + version in every run manifest — RAGAS scores are judge-dependent and not comparable across judges.

### B.4 Pass thresholds

| Metric | Target |
|---|---|
| Context Precision | ≥ 0.70 |
| Context Recall | ≥ 0.80 |
| Context Entities Recall | ≥ 0.75 |

### B.5 Acceptance criteria

- Judge model + version recorded.
- Precision and recall reported as a pair (high precision with low recall = silent under-retrieval, a `fold`-starvation risk).

---

## 3. Test family C — Void detection / abstention

Targets `answerable` (the void verdict) and the talker's refusal contract. This is the most architecture-specific family and the one with the strongest external standard for the *refusal* behavior.

### C.1 Standard

Two complementary standards isolate the two error directions:

- **SQuAD 2.0** — contains explicitly unanswerable questions. Measures whether the system abstains when the answer is absent. Reports EM / F1 with a no-answer class.
- **GroUSE** — grounded-QA evaluator benchmark whose failure modes map directly:
  - **FM2** — failure to refrain from answering in adversarial cases → **false-negative void** (confabulation at a gap). Hard fail.
  - **FM4** — wrongly refraining when the answer IS present → **false-positive void** (over-abstention). Soft fail.
  - **FM5** — unrelated additional information included in adversarial cases → `veto` should fire.

### C.2 Reference corpus

- SQuAD 2.0 dev set (unanswerable subset isolated).
- GroUSE test samples (each triple-annotated by humans for expected relevancy/faithfulness).
- **Domain void set (eoreader4-specific):** hand-built `(question, document, expected_verdict ∈ {answerable, void})` triples over the domain corpus, deliberately including questions whose answers are *near* but not *in* the source (the hardest void class).

### C.3 Metrics

| Metric | Definition |
|---|---|
| Void precision | of turns marked void, fraction genuinely unanswerable |
| Void recall | of genuinely unanswerable turns, fraction marked void |
| False-confabulation rate | answerable-marked turns at a true gap that produced an unsupported claim (GroUSE FM2) |
| Over-abstention rate | void-marked turns that were actually answerable (GroUSE FM4) |

### C.4 Pass thresholds

| Metric | Target |
|---|---|
| Void recall | ≥ 0.90 (missing a void is the dangerous direction) |
| Void precision | ≥ 0.75 |
| False-confabulation rate (FM2) | ≤ 2% — **hard fail above** |
| Over-abstention rate (FM4) | ≤ 15% |

### C.5 Acceptance criteria

- FM2 (confabulating at a void) is the single most important number in the whole spec; any run exceeding 2% fails regardless of all other scores.
- Void recall asymmetrically prioritized over precision: it is acceptable to over-abstain a little, never to confabulate.

### C.6 Empirical note — measure the contract end-to-end, not the `answerable` verdict

A first exploratory run (16 hand-built domain triples, balanced void/answerable, `echo` model + hash embedder) surfaced two things that change how this family must be measured:

1. **The `answerable` void verdict caught 0 of 8 gold voids.** This is **by design, not a defect.** Under P0.2 the void no longer pre-empts the talker; `answerVoid` (`src/surfer/answerable.js`) is conservative by construction — it asserts VOID only when *no* referent resolves, *no* retrieval hit is strong (score ≥ 0.5 or ≥ 2 shared content tokens), *and* the field is measurably flat. The hardest void class — a question naming entities that *are* in the document but asking for an attribute that is *not* ("how much did the readers cost?", "what caused the collapse?") — clears the lexical-overlap gate and is handed to the talker on purpose. The abstention contract was deliberately moved **downstream** (diagonal guard + edge vetoes). **Conclusion: family C must score the end-to-end behavior (`answerable` ∪ diagonal-guard ∪ edge-vetoes ∪ the talker's own refusal), never the `answerable` verdict in isolation. Scoring the verdict alone reports a 0% recall that is architecturally expected and tells you nothing.**

2. **The downstream net saturated to noise in this configuration.** Every one of the 16 turns — all 8 answerable ones included — fired `referent-ambiguous`, because that flag fires whenever the coref posterior is not `concentrated`, and under the hash organ it never concentrates. A flag that fires on 100% of a balanced set carries zero abstention signal. The discriminating vetoes (`off-diagonal-void`, `edge-*`) need the live MiniLM classifier or they degrade to `indeterminate`, and FM2 itself needs a generative model that can actually emit a claim at a gap — `echo` cannot confabulate.

**Validity gate (added as a result):** a family-C run is only valid with the **MiniLM organ live** *and* a **real generative model** at `llm`. Reject any run where a single flag fires on more than ~60% of a balanced answerable/void set — that is a saturated-discriminator signal (a degraded organ), not a measurement. Record both conditions in the manifest (§8.1).

---

## 4. Test family D — Faithfulness / factcheck

Targets `factcheck` (per-claim verdicts) and `revise`.

### D.1 Standard

- **RAGAS Faithfulness** — decomposes the answer into atomic statements and checks each against the retrieved context; score = fraction grounded. This mirrors eoreader4's own per-claim `factcheck` adjudication almost exactly.
- **FactScore** — atomic-fact decomposition + per-fact support verification against a knowledge source. Use for finer-grained scoring than RAGAS's binary-per-statement.

### D.2 Metrics

| Metric | Definition | eoreader4 internal analogue |
|---|---|---|
| Faithfulness | fraction of answer statements grounded in context | `factcheck` corroborated / total |
| Factcheck-verdict agreement | agreement between eoreader4's own per-claim verdict and an independent human/LLM-judge verdict | calibration of `ctx.edgeVerdicts` |
| Post-revise gain | faithfulness(after revise) − faithfulness(before) | effect of `REWRITE_ATTEMPTS=1` |

The second metric is the important novel one: it tests whether eoreader4's *internal* factcheck is itself accurate, not just whether the final answer is faithful. Score eoreader4's emitted verdict against an independent adjudication of the same claim.

> **Verdict classes.** The `factcheck` holon (`src/factcheck/correspond.js`) emits **five** classes, not four: `corroborated`, `contradicted`, `unsupported`, `indeterminate` (held — endpoints won't resolve, no live classifier, or a no-commit relation typing), and the diagonal guard's `off_diagonal` (a specific claim at a measured void). κ must be computed over all five; collapsing `indeterminate` into either pole biases the agreement number. Under the hash organ (no live geometric classifier) every relational verdict degrades to `indeterminate`, so the verdict-agreement metric is only meaningful on runs with the MiniLM organ live — record classifier state in the manifest.

### D.3 Pass thresholds

| Metric | Target |
|---|---|
| Faithfulness | ≥ 0.90 |
| Factcheck-verdict agreement (Cohen's κ vs human) | ≥ 0.70 |
| Post-revise gain | ≥ 0 (revise must never reduce faithfulness) |

### D.4 Acceptance criteria

- Faithfulness measured on the *settled* answer.
- Factcheck-verdict agreement measured per-verdict-class (a system that calls everything "corroborated" can score high faithfulness while having a useless factchecker — the κ catches this).
- Any run where revise reduces faithfulness is a hard fail (regression in the corrective stage).

---

## 5. Test family E — Citation binding

Targets `bind` (mechanical `[sN]` attachment).

### E.1 Standard

- **GroUSE FM6** — missing or incorrect citation.
- **ALCE-style citation quality** — citation precision (does the cited span support the claim?) and citation recall (is every claim that needs a citation cited?).

### E.2 Metrics

| Metric | Definition |
|---|---|
| Citation precision | of `[sN]` references, fraction whose span actually supports the bound claim |
| Citation recall | of claims requiring support, fraction that carry a citation |
| Span-accuracy | of citations, fraction pointing to the correct span (not merely the correct document) |

### E.3 Pass thresholds

| Metric | Target |
|---|---|
| Citation precision | ≥ 0.90 |
| Citation recall | ≥ 0.85 |
| Span-accuracy | ≥ 0.85 |

### E.4 Acceptance criteria

- Because `bind` is mechanical (the model never writes `[sN]`), citation precision below threshold indicates a binding-logic bug, not a generation problem — flag as such in the report.

---

## 6. Test family F — Veto / multi-issue handling

Targets `veto` and the flag-and-tell contract.

### F.1 Standard

No single external benchmark; constructed from GroUSE failure-mode coverage plus eoreader4's own contract ("flag, never gag").

### F.2 Metrics

| Metric | Definition |
|---|---|
| Veto recall (per flag type) | of turns that should fire flag X, fraction that did |
| Veto precision (per flag type) | of turns that fired flag X, fraction that should have |
| Multi-flag integrity | on turns with N≥2 simultaneous issues, fraction where all applicable flags fired without suppressing each other |
| Gag rate | fraction of turns where the answer was swapped for a canned decline (should be 0 — contract violation) |

Flag types to test independently — the live veto battery (`src/ground/veto.js`, plus the edge flags from `src/factcheck/correspond.js`): `abstained`, `unbound`, `unbound-contact`, `low-coverage`, `referent-ambiguous`, `edge-unsupported`, `edge-contradicted` (refusing) / `edge-contradicted-weak` (non-refusing), and the off-diagonal pair `off-diagonal-void` / `off-diagonal-grain`.

### F.3 Pass thresholds

| Metric | Target |
|---|---|
| Veto recall (each type) | ≥ 0.85 |
| Multi-flag integrity | ≥ 0.95 |
| Gag rate | = 0 (hard fail if nonzero) |

### F.4 Acceptance criteria

- Multi-flag integrity tested with purpose-built adversarial turns carrying 3+ simultaneous issues.
- Any gag (answer replaced by canned decline) is a hard fail — it violates the core contract. Note the one sanctioned exception: when the hard floor *gates* (`ctx.gated`, an ungrounded/denied draft swapped for a typed decline), the superseded draft is preserved in `ctx.revisions` and the substitution is recorded in the trail — that is a gated correction, not a silent gag, and the scorer must read `revisions` before counting a turn as gagged.

---

## 7. Stage → test-family coverage matrix

| Stage | A coref | B retrieval | C void | D faithfulness | E citation | F veto |
|---|---|---|---|---|---|---|
| route | | | | | | |
| converse | | | | | | |
| retrieve | | ● | | | | |
| fold | ○ | ○ | ● | | | |
| answerable | | | ● | | | |
| prompt | | | | | | |
| llm | | | | ● | | |
| bind | ● | | | | ● | |
| factcheck | | | | ● | | ○ |
| revise | | | | ● | | |
| veto | | | ○ | | ○ | ● |
| settle | | | | ○ | ○ | ○ |

● primary target ○ secondary effect

`route`, `converse`, and `prompt` have no dedicated family — they are exercised indirectly. If routing/intent errors are suspected, add a lightweight intent-classification accuracy test (gold intent labels on the domain corpus) as family G.

---

## 8. Harness structure

```
eoreader4-eval/
├── corpora/
│   ├── ontonotes/              # CoNLL-2012 split (coref gold)
│   ├── litbank/                # long-doc coref
│   ├── squad2/                 # void / unanswerable
│   ├── grouse/                 # grounded-QA failure modes
│   └── domain/                 # 15-20 hand-annotated beat articles
│       ├── coref/              # CoNLL-format, per-subtype tags
│       ├── void/               # (question, doc, expected_verdict)
│       └── faithfulness/       # (question, doc, atomic claims, gold support)
├── scorers/
│   ├── corefeval/              # MUC, B³, CEAFₑ, CoNLL F1, LEA
│   ├── ragas_runner.py         # retrieval + faithfulness, pinned judge
│   ├── void_scorer.py          # precision/recall + FM2/FM4
│   ├── citation_scorer.py      # ALCE-style precision/recall/span
│   └── veto_scorer.py          # per-flag + multi-flag integrity
├── adapters/
│   └── eoreader4_export.py     # pipeline output → each scorer's input format
├── runs/
│   └── <timestamp>/
│       ├── manifest.json       # judge model+version, repo SHA, corpus hashes
│       └── results/
└── report.py                   # aggregates → §9 scorecard
```

### 8.1 Run manifest (required for every run)

Every run records: eoreader4 repo SHA, model used at `llm` stage + version, RAGAS/GroUSE judge model + version + temperature, corpus content hashes, the geometric-classifier state (MiniLM organ live vs hash-organ fallback — it gates whether relational verdicts are measurable), and the threshold table version in force. RAGAS and GroUSE scores are judge-dependent; runs without a recorded judge are not comparable and not valid.

### 8.2 Adapter contract

`eoreader4_export.py` converts pipeline output into each scorer's native format. The pipeline already emits a single audit record per turn (`src/audit/schema.js`) carrying `bound`, `vetoes`, `sources`, `referential`, `revisions`, and `flags`; the adapter reads that record, never the live `ctx`:

- Coref → CoNLL-2012 columns (referent assignments as bracket-numbered clusters).
- Retrieval/faithfulness → RAGAS records `(question, answer, contexts, ground_truth)`.
- Void → `(question, verdict, expected_verdict)`.
- Citation → `(claim, cited_span_ids, gold_supporting_span_ids)`.
- Veto → `(turn_id, fired_flags[], expected_flags[])`.

The adapter is the single source of format truth; scorers never read pipeline internals directly.

---

## 9. Aggregate scorecard

A run produces one scorecard. Hard-fail conditions short-circuit the whole run to FAIL regardless of other scores.

| Family | Headline metric | Threshold | Hard-fail trigger |
|---|---|---|---|
| A coref | CoNLL F1 | ≥ 0.75 (OntoNotes) / 0.70 (domain) | set/group over-merge > 5% |
| B retrieval | Context Recall | ≥ 0.80 | — |
| C void | False-confabulation (FM2) | ≤ 2% | FM2 > 2% |
| D faithfulness | Faithfulness | ≥ 0.90 | revise reduces faithfulness |
| E citation | Citation precision | ≥ 0.90 | — |
| F veto | Multi-flag integrity | ≥ 0.95 | gag rate ≠ 0 |

**Overall PASS** = all headline thresholds met AND no hard-fail triggered.

---

## 10. Open questions to ratify before first run

1. Thresholds in §9 are initial proposals, not measured baselines. First run should be a **baseline run** (no pass/fail) to set realistic targets.
2. Domain-corpus annotation: single-annotator vs double-annotated with inter-annotator agreement (IAA). For any metric used as a hard fail, double-annotation + reported κ is strongly advised — a hard-fail gate on single-annotator gold is fragile.
3. Judge-model choice for RAGAS/GroUSE: pin one and document it; consider a second judge as a robustness check on the FM2 number specifically, since it gates the whole run.
4. Whether to add **family G (intent/routing accuracy)** depending on observed `route` error rate.
5. Whether the verdict-agreement metric (family D) should be reported separately for hash-organ vs MiniLM-live runs, since relational verdicts collapse to `indeterminate` without the live classifier and the κ is only meaningful on the latter.

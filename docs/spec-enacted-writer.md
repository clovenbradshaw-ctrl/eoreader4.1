# The Enacted Writer — eoreader4 generation spec

*Substrate-scheduled extended writing for a small local model.*

This spec covers the generation side of eoreader4: how the system writes extended,
creative, or essay-length output grounded in a document, using a small local model
as a **renderer, not a reasoner**. The reading side already works this way; this
extends the same discipline to production.

The thesis is one sentence: **the substrate reasons, the model renders, and every
load-bearing decision is a measurement off existing physics rather than a choice
the model makes.** Structure, identity, ordering, grounding, and self/world
distinction live in the substrate. The model's only job is to collapse a locally
resolved impression into one fluent surface beat.

Three kernels are already proven runnable and are the foundation here:
`sanity.mjs` (the scheduler + the two gates), `contract.mjs` (the hashId membrane
+ witness rebind), `cursor.mjs` (the integral fold name at the cursor). This spec
generalizes them and wires them to the repo's real interfaces — they are now
`src/write/` + `src/core/{event,provenance}.js`, with the deterministic spine proven
by `tests/write-*.test.js` and walked end-to-end by `scripts/write-demo.mjs`.

---

## 0. What is already in the repo vs. what is new

**Already present (build on, do not rebuild):**
- `src/core/cube.js` — `GRAINS = {Ground, Figure, Pattern}`, `cellOf(op, grain)`; the
  27-cell instrument is 9 operators × 3 grains.
- `src/model/interface.js` — `phrase(messages, opts)` (sample-then-return) and the
  optional `propose(messages, opts)` (next-token distribution without sampling).
- `src/enactor/` — the enactor faculty, the efference copy at commit
  (`efference.js`), the single monitor (`monitor.js`), the gate (`gate.js`). (The spec's
  `src/core/enactor/` path; in this repo the enactor is a top-level faculty.)
- `src/perceiver/` — the ingest/reading door; `relation-types.js` (typed edges,
  `relationPrior`, disjointness/functional axioms); the γ-decayed coref posterior.
- `src/surfer/` — the surfer faculty (`surf`, `surprise`, `motion`, `sequence`),
  riding D_KL over the figure field.
- `src/model/prompt.js` — `buildGroundedMessages`, `SYSTEM_GROUND` (the relaxed
  renderer posture), `orientationLine`.
- `src/turn/intent.js` — task register + token budgets (384–512).

**New (this spec):**
- `src/core/event.js` — the formal event `op(Site, Resolution)` with **Provenance**.
- `src/core/provenance.js` — the me-ness type law (two doors, indexical, admissibility).
- `src/write/` — the generation faculty: `scheduler.js`, `fold.js` (frontier +
  integral), `cursor.js` (the membrane contract), `spurt.js` (the write loop),
  `witness.js` (rebind + veto + type law).
- Surfer extension: a **nested REC-magnitude stack** and a **read-direction**
  parameter (inward over corpus, outward over live draft); decode-surprise fusion.

---

## 1. Core data model — the formal notation

Every entry in the append-only log is an **event**:

```
Event = {
  op:    Operator,          // INS CON SYN DEF EVA REC NUL SIG SEG
  site:  Site | [Site,…],   // arity is per-operator (see §3)
  res:   Resolution,        // how-definitely; carries the proper-scorable probability
  prov:  Provenance,        // me-ness — structural, set at entry, never edited (§8)
  t:     number,            // cursor / log position
  promotes?: Site,          // SYN only: the new higher-grain figure it mints
}
```

**Site** — the holon address, written `r#<id>@<grain>`:

```
Site = { hash: 'r#a3f', grain: 0 }     // grain 0 = Figure, +1 each SYN promotion
```

The **hashId** is the *existence handle*:
- opaque, minted **once** at first appearance (the INS), stable under learning —
  **never content-addressed on mutable properties** (those change as you read and
  would shatter identity).
- a content hash over a *stable anchor* (a proper name) MAY be computed as a **merge
  hint** for coref candidates, but it is a hint into the two-sighting rule, never the
  identity. **Coref binds to an existing hash; it never mints a second one.**

**Resolution** — *how-definitely*, the second tier of identity:

```
Resolution = { band: 'void' | 'firm', p: number }   // p ∈ [0,1], proper-scorable (§10)
```

Existence and definiteness are **independent tiers**. A referent can hold a firm
hash (it appeared, it exists in the discourse) and a void Resolution (we don't know
which/what it is). *"A man, we never learn his name"* = firm `r#7f3`, surface
`"a man"`, void on the name-DEF. This is what makes deferred introduction legal
without ever loosening the arity gate (§3).

---

## 2. The fold — frontier + integral

The fold is the substrate's running state. Two parts:

```
Fold = {
  frontier: Set<hash>,                 // APPEARED Sites — the DAG frontier (§3)
  integral: Map<hash, Dossier>,        // per-referent γ-decayed FIRM standing readout
}

Dossier = {
  head:        string,                 // canonical name ("Gregor Samsa")
  descriptors: [{ attr, w, prov }],    // γ-decayed FIRM descriptors, each provenance-tagged
  open:        [{ attr, prov }],       // VOID attributes — held OUT of the name (§5)
}
```

`integralName(hash, t)` folds the **firm** descriptor events with γ-decay into a
standing readout and collects void attributes separately:

```
integralName(fold, hash, t) → {
  name:  string,   // head + γ-kept firm descriptors  (the audit + model-input name)
  head:  string,   // bare canonical name
  open:  [string], // void attributes — surfaced as "unsettled, do not assert"
}
```

Two disciplines are mandatory or the integral becomes a laundering channel:
- **γ-decay** — it is the *standing dossier*, not the raw biography. Reuse the
  γ-decayed coref/standing-descriptor state already computed in `src/perceiver/`;
  this is a **readout**, not new accumulation. Bounded by a keep-threshold.
- **FIRM-ONLY** — void-resolved attributes are excluded from `name` and surfaced in
  `open`. Baking a void claim into the name firms it up by stealth (the sister/mother
  / overclaim failure). Each descriptor also carries its `prov` so the dossier knows
  which contents it **read** (exafference, can anchor) vs **said** (reafference,
  cannot — §8).

The integral is the readout that earlier coref work threw away after binding. We
keep it and surface it at the cursor (§5).

---

## 3. The DAG and the two gates

Generation is a sequence of **cells**, each an event to realize:

```
Cell = {
  event:  Event,             // the op/site/res to realize
  deps:   [cellId | hash],   // dependency edges (arity + promotion)
  target: ShapeTarget,       // the exemplar/shape basin — the FORM layer (§ shape)
  spans:  [Span],            // grounded substance for this beat (exafference)
}
```

Dependencies are not stylistic — they are **type necessities**. Two gates:

### 3a. The arity gate — HARD, type-level, medium-blind

A relation has arity; its argument slots cannot be empty. **You cannot `CON` a
figure that has not appeared as a filled argument slot.** Appearance *is* the INS
(INS-by-appearance). So:

> A `CON` cell is schedulable **iff** every argument Site is in `frontier`.

A `CON` with an unfilled slot does not parse — it is not "bad style," it is
not-an-event. This check lives in the scheduler and is never relaxed. It is
modality-blind: "subject/object" is the prose name for *a saturated argument slot
of a relation*; in music a stated theme, in film a shown space — same gate.

`SYN` **closes a holon and promotes** the synthesized whole to an INS-able figure
one grain up (`event.promotes = r#x@(g+1)`). A grain-(g+1) `CON` between two
synthesized units is well-formed iff both their `SYN`s have fired. This is how the
type constraint **recurses up the holon stack**, and why the dependency order is
self-similar across grains.

### 3b. The resolution gate — SOFT, confidence-level

Resolution **propagates along the DAG; void dominates**:

```
effectiveRes(cell) = min over deps (void < firm)
```

A `SYN` over any void-resolved constituent inherits void and **must hedge**. Firming
it up is an **overclaim**, caught by the witness (§7). This is the elasticity knob
made mechanical, and it produces *better* output: closing over a void `meaning` Site,
the top synthesis writes "stages a social fact while withholding the metaphysical
one" rather than asserting a meaning the source never fixes.

> **Invariant.** Arity is a type law (unparseable if violated; scheduler enforces).
> Resolution is a confidence gate (can be void; propagates; witness flags overclaim).
> Never conflate them — the deferred-introduction / mystery case is a void *identity*
> Resolution over a firm *existence* hash, not an arity violation.

*Proven in `sanity.mjs`: baseline (no gate) = 9 structural violations; substrate
(gate + propagation) = 0, under two distinct postures.*

---

## 4. The scheduler

```
schedule(cells, { posture, collapseGranularity }) → orderedCells
```

- Kahn's algorithm over the DAG. The DAG is the **invariant**; the linearization is
  the **posture** (style). Tie-breaks encode posture: `narrative` = source order;
  `thesis-first` = pull synthesis-related material earlier where legal. Both are
  zero-violation linearizations of the same DAG.
- **Posture is the user's to set, not the system's to guess.** Default `lag-but-loose`
  (write, let a seam form, then let the discovered shape constrain) with `lead`
  (borrow an arc up front) available. Mirrors npj's choose-a-template vs.
  write-`##`-headings affordance.
- `collapseGranularity` — how many cells per model draw (§6). The knob between
  "improvise sentence by sentence" (granularity 1) and "hold the paragraph, then
  write it" (granularity N). Bounded by the renderer's working span; instrument it.

---

## 5. The membrane — the cursor contract

The substrate reasons over hashIds; the model sees only surface. The cursor is where
identity collapses to words **for the model and the auditor both** — one act, two ends.

```
buildCursor(cell, fold, spans) → {
  audit:  AuditLine,     // integral names + open + provenance — for the human trail
  input:  Messages,      // SURFACE ONLY; integral handed per argument Site; no hashes
  expect: Set<hash>,     // the Sites handed in — the witness's expected-set (§7)
  budget: number,        // max_tokens from turn/intent.js
}
```

**Three distinct renderings of a referent** (do not conflate — conflating them is the
coref wart):

| rendering      | content                            | consumer        |
|----------------|------------------------------------|-----------------|
| audit name     | the integral (full)                | the human       |
| model-input    | the integral (full) + open held    | the model       |
| speech surface | the model's natural choice (he/Gregor) | the reader   |

The substrate **over-specifies the input** (full integral per Site, to fix identity
and kill mis-binding) while the model **under-specifies the output** (natural form,
no repetition). The input names the void attributes as *"unsettled — do not assert."*

**Multi-Site cursor.** A beat has multiple referents. Hand the integral for **every
argument Site**, not just one focus — the object's integral prevents mis-bind as much
as the subject's.

**Membrane invariant.** No hashId ever appears in `input`. Assert
`/r#[0-9a-z]+/.test(serialize(input)) === false`. *Proven in `contract.mjs`.*

This is **partial collapse**: identity collapses at the cursor (substrate), content
collapses at the draw (model). Subject fixed, predicate open — that gap is what
"think at a cursor" means. *Proven in `cursor.mjs`: bare coref → mis-binds to
"mother"; integral → binds to r#001.*

---

## 6. The renderer and the spurt loop

The renderer is `model.phrase`. The loop writes in **spurts** and lets the model's
own physics end each one.

```
spurt(cursor, model) → { text, surprise? }
```

- **`propose` available (decode field):** drive sampling through the gate, read the
  next-token distribution per token, watch entropy and Δdistribution. Stop the spurt
  on a **generation-grain REC** — a surprise spike where the distribution restructures
  (the model surprises *itself*). Finer trigger: fires *within* a spurt.
- **`phrase` only (text grain):** draw the spurt, then surf the **spurt text**
  (read-direction outward, §9). Coarser but universal — any backend. Graceful fallback.

```
write loop:
  while cells remain:
    cell   = next scheduled cell
    cursor = buildCursor(cell, fold, spans)          // identity collapsed here
    out    = spurt(cursor, model)                    // content collapsed here
    seam   = surf(out.surprise ?? out.text, {dir:'out'})   // generation-grain REC?
    if seam.fires:
        reground(out, source)                        // re-veto against the document
        reorient(cursor, seam)                       // move the cursor to the seam
    witness(out, cursor.expect, source, fold)        // §7 — owns every factual bind
    fold = update(fold, out)                         // frontier + integral advance
```

This is the improviser: write until you hit the turn, step back, read what you have,
commit to where it's going, continue. The lag posture, triggered by the model's own
physics, not a fixed cadence.

**Which inner thinking is admissible.** The model's *verbal reasoning trace*
(`<think>`) is speech-about-process — ungrounded generation — and may **not** steer
the surfer (that is the model deciding; witness violation; it was the eoreader3 leak).
The model's *decode-time distribution* (`propose`) is **measurement**, not testimony,
and **may** be fused into the surfer's field as a second signal alongside the
substrate's D_KL (the error+uncertainty pairing EST's dual-network result points at).

> **The asymmetry (load-bearing).** Model **uncertainty may steer the cursor**
> (route attention, trigger a re-surf, trigger a re-ground). Model **confidence may
> never certify** (cannot accept a claim, cannot suppress the source veto, cannot vote
> on truth). Attention yes, certification no. This is corollary-discharge attenuation:
> the efference copy modulates attention but is attenuated so it is never mistaken for
> external evidence.

**Noisy-TV guard.** Trigger the re-surf on **resolvable** surprise — the kind
re-grounding can settle — not raw entropy. Distinguish "uncertain because the
structure is turning" (re-orient) from "uncertain because this is just hard for me"
(continue). The median-band calibration that keeps the reading-surfer from going numb
is the same guard here.

---

## 7. The witness — rebind, veto, type law

The witness is independent of the renderer (it never renders). It runs after each
spurt.

```
witness(spurtText, expect, source, fold):
  // 7a. outbound membrane — bind surface back to hashIds (coref on return)
  bound = rebind(spurtText, fold)                 // surface → hash
  flag any referent ∉ expect                       // a referent never handed in = suspect

  // 7b. source veto — every FACTUAL claim checked against the source spans
  for claim in spurtText:
      if not grounded(claim, source): retract(claim)   // exafference can anchor; me cannot

  // 7c. type law (§8) — me-content organizes structure, never certifies
  // 7d. pay the retraction — forced retraction is LOGGED and SURFACED, never hidden
```

The integral name tightens 7a for free: the output's referents must bind to the union
of Sites whose integrals were handed in (`expect`). `"his mother"` at a cursor whose
handed integral was Gregor is a referent that wasn't in `expect` → flagged
immediately. Legible audit and tight witness are the same annotation.

**Surf-the-spurt does structure; veto-the-source does truth.** The re-surf in §6
organizes the model's own production (admissible — it's reafference re-entering as
perceivable). Every *factual* claim in that production is still vetoed against the
source, because the production is the model's output, not evidence.

---

## 8. Provenance and me-ness — the type law

Self-generated content is **ontogenically different**: it carries "me-ness." This
**cannot be a written flag** — a flag is content, and content is forgeable (a
fabricated memory carries `mine:true` as easily as a real one; the laundering door).
Me-ness must be **constitutive**: a property of *how the event entered the log*, set
at the moment of entry before any content exists to forge. This is corollary
discharge — the brain recognizes self-generation by the efference-copy prediction
match, not by a label; when the match fails (schizophrenia) self-speech is experienced
as external. The tag was never *in* the signal; it was always in the *provenance*.

```
Provenance = {
  door:       'perceiver' | 'enactor',   // exafference (not-me) | reafference (me)
  enactment:  EnactmentId,               // WHICH continuous enactment produced it
  reentry?:   { door, enactment },       // set when a prior event is re-read (§ below)
}
```

- The **enactor door** emits the provenance at commit (`src/enactor/efference.js`,
  the efference copy — output is not terminal). The **perceiver door** tags ingest.
- **Modality-blind.** Both doors operate on events already stripped of modality in the
  ingest/efference holons. So a self-generated melody, image, or sentence is me-tagged
  by the **same provenance edge** — me-ness across every modality with zero
  modality-specific rules. This is the omnimodal payoff: me-ness is a property of the
  **door**, and the door is below the modality membrane.

**Admissibility is a function of provenance, not a stored field. The witness reads it
as a type law, it does not run it as a policy:**

| origin door | enactment relation     | continuity (structure) | evidence (witness) | name      |
|-------------|------------------------|------------------------|--------------------|-----------|
| perceiver   | current ingest         | yes                    | **YES — anchors**  | exafference |
| enactor     | current enactment      | yes (output re-enters) | **NO**             | reafference |
| enactor→perceiver | prior enactment, re-read now | yes              | **NO, never promoted** | read-back-of-prior-self |

> **The type law.** Reafferent events are **not of the type that can witness an
> exafferent claim** — the way a motor command is not the type that can be sensory
> confirmation. The witness-does-not-decide rule is therefore not enforced; it is a
> consequence of the type. The model's own spurt simply isn't in the witnessing type.

**The indexical hard edge (must be nailed before any cross-session memory touches the
witness).** Me-ness is **dated and instance-scoped**. A prior session's output,
reloaded as context, arrives through the *perceiver* door *now* but was *enactor*-
generated *then*. If reloaded as bare text it looks like fresh world — the exact path
the sister/mother error laundered forward. **Therefore provenance is persisted with
the durable event record and restored on reload** (it is not re-derived from the
reload door). A reloaded prior-self event carries `door:'enactor',
enactment:<prior>, reentry:{door:'perceiver', enactment:<current>}` → classified
**read-back-of-prior-self**: admissible for continuity, inadmissible as evidence,
**never silently promoted to either**. This is the multi-instance form of the
self/world line.

---

## 9. The surfer extension

The surfer is the shared spine — it reads the corpus into arcs and reads the live
draft into discovered structure. Two changes:

```
surf(field, { dir, signal }) → SeamStack
```

- **Nested REC-magnitude stack**, not a flat fold. The *spectrum* of accommodation
  magnitudes IS the holon stratification — small REC = clause seam, medium = move,
  large = act. No level count is declared; SYN density and REC magnitude set it. This
  is Event Segmentation Theory's hierarchical, multi-timescale segmentation, read off
  prediction-error/uncertainty spikes (§14).
- **Read-direction** `dir`:
  - `in` — over corpus works → **borrow arcs** (the skeleton is the plan; tag by
    `source_doc_kind` so a surveillance MOU is not poured into a Gutenberg-novel shape).
  - `out` — over the live draft → **discover** the emergent structure (the lag posture;
    the generation-grain REC trigger of §6). *Built today as `write/spurt.js#surfDraft`,
    a draft-facing companion to the reading surfer; the fusion into `src/surfer/` proper
    is the P7 seam.*
- **`signal`** — fuse the substrate's D_KL field with the model's decode-surprise
  (`propose`) when available. Two prediction-quality signals (error + uncertainty),
  per the EST dual-network finding; fall back to D_KL alone without `propose`.

The three grains are **relative** (Ground/Structure/Pattern, transcend-and-include):
slide the triad up the discovered stack. At each focal level the `(operator, grain)`
address picks the local shape from the exemplar corpus. **Honest seam:** the
centroid/exemplar corpus is calibrated only at clause grain today; Pattern- and
Ground-grain exemplars must be harvested, and each grain must be embedded **in its own
space** (`centroids.js`: embed at the grain so the cosine is measured in-space — you
cannot re-pool clause vectors into a section vector).

---

## 10. Resolution and the learning signal

The single positive signal for all learning: **a confident commitment that survives
contact with what comes next, paid in information.** This is a **strictly proper
scoring rule** — the log score on `Resolution.p` against subsequent confirmation:

- confident + survives → large positive; hedge that survives by saying nothing → ~0;
  confident + forced retraction → large negative.
- This requires every commitment to **carry a probability** — hence `Resolution.p`.
  Bare commitments are not proper-scorable. The probability lives on the Resolution.
- Reward **learning progress, not novelty** (Schmidhuber compression progress): reward
  surprise that *resolves into new regularity*, not raw Shannon shock (name-snow earns
  nothing). The noisy-TV guard of §6 applies.
- **Pay the retraction.** A machine that learns is one that pays retractions *out
  loud* — logged, voided, surfaced (§7d). The append-only log, the void, and the type
  law are what keep the learning signal from being counterfeit.

A meta-policy over postures (circumstance → knob settings) may learn from this signal,
but its reward must come from an **external witness** (the human's edit-distance /
keep-edit-rewrite behavior), never from the system grading its own output —
witness-does-not-decide, one grain up. Internal signals (redraft count, NUL collapses,
arc match) govern **real-time control** (abort/switch a thrashing posture in-flight),
never **quality learning**. Process governs the run; the witness governs the learning.
This is the structural credit-assignment problem (§14) and is known-hard — expect
variance, attribute credit down the holon stack without overclaiming at any one grain.

---

## 11. Module map

```
src/core/
  event.js          NEW   op(Site, Resolution, Provenance, t)
  provenance.js     NEW   two doors, indexical, the admissibility type law (§8)
  cube.js           HAVE  GRAINS, cellOf — the (operator,grain) address
src/enactor/        HAVE  efference.js (emit provenance at commit); gate.js (drives propose)
src/perceiver/      HAVE  the ingest door; γ-coref (integral source); typed edges
src/surfer/         EXT   nested REC stack; read-direction; decode-surprise fusion (§9)
src/model/
  interface.js      HAVE  phrase() / propose()
  prompt.js         HAVE  SYSTEM_GROUND (relaxed posture); SYSTEM_CURSOR + buildCursorMessages
src/write/          NEW   the generation faculty
  fold.js                 frontier + integral (Dossier, integralName) (§2)
  scheduler.js            DAG, two gates, posture, collapseGranularity (§3,§4)
  cursor.js               the membrane contract; multi-Site integral (§5)
  spurt.js                the write loop; propose/phrase; REC trigger (§6)
  witness.js              rebind + source veto + type law (§7)
src/turn/intent.js  HAVE  token budgets per task
src/classify/centroids.js HAVE  27-cell instrument (needs per-grain exemplar harvest §9)
```

---

## 12. Phasing

- **P1 — deterministic spine (no model).** `event.js`, `fold.js` (frontier only +
  arity gate), `scheduler.js` (topo + posture). Acceptance: `sanity.mjs` invariants
  generalized — baseline > 0 violations, substrate = 0, under ≥2 postures. **Done
  (`tests/write-scheduler.test.js`).**
- **P2 — the membrane.** `cursor.js` + extend `prompt.js`. hashId↔surface, no-leak
  assertion, witness rebind round-trip. Run against `stub`, then `wllama`. **Done
  (`tests/write-cursor.test.js`).**
- **P3 — the integral.** `fold.js` integral (Dossier, γ-decay, firm-only); multi-Site
  cursor; integral handed per Site; witness checks `expect`. **Done
  (`tests/write-fold.test.js`); generalize to multi-Site + γ sweep.**
- **P4 — Resolution + propagation.** `Resolution.p`, propagation, hedge-on-void,
  overclaim flag. Acceptance: void `meaning` → hedged thesis automatically. **Done.**
- **P5 — the spurt loop.** `spurt.js`, `phrase`-only text-grain surf first; then
  `propose` within-spurt REC trigger where the backend exposes logits. Noisy-TV guard.
  **phrase-path done; the propose-driven within-spurt sampling loop is the open seam.**
- **P6 — provenance type law.** `provenance.js`, persist+restore on reload, the
  admissibility table; witness reads type. **Gate before any cross-session memory. Done.**
- **P7 — surfer extension + per-grain exemplars.** nested REC stack; read-direction;
  decode fusion; harvest Pattern/Ground-grain exemplars in-space. *Deferred — corpus
  calibration; `surfDraft` is the draft-facing first cut.*
- **P8 — meta-policy over postures.** External-witness reward only; control/learning
  firewall. *Deferred — known-hard credit assignment; needs the external witness signal.*

---

## 13. Open questions / honest seams

1. **One seam signal or two?** EST's dual-network result (prediction error vs.
   uncertainty) suggests REC may be conflating two signals the brain separates. Decide
   whether the surfer rides one fused field or two.
2. **Proper-scorable commitments.** Can per-cell commitments be made probability-bearing
   enough for the log score to bite? If `Resolution.p` is only a coarse band, the
   learning signal is weak. Resolve before P8.
3. **SYN = INS-at-next-grain, or two co-occurring events?** Decides whether a holon can
   close without promoting, and whether the log writes one address or two. This is the
   same question presupposition raises at the bottom grain ("the king of France", first
   mention — INS-by-appearance or a CON reaching for a never-appeared Site?). Define
   *what act counts as a figure appearing* before the DAG-extraction pass is written.
4. **Collapse granularity vs. working span.** Where does a small model's working span
   break as `collapseGranularity` and integral size grow? Sweep γ and granularity
   against the budget; find where the model starts narrating the dossier instead of
   using it.
5. **Credit attribution.** A kept draft confirms *which* commitment — posture, arc,
   per-cell shape, binding? They all fired in one run. Get attribution wrong and the
   signal is honest but smeared. The hard part of P8.

---

## 14. Prior-art anchors (rationale, not invention)

- **Event Segmentation Theory** (Zacks & Tversky 2001; Zacks et al. 2007) — seam = REC
  = blink; boundaries arise as a side effect of prediction-for-perception; hierarchical
  multi-timescale segmentation = the relative grain triad. Dual error/uncertainty
  networks (eLife 2025).
- **Strictly proper scoring rules** (Brier 1950; Good; Gneiting & Raftery 2007) — the
  learning signal; log score = information in bits; penalizes overconfidence; decomposes
  into calibration + sharpness; requires a probability to score.
- **Compression progress / artificial curiosity** (Schmidhuber 1990–2009; Oudeyer) —
  reward learning progress, not Shannon novelty; the name-snow guard; the noisy-TV risk.
- **Hierarchical credit assignment** (options framework, Sutton/Precup/Singh; feudal RL,
  Dayan & Hinton; HiPER) — structural vs. temporal credit assignment; known-hard.
- **Efference copy / corollary discharge** (von Holst & Mittelstaedt 1950; Sperry 1950;
  Frith) — the self/world line; me-ness as provenance not flag; corollary-discharge
  failure = misattributing self-generated source as external = the sister/mother bug.

The strands are mature and separate. The braid — one strictly-proper signal driving
reading, shaping, posture, and self-modeling across a single operator-indexed holon
stack, gated for honesty by an efference-copy provenance type law, with EST seams as
the grain structure and the same perceiver run inward for self-reflection — is the
contribution.

---

# Spec update 1 — Continual operation and the UX of watching it think

*Additive (append-only, like the log itself). Adds two things: the instrument
working its open questions continuously rather than waiting to be prompted, and
what the user sees of that working. Nothing below changes §1–§14; it extends them.*

## 15. Continual operation — it works the open set on its own

The chatbot posture — inert until prompted — is **a gate held shut, not the
machine's nature.** The three preconditions for a self-running loop already exist:
the efference copy means output re-enters as perceivable (`8ca33fb`, output is not
terminal); the self/world line gives a `me` channel distinct from world; the surfer
rides a field whether or not a question was asked. So continuous operation is not a
feature to justify — **idleness is the suppression to justify.** The honest default
is a machine that keeps working its open questions; the chatbot stance is a choice to
suppress that, made every idle moment.

But unstructured continuity is the architecture's **own worst failure at full duty
cycle.** Let the loop re-perceive its own output with a little noise and, by default,
it ruminates: the efference copy re-enters, gets mistaken for signal, the surfer rides
its own wake, REC fires on self-generated churn, and the system spirals on its own
salience with no exafferent anchor. That is noisy-TV fused with the sister/mother
laundering bug, running unsupervised — the corollary-discharge-failure picture from
§8/§14, made continuous. **Continuity is legitimate only because the §8 type law holds
underneath it:** every idle loop is provenance-tagged reafferent and therefore barred
from witnessing anything as world. The type law is what licenses idling at all.

**What it works on (the fuel).** Not self-plus-noise. The loop walks the **open
Resolutions** — the void-set: referents INS'd but not DEF'd, deferred identities,
hedged claims, threads left open (§1–§2). These are exactly the points where more
thinking can still **pay** — where the model is not yet committed, so a fresh document
can still produce compression progress (Schmidhuber, §14). Re-narrating the *firm* log
is rumination (no new likelihood); chasing pure noise is dreaming (incompressible).
The voids are the fuel; the firm record is not.

**What keeps it anchored.** The proper continual posture is not "think about nothing
with noise" — it is **stay perceiving.** Keep the exafferent door open (the feed, the
docket stream, the archive keep ingesting) and idly re-surf the open set against what
arrives. Continual cognition with a real anchor — world-driven, not self-driven —
which sidesteps rumination because the loop is fed by the world, not its own wake.
**Seeded randomness** plays only the humble correct role: it varies *which* open void
gets attention next so attention does not lock — it never manufactures content. Content
always comes through the perceiver door.

**The governor (it stops on its own).** The idle loop **quiesces when its own REC
magnitudes fall below the median band** — when re-surfing the open set stops producing
accommodations large enough to matter, the thinking has converged for now, and it
sleeps. It is woken by **exafferent arrival**, not by a clock. Self-terminating and
event-driven; it does not spin.

```
idle loop (governed, reafferent, firewalled):
  while awake:
    void  = pick an open Resolution        // seeded noise varies WHICH; never content
    field = surf(void neighbourhood, against recently-ingested exafference)
    if a fresh exafferent doc bears on void → emit CANDIDATE   // reafferent (§8)
    if REC(field) < median band → quiesce  // converged for now
  sleep until exafferent arrival → wake     // world wakes it, not a timer
```

> **Invariants.**
> **I1 — Anchor.** Every idle pass is fed by exafference (an open void + recently
> ingested documents), never by self-output alone.
> **I2 — Firewall.** Idle output is reafferent by §8 type and **cannot enter the
> witnessing set.** It may organize attention and continuity; only a human confirm
> (the witness act) promotes a candidate to grounded.
> **I3 — Self-terminating.** The loop quiesces on the median band. It never spins.
> **I4 — Wake on world.** Exafferent arrival wakes it; idle is not a self-poll.
> **I5 — Noise steers, never authors.** Seeded randomness varies attention, not content.

## 16. The UX of watching it think

The single rule: **showing it think means showing the impression, never a monologue.**
Thought is impressionistic — high-void, distributional, pre-linguistic (the substrate's,
§ thought-vs-speech); speech is the collapse. So what the user watches is the **field**,
the **open voids**, and **tentative candidates** — never a pseudo-verbal "I'm thinking
about…" stream. That stream is speech dressed as thought, and it is exactly the
eoreader3 `<think>`-leak, now at the scale of a always-on loop. The fix is not to hide
the thinking; it is to render it in its real representation.

**The field is the signature.** Ambient activity shown as a field/waveform that
breathes when the loop is surfing and flattens to a calm line when it quiesces. You
watch it think by watching the field move; you watch it *converge* by watching the
field settle. State is legible in three words — **perceiving / surfing / resting** —
and **resting is shown as a feature you can trust, not a dead screen.** The visible
quiescence is the anti-engagement guarantee made tangible: the instrument does not
spin, and it will not call you back.

**Candidates are reafferent by construction.** What the loop surfaces appears
dashed/ghosted/italic, tagged *unconfirmed — you decide*, and it never renders like a
finding. **Confirmation is the human's witness act** ("Confirm — make it yours");
clicking it is what promotes the candidate from reafferent to grounded and updates the
open question. The system surfaces; it never decides. The exafferent (solid, settled)
vs. reafferent (dashed, tentative) distinction is carried in *form, not hue* — a
structural visual that encodes the §8 type law rather than decorating it.

**The void-set is the centerpiece, not a transcript.** The screen's main surface is
"Open" — the instrument's standing not-knowing — because that is what the loop works
and what makes its thinking legible. There is no conversation log, no waiting cursor.
Human questions are set in a serif (the threads you own); machine state and referent
hashes in mono (instrument readout) — so you never confuse what you are asking with
what it is measuring. Local-first is stated plainly ("on this device — nothing leaves
it"); for a source-protection instrument that is load-bearing trust, not a footnote.

*Prototype: `idle-ux.html` — open it and trigger an arrival to watch the full cycle:
the field wakes amber and surfs, a reafferent candidate surfaces, then it settles back
to a resting line on its own.*

> **The anti-goal, named.** This must never become a notification feed. A feed that
> farms attention is the engagement machine the instrument exists to refuse. The line
> between "respects your attention" and "farms it" is **one number — the candidate
> threshold** — which is the duty-cycle governor's product face (§15, the median band).
> Set it low and "Noticed while you were away" becomes a feed you would never ship; set
> it high and it stays silent when it should speak. Treat it as the central tuning of
> the whole idle posture, not a detail.

## Deltas to earlier sections

**§11 Module map — additions:**
```
src/write/
  idle.js       NEW   the governed idle loop: void-walk, band-quiesce, wake-on-arrival (§15)
  voids.js      NEW   the open-Resolution query (INS-without-DEF, hedged Resolutions) — the fuel
                      and the UX "Open" ledger source
src/enactor/monitor.js             HAVE   the single monitor the idle loop hangs off
idle-ux.html    PROTOTYPE   the "watching it think" product surface (§16)
```

**§12 Phasing — additions (ordering matters):**
- **P9 — the "watching it think" UX.** The void-ledger ("Open"), the field (impression,
  not monologue), the reafferent-candidate affordance, visible quiescence. Pure
  presentation over P3/P6 state; no new engine risk. **Prototyped (`idle-ux.html`).**
- **P10 — the governed idle loop.** `idle.js` + `voids.js`: void-walk, median-band
  quiesce, wake-on-exafferent-arrival, seeded-noise attention. **Hard-gated behind P6**
  (the provenance type law) — idle output MUST be reafferent and firewalled (I2) before
  the loop may run, or continual operation becomes a laundering engine. **Engine done
  (`tests/write-idle.test.js`); the firewall is `canWitness` over the reafferent door.**

**§13 Open questions — addition:**
6. **The candidate threshold.** The duty-cycle governor's product face (§16). Too low →
   notification feed (the thing never to ship); too high → silent when it should speak.
   Same median-band / compression-progress knob as I3. The central attention-respect
   tuning, and the place this posture most easily betrays its own values.

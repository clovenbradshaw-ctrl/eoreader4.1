# Proposition equivalence — sameness of meaning, attested

> "Ralph owns a boat" and "Ralph is the owner of a boat" are the same proposition.
> The engine must be able to *attest* that — robustly — without a hand-set threshold.

This is the third thing the engine asks "are these the same?" about, and it answers it
the same way as the first two:

| What is asked to be the same | Signal of sameness | Module |
|---|---|---|
| two **tones** | overtone overlap | `perceiver/equivalence.js` |
| two **names** (one person?) | relational discriminators | `core/asterisk.js` |
| two **propositions** (one assertion?) | **embedding cosine** | `perceiver/proposition-equivalence.js` |

All three run the **DEF · EVA · REC** loop, and all three gate the merge on the **Born
rule** (`core/voidnull.js`) rather than a chosen number.

## The loop, on a proposition

- **DEF** — each proposition is asserted and **embedded** (MiniLM). The embedding is the
  proposition's fingerprint, the way a discriminator set is a name's fingerprint in
  `asterisk.js`.
- **EVA** — construe one proposition *as* the other (the `EVA_Binding_Lens` cell:
  *interpret, translate, construe, read-as, take* — the `entity_transform` arrow
  `A ==> B`). The measurement is the cosine between the two embeddings. A judgment, not a
  fact.
- **REC** — restructure on the outcome, three ways (mirroring asterisk's
  promote / split / open exactly):
  - **`same`** — the cosine beats the null **and** the polarities agree → **SYN merge**.
  - **`opposed`** — the cosine beats the null but the polarities **clash** ("owns" vs
    "does not own"): same content, opposite sign is a *contradiction*, never an identity.
  - **`open`** — the cosine does not clear the null → **held**; the proposition asterisk
    stands, identity unestablished, not refused.

## Why the Born rule, and not a fixed cosine

The geometric classifier's `ADJACENCY_FLOOR` is a hand-set `0.6` — the small a priori
this engine exists to avoid. MiniLM sentence cosines do not center on zero: unrelated
clauses sit in a positive band (~0.3–0.5) that drifts with the domain, so no constant
knows where the tail begins. The boundary is therefore **derived**, online, from the
field's own non-cohering cosines — the also-ran nearnesses are samples of what chance
produces, and a merge must beat the extreme-value `(1−α)` quantile of that background,
**leave-one-out** (a real paraphrase never outranks itself), **robust** (a handful of
real paraphrases do not raise the bar), **causal** (the field read so far). One knob, `α`.

`scripts/proposition-equivalence.mjs` is the measurement: the paraphrase pairs clear the
null, a noise-only field clears nothing (asserts a DEF-to-void), and a negation — near in
embedding — is forked by polarity. The same shape as `scripts/abstain.mjs`, for meaning.

## Two honest seams

1. **The firewall.** Under a spelling-space embedder (the hash organ,
   `measuresMeaning === false`) a cosine measures nothing, so every pair **holds at
   no-commit** — the same firewall the geometric classifier runs. Equivalence is live
   only under warm MiniLM. (As with the classifier, no centroids are needed here — the
   embedder alone carries it — but the meaning organ must be warm.)
2. **Polarity is the parser's, not spelling's.** The veto that forks "owns" from "does
   not own" reads the proposition's **polarity slot** (`relations.js` already cuts it),
   never a negation word-list of our own. A bare string carries no polarity and defaults
   positive; the veto is inert until the caller wires the parsed sign in. The module
   stays pure on its two injected signals — the embedder and the polarity.

## The n = 2 honesty

The Born rule needs a *field* to calibrate against. With only the two Ralph clauses and
nothing else, there is no non-cohering background to measure chance against, so the
rigorous answer is **held** (`deriveNull` returns `Infinity` below `MIN_SAMPLES` — cold
start abstains, approaching the boundary from below). Attestation becomes robust once
there is a field of propositions to derive the null from. For the bare-pair case a caller
may pass an explicit `minSim` (the back-compat constant path, exactly as `equivalence.js`
accepts `minOverlap`), but that is a chosen number again — the honest robust path is the
field-derived null.

## Surface

```js
import { discoverPropositionEquivalence } from './src/perceiver/index.js';

const out = await discoverPropositionEquivalence(propositions, {
  embedder,        // must measure meaning (warm MiniLM); the hash organ holds all
  alpha: 0.01,     // derive the null online — or minSim: <n> for an explicit boundary
  emit, log,       // optional: write SYN / NUL / DEF-void into an append-only log
});
// → { live, pairs (same), held (open), opposed, classes, voided }
```

`propositions` are strings or any parsed shape carrying `clause`/`sentence`/`text` and an
optional `polarity` (and `id`, for emission). `attestEquivalenceFrom(vectors, polarities,
opts)` is the pure, synchronous core over already-embedded propositions;
`evaluatePropositionPair` is the EVA primitive on a single pair.

## What is next (not built here)

- **Wire polarity from the parse.** `propositionOfEdge` (core) already derives a sign;
  feeding it in turns the veto live on real text. (Note: the parser cuts `−` U+2212 while
  the proposition slot uses `-`; `propositionPolarity` is tolerant of both.)
- **A `same_as?` proposition void.** `asterisk.js` holds *entity* identity open as a
  first-class void on the graph; the proposition asterisk is currently returned in `held`
  but not yet projected as a void (that touches `projectGraph`, golden-sensitive — left
  for a deliberate, flagged step).
- **Fold the classes into the projection** so a downstream reader sees one referent
  proposition where the document said it twice — the same collapse `discoverEquivalences`
  drives for tones.

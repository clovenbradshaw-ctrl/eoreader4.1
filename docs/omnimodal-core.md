# The Omnimodal Core — two floors, one learning layer

Modality lives at the edges; the interior is universal. This note records the
shape (reshape rev 2) and exactly what has landed in the code so far.

## Two floors, not one

```
  MODALITY        INGESTION           EMERGENCE           MODALITY
  text  ┐                                                      ┌ speech
  audio ┤─ organs/in ─▶ [ unit stream ] ─▶ CORE ─▶ [ props ] ─┤─ organs/out
  vision┘   (ingest)     comparable+        discovers  triadic └ music/action
                         ordered            structure  minimum

           └ floor of ┘                └ floor of ┘
             INGESTION                    MEANING
```

- **Floor of ingestion — the bare unit.** Comparable (same/different) and ordered
  (there is a next), and nothing else. It carries no modality, no origin, no
  structure, so it cannot leak. This is the input membrane. → `src/core/unit.js`
  (`makeUnit`, `isUnit`, `sameUnit`, `streamDistance`, `unitStream`, `isOrdered`).
- **Floor of meaning — the proposition.** The triadic minimum: substrate,
  relation, differentia, and a polarity. It is the *first emergent product*,
  discovered by the core above the unit stream — never handed in by an organ.
  → `src/core/proposition.js` (`makeProposition`, `isProposition`,
  `propositionOfEdge`, `PROPOSITION_SLOTS`).

Both are frozen as contracts in `src/core/index.js`, the genome everything
depends on.

## Conventions = the core's learning layer (priors, not axioms)

The built-in reading knowledge is *inherited sediment* — the same substance,
format, slot, and defeasible status as what the DEF·EVA·REC loop deposits while
reading. So the ledger lives in the core, not in a sense organ:
`src/conventions/` → **`src/core/conventions/`**.

One store, two origins, one status:

- **Priors** (the seeds) enter with a pre-baked strain-history (`PRIOR_SUPPORT`):
  a head start in confidence, not an exemption from the loop.
- **Learned** conventions the loop deposits sit in the same slot with the same
  authority.

The DEF·EVA·REC verbs read *and revise* the ledger:

| verb | meaning | API |
| --- | --- | --- |
| DEF | hold a convention | `def` / `learn` (a held convention is learned sediment) |
| EVA | test against the stream → reinforce or strain | `eva(kind, token, holds)` |
| REC | revise / override (defeat, reinstate) | `rec`, `defeat`, `reinstate` |

When strain overtakes support, the convention is **defeated** and `has()` answers
false — a seed can lose, and a learned convention can beat an inherited one.
Construct with priors off (`createConventions({ seeds: false })`) or inherit an
earlier read's sediment (`createConventions({ inherit })`); both flow through the
parser via `parseText(text, { conventionsOpts })`.

### The three falsifiability tests (`tests/conventions-emergence.test.js`)

1. **Readable with priors OFF.** Turn the seeds off; the core still discovers
   entities and propositions from units alone — slower and worse (a copula/modifier
   leaks through as a relation), but it reads. The priors are not load-bearing
   structure.
2. **A seed can lose.** EVA breaks overtake a prior copula's pre-baked support;
   REC defeats it; the verb-guard consumer flips (`am` is no longer routed to DEF).
3. **Learned occupies the same slot.** A learned attribution verb has the same
   record shape as a seed, and a later document inherits it *as a prior* — exactly
   as it inherits the seeds — and it stays revisable.

## What landed vs. what is gated

Golden parity on text is the rail: the existing suite (now 734 tests) must stay
byte-identical green, and it does.

- **Landed:** the bare-unit and proposition contracts; the learning layer moved
  into the core with priors/defeasibility/inheritance and the DEF·EVA·REC API;
  the injectable conventions path; the falsifiability tests; the `ingest/` →
  `organs/in/`, `organs/out/` rename; and **the core's own vocabulary** — the
  genome (`src/core/`) now measures reach in `streamDistance` (units) and never
  says "sentence." It speaks units, propositions, boundaries, and segments — terms
  that hold whether the stream came from the text, audio, or vision organ. Where
  the word survives in the core it is a *tombstone*: `unit.js` and `project.js`
  name "sentence" only to mark it OUT — "a learned text convention, not a core
  primitive" — so a future hand does not quietly reintroduce it.
- **Gated (future work, behind golden parity):** thinning `organs/in/text` to a
  pure mark-ingester; carrying the same `doc.sentences` / "per sentence" →
  unit/proposition stream-distance replacement OUTWARD across the ~70 downstream
  files that still count sentences (the text organ legitimately keeps the word —
  "sentence" is fine BELOW the membrane, in `perceiver/parse/`, where the modality
  is already known; it is only the modality-blind interior that must not assume
  it); moving `read/surf` → `core/surfer`. These are mechanical, high-fan-out
  moves the proposal explicitly gates behind byte-identical text parity, so they
  are staged separately rather than risked in the same pass that establishes the
  contracts.

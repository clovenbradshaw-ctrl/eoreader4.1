# NUL — the ninth cell: hold the uncohered

> Why we "did not have a NUL", what it is, and why the hedging failure was a NUL-shaped
> situation with no NUL to render. This closes the operator cube's ACT face — eight cells
> were built on ρ (exp-0003…0008); NUL was the one left, because it is the operator that
> does the least, and you cannot score "did nothing, correctly" with an F1.

## What NUL is (from `core/operators.js`)

NUL is **Differentiate × Existence**, `hold (non-transformation)`. The vocabulary is careful:
"NUL is non-transformation — it holds a thing as-is. It is NOT 'clearing': voiding a fact is
a DEF to VOID (an assertion), never a NUL." Three states, kept distinct:

- **SYN** — the material *coheres* → assert the structure.
- **VOID** — the material is *determinately absent* → assert the hole. A positive claim of absence.
- **NUL** — the material is *present but does not cohere* → hold it, assert nothing.

NUL is the anti-confabulation of the *other* direction. The grounding floor stops us
over-asserting structure that is not there; NUL stops us silently *erasing* material that is
there but does not resolve. It is the honest "seen, unresolved."

## Why it was unbuilt

1. **It is the identity element — the no-op.** Every other cell is a positive act (SEG cuts,
   DEF counts, SIG assigns, CON bonds, EVA reinforces, INS/SYN/REC birth/merge/carry). NUL
   transforms nothing; it is what is left when nothing else fires.
2. **It was already implicit.** `voidnull.js` already says: "SYN fires when the structure beats
   the noise null; NUL holds it and VOID asserts absence when it does not." Every abstention —
   `deriveNull → Infinity`, `DEF` abstaining, `SEG` empty — *is* a NUL. It just
   had no name, because it is the default the other eight fall back to.
3. **You cannot test it like the others.** Their experiments score a positive signal (boundary
   F1, birth count, defeat timing). NUL's "output" is correctly holding non-structure — no
   positive signal to score.

## The dolphin connection — the hedging was NUL with no NUL

A real export (two Wikipedia pages) came out as "strange, hedging, not an essay." The
projection had collapsed the edge weights to ~0 (fixed in `born-edge-weight.md`), so the
ground was **present but uncohered** — real lines, no assertable structure. The honest move
for that is NUL: *"I have these sources; they do not resolve into an answer."* Lacking a NUL,
the loop degraded into a smear of void-band hedging. The failure was a NUL-shaped situation
with no NUL to render. So NUL is not just cube-completion; it fixes a live failure mode.

## What was built

**The operator** (`core/spectral.js` → `NUL`). One NUL, on ρ: the credence hold —
`NUL(reserve, unit)` folds a novel/ambiguous unit into a reserve at **weight 0**, the
additive identity, so holding it leaves the standing readings *exactly* unchanged instead of
dragging them off true (exp-0009: a NUL reader keeps A/B/C clean at 98/97/95%, where a
*forcing* reader collapses them to one corrupted blob). NUL ≠ VOID: the reserve is lossless
and recoverable (INS lifts it once it coheres). This is the ninth cell; the generation and
projection uses below are the **same operator run forward** — hold the uncohered rather than
force it — not a second NUL.

**The projection surfaces it** (`core/project.js`). Under a Born floor (`edge_floor: 'born'`),
the edges below the line are no longer dropped — they are returned as `held`. Every edge is
now either `edges` (cohered) or `held` (uncohered); with no floor, `held` is empty and nothing
changes. Holds the uncohered instead of erasing it.

**The generation gate — NUL at the answer grain** (`longgen/nul.js` → `nulGate`, on by
default). Before the walk, read the ground's own coherence. The Born measure of "does this
field cohere" is the
**participation ratio** — `(Σw)² / Σw²`, the effective number of items carrying weight:
degenerate (one live, rest ~0) → ~1; a usable spread of N real scores → ~N. (A noise-null
"stand-out" test is wrong here: a smooth spread of real scores has nothing standing above the
bulk, so it would read as all-held — participation is the honest concentration read the
significance column already uses.) Below ~1.5 effective items the field is uncohered and the
response is a single NUL atom — "I read N sources, but they do not cohere into an answer" —
citing nothing, because there is nothing grounded to cite. Conservative: it needs ≥ 8 spans
(so it is a measurement, not a cold start) and never fires on a cohered walk or a small ground.

## The three-way, complete

| the material | the operator | the response |
|---|---|---|
| coheres into structure | **SYN** | assert it |
| determinately absent | **VOID** | assert the hole ("held open") |
| present, does not cohere | **NUL** | hold it, assert nothing ("held, unresolved") |

The cube's ACT face is now complete: NUL fills the last cell, and it does so by being the
honest floor on *both* over-assertion and silent erasure.

## Files

- the operator: `src/core/spectral.js` (`NUL`), locked by `tests/hold.test.js`
- the projection: `src/core/project.js` (`held`)
- the generation gate: `src/longgen/nul.js` (`nulGate`, `participationRatio`)
- tests: `tests/nul.test.js`

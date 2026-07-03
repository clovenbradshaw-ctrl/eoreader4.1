# Holonic confinement — the token's GPS coordinate

> The question this sorts out. A single token in an essay is, at once, the thing that
> makes the essay possible (the low sets the possibility for the high) and a thing whose
> identity is fixed by every whole above it (the high sets the probabilities for the low).
> The renderer, left alone, can emit anything in the vocabulary — it can hallucinate
> anything at all. We do not want a bigger vocabulary or a freer draw. We want the
> possibility space **confined**, at each position, to exactly the tokens that would
> discharge *what this token is for at this place* in the essay. That confinement is not
> one constraint. It is a **stack of nested wholes activated simultaneously**, and the
> token is drawn from their intersection. This doc names the stack, maps it to the machine
> we already have, and marks what is not yet wired.

## The biological shape (why this is the right model)

Every cell in your toe and every cell in your cortex carries the **same genome**. What
differs is **expression**: each cell reads its position — morphogen gradients, Hox
coordinates, the chemistry of its neighbours — and folds exactly the proteins that
position calls for. The genome is universal; the *coordinate* is what selects, from all it
could be, what it is here. A cell that mis-reads its coordinate and expresses the wrong
program is a tumor or a birth defect — a **mis-fold**.

The renderer is the genome: one model, the whole vocabulary available at every position,
"able to say anything." The **holonic address of the cursor** is the morphogen gradient —
the positional identity that says *which* of everything-sayable is sayable **here**. A
confabulation is a mis-fold: a token expressed against its coordinate. We are not trying to
make the model know more. We are trying to give each position its coordinate, and confine
expression to it — the same move development uses to get a trillion identical genomes to
build an organism.

## The address is already in the engine: `operator(Site, Stance)`

The engine already assigns every event a three-face address (`core/address.js`,
`core/cube.js`) — the coordinate we need is not new, it is unused at the token grain:

- **ACT** = (Mode × Domain) — the **operator**, which of the nine moves fires.
- **SITE** = (Domain × Grain) — the **terrain**: *Void, Entity, Kind, Field, Link, Network,
  Atmosphere, Lens, Paradigm*. Where the move lands — which referents, at which grain.
- **RESOLUTION** = (Mode × Grain) — the **stance**: *Clearing, Dissecting, Unraveling,
  Tending, Binding, Tracing, Cultivating, Making, Composing*. How it resolves — the surface
  shape. (Resolution is our word for the Stance face.)

`eoAddressOfEvent(event)` returns exactly this triple. It is the token's GPS coordinate. A
`CON` at a `Link` terrain in a `Binding` stance is a different fold than a `VOID` at a
`Void` terrain in a `Cultivating` stance — different admissible tokens, because the address
is different, even though the genome (the model) is identical.

## The stack of nested wholes (each one narrows the draw)

From the widest whole to the position itself. Each level is a projection onto the logit
space; the token is drawn from their **product** (the composition, below). Read top-down
this is "the high sets the probabilities for the low"; read bottom-up, each token is what
lets the level above it exist at all.

| # | whole | what it confines | the coordinate it reads | in the machine |
|---|---|---|---|---|
| 0 | **the genome** | nothing — all tokens live here | — | the base model |
| 1 | **the field** (essay/song/document) | the vocabulary universe & register | the density field ρ, the fold | `longgen/field.js`, `foldConversation` |
| 2 | **the arc phase** (open/develop/land) | term-setting vs testing vs closing language | `shape.js` phase | `longgen/shape.js` |
| 3 | **the operator** (ACT) | the move's verb-register (assert/evaluate/restructure…) | `address.act` | **not projected to logits** |
| 4 | **the site** (SITE / terrain) | *which* figures, spans, entities are admissible | `address.site`, the ground | lens-port `relevance` + entity trie (partial) |
| 5 | **the stance** (RESOLUTION) | *how* it resolves — the surface shape, firm vs hedged vs closing | `address.resolution` | **not projected to logits** |
| 6 | **the position** in the sentence | grammar-forced vs content-choice-point | the entropy gate g(H_t) | lens-port `entropyGate` |
| 7 | **the grounding floor** | no name/number the ground does not hold | the void trie, numeral gate | lens-port `void` (built, hard) |

The token that is finally sampled is the one surviving **all seven at once** — the
intersection. That is the "multiple holonic levels activated at the same time": not a
pipeline that decides the token in stages, but a set of simultaneous confinements whose
overlap is a narrow, correct region of the vocabulary.

## The organ that applies it: the lens-port

`write/lens-port.js` is the organ — a `LogitProcessor` that confines the draw:

```
bias(token, t) = g(H_t) · [ λ·personality(token) + μ·relevance(token | site) ] + void(token)
```

- `g(H_t)` — level 6. At low entropy (grammar) the gate closes: do not perturb the fold the
  syntax requires. At high entropy (a content choice point) it opens: here the address should
  decide. A conscience that does not relax at the confident positions — the void term sits
  *outside* the gate.
- `μ·relevance` — part of level 4. Up-weights the figures the site made salient (a Born
  distribution over labels).
- `void` — level 7. Hard −∞ on ungrounded numerals; an entity trie that, once a grounded
  name opens, admits only its grounded continuations. "The invented name made unsayable." A
  mis-fold, forbidden at the chemistry.
- `λ·personality` — the voice (the Horizon's ρ-departure).

So the organ exists and already discharges levels 1 (via relevance), 4 (partly), 6, and 7.
**Levels 3 and 5 — the operator and the stance — are computed by the planner and then
dropped before the logits.** The renderer is told *what proposition* to say (a good prompt)
and is stopped from inventing facts (the void), but it is **not confined to the operator's
register or the stance's surface shape at the token grain.** The `CON`/`Binding` fold and
the `REC`/`Unraveling` fold reach the model as the same free draw, distinguished only by the
prompt's phrasing. That is the gap: the address is diagonal and complete in the engine, and
half of it never crosses into the port.

## What confinement composes to (the missing projection)

The piece that is missing is not a new organ. It is the **projection from the address to the
port's configuration** — the function that reads a cursor's GPS coordinate and emits the
morphogen gradient that confines it. Concretely, given `operator(Site, Stance)` plus the
phase and the field, produce:

- **register** (from the **stance**): *Making/Binding* → a firm assertive register; *Cultivating*
  / a void band → hedged, hold-open, forbid the assertive close; *Dissecting/Unraveling* →
  decompositional connectives; *Composing* → closing/summative connectives. The stance selects
  which surface *shape* is admissible, as a soft bias over register-bearing tokens and a hard
  mask on the ones the stance forbids (a hedge must not harden into a claim).
- **figures** (from the **site/terrain**): the referents incident at this terrain become the
  relevance up-weights; the entity trie is seeded from exactly them, so only *these* grounded
  names may open here.
- **openness** (from the **operator × phase**): how far up the entropy the address may reach —
  an `INS` minting a new figure opens wider than a `NUL` holding a degenerate line.
- **floor** (always): the void flags on, unconditionally — the one level no address relaxes.

This is `holonicConfinement(address, context)` → a confinement spec, and
`toLensConfig(confinement, conceptMap)` → the port's `configure()` payload. It is pure and
testable **without a live model** (the composition logic is real: a void stance *must* mask
the assertive close; the site's figures *must* become the relevance map; the floor is *always*
on), and it drives real logits the moment a `propose`/LogitProcessor backend is present
(WebLLM registers the port today). The echo path has no logits, so the confinement is computed
and recorded per atom — the loop now *knows* each position's coordinate — and applied when a
real model renders.

## Where this meets the field read

Level 1 — the field — is the work just built (`generation-by-field-reading.md`). The density
field ρ is the widest morphogen: it is *the whole* reading its own geography and setting the
register every lower level narrows. The field's **turn** (a paradigm boundary) is the moment
the arc changes the operator (a REC), which changes the stance (to *Unraveling*), which
changes the admissible tokens. So the levels are not independent knobs — a turn at level 1
propagates *down* the stack to the token, exactly as a morphogen gradient shift re-specifies a
cell's fold. The field read is the top of the stack this doc completes downward.

## The one-line version

The model is the genome — it can express anything. The essay does not want anything; it wants
*this* token, here, to discharge this operator at this site in this stance within this phase of
this field, and to touch no fact the ground does not hold. Give every position its coordinate
and confine expression to it — the same trick a body uses to fold one genome into a toe and a
cortex. We have the coordinate (`operator(Site, Stance)`) and the organ (the lens-port). What
is missing is the projection between them, for the two faces — operator and stance — that the
port does not yet read.

## Files

- the coordinate: `src/core/address.js` (`eoAddressOfEvent`), `src/core/cube.js` (stances, terrains)
- the organ: `src/write/lens-port.js` (the LogitProcessor), `src/write/concept-tokens.js`
- the projection (this doc's build): `src/longgen/confine.js`
- the field (level 1): `src/longgen/field.js`, `docs/generation-by-field-reading.md`

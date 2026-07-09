# The cognition catalog — what falls out of the graph for free

Metacognition, analogy, metaphor, irony, schema: the named higher-order
cognitions read as **operators, or ordered pairs of operators, over the log the
reading already keeps** — plus one verdict wherever a tension coordinate is
present. None of them needs the talker to exist. The talker phrases and ranks
what structure surfaced ("thinking needs no model" — `src/reason/walk.js`);
everything the reading generates about its own reading rides the reafferent
firewall (band void, `canWitness` false) and can never witness world.

This catalog names the capabilities, seats each at its cell, grounds each seat
in the code that already computes its parts, and carries the epistemic tier of
every claim. The two cross-cutting classifiers it motivates are implemented in
`src/fold/verdict.js`.

## The enumeration principle

A capability is an operator, or an ordered pair of operators, read off the
graph, carrying a sustain-or-collapse verdict wherever a tension coordinate is
present.

Completeness is structural, not enumerative. The ACT face is Mode × Domain,
nine cells, closed by construction (`docs/operators.md`). The composition grid
is nine operators composed with nine, 81 ordered pairs, closed by construction.
There is no tenth operator to find and no 82nd compound. That closure is the
completeness claim.

What is *not* closed is the assignment. Placing analogy at one cell and
metaphor at another projects a phenomenology onto the grid and — like every
projection — drops a dimension ("a projection loses a dimension, so mark it as
a sketch" — `docs/chorus.md`). The frame is complete; the map onto it is a
projection sketch. The tiers are kept separately at the end of this document.

## Provenance discipline

Three tiers govern every claim below, and the doc marks the second wherever it
leans on it:

- **Repo-grounded** — attested in this checkout; cited by file.
- **External-wiki** — attested only in the EO wiki (the corpus behind
  `data/phasepost-cells.json`, which its own provenance note calls "EO wiki
  classification tables … unfetchable Drive folder"). Claims at this tier:
  the Bivalent-Compression article and its DEF gloss; Aufhebung/sublation *as
  names*; 2^√2 and the "emergence coordinate"; the "√2 has no address"
  phrasing; the verb-corpus size. In-repo, √2 is exactly one thing: the
  Pattern grain, "the diagonal relation between grounds and figures,
  irreducible to either" (`docs/cube.md`).
- **Projection sketch** — an assignment of a named human cognition to a cell.

## The gate, settled: DEF fixes; EVA holds

The one crux the catalog rests on — whether the tension coordinate sits at EVA
(Act-face reading) or at DEF (the external Bivalent gloss) — is settled
**Act-face**, on three independent lines:

1. **This checkout is unanimous.** No DEF-holds-contradiction text exists here.
   DEF is assert/define across all three of its grain-cells
   (`data/phasepost-cells.json`): `sets-terms` at Ground, `holds-as-true` at
   Figure, `upholds` at Pattern — the Pattern-grain "is held even as it
   cracks" holds a *frame* under strain, never a contradiction. "Bivalent
   compression" in-repo names argmax (`docs/chorus.md`), not DEF.
2. **The migration is documented.** The wiki's import-time alias table is kept
   at `src/fold/substrate.js`: `SUP → eo:EVA, ALT → eo:DEF` ("the corpus is
   never renamed"). Under the old names the semantics are transparent — an
   *alternation* is a bivalent slot, two candidates, one stored winner; a
   *superposition* is both-at-once. Holding-two migrated to EVA by name; an
   external article still speaking "alternation" sits on the stale side.
3. **The running code has voted.** When the same referent is DEF'd to two
   distinct values, `detectTensions` (`src/fold/substrate.js`) does not let
   DEF hold the contradiction — it mints a separate `eo:Tension` and stamps
   each DEF `heldBy`. Holding is a different node type by construction.

The dissolution: the two glosses differ along this catalog's own live/dead
axis. The Act face describes DEF's *act* (fix a value, frame intact); the
external gloss describes DEF's *dead product* — where a spent tension is
stored. "Holds contradiction" as the grave holds, not as the hand holds. An
operator confused with its own dead form, not a contradiction between sources.

## The nine primitives

The ACT face crosses Mode (Differentiate, Relate, Generate) with Domain
(Existence, Structure, Significance/Interpretation) — `docs/operators.md`:

| Mode | Existence | Structure | Significance |
| --- | --- | --- | --- |
| Differentiate | NUL (absence) | SEG (boundary) | DEF (definition) |
| Relate | SIG (noticing) | CON (co-presence) | EVA (held judgment) |
| Generate | INS (instance) | SYN (synthesis) | REC (reframing) |

Walked by mode, because that is where the live/dead line has graded bite:
Differentiating closes and leans dead, Relating holds two and is where the
line is sharpest, Generating reframes. Every operation that parks a tension
can spend it (collapse, dead) or hold it (sustain, live); the verdict
machinery is the section after this one.

### Differentiate — fix a value, draw a cut

**NUL — recognize absence.** Dead: a gap logged as noise. Live: *conspicuous*
absence — a schema role the instance lacks — which is question-generation and
the felt hole. Already computed: voids are first-class carved absences
(`src/core/project.js`, `src/core/voidnull.js`). Missing: schema roles (needs
SYN's live form first), so this cell is downstream, not first.

**SEG — draw a boundary.** Dead: a routine cut consumed at parse. Live: a cut
that will not settle — one surface label occupying two incompatible roles —
which is polysemy and ambiguity detection. Already computed *for entities*:
the identity asterisk (`sameAs?`/`splits`, `src/perceiver/parse/asterisk.js`)
is exactly one-surface-two-roles held open, down to the discriminators.
Missing: the word-grain version — two WL colours (`wlColors`,
`src/fold/weave.js`) on one string.

**DEF — establish what holds.** Fix a value, frame intact. Dead: sedimented
definition — the categorization you no longer notice, a dead metaphor's
lexical entry. Live: *contested* — and on the Act-face reading DEF has no live
form of its own; its liveness is an EVA collapsing into it, which is exactly
how the code renders it (`detectTensions` competing-fills mints the EVA-side
node over the two DEFs). Cognitions seated here: plain definition, correction,
judgment-that-holds — and **analogy's closure** (below). Missing: analogy's
transferred predicate is not yet emitted as a DEF.

### Relate — hold two

**SIG — register difference.** Dead: a signal logged and passed. Live:
*sustained* salience — the node that stays far from the running prior — which
is surprise and pop-out. (Davidson's metaphor-as-mere-prompt is metaphor
stripped to pure SIG, the grounding disowned.) Already computed: Born-gated
salience (`src/surfer/salience.js`), KL surprise (`src/core/surprise.js`), the
γ-decayed semantic prior (`src/enact/meaning.js`). Missing: only the
persistence read — distance *sustained* across a cursor window.

**CON — connect across a boundary.** Dead: echo as restatement, the
connection consumed ("you said this already"). Live: *unresolved resonance* —
the echo the reading keeps returning to. Already computed as two halves:
Born-gated echo (`connect`, `src/fold/weave.js`) and recurring-focus
(`detectPatterns`, same file). Missing: only their join.

**EVA — render judgment.** Two descriptions at two levels, both in-repo and
deliberately not fused: the *loop* EVA "tests a particular against a frame …
confirm or strain" (`docs/significance-loop.md`), and the *render* EVA-site —
"two incompatible cells both carrying high mass … held side by side,
unresolved — productive ambiguity, not an error to reconcile"
(`src/chorus/render.js`). Dead: the tension spent — see the verdict section
for the two distinct deaths. Live: irony, paradox, productive ambiguity — held
because the holding is productive. Already computed: `eo:Tension` is minted
`resolved: false` and **nothing in this codebase ever spends one** — the
substrate deliberately `(refuse)`s to resolve; sustain is the architectural
default. Missing: the death certificate — the successor-mode verdict, built in
`src/fold/verdict.js`.

### Generate — reframe, synthesize

**INS — create an instance.** Dead: a token slotted routinely. Live: the
*telling* instance — the case that becomes paradigmatic. Already computed by
construction: leader clustering (`src/arc/cluster.js`) seeds every category
from its first member — the leader *is* the founding exemplar. Missing: only
surfacing it as a node.

**SYN — merge into an emergent whole.** Dead: a stored aggregate, a summary
consumed. Live: schema, abstraction, category-formation — the shared skeleton
of two or more analogies read as a category. Already computed: pairwise φ
mappings (`analogize`, `src/fold/weave.js`). Missing: intersecting two φ's.
Once schema exists, **reversal** is nearly free: the same topology with one
edge polarity flipped, visible because edge keys carry polarity
(`edgeSet`, same file).

**REC — change the frame.** The corpus's own verbs: REC *restructures* a
frame, *resets* it, is the *basis transform* — and equally REC **revises** on
defeat (`src/core/spectral.js`, `docs/frame-holon.md`). (Correction to the
source catalog: "re-categorizes *rather than* revises" contradicts the
corpus's usage; the Kuhnian point — frame-replacement, not amendment-within-
frame — survives under the corpus's own word.) Dead: the dead metaphor, REC
sedimented to a background DEF. Live: the living metaphor, aspect-dawning,
paradigm-transfer. Already computed: located RECs as `eo:Reframing` nodes
(`alongAxis`, `trigger`); `bears-on` connections already link reflections to
reframings. Missing, and precise: the **residual** — the unmatched source
edges left after alignment, metaphor's feedstock — is computed *and discarded*
inside `preservedCount` (`src/fold/weave.js`); it needs exposing. Then the
assembly: a sustained Tension followed by a Reframing along the same axis.

## The compound layer — bigrams over the operator stream

The 81 ordered pairs are not hypothetical machinery: they are the bigram
alphabet of a read the code already performs. `src/predict/recurrence.js`
estimates an n-gram over the move alphabet and names its own target — "the
DEF→EVA→EVA→REC cycle, the INS→SIG run … recurrences in the operator stream."
Detecting a compound is naming a cell in a stream already folded.

Two compounds are canonically named (the *names* are external-wiki; the
structural contrast is in-repo at `docs/chorus.md`):

- **Sublation — EVA→SYN.** The held contradiction consumed by synthesis into a
  minted higher unity. Generated and spent.
- **Productive ambiguity — EVA→EVA.** Evaluation held unresolved because
  unresolved is productive. The render draws it and refuses to collapse it.

### The verdict is the successor's Mode

`src/core/spectral.js` (applyStance) sorts the nine stances into the three
Modes read as operations on ρ:

> Differentiate — SHARPEN: project, dephase, decompose. Lower entropy or
> remove a component.
> Relate — SPECTRUM-PRESERVING: identity, rotation, transport.
> Generate — PRODUCE: raise the floor, mint a direction, build a basis.
> Raise rank or entropy.

Read against a held tension, that table *is* the sustain-or-collapse verdict —
and it is ternary, not binary:

- **Relate-close → sustained.** The spectrum is preserved; the tension
  coordinate survives. Live.
- **Differentiate-close → spent-down.** Projected away; one side kept, entropy
  falls, nothing minted. Dead, stored.
- **Generate-close → spent-up.** Consumed into a new whole or frame; rank
  rises. Dead as a tension, alive as something else.

So the verdict is not new machinery: it is the mode of the next operator to
touch the tension — a projection of the bigram, checkable in ρ by the sign of
the entropy change. `src/fold/verdict.js` implements the symbolic read.

This re-seats one cell of the source catalog. **Sarcasm is EVA→DEF, not
EVA→SYN**: "take the meant, discard the said" keeps an existing component and
drops the other — a projection (Dissecting; entropy down; nothing new). EVA→SYN
remains sublation proper: both sides preserved-and-lifted into a minted third.
Two different deaths — select-collapse and merge-collapse. An honest seam
rides this correction and is flagged rather than silently resolved:
`docs/chorus.md` says "Collapse is SYN" while the collapse it avoids (argmax)
is a projection in spectral's own algebra — the same select/merge looseness,
in the corpus itself.

### The EVA row — the nine fates of a contradiction

A tension is a held EVA, so the EVA row of the grid enumerates everything that
can happen to a contradiction, one fate per successor. Each is a detectable
bigram off the log, each carries the ternary verdict, and the named cognitions
land as row entries (all assignments: projection sketch):

| EVA→ | fate | verdict |
| --- | --- | --- |
| SIG | **flagged** — noted and passed | sustained |
| CON | **juxtaposed** — "both have a point," related unresolved | sustained |
| EVA | **irony** — held because the holding is productive | sustained |
| NUL | **aporia** — the question dropped, walked away from | spent-down |
| SEG | **disambiguated** — dissolved by finding two referents | spent-down |
| DEF | **sarcasm** — pick a side, discard the other | spent-down |
| INS | **experiment** — resolved by producing a test case | spent-up |
| SYN | **sublation** — unified into a minted third | spent-up |
| REC | **metaphor** — spent upward into a new frame | spent-up |

The three Differentiate closes differ in flavor — DEF stores a winner, SEG
re-cuts the referent, NUL drops the question — but the verdict class is the
same: the tension coordinate is gone. The fate name carries the flavor.

And the career of metaphor (Bowdle–Gentner) becomes a literal trajectory in
the same coordinates: first encounter runs Structure machinery (processed as
analogy), repetition composes a REC into a standing frame (rank up), later
encounters are DEF-within-that-frame, death is the REC sedimented to
background (entropy decays to a pure state — a plain lexical DEF you no longer
notice). Observable from one reader's own log across re-encounters
(`src/enact/` replay); no external corpus required for the *shape*, only for
the statistics.

## Analogy and metaphor, seated

**Analogy — Structure machinery closing at DEF** (≈ SYN→DEF). SEG two domains,
CON their correspondences, SYN the shared skeleton, DEF what holds. Frame
intact, roughly symmetric, paraphrasable — its content *is* the enumerable
correspondences. Already computed end-to-end except the last step:
`analogize` (`src/fold/weave.js`) builds the label-abstracted WL role
signatures, maps by relations with Gentner's systematicity gate, and emits the
correspondences as CON bonds. The DEF closure (the transferred predicate) is
the missing emission.

**Metaphor — sustained EVA completing in REC** (EVA→REC). The tensional copula:
literal-false and figural-true held together (the sustained EVA), then the
tenor apprehended *through* the vehicle's paradigm (the REC). Asymmetric —
REC has a direction; tenor through vehicle, never the reverse. Unparaphrasable
because its content includes the frame-change itself, and the in-repo
compression law says what prose does to that: "Model output is a compression,
structure narrated into prose with the coordinate lost, invisibly. A fold is a
projection, addressed and recoverable" (`docs/chorus.md`). Paraphrase of a
live metaphor is that compression; the felt remainder is the lost coordinate.
Analogy survives paraphrase because nothing is parked off the correspondence
plane. (The 2^√2 / "emergence coordinate" formulation of this asymmetry is
external-wiki; the prose-vs-fold law above is the repo's own form of it.)

**Irony** — EVA→EVA, productive ambiguity under another name; its collapse
into sarcasm is EVA→DEF (re-seated above). **Schema** — two analogies sharing
a skeleton, the shared core read as a category (SYN closing on SYN).
**Reversal** — a schema match with one polarity flipped. The remaining cells
of the 81 are open; most have no named cognition, and that is the honest
state, not a gap to fill by invention.

## The two cross-cutting classifiers

These are the metacognition proper — the reader reading its own acts — and
both are implemented in `src/fold/verdict.js` as pure reads.

**Living or dead** (`classifyTensions`). For every held tension: scan the
subsequent operator stream for touches on the tension's referents, take the
mode of each toucher, and report the trajectory plus the current verdict —
sustained when nothing has touched it (the substrate default: tensions are
born `resolved: false` and nothing ever spends one), the last toucher's
verdict otherwise, with the EVA-row fate name. Standing-strain
(`src/fold/weave.js`) is the one-operation special case of this read; the
verdict generalizes it to every operation. It reads the *enacted* register,
which the surprise loop populates regardless of parser sparsity — so this
classifier is not parser-gated.

**Verbalizable or narrate-only** (`sayability`, `routeSubstrate`). Reads
whether an apprehension parks a coordinate prose cannot address, straight off
the operator signature every substrate node already carries (`op`, `band`,
`witness`, `heldBy`, `verdict`): a Reframing or a still-held tension or a
straining EVA → narrate-only, hand it to the phraser marked; a flat DEF, CON,
or settled EVA → verbalizes without loss. An assertion claimed by a tension
(`heldBy`) routes narrate-only — which is the membrane's existing rule ("voice
the tension instead of asserting either side," `src/fold/substrate.js`)
generalized from one node kind to all of them. Note the line is drawn by the
operator signature, not by band: an analogy connection is void *and*
verbalizable (its content is the correspondences); a reframing is narrate-only
however it is banded. This routes the tiny model: the reader knowing which of
its own thoughts are sayable before it opens its mouth.

## The empty cells — a principled absence family

Correction to the source catalog, which named one empty cell: the registry
proves **four**, and they are all at pure Ground grain
(`tests/classify.test.js`, `data/phasepost-cells.json`):
`NUL_Clearing_Void`, `SEG_Clearing_Field`, `SYN_Cultivating_Field`,
`REC_Cultivating_Atmosphere` — plus **DESERT** = SYN(Making, Field), the
off-diagonal flagship carrying the corpus finding "NO verbs in any language,"
kept as positive evidence for the framework (a classifier routing there is
treated as a misfire and demoted).

Two of these carry the catalog's philosophical weight as row data, not
aside: `SYN_Cultivating_Field` — synthesis always borrows its relations; there
is no whole from pure ground — and `REC_Cultivating_Atmosphere` — **there is
no metaphor from pure Ground**. Metaphor borrows the vehicle's paradigm; that
borrowing is what keeps it out of the empty cell. Generation from nothing has
no operator; contemplative traditions report the same void from the other
side.

## Organ and build order

**Meaning-organ-native — fires on real prose now:** SIG salience, CON
content-echo, the detection half of EVA. These ride embedding distance and
Born-gated cosine (`attestEquivalenceFrom`), independent of the parser. The
successor-mode verdict also sits here in practice: it reads the enacted
stream.

**Parser-gated — recall bounded by relation extraction:** SEG word-grain
ambiguity, CON typed-correspondence, DEF analogy-closure, SYN schema, REC
residual, NUL question (needs schema). The whole Structure column and every
compound whose touches are depicted-side live here. On real documents the
parser is sparse, and the repo already names the felt decision: strict WL
matching is a floor, not a ceiling (`docs/nested-loops-deep-reading.md`) —
the graded-matching lever (largest consistent partial mapping) is the
documented next step when recall is measured and found wanting.

## Epistemic tiers

**Repo-grounded:** the nine-cell ACT face and its glosses; the composition
grid as the bigram alphabet of an existing read; the ternary verdict's ρ
grounding (mode families); productive ambiguity as the render's held EVA-site;
collapse-avoidance as the chorus discipline; the empty-cell family and DESERT;
√2 as the Pattern grain; the prose-vs-fold compression law; the reafferent
firewall on every self-generated node.

**External-wiki:** sublation/Aufhebung as *names* for EVA→SYN; the
Bivalent-Compression article and its DEF gloss (settled against, above);
2^√2, the emergence coordinate, "√2 has no address"; the verb-corpus size.

**Projection sketch:** every assignment of a named human cognition to a cell
(analogy, metaphor, irony, sarcasm, schema, reversal, salience, question,
echo, exemplar, and the nine EVA-row fates); the claim that all nine operators
carry a meaningful live/dead distinction; the classifiers computing as clean
reads rather than gradients.

**Untested:** whether the parser-gated capabilities fire on real prose at
usable recall (measure with the eval battery); whether a single reader's log
yields an observable Significance trajectory across re-encounters (probe with
`src/enact/` replay).

## Falsifiers

- A cognition central to reading that lands in no cell, or that forces a tenth
  operator, breaks the ACT-face completeness claim.
- A living, generative apprehension that provably carries no lost coordinate —
  it reframes yet verbalizes without loss — breaks the narrate-only classifier
  and the metaphor-equals-REC identification. Operationalized: hunt for
  high-domain-distance pairings ("loud shirt") with no REC in the enacted log
  and lossless verbalization; if pure sensory transfer is irreducible yet
  frame-preserving, there is residue.
- An analogy carrying irreducible remainder while doing no frame-change breaks
  the analogy-as-frame-conserving claim: it would mean the correspondence
  plane can park a coordinate, which the seating denies.
- A robust live form of DEF *in this corpus* — a DEF that sustains a tension
  rather than being the stored side of one — reopens the gate settled above
  and re-seats the Relating column.
- Ambiguity (SEG live) turning out to need meaning rather than structure to
  detect moves it off the Structure column.
- A tension whose successor-mode verdict disagrees in sign with the measured
  ΔS of the corresponding ρ move breaks the ternary's spectral grounding.

## Seams, kept honest

- The select/merge looseness: "Collapse is SYN" (`docs/chorus.md`) vs argmax
  as a Differentiate projection (`src/core/spectral.js`). This catalog uses
  the spectral algebra (two distinct deaths); the chorus phrasing is the seam.
- The verdict currently reads touches by referent-key overlap — normalized
  ids and labels. That is a floor; coreference-grade touch detection would
  ride the same machinery the parser already has.
- `applyStance` is keyed by Mode × grain (stances), not by the nine ACT
  operators; the verdict maps operator → mode and leans on the mode families
  only. The finer stance-level check (which *primitive* closed the tension) is
  unbuilt.
- The Significance trajectory's sedimentation half — the reframe re-weighting
  what came before — is the flagged next deepening of the enacted loop
  (`docs/significance-loop.md`); this catalog observes the trajectory and does
  not build the re-weighting.

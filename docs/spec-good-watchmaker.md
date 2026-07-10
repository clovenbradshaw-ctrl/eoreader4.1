# spec-good-watchmaker.md — renaming the holons by spelling them on all three faces

> **Implementation status (this PR — migration step 1 of §8, "Print the faces"):**
> the pipeline's 17 stages are now spelled on all three faces. `src/turn/stage-faces.js`
> encodes §5's table, derives each stage's coherent `operator(Site, Stance)` through the
> repo's own `notate()` / coherence guard, and reports which §5 spellings are off-diagonal
> (the step-2 census). `src/turn/pipeline.js` attaches the spelling (`eo` + `faces`) to every
> emitted audit step, so it rides the JSONL trail; `src/audit/eot-terminal.js` prints each
> operation's face beside its label in the live trace. `tests/stage-faces.test.js` holds the
> conformance. **A finding worth flagging:** run through the repo's own cube, 13 of the 17 §5
> stage spellings are *off the diagonal* (e.g. `EVA(Lens, Dissecting)` — EVA is Relate-mode,
> Dissecting is a Differentiate stance). Only `reason`, `llm`, `bind`, `revise` were spelled
> coherently. That divergence is exactly the incoherence this step exists to make visible;
> the module prints the coherent face and preserves §5's wording verbatim as the census.
> Steps 2–8 (contracts, twin-merges, floor-shrink, column-folds, one writer, atlases, freeze)
> remain proposed.

> Status: proposal · measured against `main` @ `9709c19` (2026-07-09, 35 top-level
> holons, ~85k lines under `src/`, 17 pipeline stages). Canonical notation
> throughout is the repo's own: `operator(Site, Stance)` per `core/faces.js`
> `notate()` — e.g. `CON(Link, Binding)` — with holonic targets woven in per
> `notateHolon()`: `CON(claims.c014@Link, Binding)`.

---

## 0. Motivation — the bestiary is a face disease

MIGRATION-POINTER.md opens with Koestler's two watchmakers and claims 4.1 is
assembled the Hora way. The accretion since has broken the claim, and the
mechanism of the breakage is now diagnosable precisely. Three findings.

**Finding 1 — a tree cannot address a cube.** The ontology is (Mode, Domain,
Object): 27 cells, three faces — Act (Mode×Domain, *what is done*), Site
(Domain×Object, *where it lands*), Stance (Mode×Object, *how it is done*). The
namespace is a directory tree: one axis. Every time a session needed to point
at a new region of the cube, the tree offered no address but a new top-level
noun. 35 nouns later, here we are. The redundant pairs prove it: each differs
along exactly one face the tree could not express —

- `enact` vs `enactor`: same Act column, different **Site** (reading vs commit)
- `ground` vs `factcheck`: same verification, different **Stance grain**
  (section vs edge)
- the four writers: same pass, different **holonic depth** on the Site face

Nobody was wrong to mint these names. The tree gave them no other way to point.

**Finding 2 — the three faces got three different representational regimes,
and that inconsistency is the disease.** The Act face got the tree, the stage
names, the visible architecture. The Site face got ad-hoc directories
(`organs/in/pdf.js` is a Site address pretending to be a module). The Stance
face got demoted to stringly parameters (`grain`, `register`, `kind`). One
geometry, three regimes. Selection visibility explains which face won: Act
appears in every audit trace a human reads under deadline, so it was tended;
Site and Stance were invisible in traces, so they rotted into parameters.
*Whatever the trace shows gets tended; whatever it hides rots.*

**Finding 3 — the fix is not a better single slicing.** Any single slicing
re-commits the error, because the tree can only ever carry one face. The fix
is the repo's own doctrine applied to its own layout: **the directory tree is
a projection, not the thing.** Give the tree ONE face deliberately (Act — code
organized by what it does), make the other two faces first-class typed fields
on every event and every assembly, conformance-checked by the coherence guard
that already exists (`cube.js`), and recover the other two organizations as
*folds of the log* — `project(log, face:Site)`, `project(log, face:Stance)` —
exactly as nothing else in the system is stored as projection and everything
is recomputed. The layout was the last thing still pretending to be noumenon.

The naming rule (agreed doctrine, 2026-07): **a part exists at exactly two
levels — its canonical spelling `operator(Site, Stance)` (what runs, checked)
and an optional human label (annotation, demotable). Names are earned by a
recurring spelled subgraph a human keeps pointing at. Nothing lives only as a
name.**

---

## 1. The floor — proper nouns that are earned

Genuine primitives: not compositions, so they keep names. Everything above
them is grammar in the 27-cell alphabet.

| keeps its name | why it is floor |
|---|---|
| `log` (append) | the only write; the medium events are written into |
| `event` | one cell firing: operator · Site · Stance — the atom, three faces readable off it (`facesOf`) |
| `project` | the only read; every "thing," including every alternative layout of this codebase, is a fold through it |
| **the cube** | the alphabet's full geometry: `operators.js` (Act) + `cube.js` (TERRAINS, STANCES, coherence guard) + `faces.js` (notation) + `address.js` (the diagonal). One floor row, four files, all three faces — never again one file per regime |
| `provenance` | the witness fields events carry |
| NUL | the un-born ground; floor of the genesis regress |
| the kernel | the thin interpreter that executes spellings — describable in EO, run by the metal (the honest asymmetry) |

Everything else in `core/` (spectral, holder, verdicts, conversation-fold,
resolution-spectrum, …) is a spelled phrase and moves to its Act-face home in
§3. `core/` target ≤ ~1,800 lines. Test for floor membership: if it can be
written as `operator(Site, Stance)` compositions, it is not floor.

---

## 2. One face per representation — the deliberate assignment

The cube gets three carriers, one per face, each doing what it is good at:

**The TREE carries Act.** Directories say *what is done*. Level 1 is the three
Act-face columns — the faculties of `core/cognition.js`, each a column of the
operator table, each a Hora subassembly (verifiable alone, set-down-stable):

```
              Existence           Structure            Interpretation
Differentiate NUL  hold           SEG  resplit         DEF  assert
Relate        SIG  attribute      CON  bond            EVA  evaluate
Generate      INS  instantiate    SYN  synthesize      REC  learn-rule
              └── perceiver/ ──┘  └── surfer/ ──┘      └── enactor/ ──┘
                 constitute          navigate              judge/commit
```

**The EVENT carries Site and Stance.** Every event already can (`facesOf`);
this spec makes it *must*. Each assembly and each pipeline stage declares its
face contract — `{ ops, terrains, stances }` — and a conformance test runs the
existing coherence guard over every emitted event: ops within the declared
column, terrains within the declared Site set, stances within the declared
Stance set, and the three faces grain-coherent per `cellAt` (a grain-mixed
event is a spec violation, not a warning). The Stance face stops being a
stringly `grain:` option and becomes the checked answer to *how*: Clearing ·
Dissecting · Unraveling / Tending · Binding · Tracing / Cultivating · Making ·
Composing. The Site face stops being a directory convention and becomes the
checked answer to *where*: Void · Entity · Kind / Field · Link · Network /
Atmosphere · Lens · Paradigm, enriched with the holonic path when the event
names a target.

**The FOLD carries the other two layouts.** Two standing projections, cheap,
recomputed, never stored:

- `project(log, face:'Site')` — the terrain atlas: everything that landed at
  `Link`, at `Paradigm`, at `customers.profiles.*@Entity`. This is what
  `organs/in/` was trying to be with directories.
- `project(log, face:'Stance')` — the manner atlas: everything done
  `Binding`-wise, everything `Unraveling`. This is what `grain`/`register`
  parameters were trying to be with strings.

The tree is one shadow of the cube. The other two shadows are queries. Asking
"show me the codebase organized by Site" becomes a fold, not a refactor.

**The TRACE carries all three.** Every audit step prints `notate(event)` —
`EVA(Lens, Dissecting)` beside the human stage label. This is the selection-
visibility intervention from Finding 2, and it is deliberately **migration
step 1** (§8): once all three faces appear in every trace a human reads under
deadline, Site and Stance acquire the same evolutionary pressure toward
coherence that Act has enjoyed alone. The sense organ comes before the
surgery.

---

## 3. The map — all 35 names, spelled on three faces, dispositioned

Disposition key: **KEEP** (earned Level-1/2 name), **FOLD→x** (moves inside
faculty x; old name survives as label), **MERGE→x** (redundant along one face;
survivor named), **SURFACE** (app, not holon), **FLOOR** (§1).

### perceiver/ — Act column ⟨NUL·SIG·INS⟩, home terrains Void·Entity·Kind

| current | canonical spelling | face diagnosis | disposition |
|---|---|---|---|
| `perceiver` | `INS(Entity, Making)` after `SIG(Void, Tending)` — genesis: born referents from bare units | the faculty | **KEEP** (root) |
| `ingest` | `SIG→INS(Entity, Making)` over structured surfaces (EOT lowering) | same Act as perceiver, Site variant | FOLD→`perceiver/lower/` |
| `organs/in/*` | `NUL(Void, Clearing)` per modality — bare adapters, no structuring | pure **Site**-face addresses (pdf, warc, ocr…) that got directories | FOLD→`perceiver/membrane/`; modality is Site metadata, one file each, no new names |
| `classify` | `EVA(Lens, Dissecting) kind:depicted` — phasepost measurement of what a clause reports | enactor Act at perceiver's moment; the depicted register | FOLD→perceiver; `register:'depicted'` is the Stance-face field it already writes |
| `doc` | `project(log)@document` | a fold wearing a directory | FOLD→perceiver |
| `credence` | `project(log)@source-trajectory` — (M,O) regimes per source | vestigial: zero importers | FOLD→perceiver as a standing projection; wire it or let the atlas subsume it |

### surfer/ — Act column ⟨SEG·CON·SYN⟩, home terrains Field·Link·Network

| current | canonical spelling | face diagnosis | disposition |
|---|---|---|---|
| `surfer` | `CON(Link, Binding)` · `SEG(Field, Dissecting)` — navigation proper | the faculty | **KEEP** (root) |
| `retrieve` | `SIG(Field, Tending)→SEG(Field, Dissecting)` over corpus | Site: Field; candidate spans | FOLD→`surfer/retrieve.js` |
| `fold` | `SEG(Field, Dissecting)` + `NUL(Field, Clearing)` holds — the working set, membrane to the talker | the word "fold" survives as `project`'s result everywhere, not as a path | FOLD→`surfer/fold/` |
| `dag` | `CON(Network, Tracing)` — dependency edges among commitments | Pattern-grain Site | FOLD→surfer |
| `frame` | `SEG(Field, Dissecting)` instantiated per modality at the membrane | one interior structure; modality is Site metadata | FOLD→surfer |
| `predict` | `EVA(Network, Tracing)` over the ten-symbol move space | **cross-column phrase**: enactor Act on surfer terrain — the spelling says it cleanly; the directory never could | FOLD→`surfer/predict.js` (object wins over operator; §9 carries the counter-case) |
| `flow` | `EVA(Network, Tracing) prior:corpus` — DELTA/MANIFOLD/BUILD-ARC | judges *trajectories* (Pattern Site) against an external ground | FOLD→`surfer/flow/` |

### enactor/ — Act column ⟨DEF·EVA·REC⟩, home terrains Atmosphere·Lens·Paradigm

| current | canonical spelling | face diagnosis | disposition |
|---|---|---|---|
| `enactor` | `DEF·EVA·REC(Lens, —)` at site:commit — the gate over propositions | the faculty | **KEEP** (root) |
| `enact` | `DEF·EVA·REC(Atmosphere→Lens→Paradigm)` at site:reading, `register:'enacted'` | same Act column; differs on **Site face only** | MERGE→enactor: `enactor/loop.js` beside `enactor/gate.js`; the depicted/enacted distinction survives as the Stance-face `register` field, exactly where it already lives |
| `ground` | `CON(Link, Binding)→EVA(Lens, Dissecting)` at Stance grain:Figure/section | differs from factcheck on **Stance face only** | MERGE→enactor: `enactor/verify.js`, stance parameterized |
| `factcheck` | `CON(Link, Binding)→EVA(Lens, Dissecting)` at grain:edge | same verifier, finer Stance | MERGE→`enactor/verify.js`; two grains, one verdict vocabulary |
| `answer` | `DEF(Lens, Making) terminate:true` — commits without proposing | the purest enactor act in the repo | FOLD→`enactor/mechanical.js` |
| `converse` | `SIG(Atmosphere, Tending)` deposition — talker output attributed, never injected | cross-column: perceiver Act at enactor Site | FOLD→`enactor/deposit.js` |
| `reason` | `SYN(Network, Composing)·CON(Link, Binding)·REC(Paradigm, Composing)` walk, open turns | the code comment spells it verbatim; spans columns and that is fine | FOLD→`enactor/walk.js` (commits through the enactor door, `canWitness:false` by type) |
| `chorus` | `project(log)@polyphony` — Born measure over the 27-cell ground, vox as leaf | the one candidate for a seventh name (§9) | FOLD→`enactor/voice/`, provisionally |
| `audit` | `project(log)@history` | nothing special — was always just `project` | FOLD→ one file beside `project.js`; label kept |
| `organs/out/*` | `NUL(—, Clearing)` renderers — no judging | Site-face addresses, symmetric twin of the in-membrane | FOLD→`enactor/membrane/` |

### pass/ — the composition (Level 3)

| current | canonical spelling | face diagnosis | disposition |
|---|---|---|---|
| `turn` | `perceive→surf→INS(leaf)→enact`, once | the composer | **KEEP**, renamed `pass/` with `repeat:1` |
| `write` | the pass, production stance | four names, one object, differing on **holonic depth** (Site face) and stop rule | MERGE→`pass/` |
| `longgen` | the pass iterated cross-message; walk mechanics | " | MERGE→`pass/` |
| `essay` | the pass, commitments-before-prose | survivor pattern | MERGE→`pass/` |
| `arc` | the pass, sections, evidence-budget stop | " | MERGE→`pass/` |
| `model` | `INS(Entity, Making)` — the leaf | the proposer, flanked | **KEEP** |

```
pass = SYN(Network, Composing)(commitments) → CON(Network, Tracing)(edges)   — plan, before prose
       REPEAT[ surf(fold-slice) → INS(Entity, Making)(leaf, prior beat verbatim)
               → enactor.verify(stance grain:claim) → DEF(Lens, Making)(commit) ]
       UNTIL coverage ∨ evidence budget
```

A single turn is the degenerate pass. ~11k lines converge; target ≤ 4k. Kill
criterion: the deep-reading gen battery scores the merged pass at parity or
better against all four, and the flow witness's three verdicts do not regress
on the exemplar corpus.

### Surfaces

`reader`, `research`, `workspace`, `tasks`, `data`, `archive` — SURFACE /
utility; consumers of holons, no EO claims made or needed. `app.dc.js`
(953 KB) is the Tempus watch: frozen per §6.

Net: **35 names → 6** (`core` floor, `perceiver`, `surfer`, `enactor`,
`pass`, `model`) + surfaces. Nothing deleted; everything re-addressed. Every
fold-in keeps its old name as a grep-able label in its header — annotation,
demotable, never a path.

---

## 4. Face contracts — the conformance layer

Each of the six assemblies, and each pipeline stage, declares:

```js
export const CONTRACT = Object.freeze({
  ops:      ['DEF', 'EVA', 'REC'],           // Act face: its column (cross-column listed explicitly)
  terrains: ['Atmosphere', 'Lens', 'Paradigm'], // Site face: where it may land
  stances:  ['Dissecting', 'Binding', 'Making'], // Stance face: how it may resolve
});
```

The conformance test (extends `conformance.html` / the existing guard):

1. every emitted event's op ∈ `ops`; terrain ∈ `terrains`; stance ∈ `stances`;
2. the event's three faces are grain-coherent per `cellAt` — a grain-mixed
   event (`SIG` at `Entity` but `Tending`) is **rejected as a spec violation**,
   the "do not apply a Figure fix to a Ground problem" guard promoted from
   lookup to law;
3. cross-column phrases (predict, converse, reason) pass because their
   contracts *declare* the crossing — the honesty is in the declaration, and
   the declaration is exactly what the directory tree could never carry.

This is the sense in which spelling is not documentation: an assembly that
cannot honor its declared faces is misspelled, and CI says so.

---

## 5. The pipeline — 17 stages, three faces each, and what the spelling reveals

Stage labels stay in traces (humans read them under deadline). Each acquires
its full address; the trace prints both.

| stage | canonical spelling | faculty |
|---|---|---|
| route | `EVA(Lens, Dissecting) terminate?` | enactor (early) |
| expect | `DEF(Atmosphere, Making)` | enactor (early) |
| converse | `SIG(Atmosphere, Tending)` deposition | enactor door |
| retrieve | `SIG(Field, Tending)→SEG(Field, Dissecting)` | surfer |
| inquire | `SIG(Field, Tending)` | surfer |
| fold | `SEG(Field, Dissecting)+NUL(Field, Clearing)` | surfer |
| predict | `EVA(Network, Tracing)` | surfer (lookahead) |
| answerable | `EVA(Atmosphere, Dissecting) refuses` | enactor (early) |
| gate | `EVA(Lens, Dissecting)` budget | enactor (early) |
| reason | `SYN(Network, Composing)·CON(Link, Binding)·REC(Paradigm, Composing)` | surfer→enactor |
| prompt | `SEG(Field, Dissecting)` assembly | surfer |
| llm | `INS(Entity, Making)` | **the leaf** |
| bind | `CON(Link, Binding)` grain:claim | enactor |
| factcheck | `EVA(Lens, Dissecting)` grain:edge | enactor |
| revise | `REC(Paradigm, Composing)` once | enactor |
| veto | `EVA(Lens, Dissecting)→DEF(Lens, Making)` flags | enactor |
| settle | `DEF(Lens, Making)` commit | enactor |

Read down the columns and three shapes appear that seventeen names never
showed:

- **Act**: the enactor fires at both ends — EVA before the surfer moves
  (route/answerable/gate, the refusal floor) and after the leaf proposes
  (bind/factcheck/veto/settle) — with the lone INS flanked in the middle. The
  glass-box thesis as a sentence.
- **Site**: the pass *descends the terrains* — Atmosphere (expectation,
  deposition) → Field (retrieval, folding) → Entity (the leaf's proposal) →
  Link (binding) → Lens (judgment) → Paradigm (learning). The pipeline is a
  walk down the Site face and back up; that is what "grounding" is,
  geometrically.
- **Stance**: the pass *oscillates* Tending→Dissecting→Making, with exactly
  one Composing cluster (reason/revise) — the manner profile of a reader that
  mostly attends, cuts, and commits, and composes only at the walk and the
  single revision. A generation-heavy profile would show Making/Composing
  dominance; the conformance layer makes drift between these profiles
  *measurable per turn*.

That third bullet is new capability, not just hygiene: the Stance profile of
a turn is a one-line diagnostic for what kind of cognitive act the turn was.

> **Note (this PR):** the spellings in the table above are §5 as written. Run
> through the repo's own cube (`core/cube.js coherence`), 13 of the 17 are
> off-diagonal — an operator carrying a stance from another Mode
> (`EVA(Lens, Dissecting)`) or a terrain from another Domain
> (`SIG(Atmosphere, …)`). `src/turn/stage-faces.js` prints the *coherent* face
> the operator actually casts at the implied grain (route →
> `EVA(Lens, Binding)`) and keeps §5's wording as the census. See the
> implementation-status banner at the top.

---

## 6. The Tempus watch

`app.dc.js` is exempt from renaming because it is not a holon — it is the
thing MIGRATION-POINTER promised to stop building. Rule: **no new capability
lands in it**; new surface work composes the six assemblies from outside; CI
fails any PR that grows the file. Declared a surface, frozen, strangled at
leisure. Hora does not rebuild Tempus's watch; he stops buying parts for it.

---

## 7. Naming discipline, stated once

1. **Canonical form** is `operator(Site, Stance)` — the repo's own `notate()`,
   holon-enriched where a target is named. Contracts declare face sets;
   conformance checks them; the coherence guard enforces grain.
2. **The tree carries Act, and only Act.** Site and Stance live on events and
   contracts; their layouts are standing projections, never directories. Any
   PR that proposes a directory whose meaning is a terrain or a stance is
   re-committing Finding 2.
3. **Labels are annotation** — nicknames for recurring spelled subgraphs;
   legal, human, grep-able, demotable; in headers and traces, never in the
   ontology.
4. **A name is earned** when a spelled subgraph recurs and humans keep
   pointing at it, and it passes Hora's test: set it down mid-interruption
   and it holds together alone. Six names currently pass. Suspicion is
   warranted of any PR proposing a seventh (§9 carries the one live
   candidate).
5. **Cross-column and cross-face phrases are legal and expected** — that is
   what spelling is for. The crossing must be declared in the contract; the
   sin was never crossing, it was crossing silently.
6. **The floor keeps proper nouns** (log, event, project, the cube,
   provenance, NUL, kernel). Seven rows. The cube is one row with all three
   faces — never again one representational regime per face.

---

## 8. Migration order (Hora's order: stable at every set-down; sense organ before surgery)

1. **Print the faces** — every audit step prints `notate(event)` beside its
   stage label. Zero moves, one afternoon, and it creates the selection
   pressure everything else rides on. Site and Stance become visible in every
   trace read under deadline; from this step on, incoherence *hurts*, which
   is what makes steps 2–6 stick.
2. **Declare contracts** — `CONTRACT = { ops, terrains, stances }` on each
   holon and stage; conformance test wired to the coherence guard. The first
   run is a census, not a gate: it will surface every silently cross-face
   phrase and every grain-mixed emission as a worklist.
3. **Merge the twins** — enact→enactor (Site parameter), ground+factcheck→
   `enactor/verify.js` (Stance parameter). Two directories retired; the faces
   they were compensating for are now fields.
4. **Shrink the floor** — non-floor `core/` files to their Act columns;
   `core/` ≤ ~1,800 lines; the cube's four files stay together as one floor
   row.
5. **Fold the columns** — perceiver absorbs ingest/organs-in/classify/doc/
   credence; surfer absorbs retrieve/fold/dag/frame/predict/flow; enactor
   absorbs answer/converse/reason/chorus/organs-out. Paths change; spellings
   and contracts don't — which is the regression guarantee.
6. **One writer** — `pass/` per §3, behind the gen-battery kill criterion;
   retire write/longgen/essay/arc.
7. **Stand up the atlases** — `project(log, face:'Site')` and
   `project(log, face:'Stance')` as standing folds with a small surface each.
   Last because by now they are nearly free: the fields exist (2), are clean
   (3–6), and the projections are just `project`.
8. **Freeze the Tempus watch** — the §6 CI rule (can land any time; listed
   last only so the ratchet-reversal is never mistaken for the goal).

---

## 9. Open questions (carried honestly)

- **`predict`'s home**: spelled `EVA(Network, Tracing)` — enactor Act on
  surfer terrain. This spec homes it by object (surfer); homing by operator
  (enactor) is defensible. Decide by where its tests naturally live; the
  contract carries the crossing either way, so the cost of the choice is now
  low — which is itself the argument that the faces are doing their job.
- **Does `chorus` earn the seventh name?** Its Born measure over the 27-cell
  ground is the most distinctive mechanism in the repo, and it is the one
  part whose *object is the cube itself*. If `enactor/voice/` blurs it, it
  has earned the name. Let §7.4's test decide, not affection.
- **Stance profiles as a standing verdict**: §5's observation that a turn has
  a measurable Stance profile suggests a cheap new witness — flag turns whose
  manner profile is off-distribution for their route class. Projection
  sketch; a read-only diagnostic over existing traces would confirm or kill
  it in a day.
- **The kernel's self-description**: the floor should eventually carry its
  own EO description (reflectively stable, per the 2026-07 organs-as-objects
  discussion) — described in the nine, executed by the metal. Out of scope;
  noted so it is not forgotten.

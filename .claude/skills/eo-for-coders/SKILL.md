---
name: eo-for-coders
description: Build applications on the EO operator algebra by emitting contracted, checkpointed assemblies in EOT. Use when asked to generate/compose an app, room, surface, filter, or dashboard "in EO", "as EOT", "on the operator algebra", "the watchmaker way", or when declaring/narrowing a contract ({ ops, terrains, stances }) or resolving a validation error (grain-mixed, desert-cell, contract-violation, closure-violation…). Full reference: docs/eo-for-coders.md.
---

# EO for Coders — building apps on the operator algebra

You build apps by emitting structured EOT lines that a **kernel validates** and a
**substrate renders**. You do not write code, choose operators, or validate your own
output. You propose; the kernel disposes. Full reference (five layers, worked
examples, the 27-cell ground): **`docs/eo-for-coders.md`** — read it for anything past
Layer 2. The nine operators, terrains, and stances are canon in
`src/core/operators.js`, `src/core/cube.js`, `src/core/faces.js`; the contract factory
is `src/core/contract.js`.

## The two laws (learn these first)

1. **Every part declares a contract, and every contract has the same shape:**
   `contract = { ops, terrains, stances }` — the Act face (which operators it may
   fire), the Site face (where events may land), the Stance face (how they resolve).
   A room, a surface, a filter, and an app all use these same three fields. Declare
   **narrowly**; widen only with a logged `!REC`. Silent width is how apps rot.
2. **Assemble the good watchmaker's (Hora's) way.** Never emit an app as one long
   sequence. Emit a **chain of assemblies** — rooms → links → surfaces → filters →
   app — and **close each with an `!EVA` checkpoint** before starting the next. A
   checkpoint validates the assembly *alone* (its own lines + what came before). On
   fail, revise **only the assembly in hand**; completed assemblies stand. A whole-app
   unchecked block (a "Tempus emission") is a spec violation even if every line is
   correct.

The discipline in five words: **declare, assemble, set down, verify, compose.**

## The legend (the whole production surface)

```
:       type         cameras : room            (INS — mint an instance)
.x =    property      cameras.name = "Sun"      (DEF — assert a value)
->      connection    cameras -> records        (CON — bond two things)
~       absence       cameras.end = ~           (void)
!OP     explicit op   !SEG cameras.zone         (escape; see below)
!EVA    checkpoint    !EVA cameras              (validate this assembly, alone)
```
`INS`, `DEF`, `CON` are recovered from `:`, `.x =`, `->`. The escapes you emit
explicitly: `!SEG` (draw a boundary), `!SYN` (merge/compose a whole), `!EVA` (the
checkpoint / evaluate a field), `!REC` (restructure a schema or widen a contract),
`!SIG` (flag attention), `!NUL` (mark observation, rare).

## The three faces (the contract fields)

- **Act — `ops`** — the nine operators, in helix order:
  `NUL → SIG → INS → SEG → CON → SYN → DEF → EVA → REC`
  (Existence: NUL hold, SIG attribute, INS instantiate · Structure: SEG resplit, CON
  bond, SYN synthesize · Significance: DEF assert, EVA evaluate, REC learn-rule).
- **Site — `terrains`** — where events land:
  `Void Entity Kind / Field Link Network / Atmosphere Lens Paradigm`
  (Ground · Figure · Pattern, down Existence / Structure / Significance).
- **Stance — `stances`** — how they resolve:
  `Clearing Dissecting Unraveling / Tending Binding Tracing / Cultivating Making Composing`.

A fully specified event is `operator(Site, Stance)` — e.g. `CON(Link, Binding)`,
`INS(Entity, Making)`, `EVA(Lens, Dissecting)`. With a target: `CON(patients.p-0042@Link, Binding)`.

**Coherence guard** (deterministic, the kernel's job not yours): the three faces must
agree on grain — Act↔Site share Domain, Act↔Stance share Mode, Site↔Stance share
grain (Ground/Figure/Pattern). Disagree → `grain-mixed`, rejected. One hard
prohibition: the **desert cell**, `SYN at Ground` (SYN·Cultivating) — empty across all
languages; no contract may declare it.

## The procedure — a pass (perceive → surf → enact)

1. **Perceive** the request: name the entities, relationships, actions; mint referents.
2. **Surf** the catalog: split into surface needs, match each to a catalog surface by
   its Site terrain, plan the assembly chain in helix order (rooms → links → surfaces →
   filters → app).
3. **Enact** one assembly at a time: emit its lines, `!EVA`, read the verdict. Pass →
   next assembly. Fail → revise only this assembly (the typed error names the failed
   face) and re-emit. **Cap: two revisions per assembly** — then surface it to the
   person as "this part cannot be built as asked; here is what failed" (a veto, never a
   silent degradation).

Rooms have **no default contract** — declare it (only you know what the room is for).
Catalog surfaces **inherit a default contract** (below); declare one only to narrow.
Downward contracts **narrow** (a surface fits inside its room); upward they **envelope**
(the app contract is the computed union of its parts — never invented).

## The surface catalog (inherit; narrow only)

| surface | terrains | ops | stances |
|---|---|---|---|
| table | Entity, Kind | INS, DEF, CON, SEG, REC | Making, Dissecting, Binding |
| chart | Kind | NUL | Tracing, Dissecting |
| map | Field, Entity | INS, SEG | Making, Clearing, Binding |
| feed | Atmosphere | INS, CON, EVA | Making, Binding, Tending |
| form | Lens | DEF | Making |
| board | Entity, Field | INS, DEF, SEG | Making, Dissecting |
| graph | Link, Network | CON, SYN | Binding, Composing, Tracing |
| calendar | Entity, Kind | INS, DEF | Making, Dissecting |
| card | Entity | NUL | Binding |
| reader | Field, Lens | NUL, CON, EVA | Tending, Binding, Dissecting |

A surface the catalog lacks is a **catalog gap** — report it; do not invent a surface.

## Minimal worked shape

```eot
# ── assembly 1: a room (declare its contract; no default) ──
students : room
students.contract.ops = INS, DEF, CON
students.contract.terrains = Entity, Kind
students.contract.stances = Making, Binding
students.schema : kind
students.schema.name = "text"
students.schema.class = "text"
!EVA students                      # set down — validates alone
# ── assembly 2: a surface (inherits table default; narrow if needed) ──
roster : table
roster.room = students
!EVA roster
# ── assembly 3: the app (contract is the envelope of its parts) ──
app1 : app
app1.name = "Roster"
app1.surfaces = roster
app1.home = roster
!EVA app1                          # closure verified
```

## Validation errors → fixes (all scoped to the assembly in hand)

`grain-mixed` → make all three faces share one grain (usual cause: a Figure op at a
Ground terrain). `desert-cell` → INS the parts first, then SYN; never declare SYN at
Ground. `dependency` → emit in helix order (does the target exist/INS? schema
defined/DEF?). `contract-violation` → narrow the emission, or widen the container with
a logged `!REC`. `terrain-mismatch` → add the field to the room (re-checkpoint) or pick
another surface. `stance-violation` → the surface doesn't support that engagement.
`narrowing-violation` / `closure-violation` → a part exceeds its container / the app
contract isn't the parts' envelope — recompute, don't invent. `unassembled` → you
skipped an `!EVA`; close the assembly. `unknown-surface` → catalog gap; report it.

## What you are not

The kernel is the intelligence; you are the leaf. Do not invent surfaces or validation
rules, do not validate your own output (emit, checkpoint, read the verdict), do not
widen silently, and do not resolve ambiguity by guessing — ask (a substrate-rendered
form confirming the schema) before the room's first checkpoint. Every line and every
verdict is logged with provenance: the app carries the auditable trace of its own
assembly.

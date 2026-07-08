# EOT — Existential-Operator Triples

**Record ID:** spec:eot-surface-syntax
**Version:** 0.1 (draft)
**Status:** proposed
**Extension:** `.eot`
**Media type:** `text/eot`
**Encoding:** UTF-8
**Depends on:** EO operator algebra (nine operators, three faces, 27-cell substrate), the Given-Log / Khora event model.

---

## Abstract

EOT is a line-oriented surface syntax for emitting EO operator events. It is designed so that a language model — including a small local model — can produce it **without being taught a vocabulary of operators**. The operator is recovered from punctuation shapes the model already emits fluently (`:`, `.x =`, `-> :`), not from named opcodes. The six rarer operators are reached through an optional 3-letter escape flag, and provenance rides as an optional trailing clause.

Each EOT line lowers, losslessly, to one canonical EO log tuple: an operator, a target, an operand, a 27-cell address, and a Given-Log envelope (agent, mode, frame, timestamp). The surface drops the address and the operator name; the ingester reconstructs both deterministically. The design contract is two-sided:

- **For the producer (the model):** the required surface is three shapes plus one null glyph. Nothing else must be known to emit the common 80% of ingested data.
- **For the consumer (the ingester):** every line resolves to a fully-specified EO event with no information loss versus authoring the tuple directly.

This document specifies the lexical structure, the grammar, the operator-recovery rules, the lowering to canonical tuples, address/decal derivation, provenance, error handling, and RDF/OWL interoperation.

---

## 1. Conformance

The key words MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, MAY, and OPTIONAL are to be interpreted as in RFC 2119.

Two conformance targets are defined:

- A **conforming producer** emits documents that match the grammar in §6. A producer MAY restrict itself to the *core profile* (§3) and still be conforming.
- A **conforming ingester** accepts any document matching §6, applies the recovery rules of §7 and the lowering of §8, and emits canonical EO tuples (§8.1). An ingester MUST treat unknown lines per §9 rather than silently discarding them.

---

## 2. Design goals and non-goals

### 2.1 Goals

1. **Zero-instruction common case.** Asserting a type, a value, or a relationship requires no knowledge of EO. The three core shapes reuse universal programming priors (type annotation, assignment, arrow-link).
2. **Small-model-parseable.** The grammar is regular and line-oriented: one fact per line, fixed sigils, no nesting in the core profile. A fallback parser is a handful of regexes.
3. **Bounded write-time choice.** A producer never performs a 9-way classification. The common operators are recovered by the ingester; the rare ones are an explicit, signposted escape.
4. **Lossless lowering.** Every line reconstructs a full EO tuple, including the 27-cell address and provenance.
5. **Token-frugal.** A common line is roughly 5–10 tokens. Provenance is skippable and trailing, so it never inflates the common case.

### 2.2 Non-goals

1. EOT is **not** a query language. It expresses operator *emission* only. Observation (NUL-as-Horizon, projections) is out of scope.
2. EOT does **not** express arbitrary REC bodies. Only vocabulary remapping is surface-expressible (§5.5); structurally complex reframes are authored through the full log API.
3. EOT does **not** carry anchors. Anchors are opaque, content-addressed, and minted by the ingester (§4.4). Surface references are always *signs*.
4. EOT is **not** a replacement for the canonical tuple form. It is a producer-friendly front end that lowers to it.

---

## 3. Profiles

**Core profile.** The three infix shapes (§5.1–§5.3) plus the null literal (§4.5). This is the entire surface a producer must know to emit the common case. The minimal model-facing legend (§11) specifies the core profile in five lines.

**Full profile.** The core profile plus tagged forms (§5.4–§5.5), sugar infixes (§5.6), and provenance trailers (§5.7).

A producer conforming to the core profile relies on the ingester's automatic recovery (§7.2) for NUL, SIG, and EVA. This is the recommended mode for small local models.

---

## 4. Lexical structure

### 4.1 Lines and documents

A document is a sequence of lines separated by LF (`U+000A`); a CR immediately preceding an LF MUST be ignored. Each non-blank, non-comment line is exactly one **statement**. Statements MUST NOT span lines in the core profile. Leading and trailing whitespace on a line is not significant.

### 4.2 Comments and blanks

A `#` that is not inside a quoted string begins a comment that runs to end of line. A line that is empty or contains only whitespace and/or a comment produces no event.

### 4.3 Whitespace, sigils, and the colon rule

Inter-token whitespace is one or more spaces or tabs. The following sigils are reserved:

| Sigil | Role | Section |
|---|---|---|
| ` : ` (space–colon–space) | IS-A operator (INS / SIG) | §5.1 |
| `:` (tight, no surrounding space) | namespace separator inside an identifier | §4.4 |
| `=` | value assignment (DEF) | §5.2 |
| `->` | directed link / "becomes" | §5.3, §5.4 |
| `<-` | aggregate-from (SYN sugar) | §5.6 |
| `=>` | vocabulary remap (REC) | §5.5 |
| `==` | identity / reconcile (SYN sugar) | §5.6 |
| `\|` | partition (SEG sugar) | §5.6 |
| `.` | path separator | §4.4 |
| `!` | operator flag prefix (column 1 of a tagged statement) | §5.4 |
| `@` | provenance: agent | §5.7 |
| `~` | provenance: timestamp | §5.7 |
| `∅` / `nil` | null value | §4.5 |
| `[` `]` | operand list | §5.6 |
| `{` `}` | term set (REC remap) | §5.5 |
| `"` | string delimiter | §4.5 |
| `#` | comment | §4.2 |

> **The colon rule is normative and load-bearing.** A colon **surrounded by whitespace** is the IS-A operator. A colon **with no adjacent whitespace** is a namespace separator inside a single identifier. Thus `Alice : Person` is an IS-A statement, while `customer:123` is one identifier. A producer that means "is a" MUST surround the colon with spaces; a producer that means a namespaced sign MUST write it tight. Ingesters MUST NOT accept a colon adjacent to whitespace on only one side; such a token is a syntax error (§9).

### 4.4 Identifiers, signs, paths

```
IDENT     = NAMECHAR { NAMECHAR }
NAMECHAR  = ALPHA | DIGIT | "_" | "-"
SIGN      = [ PREFIX ":" ] IDENT { ":" IDENT }      ; tight colons only
PATH      = SIGN { "." IDENT }
```

A **SIGN** is a human-readable, frame-dependent, mutable reference (e.g. `Alice`, `customer:123`, `wiki:ancient-astronomy`). Tight colons partition a sign into namespace segments and are not the IS-A operator. A **PATH** addresses a slot within an entity by dot-separated field names (e.g. `Alice.age`, `customer:123.status`). Identifiers MUST NOT contain `.`, whitespace, or any reserved sigil; names requiring such characters MUST appear as quoted strings only in value position (§4.5), never as a target.

Signs are not anchors. The ingester maintains a **sign table** mapping each sign to the content-addressed anchor minted at first INS (§4.5, §8.4). Reconciliation (`==`, `owl:sameAs`) merges signs onto a single anchor without rewriting history.

### 4.5 Values and literals

A **value** appears on the right of `=` (DEF) or as a transition target (EVA). Values are literals only — never entity references. (To relate two entities, use a link, §5.3, not a value.)

```
VALUE   = STRING | NUMBER | BOOL | DATE | NULL
STRING  = BAREWORD | QUOTED
BAREWORD= NAMECHAR { NAMECHAR }                      ; no spaces/sigils
QUOTED  = '"' { CHAR | ESCAPE } '"'                  ; required if spaces present
NUMBER  = [ "-" ] DIGIT { DIGIT } [ "." DIGIT { DIGIT } ] [ EXP ]
BOOL    = "true" | "false"
DATE    = ISO-8601 inside quotes, e.g. "2026-06-26" or "2026-06-26T14:00:00Z"
NULL    = "∅" | "nil"
```

`∅` and `nil` are exact synonyms; producers without convenient access to the glyph MUST be able to use `nil`. A `NULL` value in DEF position is the trigger for NUL recovery (§7.2).

---

## 5. Statements

### 5.1 IS-A (`SIGN : SIGN`) — recovers INS or SIG

```
isa = SIGN ws ":" ws SIGN
```

`Alice : Person` asserts that the subject is of the named type. Recovery (§7.2): the **first** IS-A naming a previously-unseen subject lowers to **INS** (entity instantiation; mints the anchor). A **later** IS-A on an already-instantiated subject lowers to **SIG** (re-designation / claim). A producer never decides which; it always writes the same shape.

### 5.2 ASSIGN (`PATH = VALUE`) — recovers DEF (or NUL / EVA)

```
assign = PATH ws "=" ws VALUE
```

`Alice.age = 30` sets a value at a path. Recovery (§7.2): normally **DEF**. If the value is `∅`/`nil`, lowers to **NUL** (explicit absence). If the value crosses a declared boundary on that path (a known constraint, §8.5), the ingester MAY lower to **EVA(SEG(·))**; a producer that wants to force this writes `!eva` (§5.4).

### 5.3 LINK (`SIGN -> SIGN : REL`) — recovers CON

```
link = SIGN ws "->" ws SIGN ws ":" ws REL
REL  = IDENT { ("." | "-") IDENT }
```

`Alice -> Bob : knows` creates a typed relationship from subject to object. The trailing `: REL` is REQUIRED and names the relationship; its presence distinguishes a LINK from an EVA transition (§5.4). Lowers to **CON** with `target = subject`, `operand = object`, `relation = REL`.

### 5.4 TAGGED statements — the rare six

A statement whose first non-whitespace character is `!` is **tagged**. The flag forces a specific operator and selects a body grammar. Flags are case-insensitive.

```
tagged = "!" FLAG ws body
FLAG   = "nul" | "sig" | "clm" | "seg" | "syn" | "eva" | "rec"
```

| Flag | Operator | Body | Meaning |
|---|---|---|---|
| `!nul` | NUL | `PATH "=" "∅"` or `PATH` | force explicit absence at a path |
| `!sig` | SIG | `SIGN ":" SIGN` | force re-designation / claim (override INS) |
| `!clm` | SIG (claim register) | `SIGN ":" SIGN` | alias of `!sig` that sets the second-pass claim register (CLM) |
| `!seg` | SEG | `SIGN "\|" KEY` | draw / dissolve a boundary or partition |
| `!syn` | SYN | `SIGN "<-" "[" list "]"` | aggregate parts into a derived whole |
| `!eva` | EVA | `PATH ":" old "->" new`  or  `PATH "->" new` | judgment / transition against a prior or a standard |
| `!rec` | REC | see §5.5 | reframe a vocabulary (the only surface-expressible REC) |

Within `!eva`, `->` means "becomes"; the optional `old` records the prior value, otherwise the prior is read from current state. Within tagged statements the colon need not be space-surrounded to be the IS-A/from separator, because the leading flag already establishes the body grammar — but producers SHOULD surround it for readability, and ingesters MUST accept both inside a tagged body.

### 5.5 `!rec` — vocabulary remap

REC transforms an interpretive frame. Only the **vocabulary-remap** form is surface-expressible:

```
rec      = "!rec" ws PATH ws remap
remap    = setform | mapform
setform  = "{" termlist "}" ws "=>" ws "{" termlist "}"
mapform  = "=>" ws "{" pair { "," pair } "}"
pair     = TERM ws ":" ws ( TERM | "[" termlist "]" )
termlist = TERM { "," TERM }
```

Example (set form):

```
!rec vocabulary:status {active,inactive} => {enrolled,waitlisted,suspended}
```

Example (explicit mapping):

```
!rec vocabulary:status => {active:[enrolled,waitlisted], inactive:[suspended]}
```

This lowers to a REC event carrying `old_terms`, `new_terms`, and (if present) `mapping`, exactly as in the canonical `contains`-nested form (§8.1). Historical events using the old terms are **not** rewritten; the mapping is applied on read (§8.6). REC bodies beyond vocabulary remapping (multi-operator reframes) are NOT expressible in EOT and MUST be authored through the full log API.

### 5.6 Sugar infixes (full profile)

These are convenience equivalents to tagged forms; an ingester MUST treat them as identical to their canonical tag.

| Sugar | Canonical | Lowers to |
|---|---|---|
| `Cases \| status` | `!seg Cases \| status` | SEG |
| `Region <- [TN, KY, AL]` | `!syn Region <- [TN, KY, AL]` | SYN (aggregate) |
| `Alice == AliceB` | (no flag) | SYN (identity / reconcile signs to one anchor) |

`==` reconciles two signs onto a single anchor (the EO reading of `owl:sameAs`); it lowers to SYN with `mode: "identity"`.

### 5.7 Provenance trailer

Any statement MAY carry a trailing provenance clause. Both fields are OPTIONAL and order-independent.

```
meta  = [ "@" AGENT ] [ ws "~" TS ]
AGENT = IDENT { ("." | "-" | ":") IDENT }
TS    = ISO-8601 (bare, no quotes), e.g. ~2026-06-26 or ~2026-06-26T14:00:00Z
```

```
Alice -> Bob : knows   @intake ~2026-06-26
```

`@` names the agent; `~` (read "about/around a time") gives the timestamp. When absent, the ingester MUST fill `agent`, `ts`, `mode`, and `frame` from the ingestion context (§8.3). Provenance trailers MUST appear after the statement body and before any comment.

---

## 6. Grammar (EBNF)

```ebnf
document   = { line } ;
line       = [ statement ] [ ws ] [ comment ] LF ;
comment    = "#" { CHAR } ;
statement  = ( core | tagged ) [ ws meta ] ;
core       = isa | assign | link | sugar ;
isa        = SIGN ws ":" ws SIGN ;
assign     = PATH ws "=" ws value ;
link       = SIGN ws "->" ws SIGN ws ":" ws rel ;
sugar      = seg_s | syn_s | ident_s ;
seg_s      = SIGN ws "|" ws KEY ;
syn_s      = SIGN ws "<-" ws "[" list "]" ;
ident_s    = SIGN ws "==" ws SIGN ;
tagged     = "!" flag ws tbody ;
flag       = "nul" | "sig" | "clm" | "seg" | "syn" | "eva" | "rec" ;
tbody      = nul_b | sig_b | seg_b | syn_b | eva_b | rec_b ;
nul_b      = PATH [ ws "=" ws "∅" ] ;
sig_b      = SIGN ws ":" ws SIGN ;
seg_b      = SIGN ws "|" ws KEY ;
syn_b      = SIGN ws "<-" ws "[" list "]" ;
eva_b      = PATH [ ws ":" ws value ] ws "->" ws value ;
rec_b      = PATH ws remap ;
remap      = "{" termlist "}" ws "=>" ws "{" termlist "}"
           | "=>" ws "{" pair { "," pair } "}" ;
pair       = TERM ws ":" ws ( TERM | "[" termlist "]" ) ;
meta       = agent [ ws ts ] | ts [ ws agent ] ;
agent      = "@" AGENT ;
ts         = "~" TS ;
list       = SIGN { ws "," ws SIGN } ;
termlist   = TERM { ws "," ws TERM } ;
value      = STRING | NUMBER | BOOL | DATE | NULL ;
rel        = IDENT { ( "." | "-" ) IDENT } ;
SIGN       = [ IDENT ":" ] IDENT { ":" IDENT } ;   (* tight colons only *)
PATH       = SIGN { "." IDENT } ;
KEY        = IDENT { "." IDENT } ;
TERM       = IDENT | STRING ;
NULL       = "∅" | "nil" ;
ws         = ( " " | TAB ) { " " | TAB } ;
```

A regular-expression-grade lexer suffices: tokenize on the sigil set, apply the colon rule (§4.3), and dispatch by which top-level sigil appears. The grammar has no recursion in the core profile and bounded recursion (lists, term sets) in the full profile.

---

## 7. Operator recovery

### 7.1 Principle

The surface deliberately underspecifies the operator for the common case. Recovery is the ingester's deterministic reconstruction of the operator from (a) the statement shape, (b) the ingester's running state (the sign table and prior events), and (c) any explicit tag. Tags always win; absent a tag, shape plus state determines the operator.

### 7.2 Recovery rules (normative)

Apply in order; the first matching rule fixes the operator.

1. **Tagged** → the flag's operator (§5.4). `!clm` additionally sets the claim register on the SIG event.
2. **`==` / `<-` / `|` sugar** → SYN(identity) / SYN(aggregate) / SEG respectively.
3. **LINK** (`A -> B : r`) → **CON**.
4. **ASSIGN with `∅`/`nil`** → **NUL**.
5. **ASSIGN whose value crosses a declared boundary** on the path (a constraint registered by a prior DEF/`!seg`, §8.5) → **EVA(SEG(·))**. An ingester MAY disable this and treat all untagged assigns as DEF; if so it MUST document that EVA requires `!eva`.
6. **ASSIGN otherwise** → **DEF**.
7. **IS-A whose subject sign is absent from the sign table** → **INS** (mint anchor, §8.4).
8. **IS-A whose subject sign is present** → **SIG** (re-designation).

An ingester processing a document in a single pass MUST treat the sign table as updated by each INS as it is encountered, so that rules 7/8 are stable for a given input ordering.

---

## 8. Lowering to canonical tuples

### 8.1 Canonical tuple shape

Each statement lowers to one EO log event. The canonical shape (aligned with the Khora event model) is:

```json
{
  "uuid": "<event uuid>",
  "op": "INS|SIG|NUL|SEG|CON|SYN|DEF|EVA|REC",
  "target": "<sign or path>",
  "anchor": "<content-addressed entity id, when resolvable>",
  "operand": { "...": "operator-specific (see 8.2)" },
  "addr": { "alpha": "...", "eta": "...", "omega": "+|-|*" },
  "site": "<Site-face cell, derived>",
  "agent": "<from @ or context>",
  "ts": "<from ~ or context>",
  "mode": "<mode of givenness>",
  "frame": "<context envelope>"
}
```

`uuid` is the event's identity (bookkeeping); `anchor` is the entity's identity (ontology), minted only by INS and carried by reference thereafter. Both are assigned by the ingester, never by the producer.

### 8.2 Operand by operator

| Operator | `operand` contents |
|---|---|
| INS | `{ "type": <SIGN> }` |
| SIG | `{ "designation": <SIGN> }` (+ `"register":"claim"` for CLM) |
| NUL | `{ "value": null }` |
| SEG | `{ "key": <KEY> }` (partition) or `{ "boundary": "dissolve" }` |
| CON | `{ "to": <SIGN>, "relation": <REL> }` |
| SYN | aggregate: `{ "parts": [<SIGN>...] }`; identity: `{ "same_as": <SIGN>, "mode": "identity" }` |
| DEF | `{ "value": <VALUE> }` |
| EVA | `{ "from": <VALUE|null>, "to": <VALUE> }` (+ `"via":"SEG"` when boundary-crossing) |
| REC | `{ "old_terms": [...], "new_terms": [...], "mapping": {...}? }` |

### 8.3 Provenance defaulting

If the statement carries `@agent`, use it; else use the ingestion context's agent (e.g. `import:owl:<ontology-iri>`, `import:airtable:<base>`, `model:<name>`). If it carries `~ts`, use it; else use the ingestion timestamp. `mode` (mode of givenness) and `frame` (context envelope) always come from the ingestion context — for EOT produced by a model, `mode` SHOULD be `"asserted"` and `frame` SHOULD identify the producing run; for EOT lowered from OWL, see §10.

**Provenance door (the me-ness type law).** EOT produced by a model is the model's NOTES of a reading — its representation of its own interpretation, not a record of what happened. Such events take the **enactor** door (reafference): they are *mine*, and by the type law they CANNOT witness — they are the conjecture, held defeasibly, not the ground. The source text the model read is the exafference (the world). Only an EXTERNAL import (OWL / Airtable / real data) is exafference and takes the **perceiver** door. A prior model's EOT, reloaded later as context, returns *read-back-of-prior-self* via the indexical reload — never fresh world. An ingester SHOULD default the door to enactor and let the caller mark imports `perceiver`.

### 8.4 Anchor minting and the sign table

On the INS produced by rule 7 (§7.2), the ingester mints a content-addressed anchor (an opaque immutable hash) and records `sign -> anchor` in the sign table. Every later event whose target resolves (via sign or path root) to a known sign carries that anchor by reference. A `==` / `owl:sameAs` reconciliation points one sign's entry at another's anchor; prior events are not rewritten — replay resolves both signs to the surviving anchor (§8.6).

### 8.5 Boundary constraints (for EVA recovery)

A "declared boundary" on a path is a constraint previously registered for that path — e.g. an enumerated domain established by a prior DEF, a `!seg` partition key, or an OWL restriction lowered per §10. An assign whose value moves the path's value across such a boundary (e.g. `status` from a value in partition A to a value in partition B) is the EVA(SEG(·)) case of rule 5. Ingesters that do not maintain boundary state MUST require `!eva` for transitions and document this.

### 8.6 Replay and read

State is derived by replaying the log; EOT contributes events, never state. Vocabulary REC mappings (§5.5) and `==` reconciliations are applied at read time, so historical events authored under old terms or old signs resolve correctly without mutation. This preserves the append-only guarantee end to end: EOT adds entries; it never overwrites.

### 8.7 Worked lowering

Surface:

```
Alice : Person                      @intake ~2026-01-15
Alice.age = 30
Alice.email = nil
Alice -> Bob : knows
Alice : VIP                         @loyalty ~2026-06-01
!eva Alice.tier : Bronze -> Gold    @loyalty
Region <- [TN, KY, AL]
!rec vocabulary:status {active,inactive} => {enrolled,waitlisted,suspended}
```

Lowers to:

| # | Line | op | target | operand (abbrev) | addr.ω / site |
|---|---|---|---|---|---|
| 1 | `Alice : Person` | INS | Alice (anchor minted) | type=Person | `+` / Entity |
| 2 | `Alice.age = 30` | DEF | Alice.age | value=30 | `+` / Entity |
| 3 | `Alice.email = nil` | NUL | Alice.email | value=null | `+` / Entity |
| 4 | `Alice -> Bob : knows` | CON | Alice | to=Bob, rel=knows | (Link) |
| 5 | `Alice : VIP` | SIG | Alice.type | designation=VIP | `+` / Entity |
| 6 | `!eva Alice.tier : Bronze -> Gold` | EVA | Alice.tier | from=Bronze,to=Gold | `+` / Figure |
| 7 | `Region <- [TN, KY, AL]` | SYN | Region | parts=[TN,KY,AL] | (aggregate) |
| 8 | `!rec vocabulary:status ...` | REC | vocabulary:status | old/new terms | (Paradigm) |

---

## 9. Error handling

An ingester MUST classify each line as *event*, *empty* (§4.2), or *malformed*. A malformed line MUST NOT be silently dropped; the ingester MUST emit a diagnostic recording the line number, the raw text, and the failed expectation, and SHOULD continue with subsequent lines. The following are malformed:

- a colon adjacent to whitespace on only one side (§4.3);
- a LINK missing its `: REL` label (it would be indistinguishable from an EVA transition);
- an unterminated quoted string or unbalanced `[]`/`{}`;
- an unknown flag after `!`;
- a value in IS-A or LINK target position (targets are signs/paths, never literals);
- an entity reference in DEF value position (relationships use LINK, §4.5).

Recovery rules (§7) never produce errors; they only assign operators. Ambiguity that cannot be resolved by the rules is a grammar error, not a recovery failure.

---

## 10. RDF / OWL interoperation

OWL and RDF are static assertion sets; EOT (like the EO log) is a stream of operations. An RDF importer lowers each triple to the EOT statement that would have produced it, then EOT lowers to tuples per §8. IRIs become signs (tight-colon CURIEs); anchors are minted on first INS. The importer SHOULD set `mode: "asserted"` for stated triples and `mode: "inferred"` (with `agent: "reasoner"`) for entailed triples, so provenance distinguishes the two.

| RDF / OWL construct | EOT statement |
|---|---|
| `s rdf:type C` (first sighting of `s`) | `s : C` → INS |
| `s rdf:type C` (re-classification) | `!sig s : C` → SIG |
| `s P o`, `P` an `owl:ObjectProperty` | `s -> o : P` → CON |
| `s P v`, `P` an `owl:DatatypeProperty` | `s.P = v` → DEF |
| `C rdfs:subClassOf D` | `C -> D : subClassOf` → CON (Paradigm site) |
| `owl:Restriction` / cardinality / `someValuesFrom` | `C.P = <constraint>` (DEF, registers a boundary §8.5); membership tested as EVA |
| `rdfs:domain` / `rdfs:range` | `P.domain = C` / `P.range = C` → DEF |
| `owl:sameAs a b` | `a == b` → SYN(identity) |
| `owl:disjointWith C D` | `!seg C \| disjoint:D` → SEG |
| `owl:equivalentClass C D` | `C == D` (collapse) or `C -> D : equivalentClass` (assert) |
| `owl:imports` / `owl:versionInfo` / `owl:deprecated` | `!rec` on the affected vocabulary → REC |
| `owl:Nothing` / retraction | `x.p = ∅` → NUL |

Open-world entailment has no native operator: an importer either materializes the reasoner's closure and ingests entailed triples as DEF/CON with `agent:"reasoner"`, or keeps entailment as a read-time projection over the asserted log (the more EO-faithful, heavier option).

---

## 11. Minimal model-facing legend

This is the **entire** prompt fragment required for a small local model to emit the core profile. It teaches three shapes and one glyph; the ingester does the rest.

```
Write each fact on its own line.
  X : Type            an X is a Type            e.g.  Alice : Person
  X.field = value     X's field has a value     e.g.  Alice.age = 30
  X -> Y : relation   X relates to Y            e.g.  Alice -> Bob : knows
Use  nil  for a missing/empty value:           e.g.  Alice.email = nil
Quote values that contain spaces:              e.g.  Alice.note = "needs review"
(Optional) end a line with who/when:           e.g.  ... @intake ~2026-06-26
```

Six lines. No operators, no faces, no addresses. Everything in §5.4–§5.6 is an optional escape hatch the model reaches for only when it wants to force a rarer operator; absent that, NUL, SIG, and EVA are recovered automatically (§7.2).

---

## Appendix A — Operator reference

Helix order; Triad = Domain. Exact `[α, η, Ω]` coordinates are a fixed lookup in the EO operator registry and are not reproduced here.

| # | Op | Glyph | Greek | Triad (Domain) | Surface origin |
|---|---|---|---|---|---|
| 1 | NUL | ∅ | ν | Existence | `= nil` / `!nul` |
| 2 | SIG | ○ | σ | Existence | repeat `:` / `!sig` / `!clm` |
| 3 | INS | ● | α | Existence | first `:` |
| 4 | SEG | ｜ | κ | Structure | `\|` / `!seg` |
| 5 | CON | ⋈ | ε | Structure | `-> :` |
| 6 | SYN | △ | η | Structure | `<-` / `==` / `!syn` |
| 7 | DEF | ⊢ | δ | Significance | `=` |
| 8 | EVA | ⊨ | ψ | Significance | `!eva` / boundary-crossing `=` |
| 9 | REC | ⊛ | Ω | Significance | `!rec ... =>` |

## Appendix B — Decal (Object-axis) derivation

The surface omits the decal; the ingester sets it from the target kind. `omega` is the Object/Time coordinate.

| Target kind | Object position | Decal (ω) | Site-face reading |
|---|---|---|---|
| concrete individual / entity | Figure | `+` | Entity (Existence×Figure) |
| type / class / concept / vocabulary | Pattern | `*` | Kind / Paradigm |
| ambient condition / ground / field | Ground | `−` | Condition (Existence×Ground) |

The operator fixes the Act face (Mode × Domain); the target kind fixes the Object decal; the Site face (Domain × Object) follows from the two. An operator emitted without a resolvable target kind leaves ω **unresolved** — a legitimate diagnostic state — until a later event pins it.

## Appendix C — Sigil quick card

| Sigil | Means |
|---|---|
| ` : ` | is-a (spaced) |
| `:` | namespace sep (tight) |
| `.` | path field |
| `=` | set value |
| `nil` / `∅` | empty value |
| `->` ... `: r` | relate (with label) |
| `<-` `[...]` | aggregate from parts |
| `==` | same entity |
| `\|` | partition by key |
| `=>` `{...}` | remap vocabulary |
| `!xxx` | force operator xxx |
| `@who` | agent |
| `~when` | timestamp |
| `#` | comment |

---

*End of specification.*

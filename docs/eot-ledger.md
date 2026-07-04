# The EOT ledger — the machine, read out in EOT

**Record ID:** spec:eot-ledger
**Status:** shipped
**Holon:** `src/audit/` (sibling to the per-turn trail, `audit/log.js`)
**Surface:** a terminal drawer in the running app (`Ctrl`/`Cmd` + `` ` ``)

## What it is

A live, append-only **terminal feed** of every operation the app performs —
a source read, a web search, a route decision, a prompt, a generation, a
citation bind, a veto — each printed as **one EOT surface line**
([`eot-surface-syntax.md`](eot-surface-syntax.md)) the moment it happens, with
its `@agent ~ts` provenance trailer and its door. The whole session exports as a
`.eot` document that re-parses through the ingester with no loss, or as a
`.jsonl` trail carrying the verbatim prompts and outputs.

The per-turn audit ([`audit-schema.md`](audit-schema.md)) records *one turn* in
depth. The ledger records *every operation* in breadth, in the engine's own
nine-operator vocabulary. Same stream, a second reading — so the terminal shows
the machine in the syntax the machine already speaks
([`operators.md`](operators.md)).

## Why EOT, and why the door

The nine operators are the genome. Reading emits them, the graph projects them,
the audit records in them. Rendering the operation stream back **into EOT** means
the audit is not a parallel narration bolted on the side — it is the same log,
read out. Auditable means **re-runnable**, not merely legible: paste the export
back through `parseEOT` and you get the events again.

The **door** is load-bearing ([`../src/core/provenance.js`](../src/core/provenance.js),
[`../tests/eot.test.js`](../tests/eot.test.js)). Two kinds of operation must never
be confused in a generative machine:

| Door | What it is | Witness? | In the terminal |
|---|---|---|---|
| **perceiver** | the world it read — a page, a search result (exafference) | **can** witness | green `▸` |
| **enactor** | the model's own act — a route, a prompt, a generation (reafference) | **cannot** witness | amber `◂` |

So a read runs green and a generation runs amber, and the trail never lets the
model's own conjecture pass for the world it read. That distinction is the whole
point of auditing a machine that both reads and writes.

## The operation vocabulary

Each app verb lowers to a fixed EO shape (`src/audit/eot-ledger.js`):

| Verb | Door | Op | EOT line |
|---|---|---|---|
| read a source | perceiver | CON | `session -> <src> : read @reader ~t` |
| the fold it minted | perceiver | SYN | `reader:<n> <- [INS-42, CON-10, …] @reader ~t` |
| search the web | perceiver | CON | `session -> <query> : searched @reader ~t` |
| sources found | perceiver | SYN | `sources <- [<a>, <b>] @reader ~t` |
| learned an entity | perceiver | INS | `<entity> : Person @reader ~t` |
| route a turn | enactor | SIG | `!sig turn:t7 : grounded @model ~t` |
| retrieve spans | enactor | DEF | `turn:t7.spans = 6 @model ~t` |
| prompt the model | enactor | DEF | `turn:t7.prompt = "540 chars" @model ~t` |
| generate an answer | enactor | CON | `turn:t7 -> answer : generated @model ~t` |
| bind a citation | enactor | CON | `<claim> -> s2 : cites @model ~t` |
| a veto fires | enactor | EVA | `!eva turn:t7.c1 : asserted -> refused @model ~t` |
| a draft is superseded | enactor | SEG | `!seg turn:t7.draft \| superseded @model ~t` |

A free-text reference (a URL, a query, a claim) is not a bare `SIGN`, so the
surface **slugs** it to a clean, re-parseable identifier and keeps the verbatim
in `raw` — the line stays canonical EOT, the audit keeps the original.

## How it's wired

- **`src/audit/eot-ledger.js`** — a pure, zero-dependency leaf: the ring buffer,
  the operation constructors, the EOT line renderer (the deliberate inverse of
  `ingest/eot.js`), and the `.eot` / `.jsonl` exports.
- **`src/audit/eot-terminal.js`** — the browser surface: a self-contained dark
  drawer mounted under `<body>` (outside the React root, so a re-render never
  clobbers it), tailing newest-at-the-bottom, with door / text filters, pause,
  copy, export, and clear. Click a line to unfold its verbatim payload.
- **The app** (`src/reader/app.dc.js`, `scripts/build-reader.mjs`) exposes the
  ledger as `window.__eot`; `feedLine` and `ingest` mirror into it, and the model
  bridge is wrapped at boot so every prompt and generation is captured verbatim.

## Guarantees (pinned by `tests/eot-ledger.test.js`)

1. The `.eot` export **re-parses through the real `parseEOT`** with zero
   diagnostics — one parsed event per record, no silent drops.
2. The door the ledger stamps is the door **core's `canWitness` would assign** —
   reading witnesses, generation does not. The tie is structural, not decorative.
3. The verbatim prompt and output ride in `raw` — the load-bearing audit artifact.
4. The ring buffer holds the last N and **counts what rolled off**; the export
   reports the drop honestly (§9: never a silent discard).

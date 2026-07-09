# The significance the reader infers — promoted to the graph, with its provenance

> The inner monologue is supposed to make the connections that are **not explicitly in the text** —
> the significance of it all. For those to matter they have to reach the physics: a claim can't
> become corroborated or contested by a thought that never touches the graph. This is that channel —
> the reader's inferences promoted as real edges that **carry their provenance**, so they move the
> reading without ever being mistaken for what a source witnessed.

## The gap this closes

`deep-reading.js` voices a reflection as a plain-text note; `weave.js` connects reflections across
the corpus (echo · bears-on · analogy). Both are held **only as substrate nodes** — they enrich the
reading but cannot *move* it:

- a reflection is op `EVA`, and `projectGraph` skips `EVA` by type — no edge;
- a `weave` connection carries no `src`/`tgt` endpoints — no edge.

So the significance the reader reads was inert to the physics. The future surface
(`EOReader.dc.html`) is a **provenance graph** whose load-bearing edges are lateral —
`corroborates`, `contradicts`, `bears-on` between passages — and *those are exactly the relations no
single source states*. The reader infers them. They need to be on the graph.

## The key fact that makes it safe: `projectGraph` carries provenance per edge

`projectGraph` builds an edge from every `CON`/`SIG` event **and rides the event's provenance onto
the edge** (`core/project.js`: *"the DOOR rides through the projection … an enactor-door edge can
orient but never corroborate a claim as world"*). So the witnessed record is not "the edges without
the inferences" — it is the **`canWitness`-true subset** of the edges:

- a **parser** edge has no provenance → `canWitness` true → *witnessed*;
- an **inference** edge carries `fromEnactor` provenance → `canWitness` false → *the reader's own*.

The firewall was never "keep inferences off the graph." It is "keep them **distinguishable** on the
graph." That is already the architecture — this channel just uses it.

## The three connections (`fold/significance.js`)

All read model-free off the witnessed structure (`perceiver/structureSurface`), none authored:

| kind | what the reader infers | read off |
|---|---|---|
| **contradicts** | the same bond affirmed and denied — a tension the text never resolves (→ a claim goes *contested*) | a polarity clash on `(src, stem(via), tgt)` |
| **connects** | two figures that never meet in the text but both bear on a third — the latent link "in potential" | a shared target neighbour with no direct edge |
| **corroborates** | the same bond asserted from two places — convergence that *strengthens* a claim | one bond, one polarity, ≥2 distinct sentences |

Each is promoted as a `CON` edge that is **reafference** (`fromEnactor` → `canWitness` false, the §8
firewall), band **void**, tagged `inferred:true`, and sits **between the real figures** — so
`projectGraph` depicts it (the impact) carrying its provenance (the safety).

## What it does to the physics — measured

`eoreader4-eval/significance-physics.mjs`, model-free, three samples:

| doc | connections inferred | edges + | surf field L1 | facts added | inferred overlay | firewall |
|---|---|---|---|---|---|---|
| affirm-and-deny | 1 contradicts · 1 connects | +2 | 0.49 | **0** | 2 | intact |
| convergence (echolocation) | 3 connects | +3 | 0.79 | **0** | 3 | intact |
| alliances (common adversary) | 3 connects | +3 | 0.67 | **0** | 3 | intact |

Every promoted connection is a real edge the surf, retrieval and the provenance graph read — the
attention field **moves** (L1 0.49–0.79), a figure becomes reachable from another it never met — while
the **witnessed record is byte-unchanged** (`factsAdded 0`) and the inferences ride as a labelled
overlay (`inferredAdded N`, every edge `canWitness` false). *Impact without laundering.*

```js
import { weaveSignificance, readSignificance, firewallAudit } from './src/fold/index.js';

const w = weaveSignificance(doc);              // infer the connections, commit them as reafferent edges
w.kinds;                                       // { contradicts, connects, corroborates }
readSignificance(doc);                         // read them back off the log
firewallAudit(doc);                            // { factsAdded: 0, inferredAdded: N, intact: true }
```

## The audit was measuring it wrong — now it isn't

`firewallAudit` (`fold/audit.js`) previously counted **any** added edge as `factsAdded`, so a
legitimate provenance-tagged connection read as a breach. It is now **provenance-aware**: it strips
by the reader-inference tag (`reflection | connection | inferred`) and counts `factsAdded` over the
**witnessed** subset only. A reafferent connection lands in `inferredAdded` (intact); a reflection
*mis-minted* with a world-door prov still lands in `factsAdded` (breach). The teeth stay; the false
alarm is gone. See `docs/monologue-audit.md`.

## Where it lives

| concern | file |
|---|---|
| the connector (infer + promote) | `src/fold/significance.js` (`weaveSignificance`, `inferSignificance`, `readSignificance`) |
| the provenance-aware firewall | `src/fold/audit.js` (`firewallAudit`: `factsAdded` vs `inferredAdded`) |
| the physics battery | `eoreader4-eval/significance-physics.mjs` |
| tests | `tests/significance.test.js` |
| the edge that carries provenance | `src/core/project.js` (the `prov` spread onto a `CON`/`SIG` edge) |
| the firewall type it rides | `src/core/provenance.js` (§8, `canWitness`) |
| the connections it complements | `src/fold/weave.js` (echo · bears-on · analogy, held as nodes) |

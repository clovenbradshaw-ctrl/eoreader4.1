# The referent journey — the weave, and the nesting the address hid

The goldens are mono-referential: one Gregor, one Alice, one protagonist a
first-person "I" resolves to. That is the wrong bed for three questions the system's
whole generation-steering story rests on — *does each referent travel a staged arc?
are texts about weaving referent-journeys together? does the weave nest holonically?*
With one character there is no weave to measure and no nesting to find. So we ran the
reader over the extreme opposite case: **War and Peace**, hundreds of characters,
threads running in and out across the whole length.

Reproduce it (the tool fetches the book from the GITenberg mirror once and caches it
under `tools/referent/.cache/`, gitignored — the 3.2 MB text is never committed):

```
node tools/referent/journey.mjs                 # a 700 KB read (the numbers below)
node tools/referent/journey.mjs --chars 0       # the whole book (minutes)
node tools/referent/journey.mjs --text any.txt  # any multi-character text
```

All figures below are that default read: 700 KB after boilerplate strip, 7,628
sentences, 666 entities, **199 referents with ≥8 attributed events** — the full
ensemble present (Pierre, Natasha, Kutuzov, the Rostovs, the Bolkonskys). They shift
with the read window; the *conclusions* do not.

## 1. The journey — born, then relational; not a staged arc

**Each referent does NOT travel its own INS→CON→EVA arc.** Once a referent is alive it
is continuously instantiated, bonded, and (rarely) reflected on across its whole span —
there is no within-life progression from existence to structure to interpretation.

The one boundary-tendency that holds: a referent is **born before it is bonded** —
115/190 (61%) have their first `INS` before their first `CON`/`SIG`. It is a majority,
not a law, and it is *weaker at scale* than a tiny sample suggests (an early
exploratory pass on a few paragraphs read 81%). A referent bonded before it is ever
instantiated is a dangling reference — a real defect a generator can flag.

And the correction the bigger sample forces: **long-span hubs and short-span threads
have the same operator mix.**

| population | Ground (Existence) | Structure | Interp |
|---|---|---|---|
| all 199 | 54% | 40% | 6% |
| 100 long-span hubs | 55% | 39% | 6% |
| 99 short-span threads | 51% | 42% | 6% |

An early small-sample pass claimed hubs *accrue interpretation* while threads stay
merely connective. **That does not replicate.** The interpretation operators
(`EVA`/`SYN`/`REC`) are discourse-level and rare (≈6%), and barely entity-attributed
(3,596 of ~13k events attach to no referent at all), so there is no per-referent
"reflection" signal to separate a Pierre from a Shinshin. **What differs between
referents is span and connectivity — how long and how connectedly a thread runs — not
the KIND of operation that happens to it.** The honest version is narrower than the
first guess, which is what a bigger, honest sample is for.

## 2. The weave — a dense *parallel* bundle, not a hand-off

This is the strongly-confirmed result, and War and Peace is its extreme case. The
threads co-run; they do not hand off.

- **mean pairwise coverage 0.73** — take any two threads; the shorter sits almost
  entirely inside the longer's reading-span. (Union-normalised Jaccard is 0.31, pulled
  down by the many short threads — the two numbers together *are* the parallel-weave
  signature: modest Jaccard, high coverage.)
- **49% of all thread-pairs** have one nested inside the other's span.
- **introduction timing spreads 0.00 → 0.99** — referents are woven in continuously
  across the entire reading, not front-loaded.

The span picture is the novel's architecture laid bare — long protagonists spanning the
whole length, mid-length threads, short ones woven in and out:

```
prince   ··████████████████████████████████████████  94%  n=606
pierre   ···█████████████████████████████████·····   82%  n=319
rostov   ·······████████████████████████████████    81%  n=216
denisov  ····················███████████████████·    49%  n= 75
bagration ··················██████████████··         34%  n= 61
```

A big novel **is** a dense parallel weave of hundreds of overlapping character-journeys.
This is the referent-level identity of the flow work: the document's trajectory is the
*superposition* of these threads. It is exactly the geometry that separated the esker
narrative (high overlap, parallel) from the volcano essays (low overlap, sequential
hand-off) — now at scale — and it is a steerable register control: threads that never
overlap read as episodic and thin; concepts that all co-run read as tangled.

## 3. The nesting — real, deep, and the flat address used to throw it away

The weave has genuine hierarchical depth. Span-containment gives a **median full
nesting of 108** (a short thread sits inside 108 longer ones), a **maximum of 178**,
and **642 referents nested ≥3 deep**.

But `core/holon.js` — the address machinery built to descend containment level by level
(`parseHolon(path).depth`, `containsHolon`) — never received a *referent* with a nested
path. Admission mints a flat id (`pierre`, `prince`), so **every referent parsed to a
depth-1 atom** and the holonic depth stayed permanently 1. The nesting lived only in
span-containment and the relation graph; the addresses discarded it.

**That is fixed.** `perceiver/referentNesting(doc)` (in `src/perceiver/referent-nesting.js`)
is a pure read over `(log, graph)` — nothing is stamped on an event, the log stays the
single source of truth, and the address is DERIVED exactly like `projectGraph` and
`eoAddressOfEvent`. For each merged referent it reads the span off the mention stream,
finds the threads whose span strictly contains it, takes the **tightest enclosing
thread** as the holonic parent, and joins a real containment path — so
`parseHolon(address).depth` finally recovers the holon level the flat id hid. On the
same read: **holon depth now reaches 16**, and only **18 of 666 referents remain at
depth 1** (the outermost threads, correctly). Two numbers ride together, because
containment is a partial order (a DAG), not a tree:

- `depth` — the holon LEVEL: the length of the tightest-container chain (what the
  address encodes). `cato.address === 'airing.bardo.cato'` ⇒ depth 3.
- `containedByCount` — the FULL nesting: every longer thread this one sits inside (the
  108-median / 178-max), the raw depth of the weave at that referent.

The robust per-referent signals — the ones that survive a big sample — are therefore
**span**, **introduction timing**, **connection count**, **nesting depth**, and the
**born-before-related** ordering. Not "hubs get reflected on." Those are the signals the
generation-steering work wanted and the addresses did not carry; now they do.

## Two honest caveats

- **`prince` at ~600 events is a coref conflation** of every prince (Andrei, old
  Bolkónski, Vasíli) — the parser merges them, which inflates the top thread. The weave
  signal is robust to this; per-character identity resolution is not.
- Several "threads" (`god`, `french`, `come`) are abstractions, demonyms, or verb
  artifacts, not characters. Again the aggregate weave is robust; the individual
  attributions are noisy.

## The synthesis

Of the three intuitions, the middle one is the most decisively confirmed and the outer
two are half-right. Texts **are** weaving referent-journeys together — the parallel
weave is the clearest thing here. The journeys **do** nest holonically — confirmed
structurally, and deeper than a first guess, and now the parser *represents* the depth
it used to flatten. But each referent does **not** travel a staged inner arc; it is born
and then lives relationally, and what distinguishes a Pierre from a Shinshin is how long
and how connectedly its thread runs — span and nesting, not the shape of an inner
journey.

## Artifacts

- `src/perceiver/referent-nesting.js` — `referentNesting(doc, graph?)` and
  `nestingSummary(nesting)`, exported through the perceiver face.
- `tests/referent-nesting.test.js` — the containment → holonic-depth → address chain,
  on a text with an engineered nesting.
- `tools/referent/journey.mjs` — the reproducible read (journey · weave · nesting).

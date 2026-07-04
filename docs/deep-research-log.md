# Deep research — grounded projection over an append-only log

**Status: shipped (Phases 0–3 of the proposal, plus the live surface).** The
research mode where the report is not written, it is *projected*. Every fact is
an extractive span at a pinned archive address; importance is not assigned but
earned — Bayesian surprise straining a frame until it restructures; coverage is
measured by the cube, not asserted; questions fire on the measured conditions
the physics already watches (a null, a contradiction, a reframing); and the
language model is confined to one bind-checked phrasing call per section. The
whole document is `projectReport(log)`. It never severs the claim-to-span link,
so clickable exact-citation is not a feature added afterward — it is the log
made visible.

## The seam this closes

LLM deep-research is unreliable at a single seam: summarization severs
provenance. Read a source, let the model restate the facts in its own words,
and the tie to the exact span is gone; the model then writes with citations it
has to *reconstruct*, which is where fake citations and unsupported claims come
from. The dolphin-essay audit showed exactly this: footnotes that did not
clearly connect to the propositions they were meant to carry. **That link is
the unit here.** A citation `[n]` in the chat reply quotes the exact span under
it; a citation in the report links to (and highlights) the embedded evidence
block; a summary sentence that binds to no span is greyed as *glue* — marked,
non-clickable, carrying no claim — or dropped, and the VERIFY line
(`N/N sentences bind, K glue, D dropped`) is itself an event in the log.

## The log (src/research/events.js)

A `ResearchEvent` log, append-only, projected exactly like TaskEvent
(`src/tasks/`, `src/frame/`) — path ids, pure fold, frozen events, logical `t`
(never a wall clock), byte-reproducible replay.

| event    | carries                                                          | operator |
|----------|------------------------------------------------------------------|----------|
| open     | a frame (root question or pushed sub-question), subject, scope    | DEF / INS |
| pin      | a source resolved to a dated archive snapshot: id, capture time, content hash | — (provenance anchor) |
| read     | a span from a pinned source, its bind score vs. the null          | SIG |
| extract  | a span promoted to a grounded proposition — the span address IS the fact | — (selection) |
| eva      | the enacted-loop test: verdict, surprise, strain Δ, **and the band/threshold that judged it** | EVA |
| con      | a proposition-equivalence edge: corroborate or contradict         | CON |
| rec      | strain broke the frame: forcedBy, strain sum, the new frame       | REC |
| void     | a measured absence: never-set / elsewhere / Kind-gap / Entity-gap | NUL → DEF-to-VOID |
| ask / answer | a question surfaced with its measured trigger, and the reply  | — (human input, logged) |
| promote  | a proposition enters the report at a section                      | — (projection input) |
| phrase   | the ONE model call per section: sentences with per-sentence bind-back, **plus the exact prompt and raw output** | — (VERIFY, logged) |

`projectReport(log, cursor)` (src/research/project.js) folds this into the
sectioned document: the outline is the frame tree, the ordering is
significance, the evidence is the pin + extract spans, embedded. `liveView`
(live.js) is the same projector reshaped for the process panel. Both are pure
and memoized by (log, cursor); nothing animates that is not an event.

## Importance is earned; coverage is measured

Significance order, read off the log: REC-forcing spans first (the
reframings), then strain magnitude, then the frame's load-bearing DEF terms,
with confirmations underneath as corroboration. The convergence badge rides
`rec` gaps: growing gaps → converging/settled; dense distinct RECs →
contested; repeated A→B→A over few frames → thrash (kept apart from honest
turbulence). The coverage grid folds each extract's cube address onto the Act
face; empty cells are triaged findings or gaps to research, never smoothed
over; a proposition off the Object diagonal (core/cube.js `coherence`) is
residue — the frame is incomplete, extend it.

## The full surf is auditable

Every judgment can be re-derived from the log alone: each `eva` carries the
causal band/threshold that judged it (calibrateReader over the *past* only);
each `phrase` carries the exact prompt and raw model output; the surface and
the standalone page export the whole log as JSONL and render the collapsible
trace under the report. Evaluating how the surf is doing needs no extra
instrumentation — the log is the instrument.

## Two hosts, one surface — and it is never dead

`src/research/surface.js` mounts the whole thing into any DOM element:

- **The main app** (composer → *Research* / *Surface*): `Research` runs the
  grounded projection on the box text (`/research …` and `/essay …` in chat
  land on the same path); `Surface` docks the live panel in the right panel.

The surface is a *live* projection, not an artifact: `createResearchSession`
(session.js) holds ONE append-only log across asks. Every further research ask
via chat appends a new frame tree to the same log (pins dedupe by content
hash), every subscriber re-projects, and the report keeps populating and
adjusting — coverage, corroboration, the badge, and the residue aggregate
across asks for free, because they are folds.

## The essay organs are gone

The commissioned-essay pipeline (organs/out/essay.js, essay-types.js, the
eo-gen essay adapters, the composer output picker, `/essay` as an organ
command) is removed. It asked a small model to write confident long prose it
could not ground. Essay/report-shaped asks now flow through `_wantsLongform`
into `_deepResearch`; a thread whose last turn was research continues as
research into the same session log. `composeArtifact` (poems and other
creative pieces) is untouched — that register is honest invention and says so.

## Evolutions from the proposal (deliberate)

1. **Cube addressing of extracts** is an injectable classifier with a
   transparent lexical fallback (`addressOfSentence`) — deterministic cues, so
   the coverage grid is never a model judgment. The phasepost centroid reader
   can be injected when a vector organ is live.
2. **Corroboration/contradiction** rides the injected-embedder path
   (perceiver/proposition-equivalence.js) when available; offline it is a
   term-overlap + polarity fallback with the same `con` event shape.
3. **`phrase` is an event kind** — the proposal logged VERIFY as a side note;
   here the one generative step, its prompt, its raw output, and its
   per-sentence bind-backs are all in the log.
4. **Archive pinning degrades, provenance does not**: unreachable archive.org
   (or a pasted source) yields a *local pin* — content hash + capture time —
   and the embedded span remains the record; the link is corroboration, not
   the sole record (`src/archive/pin.js`).
5. **The significance loop is run per-frame inside the driver** over the
   extract arrival order (calibrateReader causal band, leaky strain,
   accumulation REC), rather than routing through core/enacted/loop.js's
   integer-cursor API; the discipline (arrow of time, causal calibration,
   confirm-band, leak) is identical and every value is logged.
6. **The live surface** (the proposal's Phase 4) shipped as the session +
   subscribe seam rather than a cursor-scrubbing player; the log's `t` makes a
   scrubber a pure UI addition later.

## Tests

`tests/research-log.test.js`: the Bieber non-regression (off-topic corpus → a
measured VOID with terrain + receipt, never a false-matched report); importance
ordering; coverage/residue triage; the convergence badge and the thrash
detector; bind-back glue + the audited phrase event; provenance integrity
(byte-stable projection, embedded evidence); pin fragments and offline pin
degradation; ask triggers (corpus, void, depth) firing on their measured
conditions and nowhere else; the live session appending across asks; JSONL
audit export; fallback parity (no model → spans-only, never worse than today).

Relates to: significance-loop.md, cube.md, answerability.md, frame-holon.md,
frame-binding-route.md, curiosity-research.md, edge-grounding.md,
persistence.md, web-search.md.

# EO Reader — Chat & Research Redesign

Two prototypes and the reasoning behind them. Both are **Design Components**
(`*.dc.html`) that open directly in a browser and use EO Reader's real design
tokens (`--acc:#5b34d6`, the card/ink/line greys, system sans) and its real
provenance-marks CSS. They are faithful mocks meant for iteration — the winning
patterns get ported back into `src/reader/view.xdc.html` and the turn pipeline.

---

## Files

- **`EO Chat.dc.html`** — the chat surface: emergent composer + de-stacked
  response + per-proposition grounding.
- **`EO Essay Output.dc.html`** — a redesign of one real turn ("write an essay
  about dolphins"), rebuilt from the exported audit log, showing how drift and
  grounding should be presented.

---

## Part 1 — The composer: from six manual controls to one emergent read

### Before

The composer carried six peer controls in a wrapping row — **research/web
toggle, depth, strategy, register (auto/grounded/creative), provenance display
(hover/lines/off), and a deep-research split button** — plus a hint line. They
overlapped in meaning, cycled through opaque states ("obsessive", "holonic"),
and asked the user to *choose* the machinery of an answer before asking a
question.

### After (`EO Chat.dc.html`)

Every setting is **emergent — read off the ask and the field, never selected.**
This is EO's own thesis ("it is all physics, not decisions") applied to the UI.

- The composer is just an input + **Ask**, with a live **"Reads as"** readout
  above it. As you type, the route resolves:
  - **intent** — a relational/causal ask ("why", "how", "compare", or a long
    ask) relaxes into *research*; a lookup stays a single *answer*.
  - **depth** — a length demand read off the ask's complexity (brief / standard / deep).
  - **register** — *grounded* by default; *creative* only when the wording is
    speculative ("imagine", "suppose", "what if") and leaves the library.
  - **breadth** — follows intent (precise / broad).
- The readout chips are a **readout, not buttons.** There is nothing to set.
- **Provenance display is emergent too** — clean hover-reveal at rest, no toggle.
- The **register badge on each answer** stays as the honest confirmation of what
  the turn *actually* used, matching the existing "badged with the register it
  actually used" behavior.

**Port note:** replace both composer button rows in `view.xdc.html` (~line 462
and ~line 1256) with the readout; delete the `onCycle*` / `onToggle*` /
`onOutput*` handlers; derive each turn's config from a `_read(query)` at send
time instead of from stored mode state.

---

## Part 2 — The response: every proposition grounded, including "the void"

### Before

The answer stacked many collapsible sections (research trace → thinking →
register badge → bubble → "write it / just answer" → grounding refs → reflection
→ related → revision → note). Grounding was partial and coarse — a block of
reference chips under the whole answer.

### After (`EO Chat.dc.html`)

The response is **de-stacked** to: research panel → answer → compact sources →
one subtle meta line (register pill + expandable "reasoning"). And grounding
moves to the **proposition** level:

- **Every phrase carries a visible marker** — a green source chip (`S1`, or
  `S7 +1` when corroborated), a grey `○` for the model's connective tissue, an
  accent `✦` for the model writing freely. Nothing is unmarked.
- **Click any proposition → a provenance modal.** Source-grounded phrases show
  the exact passage(s), host, and read-time with *go to line →*; corroborated
  claims list every independent witness under a "corroborated" header.
- **"Grounded to the void" is a first-class, honest state.** When a phrase is
  the model's own — connective or creative — the modal says so plainly ("It is
  grounded to the void, not to a span, and marked so you always know"), shows
  *the edge of what I have read*, and offers **✦ Research this** to try to bind
  it to a real source. This mirrors EO's rule that a claim tied to no span is
  normally struck — but the void-grounded claims that *do* appear are labeled
  and traceable like everything else, never hidden.

---

## Part 3 — The dolphins case: diagnosis from the audit

`EO Essay Output.dc.html` rebuilds one real turn ("write an essay about
dolphins") from the exported audit log. The audit revealed a **chain** of
failures, not one bug.

### 3a. The engine drifted off-topic

The crawler chases the *most surprising* token — and surprise leads **away** from
the topic:

- step 40: *"most surprising turn is 'aquaman' — chasing it"* → Dolphin (character)
- step 56: *"Following 'dolphin'"* → **Miami Dolphins (NFL)** (+809 entities)
- step 61: *"Following 'merluccius'"* → **Fishing industry in Peru** (+482)
- step 66: *"Following 'want'"* → **Bills–Dolphins rivalry** (+322)

"Write an essay about dolphins" (the animal) ended up learning **4,817 entities
dominated by Buffalo Bills, Marino, Flutie, Orchard Park.** A relevance guard
exists (steps 15, 28: *"Set aside — drifting off topic"*) but fired
inconsistently — it dropped a brain article and paleobiodb while letting three
NFL/fishing pages straight through. The system even admits it in the answer:
*"the picture shifted partway through the read."*

There was also a **prompt leak**: the search query became the LLM's own meta-reply,
*"Here are 5 distinct search queries that open different angles…"* (steps 2, 20).

### 3b. The presentation compounded it

- Boilerplate arc headers, mechanically filled: *"origins and history of
  physical characteristics of dolphins,"* *"how physical characteristics of
  dolphins works,"* *"criticism and controversy around…"*
- Leaked instructions per section: *"Here is a summary of the text in plain
  prose, 2–5 sentences per excerpt:"* — and one section dumped a raw numbered
  list 1–13, cut off mid-word at "[57]."
- **84 "grounded spans" were really ~15 unique spans repeated 6×** (the same
  "male dolphins herd females" span appears as [17],[47],[65],[79],[94],[109]).
- Raw internals leaked to the UI: `pinned locally (fnv:157b32d6…)` ×7,
  `_84 grounded spans · contested_` and `VERIFY: 38/51 bind, 13 glue` as
  **unrendered markdown**, plus `shifted the picture`, `(⌕)`.

### 3c. The redesign, failure by failure

| Failure in the audit | Fix in `EO Essay Output.dc.html` |
|---|---|
| Silent topic drift | A calm **sense-lock**: "Reading 'dolphins' as the animal" + one-tap ⇄ to the NFL sense. |
| 4,817-entity football pollution | The 4 drifted pages are **set aside by default**, listed under **review**, each with **Restore** — nothing hidden, nothing silently skewing the read. |
| 112-step trace with raw hashes | Four human phases ("How this was read"): read the ask · 8 sources / 13 hops · **4 set aside (amber)** · 51 sentences grounded. No hashes, no jargon. |
| Boilerplate headers + "Here is a summary…" | A real essay — clean sentence-case sections, no instruction echoes, no raw list dumps. |
| 84 duplicated spans | **8 deduped sources**, each showing how many spans it backs ("6 spans"). |
| `_VERIFY…_` raw markdown | One rendered line: "38 of 51 sentences bound to a passage · 13 connective · 8 sources · 4 off-topic set aside." |
| Coarse grounding | Every sentence carries its own inline marker and opens the provenance modal (source passage, or honest "grounded to the void"). |

### 3d. Root cause a prototype can't fix

The **"chase the most surprising token"** crawl strategy actively *rewards* drift
(surprise = novelty = off-topic). The real fix is a relevance gate on every hop,
scored against the locked topic sense. Surfacing set-aside decisions the way this
prototype does makes that gate's calls **visible and correctable** instead of
silent — but the gate itself belongs in the crawl, upstream of the UI.

---

## Suggested next steps

- **Wire the sense-lock to the entity panel** — restoring/keeping a set-aside
  source should add/remove its entity cluster, keeping the ~4,500-entity list
  scoped to the topic instead of 80% Buffalo Bills.
- **Show drift live** — surface "⚠ this hop is drifting off 'dolphins (animal)'
  — follow anyway?" in the composing trace, so it's caught at hop 56 rather than
  after 84 spans are pinned.

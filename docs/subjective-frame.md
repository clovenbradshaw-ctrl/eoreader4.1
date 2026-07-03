# The subjective frame — what the reader is, not what the sources are

Status: implemented. Follow-up to, and partial reversal of, `prompt-assembly.md`.
That spec made two changes: feed the talker the fold's arrows alongside excerpts,
and make the notes the arrows. The June 20 correction reverses both. The arrows
leave the prompt (they causalize), the talker reads verbatim spans only, and it
reads them **as the one who read them**. Structure stays in the grounder — in
selection, order, and the edge-grounding veto (`edge-grounding.md`) on the way
back. Extends `grounded-speech.md` and `conversational-provenance.md`; the test of
record is the conversational battery in `metamorphosis-battery.md` (gold mark
zero).

## The bug, in the audit's own numbers

The battery run (`who is gregor's sister?` → `prove it` → `huh?` → `prove what you
are saying about her life circumstances`) failed gold mark zero. The answer key
says the opening transformation is Gregor's: he wakes as vermin. The talker said,
twice, that the transformation is the **father's**. Three numbers say how it got
out:

- t1: `bind.claims: 4, cited: 0`; the refusing veto fired; `gated: false` — the
  answer shipped anyway.
- t1/t4 factcheck: `contradicted: 0, offDiagonal: 0` — a flatly false claim drew
  no contradiction, because the edge-grounding veto checks a claimed edge against
  the document reading's edges, and `Gregor -> insect : transformed-into` was
  never in that reading to contradict against.
- t2: `retrieve.top: 1` on the literal token `prove` — the broom sentence ("to
  prove it she gave Gregor's body another shove") — because the demonstrative was
  never resolved before retrieval.

Two roots feed all four turns. The prompt collapsed what the model read into what
it remembers (`SYSTEM_GROUND` called the spans "your own memory"; a `metadataBlock`
lift handed it `Title: Metamorphosis / Author: Franz Kafka`). And the parse layer
carried verb-fragment relations, not kinship/role/change-of-state edges, so a
contradiction had nothing to be a contradiction to.

## §1 — The subjective frame (`src/model/prompt.js`)

`SYSTEM_GROUND` and the grounded user block are now a reader's frame. There is
exactly one channel in the prompt — the verbatim lines, the only thing it read —
and the boundary is stated as a fact about the reader ("they are all you read"),
not a rule about sources. The words *sources / context / passages / documents /
memory* are kept out. The absence clause rides last, where a small model attends
hardest:

```
You just finished reading some lines — the ones below. They are all you read;
you have not seen the rest of it. Speak as the one who read them. [system]

What it was: {filename · type · length}.
What you read:
{lines, ordered for the frame}
[Earlier in this reading: {recap}]   [They had asked you: {thread}]
They asked you: {question}
Answer them now… If they asked about something that was not in what you read,
tell them you did not find it — that is an honest answer, not a failure.
```

This retires VOID-as-coercion: if those lines are all the reader read, speaking
past them is incoherent, not forbidden, and "I did not find that" is the honest
report of an absence. No refusal instruction sits behind it. The sentence cap is
**not** reintroduced — the bound stays `max_tokens`, set per task by the intent
pass; the closing line is the absence clause, not a length clause.

## §2 — The arrows leave the prompt

The `Notes from the document:` block (the fold's `A -> B : rel` arrows) no longer
reaches the talker. A model reads an arrow as a causal claim even when the edge
encodes only adjacency (the post-hoc fallacy), and the arrows shipping were
degraded verb-fragments — noise, not spine. `serializeNotes` and the substrate
stay alive: they feed the grounder and the edge-grounding veto, never the prompt.
Relational structure now rides in span **selection and order** (§3).

## §3 — No recognition; the front matter is answerable, not ambient

Orientation is `filename · type · length` — nothing that lets the model narrate a
famous text from memory. The `metadataBlock` injection into the grounded prompt is
reverted. The answerability the lift was for is preserved without the leak: a
metadata question ("who wrote this?", "when was it written?") routes to a metadata
answer drawn from the front matter as a distinct fact (`src/answer/metadata.js`,
routed in `turn/stages.js`). Title and author are answerable; they are not
ambient.

Ordering, while the lines are placed (`orderSpansForFrame`): strongest first
(primacy — the cursor's argmax), second-strongest last (recency — the span that
most needs retaining), the weakest buried in the middle, four to eight lines. A
read-only permutation; the text is untouched.

## §4 — Emit the kinship / role / change-of-state edges the veto checks (flagged)

The real unlock, and the half the prompt cannot reach. The edge-grounding veto is
correct, but the reading held no `Gregor -> insect : transformed-into`, so the
father-claim corresponded to nothing. Behind `RULES_REV`, with golden parity:

- **Change-of-state algebra** (`core/relation-types.js`). A `becomes` primitive
  (transform / became / turned-into / metamorphosed), *object*-functional: one
  undergoer per resultant within a reading. `checkObjectFunctionalConflict` mirrors
  the functional-axiom on the object slot — a claim that a different undergoer
  reached the same resultant the document already reached is **contradicted**. Kept
  separate from `checkRelationConflict` so that function stays byte-identical; the
  veto threads it via a `changeOfState` flag (`factcheck/correspond.js`,
  `turn/stages.js`), set to `RULES_REV`. With it on, the claim parse opens the NP
  object slot so a common-noun resultant resolves.
- **Coordinated subjects** ride behind `RULES_REV` in the text ingest (the parser's
  existing `coordSubjects` switch). The colon-introduced coordination a single scan
  drops now reaches both conjuncts — the starved bridge channel.
- **The basis atom** (`enactor/basis.js`) gains a `relations` field: the typed
  kinship / role / change-of-state edges incident to the stops, so a role- or
  kinship-asserting reading moves mass instead of nothing.

With those edges present, "Gregor (not the father) transforms" becomes
*contradicted* rather than merely uncited — the audit's missing number.

## §5 — Make the gate honest (`src/ground/veto.js`, `src/turn/stages.js`)

Under the old prompt, gagging the talker caused refusals, so a refusing veto rode.
The subjective frame inverts that calculus: abstention is free and coherent. So a
**refusing edge-grounded veto on a pointed question's load-bearing claim** — a
confident `edge-contradicted`, or a from-nowhere `unbound` answer — now engages the
gate and **regenerates** against the same lines (`turn/stages.js` `revise`),
recorded as `gated`. It regenerates, it never substitutes a canned decline — the
model's own word still surfaces (with a real model the corrective pulls it toward
an honest absence). `low-coverage`, the weak contradiction, `edge-unsupported`,
`unbound-contact`, and the grain over-read stay flag-only; telling the user is
still the safety for those.

## §6 — Resolve the follow-up referent before retrieval (`src/converse/`)

`needsContext` now catches the demonstrative / meta-discourse follow-ups the audit
missed — `prove it`, `huh?`, `what you are saying about her`. The retrieve stage
resolves the query against the recent user turns on **every** path (the audit ran
with `RULES_REV` on, where the regex query-fold had been gated off), so `prove it`
retrieves the sister-evidence, not the broom sentence. A mechanical regex/coref
pass, no model router. Verified against `pg5200.txt`.

## §7 — An unbound answer never folds into history (`src/converse/`)

t1's unbound father-claim was the premise of t4. The pipeline now tags an unbound
reply; `foldConversation` and `conversationCast` drop it, so a claim that did not
bind cannot become the next turn's ground.

## The model choice is a measurement, not a decision

Two notes conflict and the coder should see the conflict rather than inherit a
silent pick. The grounded-talker research recommends **Pleias-RAG-1B** for native
`<ref>` citation and a trained refusal path; the subjective-voice note recommends
**Qwen 2.5 3B**, because a citation-drilled RAG register *reports*, it does not
*speak*. The frame partly dissolves the conflict: the two things Pleias carried —
grounding and abstention — are now supplied by §1 and the §5 veto, so the case for
its native machinery weakens exactly as the frame strengthens. **Not decided
here.** Run the head-to-head both notes prescribe: identical surfed packet, both
models, planted unanswerables; compare subjective prose quality and the rate of an
honest "I did not find it" over reaching. Deployment axis to keep in view: Pleias
is the CPU/worker citizen, Qwen the better in-browser one (WebGPU/WebLLM).

## Honest seams

- §1–§3 and §6–§7 are pure prompt and seam work and ship on the default path; the
  full suite is green with `RULES_REV` off.
- §4 is the parse-layer change with real surface area: behind the flag, golden
  parity (flag off → byte-identical), prototyped in `.probe/` first, tested by an
  explicit-argument battery so the demonstration is deterministic. The controlled
  reading is **active voice**; Kafka's resultative ("found himself transformed into
  a vermin"), the "the father" role-coref, and insect↔vermin synonymy are the
  harder extraction the flag is benchmarked on before shipping to default.
- The acceptance test is `tests/metamorphosis-battery.test.js`, gold mark zero: no
  recognition in orientation; `prove it` retrieves sister-evidence; the §5 veto
  marks the father-transformation contradicted (flag on) and is byte-identical
  (flag off); an unbound turn cannot become the next turn's premise. The talker's
  actual prose needs a live LLM, so the claims that turn on it are tested through
  the machinery that catches the failure.

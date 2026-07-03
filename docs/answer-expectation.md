# The answer expectation — predicting the answer, then error-correcting toward it

> A truthful model would start answering, stop when it notices it is off, and begin
> again — and you should be able to watch it do this. Sometimes it realizes it is
> answering *poorly*; sometimes it realizes it has the *wrong* answer.

## The gap this closes

The engine had a rich model of **how it read** (the surf, terrain, bands, stance,
referential confidence) and of **whether a claim is witnessed** (bind → factcheck →
veto). It had almost no model of **what the question wants back**. The whole "what does
a good answer look like" budget was a four-way task tag (`intent.js`:
answer/summary/list/explain) that set a token ceiling and a faithfulness guard, nothing
more.

So a turn could be fluent, on-topic, grounded-adjacent, and still **not answer the
question** — and nothing noticed. The worked failure: *"what is her name?"* answered
with a personality sketch that never says **Grete**, while the name sits in the source
24 times and the reader's own coref had already folded *his sister → Grete*. Every gate
passed; the only flags were about grounding, never about responsiveness. The system was
optimizing **provenance**, not **answerhood**.

## The predictive-processing frame

Comprehending a question already instantiates a **typed answer-slot**, before any
content arrives. *"What is her name?"* predicts a single proper noun, short, standing in
an "X is named ___" relation to the figure in focus. A good answer is the one that
**fills that slot and discharges the prediction error the question opened.** "Knowing
what a good answer looks like" is not a separate faculty — it is the question's own
forward model with an unfilled variable.

That reframes the three pieces:

- **Predict** — `expect` (turn/expect.js). The question, read as the shape its answer
  must take, with a **precision**: how sharply it types the answer. A name question is
  high-precision (almost nothing but a proper noun satisfies it); a summary is
  low-precision (many answers are acceptable). Tip-of-the-tongue is the proof the slot
  is separable from its filler: you can know *a name is missing* without recalling the
  name.
- **Error** — `answerSlotError`. The prediction error: does the produced answer fill the
  slot? For a name slot, when the reading resolved the referent's proper name, the answer
  must *give that name* — the knowledge the answer path used to discard. An honest
  abstention ("I did not find her name") **fills** the slot: reporting the typed gap is
  the correct terminal, not a miss to retry.
- **Correct** — the `revise` loop. A shape miss now joins the confabulation and §5
  grounding triggers as a reason to **stop and answer again**, with a corrective that
  hands the talker the resolved name when the engine has it. Each superseded draft is
  preserved beside its successor with a plain `why`, so the audit shows the engine
  catching itself: *start, stop when off, begin again.*

When the correction cannot land (the lines truly do not name her, or no model is
present), the unmet slot ships as the `answer-shape` veto — the prediction error the
engine could not discharge, **told to the user rather than hidden**. Predict → error →
correct → report the residual is the same loop the reading side already runs on the
page; this points it at the reply.

## Precision, not a flat rule

Only a high-precision slot (`name`) gates a restart. `who` is detected but flags only — a
role-only identity answer can be acceptable, so a miss there is told, not retried.
Everything that does not type its answer sharply is `OPEN` (precision 0): no slot, no
gate, byte-identical to the prior pipeline. The same calibration the grounding floor
already carries (`GROUNDING_FLOOR` per task) — a direct answer is held tightly, a
synthesis loosely — now extends to *whether the answer is even the right kind of thing*.

## Where it lives

- `src/turn/expect.js` — `expectAnswer` (the prediction) and `answerSlotError` (the
  error signal). Pure, embedder-free; the name check reuses `namedReferents`, the same
  admitted-figure matcher the fold turns on.
- `src/turn/stages.js` — the `expect` stage; the shape trigger folded into `revise`
  (which resolves the referent read-only, even with `RULES_REV` off, so it can use the
  name the engine *can* resolve); the `shapeCorrective`.
- `src/ground/veto.js` — the `answer-shape` flag for the residual.
- The audit carries `expect` (slot · precision · gates) and, per revision, the `why`.

## The prompt could be anything

A regex per question form does not scale to "write a poem", "say the story backwards",
"explain it to a five-year-old". The fix is not more regexes — it is to see that the
deciding axis is **checkability**, and that a prompt induces a *set* of constraints, each
with its own precision and its own checker:

- **mechanical / self-verifying** — a transform against the source the engine owns:
  `length` ("in three sentences" → count), `order` ("backwards" → the answer's cited
  source indices run descending), `name` ("→ Grete"). High precision → a miss **gates** a
  restart.
- **structural heuristic** — `form` ("as a poem" → does it read as verse?). Low precision
  → **flag**, never gate.
- **taste** — "write a *good* poem". No honest check → **no constraint** → `OPEN`. The
  engine just answers; it must not pretend to grade poetry.

So an open-ended prompt is handled by *default*: it yields no constraint, no gate, no
flag. `expectAnswer` returns a constraint list (empty for open prompts); `gates` is true
iff some constraint is mechanically checkable. The loop arms only where the miss can be
measured — the same discipline the reading side runs, acting where the signal can be
gated against chance and abstaining where it cannot.

## Form, learned from sample answers (the embedder path)

Content prediction comes from the graph; **form** prediction — what a *good answer of this
kind* looks like (a crisp lookup vs a hedged synthesis vs a warm reorient) — is a learned
convention, not derivable from the document. The only honest source is examples.
`data/exemplars.jsonl` is **430 authored `{user_turn → response}` sample answers** (ported
from eoreader3), tagged by `intent` and `shape_tags`. Embedded, each intent's responses
form a **centroid — the learned shape of that form** — and a draft is scored by
**discriminative cosine** (`src/turn/shape.js`): is it unambiguously in the target basin
(closer to the target shape than to any competitor), against an **adaptive threshold** that
widens where competing shapes sit close?

The prediction is the **nearest sample answer(s) to the question** — no template — so it
generalizes to any prompt the library covers ("we can predict anything"): the question's
embedding votes a shape, and the single nearest sample answer is itself a content+form
prediction of the reply. It is **embedder-gated** (a cosine is meaning only under a
meaning-measuring embedder) and inert without a threaded library, exactly like the
significance column. Form is a **smoke alarm**: a miss rides as a soft flag
(`answer-shape-weak`), never a gating restart — taste is not refusable. Where taste is the
*only* judge ("write a *good* poem"), the library simply has no strong basin, so it stays
quiet.

`runTurn` takes an optional `shapeLibrary` (built once per session via
`buildShapeLibrary(parseExemplars(text), embed)`); `predict` reads the wanted shape off the
question, `veto` scores the answer against it. (A second eoreader3 library,
`form-genres.jsonl` — genre prototypes for output forms — is ported too, for the same
machinery over output genres rather than conversational intents.)

The library is wired **live** three ways (each embedder-gated, inert until the meaning
embedder warms):

1. **Startup build.** `src/ui/app.js` lazily builds the library the first turn after MiniLM
   warms (via `loadShapeLibrary`, which fetches `data/exemplars.jsonl`) and caches it on
   `STATE`, then threads it into `runTurn`. Deferred because it embeds 430 responses once.
2. **Nearest sample as a content hint.** `prompt` hands the matched sample answer to the
   FIRST draft as a SHAPE exemplar (framed "about a different text — copy its register and
   length, not its facts"), so the first attempt is already well-shaped, not only corrected
   after.
3. **Form drives revision.** In `revise`, an off-basin draft is a gating trigger (a reshape),
   with the matched sample answer handed over as the target. Flag-only in `veto`, but a
   reason to answer again here — the same start/stop/begin-again loop, now on form.

## Next: the engine's own generation as the prediction

The constraint checkers above are hand-written predicates. The deeper move — the engine
already half-builds it — is to use its **own non-LLM, grounded generation as the content
prediction**. The mechanical writer (`write/rdf.js`, `write/think.js`, the streamed
one-sentence-per-stop draft) produces a clumsy but *grounded* answer straight off the
graph: for "what is her name?" it already contains *Grete*; for "say it backwards" it can
emit the units in reverse order. That draft is the **prior / efference copy**; the LLM's
fluent reply is the return; the **prediction error is their divergence** — a name the
mechanical draft predicted but the LLM dropped, or a relation the LLM asserted that the
graph never generated (a confabulation). This subsumes the regex constraints: most
expectations stop being hand-written and become *whatever the engine would itself say,
grounded*. (It is sitting in the audit already, as the discarded `llm.draft`.) The
constraint vocabulary here is the bridge; the mechanical-draft predictor is where it
wants to go.

# Answerability — the VOID gate before the talker

> The route gate decides *whether* to read the document; the prompt contract decides
> *what* to feed the talker when it does (prompt-assembly.md). Between them sits one
> more question the physics can answer: *is there anything here to say?* This gate
> measures it, and when the field holds nothing, answers the typed absence directly
> instead of handing the talker an empty field to invent from. This is the
> `answerable` turn stage, over `src/read/answerable.js` and `src/answer/void.js`.

## The failure it closes

The talker's worst failure is the **invented answer**. Hand a model a question whose
answer is not in the material and it fills the gap with probable tokens — "the
situation in the …" wants a place, so it invents one (the documented
invented-location lie; prompt-assembly.md, edge-grounding.md). The fold's notes are
the cure on the *generation* side: feed the edges that exist and there is no gap to
fill. This gate is the cure *before* generation: do not call the talker at all when
the field where the question landed is empty.

Before this, a document question that retrieved nothing fell through to **ungrounded
chat** — the talker answered from outside the material, which is exactly the
hallucination the system exists to refuse, and which contradicts `SYSTEM_GROUND`'s
own instruction ("if the material does not cover it, say the document does not
say"). Now it routes to a measured VOID.

## It is the system's own discipline, applied to the response

The equivalence and motion readers already run one rule (read/voidnull.js,
tests/void.test.js): **propose a structure; measure it against the noise null the
field's own non-cohering background throws up by chance; when nothing beats the null,
hold (NUL) and assert the absence (a DEF to VOID).** SYN fires on signal, NUL+VOID on
noise. The same rule, applied to the turn: the proposed structure is *"there is an
answer to this question where it landed."* The field is the witness, the noise null
is the verdict, the step is mechanical — the witness-does-not-decide rule applied to
the response, the way the surfer applied it to navigation.

In EO terms (the nine operators): a flat reach is all **NUL** — the empty slot
recognised, nothing lifted into structure — and the response is a **DEF to VOID**,
the asserted absence. No new vocabulary; the operators the engine already speaks.

## Conservative by construction

A false VOID is worse than a missed one — it refuses an answerable question. So the
gate claims VOID only when **all three** hold (`fieldVerdict`):

1. **No referent resolves.** `namedReferents(doc, question)` is empty — the question's
   subject is not an admitted entity. (A resolved referent means the field has it.)
2. **No retrieval hit is strong.** No span clears the score floor or shares ≥2 content
   tokens with the question (eoreader3's strong-lexical gate).
3. **The field is measurably flat.** Surf the anchor and read the reach's
   Bayesian-surprise values; the steepest peak fails to beat a noise null that was
   *actually measurable* — enough samples, never a cold-start `Infinity`
   (`fieldIsVoid`). An unmeasurable or too-short field is **never** voided: assume an
   answer until the void is measured.

Two more exemptions keep it honest:

- **Only the `answer` task is gated.** A whole-document task — *summary*, *list*,
  *explain* — points at no location, so weak retrieval is not an absence. "summarize
  this" must never come back "the document does not say." Those reach the talker; the
  unbound and edge-grounding vetoes catch an invented claim on the way back.
- **No document, no gate.** Pure chat has nothing to be void about.

When retrieval returns **nothing at all**, the void is clearest of all (the page never
tokenised the question): that fires directly, without needing the surf.

## The terrains (eoreader3's void typology, realised)

The verdict carries a `kind`, the terrain of the absence, rendered post-hoc and
mechanically — the membrane holds, there is no talker here to be told a type:

| kind | when | renders as |
|---|---|---|
| **never-set** | the page never addressed it | *The document does not say — scanned N sentences, and nothing here addresses that.* |
| **elsewhere** | the question names a proper noun absent from the document | *"<name>" is not in this document.* |

`contradicted` and `cleared` (a claim the page denies or has retracted) are the
meaning-reader's terrains — they need VOID-carving at ingest and relation
correspondence (edge-grounding.md), so they stay future work, held honestly out
rather than faked.

## The certainty dial

`fieldIsVoid` takes one knob, `alpha` — **the hallucination budget** (read/voidnull.js):
the tolerated probability of mistaking the field's own noise for an answer. Larger →
a lower null → fewer VOIDs (the talker speaks more, tolerating thinner answers);
smaller → more "the document does not say." A policy, not a threshold; the physics
computes the bar that delivers it. `ANSWERABLE_ALPHA` is the default; a caller may move
it per turn, and it is the natural seam for a future user-facing certainty register.

## Where it lives

| concern | file |
|---|---|
| the answerability measurement (`fieldVerdict`, `fieldIsVoid`) | `src/read/answerable.js` |
| the typed-absence answer (`answerVoid`, the rendering) | `src/answer/void.js` |
| the noise null it rides | `src/read/voidnull.js` (`deriveNull`) |
| the field it reads | `src/read/surf.js`, `src/read/reading.js` (`bayes`) |
| the turn stage | `src/turn/stages.js` (`answerable`), `src/turn/pipeline.js` |
| tests | `tests/answerable.test.js`, `tests/turn.test.js` |

## Honest seams

- **The γ-mass field today, meaning tomorrow.** `fieldIsVoid` rides the modelless
  γ-mass Bayesian surprise — real but thin, blind to a topic the reading has no figure
  for. It ships now and helps now (the dominant void path is "nothing retrieved,"
  which needs no surf). With the meaning reader live (bayesian-surprise.md), the same
  gate sharpens with no shape change: the reach's flatness becomes a flatness in
  meaning space.
- **`elsewhere` picks the first absent proper noun.** A question naming several names
  reports the first that is not in the document. Honest (it *is* absent) but coarse;
  cross-source pointing ("…but source B mentions it") is the multi-document follow-up.
- **A VOID is recorded, not a silence.** The decision rides the audit (`route: 'void'`,
  the `answerable` step's `verdict`/`kind`/`rode`), so a checked-and-empty turn is a
  record that replays, never an unexplained refusal.

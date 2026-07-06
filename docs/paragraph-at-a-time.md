# Paragraph at a time — short output that coheres to a larger whole

> The theory for generating longform where the model only ever writes **one
> paragraph per call**, handed enough of the fold to do it, the paragraph
> before it, and a sense of the goal of the chunk it is on — organic input, not
> steering, so its natural continuation *is* the proper output. It is
> `runContinuation` (`docs/long-generation.md`) re-cut: the atom lifted from a
> sentence to a paragraph, the prompt stripped of prohibition, and the weld
> extended so the paragraph just written reads itself back and predicts what the
> next one will need. Message 1's "shape and how far along" is the goal each
> chunk is handed. Vocabulary assumes the fold, the surfer, the predictor, the
> arc, and bind/veto.

## The worked failure: five paragraphs about falcons

A real run, audited (`eoreader4`, Llama-3.2-3B, 2026-07-06). The reading held
six sources; the user asked:

> write 5 paragphs about falcons after researching them

What came back was **one** short paragraph, hedged and mis-framed:

> According to what I found, falcons have physical characteristics such as a
> body length of 34 to 58 cm … This information is mentioned in the text about
> the Royal National Park in New South Wales, Australia …

Then the user corrected it — *"this is not 5 paragraphs"* — and the system
answered:

> I didn't find any information in what I read about the user's request to write
> 5 paragraphs. The user had provided a single paragraph, but I couldn't find
> any additional paragraphs …

Four faults, and they are the four things this doc is about.

### 1 — The shape was seen, then thrown away

The discourse-read parsed the request correctly: *"The user is asking me to
write 5 paragraphs about falcons."* But its own note records `length=— ·
developDrive=0.000` — the length demand read as **empty** — and by the time the
answer-prompt was built the whole request had collapsed to one retrieval query,
*"They asked you: falcons physical characteristics."* "5 paragraphs" was gone.
One paragraph came back and **nothing in the system knew it was 1 of 5.** There
was no object that said *the proper output is five paragraphs* and no measure of
*how far along we are*. This is the message-1 fault in the open.

### 2 — The correction could not land

*"this is not 5 paragraphs"* is a **structural** complaint: you produced 1, the
shape wants 5. With no shape object to check produced-against-demanded, the turn
routed the complaint through the **retrieval** gate — and came back *"I didn't
find any information … about the user's request to write 5 paragraphs."* A
system that cannot represent its own target cannot understand being told it has
not reached it. The shape has to be **represented and persisted**, not inferred
fresh each turn.

### 3 — The prompt was all prohibition, and the model parroted it

The answer-prompt's system frame was a pile of negative and meta instruction:

> Answer the way you naturally would … **don't quote them back or tell the user
> to go look**. If they don't cover the question, say so plainly (**something
> like "I didn't find that in what I read"**) … **don't write citations or
> tags** … Answer as a research librarian … **not an expert holding forth** …
> **never put quotation marks around wording you did not actually read: invent
> no quotations** …

And the output opened, in turn 0, *"According to what I found"* and, in turn 1,
*"I didn't find any information in what I read"* — **verbatim the escape hatch
the prompt handed it.** This is the empirical core of the message-2 intuition:
telling a small model *don't say X* and *say something like Y* does not suppress
the behaviour, it **supplies** it. The prompt taught the voice it was trying to
forbid. Steering is a slot left open at the meta grain, and an open slot is
where the model reverts to the frame you just gave it.

### 4 — The fold was the wrong parts, not too little

"What I found reading it" was a jumble — physical causal closure, a French
treatise title, the Ancient Egyptian race controversy, *Eagles, Hawks and
Falcons of the World* — with one real falcon fact inside it. Retrieval had
pulled six sources including `Causal_closure` and `Shapeshifting`: noise for a
question about falcons. And the mis-framing — *"the text about the Royal
National Park"* — is a dirty span: an image caption (`Royal National Park, New
South Wales, Australia`) glued onto the dimensions sentence, which the model
read as the fact's frame. The fold handed in was not too small. It was the
**wrong parts**, unsharpened, and never re-focused for the paragraph actually
being written.

## The unit: one paragraph, a cluster of commitments

One call writes **one paragraph**, and a paragraph realizes a **small cluster of
commitments** — two to four bound claims rendered in a single pass — not one
sentence and not one claim. This is the grain `docs/longform-generation.md`
already argues for and the current `longgen` closure does not yet honour
(`propositionInstruction` still says *"Write one sentence saying X"*):

> Render flows at paragraph scale or larger, one pass per section … the model is
> doing surface realization, not fact generation — the one place autoregressive
> fluency is a strength.

So: **generate coarse, verify fine.** The cluster is chosen and bound *before*
the render (the hard decisions made), the paragraph is one fluent pass over it,
and the floor re-binds it **per sentence at claim grain** afterward — a sentence
that cites a span keeps it, connective tissue rides as marked glue, a sentence
from nowhere is struck however fluent (`docs/longform-generation.md`,
"Asymmetric granularity"). Coarse generation, fine verification, every threshold
the binder's own. The paragraph is short by construction because its cluster is
small; it coheres to the larger whole because the cluster was selected against
the shape, not invented in the prose.

## The three organic inputs

Each paragraph call is handed exactly three things, and each is **material, not
a rule**:

- **Enough of the fold** — the running situation, but only the parts *this*
  paragraph needs (below). Handed as what is so, never as "context you must
  use."
- **The prior paragraph** — the last one written, verbatim, so the new paragraph
  opens on a real transition. This is `readWindow` today; at paragraph grain it
  is the previous paragraph, witnessed, not bound again.
- **The goal of this chunk** — what this stretch is *about* and where the
  argument is heading, expressed as **content** (the cluster's claims and the
  region they cover), never as an instruction about form.

### The anti-steering principle: move the burden to the floor

The falcons prompt failed because it tried to buy grounding with prohibition.
The correction is to **stop paying at the prompt and pay at the floor.** The
prompt hands the model the materials that make the right paragraph its *natural*
continuation, and the grounding constraint — no fact without a span — is
enforced *after* the call by `bindAndVeto`, where it already lives. The prompt
gets clean and organic precisely because the floor, not the nagging, guarantees
the ground.

Concretely, the model-facing frame loses every *don't*:

- not *"don't quote them back … don't write citations … not an expert holding
  forth"* — but a plain writer's frame and the material, so the fluent
  continuation carries no meta;
- not *"say something like 'I didn't find that in what I read'"* — because a
  region the ground cannot support is **never handed to the model as a goal** in
  the first place (the answerability gate and the shape decide that upstream, and
  a held region is the `nul` atom, not a hedge the model improvises);
- not *"invent no quotations"* — because the veto strikes an invented one after,
  which is cheaper and surer than asking the model to police itself.

The trade is real and intended: a looser prompt lets the model reach further, so
the floor does more work. That is the correct place for the work to be. A prompt
that must forbid twelve things is a prompt whose slot is open; close the slot by
handing the material, and there is nothing to forbid.

## The goal is shape and progress (message 1)

"A sense of the goal of the next chunk" is not vague. It is two persisted
objects, and they are what the falcons run never had.

### Shape — two levels, emergent from the corpus, copied forward, not a canon

The shape has **two levels**: SECTIONS, each an ordered run of paragraph beats.
A beat's role is `open` (the first paragraph of its section, which carries the
heading) or `continue` (a paragraph that picks up *within* the section — no new
heading, the prose flows on). Not every paragraph is its own section; a heading
is furniture only at a section boundary, and inside a section the goal rides
purely as the seed (DEF) and the continuity (CON).

The structure has two sources, and the honest one is emergent. The **sections
come from processing a corpus**, not from a per-query retrieval: the significance
loop surfaces the salient **findings**, and the surfer's frame-breaks — where the
`atmosphere` / paradigm shifts (`surfer/atmosphere.js`, `surfer/trajectory.js`) —
are the natural section boundaries. Sections are the reading's own thematic
segments; the paragraphs within a section are its findings. That outline is an
input, produced upstream by corpus processing, handed to `buildSkeleton`.

When no emergent outline is available, the fallback is a **single flowing
section** over the developable regions (`developableRegions`, `answerable.js`) —
paragraphs that pick up within one section, never headed stubs. We do **not**
invent section breaks from a per-query retrieval; `shape.js` is emphatic that a
canon of response shapes is *"a void gate run backwards … a balance the evidence
cannot earn."* So multi-section structure is *discovered* by the corpus, and
whichever shape is carved is **copied forward across every message, never
rewritten** — the way the essay's thesis is copied into every carry
(`docs/longform-generation.md`).

The request's own length demand seeds the shape. *"5 paragraphs"* is a demand
for a five-region shape; if the field offers only two developable regions, the
honest shape is two paragraphs and a stated reason, not five paragraphs of
padding — the exact "shapeless walk" `answerable.js` was built to refuse. The
demand sets the *ceiling* on the shape; the field sets its *floor*.

### Progress — the workspace, not a bar

How far along is a **pure fold over the accepted paragraphs against the shape**:
which regions are covered, which are pending, whether the arc has landed. It is
shown as workspace-state, **never a percentage** —
`docs/longform-generation.md`: *"Progress is not a bar … Show the workspace, not
a percentage."* "1 of 5" is honest here in a way it is not inside the essay
organ (where the denominator moves), because the paragraph count is the user's
own stated demand, fixed unless they change it.

This progress read does double duty. It is the "goal of the next chunk" fed into
each paragraph's prompt — *this paragraph covers region 3, the falcon's stoop* —
and it is the "how far along" the system and the user can see. And it is what
makes the turn-1 correction land: *"this is not 5 paragraphs"* checks against a
shape that says `covered: 1, planned: 5`, and the honest response is to
**resume the walk from paragraph two**, not to search the corpus for the phrase
"5 paragraphs."

## The weld reads self back and predicts the retrieval (message 4)

`docs/long-generation.md` names this as built-later and unbuilt: *"Reading self
back through the perceiver — run the accepted prose back through the document
reader so the recurrence and structural priors read the generated text's own
figures — the same `buildMoveLog`, source=self."* Message 4 is the call to build
it, and it is what turns the weld from a bookkeeping step into predictive
processing.

After a paragraph is accepted, the weld does two new things:

- **Enrich the SURF.** Run the paragraph back through the perceiver and surfer
  (`buildMoveLog` source=self, `surfFold`, `salienceField`) so its own figures
  enter the field. The falcon paragraph that introduced *the stoop* raises the
  salience of speed, prey, and the knockout blow — the reading now leans where
  the writing just went.
- **Predict the retrieval need.** `predictNextMove` over that enriched
  self-field predicts not only the next move-type but *what the next paragraph
  must know* — the spans and fold-parts to light. **Generation drives
  retrieval:** paragraph N decides what gets surfaced into paragraph N+1's fold.

This is the answer to fault 4. The reason the falcons fold was a jumble is that
retrieval ran **once**, blind, against the bare query, and every paragraph would
have drunk from the same polluted pool. With the self-read weld, the fold handed
to each paragraph is re-focused by the paragraph before it: the next chunk gets
*the necessary parts*, because the last chunk said what they are.

First cut resolves the retrieval by salience (`salienceField` over self plus
ground, monotone in coverage so the walk cannot re-drink a covered span). The
full version rides the referent-and-relation graph — the same `resolveProposition`
seam already marked unbuilt for exactly this, where a predicted move selects an
*edge* to realize rather than the next ranked span.

## Across messages

The loop's resumable `state` grows from `{units, covered}` to carry the **shape**
and the **progress** as well. A follow-up message calls the loop again with that
state and the grown history: the fold widens, the self move-log lengthens (the
recurrence prior now has real rhythm to read), and generation resumes **against
the same shape**, from the first uncovered region. Nothing in the loop knows or
cares whether a paragraph is the third of this message or the first of the next
— which is the whole point of "across messages." The turn-1 correction is not a
new task; it is the same shape, `covered: 1, planned: 5`, resumed.

## How we would know it works — the falcons run, re-read

- **The shape holds.** "5 paragraphs" survives from the discourse-read into a
  persisted five-region shape; the answer does not collapse to one retrieval
  query. Length is a demand read off the request, floored by what the field can
  develop.
- **The correction lands.** *"this is not 5 paragraphs"* resumes the walk at
  paragraph two against `covered: 1, planned: 5`, rather than searching the
  corpus for the request.
- **The voice is organic.** No *"According to what I found,"* no *"I didn't find
  any information in what I read"* — because the prompt no longer seeds them and
  the floor, not the model, enforces the ground.
- **The fold sharpens.** Paragraph two's fold is re-focused by paragraph one's
  self-read, so the peregrine spans crowd out `Causal_closure` and
  `Shapeshifting` instead of riding alongside them.
- **Resume is seamless.** N paragraphs then M more from the returned state yield
  the same paragraphs as N+M at once — the state is a sufficient statistic.

## Condition the artifact, not the behavior

The governing principle, sharper than "organic input." Every lever is one of two
kinds. An **organic** lever conditions what the text *is* — its genre, register,
structure, grounding, momentum — and the output you want falls out as a side
effect of the text being that thing. An **inorganic** lever polices what the
model *does* — "don't say OK," "write normally," "one paragraph only" — and it
fights the model and leaks the task frame.

Two failure modes hide in the rejected instructions, and the falcons run shows
both. *"Don't say OK"* is pink-elephant priming: naming the token raises its
salience. *"Write in normal language"* is worse — it reveals there is a task with
a supervisor, which activates the assistant register: preambles, "Here's a
paragraph that…", meta-commentary. The instruction meant to suppress the
assistant voice is what summons it. **You cannot suppress the frame from inside
the frame** — which is why turn 0 opened *"According to what I found"* and turn 1
parroted the seeded escape hatch verbatim.

So remove the task frame entirely: **the model never answers a request, it
continues a document.** The generation act is always "continue this text," never
"write me a paragraph about X." Then the things you wanted are free:

- no preamble — you cannot preface a continuation; there is nothing to
  acknowledge mid-document;
- register is *inherited*, not instructed — the model matches the voice, tense,
  and diction of the prose it is extending (the organic replacement for "write
  normally," and about the most reliable behaviour an LM has);
- continuity is *structural* — the prior paragraph is literally the left-context,
  so threading and rhythm carry without a "make it flow" instruction.

The grounding constraint moves the same way. A continuation optimizes
plausibility, not truth, so a pure-continue model extends past what the fold
supports. You cannot fix that with "only use the given facts" — an instruction
that cracks the frame and a small model ignores anyway. You move the
truth-constraint from the prompt to the **validator**: let it continue, then
check each claim against the slice's provenance and regenerate on an ungrounded
introduction. That is already the eoreader ethos — `bindAndVeto` *is* EVA — which
is why the policing cues on today's generation prompt (`LIBRARIAN_CUE`'s "invent
no quotations," `CAPABILITY_CUE`'s "don't pad") are redundant *and* leak the
frame: EVA already guards what they nag about. Strip them; keep EVA.

## Injecting a goal without a command

The hard part: a goal is naturally an instruction, and an instruction cracks the
continuation frame back open. Three placements inject direction as document, not
command — each mapped to the operator it realizes:

- **Goal as furniture — SEG.** The beat's topic rides in as a *heading the model
  writes beneath* ("## Who signed off"), a document element, not an imperative.
  Stripped from the final output; it is scaffolding.
- **Goal as a seeded topic sentence — DEF.** Prepend the paragraph's first
  sentence in the document's own voice and let the model complete it. *"But the
  timeline complicates that account."* is not "write about how the timeline is a
  problem" — it is a sentence in the artifact that commits the paragraph's
  direction, and because it is mid-document the assistant register cannot fire.
- **Continuity/pivot as the handoff — the seam.** Good prose ends a paragraph by
  opening the door the next one walks through. The seeded DEF carries that
  momentum; the seam is a phrased transition — a gate, not an operator (it may
  reuse only its neighbours' vocabulary and contradict nothing it connects).

Length control is structural too: with the next beat's heading already present
and a gap before it, the model bridges the gap with roughly one paragraph — the
skeleton is the length spec. Under fill-in-the-middle, do this as literal infill;
on a plain chat model, show the upcoming heading and stop on the next heading
marker. You never say "one paragraph, then stop."

## The operator algebra (read from the live code)

The nine operators, as `docs/operators.md` and `src/longgen/resolve.js` (the
`STANCE` map) define them — the loop speaks this algebra, and three easy mis-reads
are corrected here (CON, SYN, NUL):

| operator | cube cell | in the loop |
|---|---|---|
| **SEG** | Differentiate × Structure — *resplit* | carve the skeleton; the heading boundaries (goal-as-furniture) |
| **DEF** | Differentiate × Interpretation — *assert / define* | the seeded topic sentence that sets the beat's terms |
| **SIG** | Relate × Existence — *attribute* | the significance read that picks the beat's slice (the surfer does the selecting) |
| **CON** | Relate × Structure — *the binding bond* | bind each rendered claim to its source span — **not** the prose connective |
| **INS** | Generate × Existence — *instantiate* | mint the slice's facts as new commitments in the document |
| **EVA** | Relate × Interpretation — *evaluate* | the provenance gate: check the paragraph against its slice |
| **SYN** | Generate × Structure — *cohere → assert* | the **closing** beat that draws the fired constituents together — not every render |
| **REC** | Generate × Interpretation — *learn* | fold the accepted paragraph into the carry (loop closure) |
| **NUL** | Differentiate × Existence — *hold* | hold a beat whose slice is present but does not cohere — the honest "seen, unresolved," never a blank |

So one beat's body is **INS + CON** (mint and bind), opened by a **DEF** seed and
gated by **EVA**; **SYN** lands only the close; **NUL** is the escape hatch for an
uncohered beat; the blank cold-start is the empty log, opened by DEF + SEG.

## The loop

```
state = ⟨skeleton (SEG), slice selector (SIG), seed, prior⟩
for beat b in skeleton:
    ctx = render(state, b)      // ALWAYS a continuation, never an instruction
    p   = model.continue(ctx)   // one paragraph — INS + CON
    p   = EVA(p, slice(b))       // per-sentence provenance; splice + regen below threshold
    state = REC(state, p, b)     // fold the accepted paragraph into the carry
```

`render` is the load-bearing function; its invariant: the tail of what the model
sees is the running document ending mid-sentence, the facts above a hard boundary
(the excerpts block — the theory's "Record: …"), and the current heading in
place. Cold-start is the same shape with a genre declaration ("The following is a
grounded explanatory article.") plus the first heading and an opening clause — a
genre declaration is organic because it conditions what the text *is*, not what
the model must avoid. That line is the boundary between organic and inorganic.

## Two rulings

- **The seed is a per-beat SEG choice, and the tight seed is grounded by
  construction.** A load-bearing beat gets a full topic sentence; a connective
  beat gets a heading plus a dangling connective and lets the render own the
  claim. But the tight seed is *not* free-authored prose — it is the text
  projection of the beat's strongest already-*bound* commitment. So tight goal
  control does not reopen the grounding hole: the seed is a rendered bound claim,
  and EVA has nothing to strike in it. Free-authoring the seed is the one way to
  smuggle an ungrounded thesis back in.
- **EVA splices; it does not regenerate wholesale.** Verify per sentence at claim
  grain, keep the bound prefix, strike the ungrounded tail, and regenerate the
  paragraph only when the bound fraction falls below `REBIND_THRESHOLD` — the
  floor already in `continuation.js`. After a splice, re-derive the handoff from
  the *surviving* terminal claim, or the next beat's seed threads off a sentence
  that no longer exists.

## Reconciliation with the running prototype

A Claude-backed React prototype implements this exact loop (INTAKE+SEG → per beat
[SIG · render · SYN · EVA · REC] → assemble) and settles three things by showing
its hand:

- **Completion frame vs. true prefill.** A hosted chat endpoint blocks assistant
  prefill, so the prototype approximates the continuation with a *frame*: the
  document sits in the user turn and the seed rides as a required opening ("begin
  with exactly …"), plus a minimal output constraint ("only the paragraph"). The
  eoreader target is a *local* model (WebLLM), where prefill IS available — so the
  render here can end the prompt literally on the seed and drop even that residual
  framing. Same loop, purer on the platform we ship to.
- **The seed: authored vs. projected.** The prototype has the planner *author* the
  seed sentence (an LLM writing a natural topic sentence) and trusts EVA to catch
  a bad one. This slice takes the conservative ruling instead — the tight seed is
  the text projection of an already-bound span, grounded by construction, so EVA
  has nothing to strike in it. The authored seed reads more naturally; the
  projected seed cannot smuggle an unchecked thesis. Both are legitimate; an
  `authored` seed mode is a later option, gated by the same EVA.
- **EVA: mechanical binder vs. LLM judge.** The prototype's EVA is an LLM judge
  (grounded/on-beat) plus a regex leak check. This slice keeps EVA mechanical —
  `bindAndVeto` for grounding (no model call, deterministic) — and adopts the
  prototype's regex outright as `frameLeak`: the assistant-register leaks that
  bind lexically and would otherwise sail past the grounding floor. The leak
  check is the one piece of the judge that a mechanical validator cannot supply,
  so it is worth its regex.

## Where it lives

| concern | file | reuse or new |
|---|---|---|
| the skeleton (SEG) — beats from developable regions, honest-floored | `src/longgen/skeleton.js` | new |
| `render` — the continuation frame + per-beat seed (DEF/heading) | `src/longgen/render.js` | new |
| the paragraph composer — the loop (SIG · render · EVA · REC) | `src/longgen/compose.js` | new |
| the progress fold (covered/planned, workspace not a bar) | `src/longgen/progress.js` | new |
| the floor, per-sentence at claim grain (EVA) | `src/ground/index.js` (`bindAndVeto`) | reuse |
| the render call | `src/arc/generate.js` (`generateSection`) | reuse |
| the organic-prompt cleanup (strip `LIBRARIAN_CUE` / `CAPABILITY_CUE` policing) | `src/model/prompt.js` | later slice |
| the self-read weld → predicted retrieval | `src/predict` (`buildMoveLog`, `predictNextMove`), `src/surfer` (`surfFold`, `salienceField`) | later slice |
| the resumable state carrying skeleton + progress | `src/longgen/compose.js` (`state`) | new |

## EO reading

Optional, for the framework. The shape is a DEF over the field — a definition of
the output's regions, discovered not imposed. Each paragraph is INS at a site
(the region) under EVA (the floor), rendering a cluster of bound commitments in
one pass. The self-read weld is REC: the paragraph just written is recognized
back into the field as a figure, and the recurrence prior reads it. The
predicted retrieval is the surfer turned to write — a SIG that lights the next
region's spans. Progress is the fold of the accepted INS against the DEF'd
shape. Organic prompting is the refusal to run a void gate at the prompt: the
constraint is an EVA after the fact, never a prohibition before it. Paragraph at
a time is sustained INS across a DEF'd shape, floored by EVA, carried by REC,
and re-aimed each step by the surfer reading the writing's own wake.

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

### Shape — derived from the field, copied forward, not a canon

The shape is the set of regions the proper output should cover, **read off the
field** — the developable regions of the ground (`developableRegions`,
`answerable.js`) — not a template chosen from outside and imposed. `shape.js` is
emphatic about why: a canon of response shapes is *"a void gate run backwards …
a balance the evidence cannot earn."* So the shape is *discovered* at plan time
from what the ground can actually develop, then **copied forward across every
message, never rewritten** — the way the essay's thesis is copied into every
carry (`docs/longform-generation.md`).

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

## Where it lives

| concern | file | reuse or new |
|---|---|---|
| the loop, re-cut to paragraph grain | `src/longgen/continuation.js` | extend |
| the organic prompt (strip the prohibitions) | `src/longgen/prompt.js` (`SYSTEM_WRITER`, `propositionInstruction`) | rewrite |
| the render call | `src/arc/generate.js` (`generateSection`) | reuse |
| the floor, per-sentence at claim grain | `src/ground/index.js` (`bindAndVeto`) | reuse |
| the cluster resolver (2–4 claims per paragraph) | `src/longgen/resolve.js` | extend |
| the shape (derived regions, copied forward) | new — `src/longgen/shape` region plan beside `arcPhase` | new |
| the progress fold (covered/planned, workspace) | new — a pure fold over `units` against the shape | new |
| the self-read weld → predicted retrieval | `src/predict` (`buildMoveLog`, `predictNextMove`), `src/surfer` (`surfFold`, `salienceField`) | wire |
| the resumable state carrying shape + progress | `src/longgen/continuation.js` (`state`) | extend |

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

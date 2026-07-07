# Multi-response generation — the prompt as a fold, selected on the manifold

> The next-paragraph prompt is not an instruction — it is a **fold**. A cell does
> not receive "be a hepatocyte"; it reads its position and expression emerges from
> the resulting chromatin state. So the prompt does not instruct style ("write like
> an essay"). It presents the **structural state** the paragraph emerges from and the
> **single move** it must make, and lets the model express prose from that fold.
> Condition the artifact, not the behavior, made literal.
>
> And because a 1–3B model is a noisy generator, you do not need the first fold to be
> right. You need **varied candidates and a selector** — generate N, score each against
> the flow prior, keep the one whose section-vector lands on-manifold. Variation plus
> selection against a viability manifold: the small model is the mutation source, the
> flow prior is the fitness function.

Implemented in `src/longgen/fold.js`. This is the companion to `render.js`/`compose.js`
(docs/paragraph-at-a-time.md): where those hand the model a running document to
continue, this hands it the fold — and, in `foldBestOfN`, runs the variation+selection
loop next to `flowVerdict`.

## The fold — three parts, and only three

A small model holds one dominant structural instruction plus material, not a lattice
of constraints. So the fold is exactly three things:

- **STATE** — where we are. The accumulated structural position, in plain language:
  what is introduced, what is related, what is still hanging. The Level-2 cumulative
  graph, distilled to two or three facts. Read out by `liveThreads` (in play /
  unrelated / dangling), rendered by `stateFacts`.
- **MOVE** — the one operation. The single target operator for this paragraph,
  **derived, not guessed** (`arcGapMove`): compare the live trajectory position to the
  build-arc schedule (`arcTarget`) and the gap names the move. Relation-density below
  the arc's expectation → *relate*. Still introducing late → *synthesize*. Then
  translated out of the algebra into a concrete writing directive (`OP_DIRECTIVES`).
- **MATERIAL** — what to fold. The specific live threads the move operates on, pulled
  from the entity graph: which elements are in play but not yet related, what was
  raised but not returned to.

### The move is derived from the arc gap

`arcGapMove` is the load-bearing derivation. `arcTarget(prior, t)` gives the
corpus-typical cumulative graph state at reading position `t`; `arcState(prior, step)`
(new, in `src/flow`) reads the *same* twelve features off the live step vector. The
per-feature z-score is the gap. Each writer-facing operator has a **demand** read off
those z-scores — CON when `rel_dens` is below schedule, SYN when `ent_dens` is *above*
schedule late (still introducing) and `generate` is below it, REC when coref reach
(`ent_span`) has fallen, and so on — and a **phase baseline** (`PHASE_WEIGHT`, the
significance-row order, mirroring `shape.js`'s `PHASE_OPS`). The phase-weighted,
gap-sharpened argmax is the move. With no prior or no step it falls to the phase
baseline — the honest cold-start move (open→DEF, develop→CON, land→SYN).

### The operators never appear as jargon

`OP_DIRECTIVES` translates each of the seven writer-facing operators to a concrete
directive (with `{A}/{B}/{X}/{E}` slots the builder fills from the live threads) and a
4–6 word restatement placed at the very end of the prompt, so recency reinforces the
one move:

| op  | translates to                                              |
|-----|-----------------------------------------------------------|
| INS | bring in a new element not yet in play                    |
| CON | connect two things already in play — show how A bears on B|
| SYN | draw the threads together into one claim                  |
| DEF | state plainly what X is or means                          |
| EVA | weigh X — its significance, cost, or credibility          |
| SEG | turn to a new scene, angle, or beat                       |
| REC | pick up something raised earlier and carry it forward     |

No operator code, no cell name, no "chromatin" ever crosses into the model-facing
prompt — the same §6 discipline `prompt.js`/`render.js` keep.

## The template

`buildFoldPrompt({ prior, prevStep, graph, phase|t, register, priorText })` — this is
`build_prompt(prior, prevStep, liveGraph, arcPhase)` from the design (exported under
both names). It emits two messages. A real render, with the move derived from a step
whose `rel_dens` sits 3σ below the develop-phase schedule:

```
SYSTEM
You continue a piece of writing one paragraph at a time. Match how the writing
moves. Write exactly one paragraph. Do not summarize what came before, do not
wrap up, do not add a heading.

USER
Register: contemporary investigative feature.

Established so far:
- In play: the mayor, the MOU deferral, the $10,100 donation and Civicity.
- The MOU deferral and the $10,100 donation are both in play but not yet connected.

This paragraph should: connect two things already in play — show how the MOU
deferral bears on the $10,100 donation.
Work with: the MOU deferral and the $10,100 donation.

Continue this text:
"""
The morning after the council deferred the surveillance MOU, a check cleared.
Gresham Smith's PAC had given the mayor's campaign $10,100 — its largest single
contribution of the cycle.
"""

Write the next single paragraph. It should relate two things in play. Do not
summarize or conclude.
```

The shape is deliberate for a weak model: one dominant instruction, concrete material,
the real prose to continue as a hard anchor, and the move restated at the end.
Everything a small model tends to do wrong — summarize, conclude early, make a list,
add meta-commentary — is suppressed explicitly in `SYSTEM_FOLD`, because naming the
failure suppresses it more reliably than hoping it won't happen.

## The part that actually makes small models work — variation + selection

`foldBestOfN` is the honest way steering works with a 1–3B model: not a perfect first
fold, but many folds and a selector that knows which one belongs. It builds the fold,
draws N candidates at temperature ~0.8, scores each with the flow prior, and keeps the
one whose section-vector lands **on-manifold** — the move you asked for, at the right
delta, on the build arc. It discards the ones that **lurched** (delta > p90) or went
**flat** (barely moved).

```
arcTarget → the move in the prompt → the model draws candidates → flowVerdict scores
them → the on-manifold one is kept.
```

`flowScorer` is the fitness function: given the prior, the previous section vector, and
a `parse` (parseText) to turn candidate prose into a scorable trajectory, it returns a
scorer that flags each candidate `flat` / `lurch` / `offManifold` (and `onManifold` =
none of the three). Scoring is nearly free next to generation, so a weak generator plus
a good selector beats a strong generator alone.

**When none clear the bar**, the miss tells you how to sharpen (`diagnoseMiss`): all
flat → the material was too thin, the move had nothing to operate on (widen MATERIAL,
or pick a node move); all lurch → the move over-jumped for the phase (soften toward a
develop move); all off-manifold → the move was wrong for the phase, or drop in a
retrieved exemplar that makes exactly this move as a pattern to imitate.

## Drop-in contract

- `buildFoldPrompt` is **pure and model-free**. `arcGapMove`, `liveThreads`,
  `OP_DIRECTIVES`, `SYSTEM_FOLD` likewise.
- `foldBestOfN` takes a `model` (with `phrase()`) and, for the default selector, a
  `parse` (parseText). Give it an explicit `score` instead and it never touches the
  perceiver. Null prior / no parser ⇒ it still produces prose (the first live
  candidate), it just cannot select (`scored:false`).
- `liveThreads` tolerates the many shapes an entity graph arrives in — a `write/fold.js`
  fold, a mentions `Map`, or a plain `{nodes, edges}` / figureSurface object — and
  degrades to empty rather than throwing, so MATERIAL is best-effort and the prompt
  still stands on STATE and MOVE.

## The honest caution

The move directive is only as good as the arc-gap computation behind it, and at the
fine grain the operators are blunt — so this steers **which structural move** reliably
and the **texture within the move** weakly. For an investigative register that is the
right trade: getting "relate the donation to the deferral, don't just restate it" right
is most of what makes the paragraph land, and the voice is the writer's to supply.

Exercised by `tests/fold.test.js`.

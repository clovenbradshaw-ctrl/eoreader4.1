# Exemplar → spec → shaped generation

The flow prior (`docs/flow-prior.md`) is a *distribution* over a corpus. Sometimes
you don't want "like competent prose in general" — you want "like **this piece**."
This is the loop that finds an exemplar online, turns it into a loadable spec, and
shapes generation toward it.

## Prior vs. exemplar spec

| | Prior | Exemplar spec |
|---|---|---|
| Built from | ~20+ pieces | **one** piece |
| Answers | "does this move like competent prose?" | "does this move like *this exemplar*?" |
| Has variance / manifold / percentiles | yes | borrowed from a base prior |
| Target arc + rhythm | the corpus mean | **the exemplar's own** |

A single exemplar gives a target trajectory but no spread — you can't PCA one piece.
So `tools/flow/exemplar_spec.mjs` segments the exemplar into its **own natural
sections**, resamples that arc + rhythm onto the base prior's position grid, and
**overlays** them onto the prior — keeping the corpus's sd / manifold / quantiles as
the tolerance. The result is still `kind:"eo-flow-prior"`, so `src/flow/index.js`
loads it unchanged. It retains **no text** — only the exemplar's operator statistics
plus an attribution stamp — so any CC/public-domain exemplar is a clean input.

```
# 1. fetch an exemplar (any essay/article as plain text)
#    e.g. a Wikipedia Featured Article via the API extracts endpoint
# 2. turn it into a spec, overlaying onto the corpus prior
node tools/flow/exemplar_spec.mjs --text exemplar.txt --prior data/flow-prior.json \
     --eoreader . --title "Introduction to viruses" \
     --source https://en.wikipedia.org/wiki/Introduction_to_viruses \
     --out data/flow-spec-viruses.json
# 3. score any draft against it (the exemplar-specific dial is meanArcAdherence)
node tools/flow/flow_scorer.mjs --prior data/flow-spec-viruses.json --text draft.txt --eoreader .
```

`data/flow-spec-viruses.json` is a committed example, built from the Featured Article
*Introduction to viruses* (297 sentences → 14 natural sections; CC BY-SA; statistics
only, attribution in `meta.exemplar`). Its measured build: new-entity introduction
tapers across the arc (ent_dens 0.55 → 0.49) while relations and coref rise —
introduce the terms early, develop the relations later. That curve is now the target.

The dial is calibrated: the exemplar scored against **its own spec** is
`meanArcAdherence ≈ 0.06` (the target *is* its arc); scored against the **narrative
corpus prior** it is `1.52` (the corpus reads expository build as off-schedule). So
`meanArcAdherence` against the spec measures "how much does this build like the
exemplar," ≈0 = exactly.

## Shaping the output — the closed loop

With no model backend installable in this environment, the demonstration runs the
loop with the human (here, the assistant) as the token model and `src/flow` as the
critic: **write → score against the spec → read the drift → revise → re-score.** The
demo writes an explainer on a *different* topic (volcanoes) and shapes it toward the
viruses exemplar. Reproduce:

```
node tools/flow/flow_scorer.mjs --prior data/flow-spec-viruses.json \
     --text tools/flow/examples/draft1_volcanoes.txt --eoreader .   # unshaped
node tools/flow/flow_scorer.mjs --prior data/flow-spec-viruses.json \
     --text tools/flow/examples/draft2_volcanoes.txt --eoreader .   # shaped
```

| Draft | sentences | sections | meanArcAdherence | note |
|---|---|---|---|---|
| 1 (unshaped) | 33 | 3 | **2.49** | long periodic sentences, relation-first |
| 2 (shaped) | 86 | 4 | **1.98** | short declarative, entities-first → relations → coref |
| *exemplar itself* | 297 | 14 | *0.06* | the target |

The critic's diagnosis drove the revision. Draft 1's worst per-feature drift was
`mention_conc` (one entity dominated the mentions), and its long periodic sentences
gave the arc little to work with. Draft 2 answered both: short declarative sentences
(the exemplar's rhythm), terms introduced before relations were built, back-reference
(coref) rising late. `meanArcAdherence` fell **~20%** toward the exemplar (and mean
residual 0.57 → 0.49). Note a short draft yields only a handful of natural sections —
for the running critic on short text, the `{perSentences:N}` window gives more
points than natural sections do.

## Two honest limits

1. **A different topic won't reach 0, and shouldn't.** The spec is a target shape, not
   a mold. Chasing `meanArcAdherence → 0` by contorting content is overfitting the
   instrument, not writing better — the number is a compass, not a score to max.
2. **Register still dominates the tolerance.** The exemplar supplies the target arc,
   but the *spread* it is measured against is borrowed from the narrative corpus — so
   an expository draft is judged against narrative variance. For expository targets,
   distil the base prior from expository sources (Wikipedia Featured Articles, The
   Conversation) so the tolerance the exemplar borrows is the right one. That is the
   `docs/flow-prior.md` register caveat restated.

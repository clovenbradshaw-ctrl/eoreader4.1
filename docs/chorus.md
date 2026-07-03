# The Chorus

*A spec for what we have not built: rendering the reader's folds as a weighted polyphony across holonic levels and across the three faces, governed by a Born measure over the 27-cell ground, with the vox demoted to a leaf.*

Status: **Gate zero built; the deterministic core shipped; the render shipped; the vox leaf shipped — all model-free and behind Probe A.** The chorus holon lives in `src/chorus/` (barrel: `src/chorus/index.js`):

- **Probe A / B / C** — `src/chorus/probe.js`, the three read-only gates. Pure over amplitudes and centroid geometry; none touches a model. `tests/chorus-probe.test.js` locks the machinery. The live verdict is run by `eoreader4-eval/chorus-probe-a.mjs` (`npm run chorus:probe-a`; `:mock` verifies the wiring with no model, the same onnxruntime-node egress caveat as `essay-real-model.mjs`).
- **The Born measure** — `src/chorus/born.js` (`cubeAmplitudes`, `centeredAmplitudes`, `bornDistribution`): square the signed cosine amplitudes, normalize to sum one. `centeredAmplitudes` is the "fix the basis" candidate the gate anticipates: the 27 centroids are highly correlated in MiniLM space, so the raw cosines spread flat; the signed residual above/below the clause mean is where concentration lives.
- **The fold-voice** — `src/chorus/fold.js`: an addressed, recoverable projection carrying no prose. **The marginals** — `src/chorus/marginals.js`: the three faces as axis-marginals of the cube. **The governor** — `src/chorus/governor.js`: voice by cumulative mass to a coverage budget, no `k`.
- **Levels as rotated bases** — `src/chorus/levels.js` (`recStrain`, `ascendWhile`), a projection **sketch**, bounded by `maxLevels`. **The render** — `src/chorus/render.js`: the mechanical weighted map, EVA-sites held unresolved, SYN-by-Ground drawn as silence, the lanes never collapsed.
- **The vox leaf** — `src/chorus/vox.js`: one fold in, one sentence out, machinery stripped; the phrasing surface is injected, never a model.

Tests: `tests/chorus-born.test.js`, `tests/chorus-governor.test.js`, `tests/chorus-probe.test.js`, `tests/chorus-render.test.js`, `tests/chorus-vox.test.js`.

Extends `docs/cube.md` (the 27 cells and the three faces), `docs/phasepost.md` and `src/classify/phasepost.js` (the argmax this replaces with a kept distribution), `docs/reading-levels.md` and `docs/holons.md` (the level axis), and reuses `core/spectral.js` (`commutator`), `core/surprise.js` (the strain signal), and `core/voidnull.js` (the Born noise line) unchanged.

---

## Where we are

eoreader4.1 reads from one frame and speaks from one cell. The MiniLM vector collapses to cosine against the 27 centroids, and the reader takes the nearest one. That last step is argmax. It keeps one cell and discards the rest of the distribution. Argmax is a hard measurement, and a hard measurement is the bivalent compression the framework exists to prevent. The single frame was faithful inside its horizon and flat everywhere else. It was one projection of a three-axis object, narrated as if it were the object.

We have not built the thing that keeps the distribution instead of collapsing it.

## The reframe

Two moves, already argued, stated here as commitments.

A voice is a fold, not a generation. A voice is a mechanical object the surfer produces: a fold at an address, carrying a weight. It is not model output. Model output is a compression, structure narrated into prose with the coordinate lost, invisibly. A fold is a projection, addressed and recoverable. The polyphony has to stay on the projection side of that line, so the voices are folds and only folds.

The measure is Born. The cosine vector against the 27 centroids is a set of signed amplitudes. Square them, normalize to sum one, and you have a distribution over the ground. Voicing by squared mass suppresses the weak projections quadratically, which is the property argmax was crudely approximating and linear weighting cannot give you. The squaring is the signal-from-noise step. It is why we say Born and not "use the scores."

Everything below follows from those two.

## Gate zero: measure before building

Approach from below. Three read-only probes over the corpus we already have. Each can come back negative. Each gates a build. None touches a model.

Probe A, sparsification. For each clause, take the 27-vector, square, normalize, sort descending, record the fraction of mass in the top three cells. Average over the corpus. If real readings are sparse in this basis the mass concentrates and the governor is free: voice the top cells and let the tail go silent with no threshold. Pass is concentration, on the order of two thirds of the mass in three cells or fewer for most clauses. Fail is a flat spread, which means the basis is wrong and no renderer built on it will separate signal from noise. This probe gates the whole spec. Run it first.

Probe B, interference. Cosine projections are signed. For each cell, take every span that contributes and compute the cell's mass two ways: sum the signed amplitudes across spans and then square, against square each span and then sum. If the two disagree there are cross-span cancellations, destructive interference, and the Born framing is carrying real structure. If they never disagree there is no interference and the measure is a probability weighting wearing borrowed vocabulary, still useful, but the word stays in quotes. This probe gates whether we claim interference in the render.

Probe C, non-commutativity. The three faces are three marginals of the cube. Measure a reading in the Act marginal, condition on the result, then measure the Site marginal, and compare against the reverse order. If order changes the outcome the faces do not commute and there is something like complementarity across lenses. If order never matters the faces commute and the physics framing is decorative, though the polyphony still renders fine. This probe gates the strength of the claim, not the build.

The honest position. Probe A is the near-term win and the only one the render depends on. B and C decide how much of the vocabulary we have earned. Do not weld the cheap win to the big claim. A can pass while B and C fail, and the chorus still works as a plain weighted projection.

## The fold-voice

Define the object. A voice is a fold with an address (level, face, cell on the 27-ground), a raw amplitude (the signed cosine projection onto that centroid), a weight (the squared normalized mass), and provenance (the contributing spans and the frameSig that formed it). It is grounder-side, deterministic, and carries no prose.

The primary measure is the distribution over the 27-cell cube. The three faces are its axis-marginals, each a nine-cell distribution got by summing the cube over the third axis. Lenses and cells are then one structure. The cube is the reading. A lens is a marginal of it. There is no separate machinery for faces.

## The governor

Normalize, square, then voice by cumulative mass to a coverage budget. Order the cells by weight, take them until the running sum crosses the budget, stop. The tail is not cut by a rule. It falls below the budget on its own. The number of voices is whatever the distribution needs, one for a sharp reading, several for an ambiguous one. There is no k to tune. There is a coverage fraction, which is a readable knob and not a magic number.

## Levels as rotated bases

Holonic ascent is a change of basis, because the domain rotates: what a reading measures as Significance at one level it measures as Existence one level up. REC is the basis transform. This is a projection sketch, not a measured result. It follows from the axis structure and the edge argument, and a projection loses a dimension, so mark it as a sketch wherever it drives code.

The consequence is the level governor. Do not enumerate levels. Ascend while REC-strain is high, meaning while the rotation keeps redistributing mass across cells. Stop when a further rotation leaves the distribution roughly fixed, because the level above is then telling you nothing the level below did not. The surprise gradient already computes the strain. Reuse it. This is the same shape as the coverage budget on the cell axis: instantiate only what the material lights up, on both axes.

## The render

Mechanical. No generation. The output is a weighted map, and the map is the answer for most queries.

Per level, a lane. Within a lane, the cube's mass across cells, with the three face-marginals available as the three readable projections. Two incompatible cells both carrying high mass are drawn as an EVA-site, held side by side, unresolved, which is productive ambiguity and not an error to reconcile. The move from one level's lane to the next is drawn as a REC-transition, the rotation made visible, the significance-becomes-being hinge shown rather than hidden. The cell at SYN by Ground carries zero mass in every physical reading and is drawn as silence, a preserved absence, the empty slot kept as data.

The render never collapses the lanes into one. Collapse is SYN, and SYN here would be the compression we are avoiding. A reader may project the whole thing down to one lane or one face on demand and lose nothing, because the rest is parked with its address and recoverable. That recoverability is the entire reason the voices had to be folds.

## The vox leaf

Optional and terminal. The vox turns one selected fold into one human sentence, under the phrasing-surface discipline: verbatim excerpts in, one sentence out, no operators, no addresses, no machinery words, single output per call. It is called only for the cells a reader wants spoken, one cell per call, never spanning cells or levels. It cannot invent a cross-level synthesis because it is never handed two cells. Its output is regenerable and discardable, because the fold behind it persists with its coordinate. The vox is a mouth lent briefly to a fold. It is not where the reading lives and it never feeds back into structure.

## What this does not achieve

The governor is real and cheap and gated by Probe A. The interference and complementarity claims are hypotheses gated by Probes B and C, and until those pass the physics vocabulary stays in quotes. The domain rotation across levels is a projection sketch argued from the axis geometry, not measured. The level governor reuses the existing strain signal and has not been shown to terminate cleanly on real corpora, which is its open risk. None of this raises capture rate, which is the separate job of spec-total-read. The chorus renders what was captured. It does not capture more.

## Build order

Probe A first, read-only, and if it fails, stop and fix the basis before anything else.

Then fold-voice tagging and the Born weighting, deterministic, no model.

Then the render, display only.

Probes B and C alongside the render, to set the vocabulary the render is allowed to use.

The vox leaf last, and only if a reader wants sentences instead of the map.

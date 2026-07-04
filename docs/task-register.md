# The task register as physics — DEF·EVA·REC over the intent parser

`src/turn/intent.js` · tests: `tests/intent.test.js` (the preserved baseline),
`tests/task-register.test.js` (the measurement and the loop)

## What changed

The task register — the turn's task (`summary` / `list` / `explain` / `answer`) and the
meta-conversational flag, read off the question with no model — used to be a **regex
cliff**: the first pattern to match decided. It is now a **measurement** governed by the
same DEF·EVA·REC loop every other held convention in the system runs
(`core/conventions/ledger.js`, `write/eva.js`), with the same mechanics the route grain
already uses (`turn/meta-route.js`, `docs/discourse-routing.md`):

1. **Each task owns a basis** — a term profile built from exemplar phrases (the
   exemplar-centroid trick `shape.js` and `meta-route.js` run at their grains). The
   question's Born weight `|⟨B|q⟩|²` against each basis (`surfer/salience.js`, the one
   tokenizer) is that task's raw pull.

2. **Each pull is gated by a crosstalk null** (`core/voidnull.js`): the background for a
   basis is every *other* task's live exemplars scored against it, and the line is that
   ensemble's ceiling. A task acts only when the question aligns with it better than
   off-task speech ever does. This is how the pointed/whole distinction is carried
   structurally: the whole-document identity phrasings ("what is this about") sit in the
   summary basis while the pointed lookups ("what about the ending", "what is this
   word") sit in the **answer contrast basis** — `answer` is never a current of its own;
   its phrases exist to raise the other tasks' nulls, exactly as the develop/brief pair
   holds itself apart in `meta-route.js`.

3. **The surviving currents relax** in the same winner-take-all network the essay moves
   settle in (`longgen/relax.js`), with `answer` — the Existence default — receiving the
   resting potential: a whole-document current must out-compete the ground state, not
   merely register.

4. **The regexes are demoted from cliff to seed.** When the measurement is alive, a
   fired cue folds in at `SEED` weight — it informs, it does not decide (the weight
   `relax.js` gives `p(next)`). When the measurement abstains — a terse question
   ("tldr", "recap") carries too little lexical signal to clear any null — the cue
   baseline rules, byte-identical to the old `readTask`. The old suite pins this.

## The loop

Every piece of held knowledge — each exemplar phrase *and* each regex cue — is a
convention with the ledger's entry shape (`origin / weight / support / strain /
defeated`):

- **DEF** — `register.def(group, phrase, weight)` holds an exemplar. This is the
  tending surface that replaces regex-patching: a misrouted phrasing is *taught* into
  the right basis (or into a contrast), and the profile is weight-aware, so a re-held
  exemplar deposits more mass.
- **EVA** — `register.eva(question, group, holds)` tests what carried a read against
  how the turn went. The carriers are the live exemplars the question made contact
  with, plus the cue that fired toward that group. A hold reinforces (support grows,
  strain relaxes); a break accrues strain.
- **REC** — fires automatically when strain overtakes support: the convention is
  defeated and leaves the basis (a defeated cue stops being consulted), logged as a
  REC line. `rec()` / `reinstateCue()` revise directly; a later run of holds brings a
  defeated convention back.

A prior is a convention with support pre-baked (`PRIOR_SUPPORT`) — a head start in
confidence, not an exemption. The falsifiability guarantees mirror the conventions
ledger's: **a seed can lose** (enough breaks defeat the `summary` regex itself and
"tldr" stops routing), and the register is **readable with priors off**
(`createTaskRegister({ priors: false })` abstains everything to the total `answer`
default and can be taught from nothing, the learned sediment occupying the same slot
the seeds would have). `exportLedger()` carries the strain-history as inheritable
sediment.

## Why no meaning embedder here

Unlike the route grain, the text measured *is* user speech, where the paraphrase
problem lives — so the physics does not pretend to more reach than a lexical overlap
honestly has. The crosstalk ceiling is deliberately conservative: wordy paraphrases
clear it ("what is this document mainly about", "unpack the reasoning behind that
decision" — no cue fires; the measurement alone carries them), terse forms abstain to
the seeds, and everything the physics cannot discriminate lands on the same baseline it
always did. What the measurement buys at this grain is not an embedder's reach but a
**governed** register: graded, auditable (`taskOf` rides `taskMeasure` — weights, cue,
abstention — into the turn context), and revisable by evidence instead of by editing a
regex.

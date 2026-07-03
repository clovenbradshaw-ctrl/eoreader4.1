# Frame binding — the route read off what the turn binds to

> One decider, not three. The compose/switch fork stops being a vote between a regex
> (`_switchesFromCompose`), a warm-model verdict (`metaRoute`), and a lexical relevance
> gate, and becomes a single measurement: **what does the incoming turn bind to** — the
> standing frame, a subject already in scope, or net-new content? The route falls out of
> the binding. The regex seeds inform it; they do not decide it — the contract
> `docs/discourse-routing.md` already wrote but `sendChat` never enacted.

Status: **Phase 0 + Phase 1 shipped.** Phases 2–3 proposed. This extends, does not replace,
`docs/discourse-routing.md` (the measurement) and `docs/conversation-fold.md` (the carried
stance).

---

## The failure this closes

The regression fixture is the exported audit `write me a story about my cat buster` (two
turns, model Llama-3.2-3B). Turn 1 composes; the thread carries `stance: compose`. Turn 2
the user sends a **repair** — "what do you mean what's his name?" — a comment on the
assistant's own prior question, referring back to the subject under composition (*his* =
Buster). The engine treated it as a fresh research topic, searched the literal phrase,
matched the Justin Bieber and Oasis songs *by title*, and answered about chart positions.

The disease is **plural control**. Three deciders ran on that turn and desynced:

1. **`_switchesFromCompose`** (a model-free regex seed) fired **true**: the string starts
   with "what", ends with "?", and carries no token from a hardcoded back-reference list
   (`it|this|that|the poem|…`). "his" is not in that list, and the detector has no concept
   that a *"what do you mean…?"* is a return into the act, not a new subject. → *"leave
   compose."*
2. **`metaRoute`** (the warm-model measurement, run by `_discourseRead`) settled
   **`route=compose`**. It got it right. → *"stay in compose."*
3. **the relevance gate** (`relevant = !!(fb.refs && fb.refs.length)`) rubber-stamped
   stopword overlap between the query's function words and the song passages as grounding.
   → *"tag it `matched`."*

Nothing arbitrated. The decision at the `sendChat` compose fork was made by decider 1 and
**never consulted decider 2** — even though the machinery to consult it (`routeStance` +
`createMetaRouter`) is fully built and already fuses the regex seed and the warm verdict.
`sendChat` reimplemented the fork inline with `_switchesFromCompose`, so the entire
single-decider router was **dead code on the reader-chat path**, and `metaRoute`'s verdict
was computed for the audit note and then discarded.

## Phase 1 — wire the decider that already exists (the shipped fix)

`sendChat` now runs `_discourseRead` **before** the compose/switch fork, into the one
pending bubble the compose, web, and ground paths all share. The fork is driven by the
measured route:

```
_continuesCompose(q, fold, read):
  if read is warm and not abstained:  return read.route === 'compose'   // the binding decides
  else:                               return !_switchesFromCompose(q)   // the cold/abstained SEED
```

This enacts `routeStance`'s fusion inline off the already-computed read (equivalently:
`routeStance(q, fold, { model: createMetaRouter({ speech: read.speech, fold }) }) ===
'compose'`). A **warm** read decides on its settled route — a repair or refinement that
binds back into the act (`route=compose`) continues; a genuine switch (`ground` / `research`
/ `isolate`) leaves. A **cold or abstained** read falls to the model-free switch seed — the
fallback contract, byte-identical to the pre-frame-binding behavior. The regex thus informs;
it does not decide.

Under the new fork, the fixture's turn 2 read settles `compose`, so the turn stays in
`composeArtifact`. **There is no research subject at any point** — the songs are never
reached, and the relevance gate is never consulted. The bug is closed at the routing grain.

### Cost, and what stays continuous

The discourse read now runs on compose-continuation turns that previously short-circuited
before it (one extra model call on those turns) — and the read is now what *decides*
continuation. `composeArtifact` and `runOrganEssay` grew a `{ reuseId }` (and `runOrganEssay`
a `{ read }`) so a continuation reuses the discourse bubble and the read already taken — one
bubble, one model call, not two. Cold chat model, empty frame, or a non-contentful turn →
`read` is null → `_continuesCompose` falls to the seed → the caller's baseline rules,
unchanged. Never worse than today.

## Why this is Phase 1, not the whole design

Phase 1 inherits a blind spot worth naming. `metaRoute`'s basis is the **abstract-direction**
alphabet: exemplar phrases for `compose`/`ground`/`research`/`isolate`, and the paragraph's
Born overlap against each. That measures whether the *model's paragraph sounds like a
direction*. It is blind to the one signal that actually separates a repair from a switch:
**reference**. "What do you mean what's his name" and "what is the capital of France" are
both wh-questions ending in "?"; what distinguishes them is that the first *refers back into
the frame* (his = Buster, the subject under composition) and the second introduces an unbound
subject. A basis built from direction-words can only get the first right when the
metacognition happens to *say* something compose-shaped about it.

So the route should ultimately be read off the binding, not off how direction-y the paragraph
sounds. That is the frame-binding grain the next phases build.

## Phase 2 — materialize the frame (proposed)

Generalize the carried `focus` string into a first-class `Frame` object with content to bind
against:

```
Frame {
  act:      'compose' | 'ground' | 'research' | ...   // the standing DEF
  subject:  EntityId[]        // graph entities, NOT a string; [] when none admitted yet
  kind?:    'story' | 'poem' | 'essay' | ...           // compose sub-kind, when compose
  openedAt: turnIndex
  ref:      logAddress        // the EO event that OPENED this frame (DEF or INS)
}
```

Carried on every stance (not just compose), populated from the graph, and logged (a `DEF` for
the first frame of a thread, an `INS` for a switch) so `REC` has an address to return to.
`projectFold` stays a **pure projection** of the event log — no mutable state, no new loop.

**Dependency (tracked separately):** `c_subj[Buster]` only reinforces the route if Buster is
in `frame.subject`, and in the fixture he is not — "my cat buster" is a nominal apposition the
composer never resolved. That miss lives in the composer's entity/coref extraction, not in
routing; the frame-binding measurement still routes the repair correctly via `c_frame` (the
comment-on-the-act signal is independent of the subject), so the bug stays closed, but the
reinforcement is lost until the apposition fix lands.

## Phase 3 — the bind measurement (proposed)

Measure the incoming turn against each in-scope object, NUL-gated:

```
c_frame   = EVA(e | frame)       // does e bear on the ACT? ("what do you mean", "make it shorter")
c_subj[i] = EVA(e | subject_i)   // does e REFER to subject_i? (coref: "his name" -> Buster)
c_new     = novelty(e)           // content binding to NEITHER frame NOR any in-scope subject
```

The route is which object the event bound to (argmax over the NUL-gated couplings): a max on
`c_frame` is a `REC` into the frame → `continue`; a max on `c_subj[i]` stays on that subject;
`c_new` dominating is an `INS` → a fresh route; nothing clearing NUL abstains → incumbent. The
incumbent relaxes as a resting potential (`longgen/relax.js`), unchanged. And the relevance
gate becomes the **same EVA**, applied to retrieved passages: `relevant = max_p EVA(passage_p
| frame.subject) > null` — a passage counts as grounding only when it CONs to a subject in
scope, not when it shares function words with the query. Defense-in-depth: after Phase 3 the
songs are never fetched, so the gate is a backstop for legitimately-run research that returns
off-subject pages.

## What Phase 1 collapses

| today (independent decider)                                   | after (one bind measurement)                                    |
|---------------------------------------------------------------|-----------------------------------------------------------------|
| `switchesFromCompose` — regex over wh-shape + a pronoun list  | the measured route left compose, or (cold) the seed as floor    |
| the warm verdict computed then discarded                      | the warm verdict **decides** the fork                           |
| *(Phase 3)* `relevant = !!(fb.refs&&fb.refs.length)`          | `EVA(passages \| frame.subject) > null`                         |

None is deleted from the vocabulary of the system; each stops being a vote and becomes a
projection of the binding.

## Migration — reversible phases

- **Phase 0 — the fixture.** `tests/frame-bind.test.js` pins that the repair stays in compose
  under a warm read and that the wiring is present in both shipped copies. It fails on `main`
  (the inline `_switchesFromCompose` fork is still there).
- **Phase 1 — wire the decider (shipped).** `_continuesCompose` drives the fork; the discourse
  read moves before it; `_switchesFromCompose` demoted to the cold/abstained seed. Behind the
  existing `opts.model` seam / abstention fallback, so it is reversible.
- **Phase 2 — materialize the frame (proposed).** `focus → Frame`, carried on every stance,
  subject from graph entities, frame-open logged. Land the composer apposition fix alongside.
- **Phase 3 — the bind measurement (proposed).** `c_frame` / `c_subj` / `c_new`, route derived
  from the binding; the relevance gate swapped to the content-bind check.

## Files

- the fork, rewired: `src/reader/app.dc.js` (`sendChat`, `_continuesCompose`, `composeArtifact`
  / `runOrganEssay` bubble+read reuse), mirrored into the built `index.html`
- the router that already existed and is now called: `src/core/conversation-fold.js`
  (`routeStance`, `switchesFromCompose` → seed), `src/turn/meta-route.js` (`createMetaRouter`,
  `metaRoute`)
- the frame object (Phase 2): `src/core/conversation-fold.js` (`computeFold`, `projectFold`)
- the measurement reused (Phase 3): `src/surfer/salience.js` (EVA/Born), `src/core/voidnull.js`
  (NUL), `src/longgen/relax.js` (incumbent relaxation), `src/turn/intent.js`
  (`isMetaConversational` → folded into `c_frame`)
- docs: extends `docs/discourse-routing.md`, `docs/conversation-fold.md`; relates to
  `docs/nul-hold-the-uncohered.md`, `docs/subjective-frame.md`, `docs/edge-grounding.md`
- tests: `tests/frame-bind.test.js` (new); `tests/meta-route.test.js`,
  `tests/conversation-fold.test.js`, `tests/research-relevance.test.js` (Phase 3)

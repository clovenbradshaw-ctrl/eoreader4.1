# Surfing the fold — the surfer with no pilot

> The fold used to read significance at one fixed cursor: the top retrieval hit.
> That is a router-style **choice**, and a choice is the wrong category. The
> surfer replaces it. It does not ask where to look; it measures where the field
> is steepest and steps there. The field is the witness, the gradient is the
> verdict, the step is mechanical — the witness-does-not-decide rule applied to
> navigation. This is the `surfFold` in the `read` holon and its use in the
> `fold` turn stage.

**SURF** stands for **S**ituated **U**nderstanding **R**etrieved by **F**olding:
the understanding is *situated* in the field around the anchor (not a fixed
cursor), *retrieved* by stepping down the gradient that field already maintains,
and produced by *folding* that reach into the significance note. The name is the
mechanism — each letter is one of the moves below.

## A router is a choice; surfing is a measurement

A router reads a state and *emits* where to go next. The surfer reads a field
that the reading already maintains and *steps down its gradient*. Nothing is
selected; each of the three axes is read off a quantity that exists whether or not
anyone is surfing. The decision is read off the physics, not authored.

## Three axes, three quantities already maintained

| axis | reads | from |
|---|---|---|
| **focus** | the warmest figure (γ-mass argmax) — where the eye sits | `readingAt().predicted.figures[0]` |
| **cursor** | advance through the flat, arrest on the peaks of **Bayesian** surprise | `readingAt().bayes` (see bayesian-surprise.md) |
| **frame** | a frame breaking under accumulated strain (a REC) is an arrest too | the enacted loop, run over the reach |

Focus is modelless and honest today. Cursor rides `bayes`, not surprisal — so it
arrests where the reading was *rewritten*, not where a token merely looked odd
(the TV-snow correction). Frame is the same DEF·EVA·REC loop the significance
engine runs, calibrated to the reach (`calibrateReader`), so the cursor axis and
the frame axis never disagree — they read the same scalar.

## The reach and the regimes

The surfer is seeded at an anchor (the retrieval hit) and reads a forward-biased
window around it — a little behind, to read the frame the anchor sits inside;
mostly ahead, because a surf rides forward and the arrow of time orders the frame
axis. Within the reach it measures the field at every cursor — the random-access
regime: with the field stateless in the cursor it can read the gradient anywhere
and leap to the steepest. (Under a sequential momentum clock it would flow forward
instead; both are physics, not a router.)

## What it returns

```
surfFold(doc, anchor) → {
  anchor,          // where retrieval set the surfer down
  stops,           // cursors it arrested on, in reading order
  peak,            // the steepest stop — where to take the significance reading
  focus,           // the warmest figure across the stops
  field,           // per-cursor warmth + surprise + novelty (for the trace)
  recCursors,      // frames that broke within the reach
  rode: 'bayesian-figure'
}
```

The anchor is always a stop (retrieval set it down there); every REC cursor is
always a stop (a frame broke there); the strongest remaining surprise peaks fill
in toward `maxStops`, never the flat between them. The arrest band is calibrated
to the reach, not a fixed floor — `bayes` clusters low, so a constant floor would
arrest nowhere.

The band can be sharpened from the median to the **derived VOID boundary**
(`read/voidnull.js`) by passing `opts.alpha`: the threshold becomes a high quantile
of the noise null the reach's own non-cohering bulk throws up by chance —
extreme-value (so the longest *accidental* peak is VOID, not a stop), leave-one-out,
robust, with `alpha` the only knob (the hallucination budget). A cursor then arrests
only when its `bayes` **beats** what this context produces by chance (`SYN`), and
every reach cursor carries its verdict (`SYN`/`NUL`) so a checked-and-empty stretch
is a *record*, not a silence (`rode: 'bayesian-void'`). The signal/noise boundary is
the context's, computed live, recalibrated to the window the surf landed in. Default
(no `alpha`) is the median rule, byte-identical.

## The fold stage uses it (`src/turn/stages.js`)

```
fold(ctx):
  anchor = ctx.spans[0].idx
  surf   = surfFold(doc, anchor)
  spans  = ctx.spans ++ surfed stops retrieval missed   (via:'surf', citable)
  note   = foldNote(spans, { cursor: surf.peak })
```

Two consequences. The significance reading is taken at the **peak** the surf
reached, not blindly at the top lexical hit. And any high-significance line
retrieval missed is folded into the spans, so it is both read by the consciousness
*and* bindable as a citation (its index is real). The fold integrates the reading
over where the field is steepest, not over the single best-scoring match.

## Deterministic and replayable

Every move is a pure function of the log and the field. Same document, same
anchor, same path — unlike a router, which is stochastic turn by turn. The surf
path is part of the deterministic substrate; the audit records it (`fold.surf`:
anchor, peak, stops, focus, recs, rode), so it replays like the rest of the log.

## Where it lives

| concern | file |
|---|---|
| the surfer | `src/read/surf.js` |
| the fold stage wiring | `src/turn/stages.js` |
| the surprise it rides | `src/read/reading.js` (`bayes`) — see bayesian-surprise.md |
| the frame axis | `src/enact/loop.js`, `src/enact/index.js` |
| audit telemetry | `src/turn/pipeline.js` (`fold.surf`) |
| tests | `tests/surf.test.js` |

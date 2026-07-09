# Deep reading into generation — the battery (2026-07-09)

Does reflecting at the source's surprise peaks *before* writing improve the prose? A
three-arm battery on a real CPU model (Qwen2.5-0.5B, greedy, 4 topics), same sources,
only the reflection varied. Harness: `eoreader4-eval/deep-reading-gen-battery.mjs`.

- **baseline** — walk, no deep reading
- **free** — walk + `deepRead`, model-free reflection (the deterministic inner note)
- **voiced** — walk + `deepRead`, MODEL-voiced reflection (the model reads each surprise
  peak and writes what is significant there; async lift — reflections pre-computed at the
  peaks, injected synchronously into the sync `deepReading` path)

## Result — net-negative unconditionally, positive on the churning baseline

Mean Δ vs baseline (independent metrics — not the flow/Significance signal any of this
optimizes):

| arm | maxPair ↓ | distinctTri ↑ | meanBound ↑ | chars |
|---|---|---|---|---|
| free | **+0.137** (worse) | −0.067 (worse) | **−0.158** (worse) | +976 |
| voiced | +0.084 (worse) | −0.053 (worse) | −0.095 (worse) | +557 |

Per topic:

| topic | baseline maxPair | free | voiced |
|---|---|---|---|
| dolphins | 0.00 | **0.841** | 0.594 |
| printing_press | 0.00 | 0.00 | 0.034 |
| honeybees | 0.00 | 0.005 | 0.051 |
| **volcanoes** | **0.349** | 0.053 | **0.005** |

The split is the finding. On the three already-clean baselines, the reflection **hurt** —
bloat, lower grounding, and on dolphins-free it induced churn where there was none. On the
one churning baseline (volcanoes), the voiced reflection **rescued it**: maxPair
0.349 → 0.005, distinctTri 0.79 → 0.995, grounding *up* 0.31 → 0.408 — better on every axis.

## Why

1. **`meanBound` drops because the reflection is uncitable by design** — the epistemics
   working (`docs/deep-reading.md`: a reflection is reafference, never a citable span). Content
   the model draws from it correctly counts as ungrounded, so a larger ungrounded fraction is
   the epistemic firewall showing up in the metric, not necessarily new fabrication.
2. **The reflection is a churn-breaker.** On a draft that is already developing it is extra
   rope for a weak model to drift on; on a draft that is looping, a fresh angle is exactly what
   it lacks — so it helps only where the baseline was failing.

## Consequence — reflect conditionally, not always

The battery (unconditional reflection is net-negative) and the churn detector
(`docs/deep-reading-churn-2026-07.md`: the model's reflections repeat at r=0.84 when the draft
churns) point to the same design: **gate the reflection on detected churn.** Reflect when the
draft is looping — where volcanoes shows it rescues the piece — and stay out of the way when it
is developing, where the battery shows it hurts. That is the next build: a churn-gated deep
read in the walk, then this same battery re-run with the gate.

## Honest edges

- Small model (0.5B), greedy, 4 topics — directional, not a tight effect size.
- `meanBound` conflates "drew from the (uncitable) reflection" with "fabricated"; the lexical
  binder cannot tell them apart. A provenance-aware read (`ground/provenance.js` door split)
  would separate them and is the fairer grounding metric for a reflection-wired walk.
- One clean win (volcanoes) is a single case; the gated design needs its own battery to
  confirm the conditional gain holds.

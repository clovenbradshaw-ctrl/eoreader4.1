# Does flow shaping improve long-form generation? — A/B result (2026-07-09)

**Verdict: no, as currently wired — and it modestly hurts.** Conditioning the walk on
the flow prior (`flowShape`: inject the arc-demanded move into each beat's prompt) did
not produce better long-form prose in a controlled A/B on a real model; on
prior-independent metrics it was neutral-to-worse. The one metric it improved is the
flow metric it directly optimizes. This is a **measured negative**, with clear caveats.

## Design

- **Model:** `onnx-community/Qwen2.5-0.5B-Instruct`, CPU (q4), run in node via
  transformers.js — a real generator standing in for the reader's small-model path.
- **Control:** same model, same source spans, **greedy decoding**, `demand=4`
  paragraphs. The only difference between arms is `flowShape` off vs on, so any output
  difference is causally the injected arc directive.
- **Path:** the real live essay walk (`src/longgen/walk.js`), driven exactly as the
  reader drives it (`groundLater`, per-beat refold). Both arms run OBSERVE (the flow
  verdict rides the trace); only the shaped arm injects the directive.
- **Metrics — independent of the flow prior on purpose** (scoring by the flow metric
  the shaping optimizes would be circular): consecutive-paragraph trigram Jaccard
  (`interPara`, ↓ better — the refrain signal), worst repeated-paragraph pair
  (`maxPair`, ↓), distinct-trigram ratio (`distinctTri`, ↑, but rewards novelty so a
  hallucinated tangent inflates it). `arcAdh` (the flow metric) reported as secondary
  and flagged circular. 8 topics.

Reproduce: `node eoreader4-eval/flow-shaping-ab.mjs`.

## Result (8 topics)

| topic | arm | distinctTri ↑ | interPara ↓ | maxPair ↓ | arc-wants (shaped) |
|---|---|---|---|---|---|
| dolphins | unshaped | 0.98 | 0.011 | 0.043 | |
| dolphins | shaped | 0.931 | 0.030 | 0.091 | CON,SEG,SEG,SEG |
| volcanoes | unshaped | 0.87 | 0.111 | 0.333 | |
| volcanoes | shaped | **0.946** | **0.008** | **0.024** | CON,SEG,SEG,SEG |
| aqueducts | unshaped | 0.66 | 0.299 | 0.489 | |
| aqueducts | shaped | 0.794 | 0.152 | 0.610 | CON,SEG,SEG,REC |
| photosynthesis | unshaped | 0.987 | 0.000 | 0.000 | |
| photosynthesis | shaped | 0.806 | 0.002 | 0.759 | CON,SEG,REC,SYN |
| printing_press | unshaped | 0.989 | 0.007 | 0.022 | |
| printing_press | shaped | 0.674 | 0.256 | 0.769 | CON,SEG,SEG,SEG |
| coral_reefs | unshaped | 0.937 | 0.001 | 0.124 | |
| coral_reefs | shaped | 0.758 | 0.282 | 0.820 | CON,SEG,SEG,REC |
| glaciers | unshaped | 0.978 | 0.000 | 0.006 | |
| glaciers | shaped | 0.962 | 0.000 | 0.000 | CON,CON,REC,SEG |
| honeybees | unshaped | 0.986 | 0.000 | 0.007 | |
| honeybees | shaped | 0.619 | 0.000 | **1.000** | CON,SEG,SYN,SYN |

**Mean Δ (shaped − unshaped):** `distinctTri −0.11` (worse), `interPara +0.04` (worse),
`maxPair +0.38` (worse), `arcAdh −0.20` (better — but this is the circular target).
Shaped was better on `maxPair` in 2 of 8 topics (volcanoes, glaciers), worse in 5.

## Why it hurts — the mechanism

The regression is not uniform, but the worst cases share a cause: **on a small instruct
model, the "wrap-up" directives make it restate.** `honeybees` (two `SYN` beats,
"draw the threads together") produced two **near-identical bulleted "Certainly! Here's a
breakdown…" paragraphs** — `maxPair 1.0`. The directive meant to *cure* the refrain
*induced* it. Meta/"breakdown-mode" markers jumped 8 → 79 in that essay. `photosynthesis`
(REC+SYN) shows the same drift (9 → 20). The directive knocks the model out of
continuation and into summary, and summary of prior content **is** repetition.

Not every regression is SYN/REC (`printing_press` regressed with only CON/SEG), and one
`SYN`/`REC` case improved (`glaciers`), so the effect is noisy — but the direction is
consistent enough at n=8 to say the lever as wired does not earn its place.

This is the same lesson the validity test taught, now on the generation side: the flow
prior is a **shape** instrument. Optimizing generation toward the shape metric improved
the shape metric (`arcAdh`) and did **not** transfer to independent prose quality — and
degraded it, because a weak model obeys "synthesize" by restating.

## Caveats (why this is not the last word)

- One small model (0.5B). A stronger talker (the reader's Llama-3.2-3B, or a frontier
  model) might follow "synthesize" without restating.
- One lever, one directive wording (`Move for this paragraph: <restated>`). A softer or
  differently-phrased steer might not destabilize the model.
- n=8, single seed each, greedy. Directional, not a tight effect size.

So: evidence against `flowShape` **as currently wired on a small model**, not proof the
idea can't work. It is enough to say: **do not turn `flowShape` on by default**, and do
not expect the flow prior to fix generation quality.

## What still stands, and what to test next

- **OBSERVE is validated and safe** — the flow verdict correctly detects the flat build
  (the earlier dolphin demonstration; here it rides the trace and changes no tokens).
  The reader surfacing its own build is a real, kept improvement.
- **The higher-value untested lever is grounding enforcement**, not shape. The dolphin
  failure was coherence/fabrication, which flow is blind to by design. The audit already
  shows the reader computing `bound=0.071` on fabricated paragraphs and shipping them
  under `ground-later`. Making that gate *enforce* a rebind (or wiring the DAG's
  dependency check) targets the failure the shape lever cannot touch. That is the next
  experiment worth running with this same harness.

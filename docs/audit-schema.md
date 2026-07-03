# `eo-audit/1` — the audit record schema

Every turn produces a single JSON object. The audit panel renders it; one
button exports the entire ring buffer as JSONL.

## Schema

```jsonc
{
  "schema": "eo-audit/1",
  "id": "t42",
  "question": "What did Alice say?",
  "startedAt": 1718636400000,
  "finishedAt": 1718636400512,
  "durationMs": 512,
  "route": "grounded",   // or 'math', 'who', 'confirm', 'chat', 'smalltalk', 'error'
  "steps": [
    { "name": "route",    "t": 0,   "data": { "ms": 0, "route": "grounded", "task": "summary" } },
    { "name": "converse", "t": 1,   "data": { "ms": 1, "recent": 4, "folded": 6, "notesLen": 210 } },
    { "name": "retrieve", "t": 5,   "data": { "ms": 4, "n": 6, "top": 0.71 } },
    { "name": "fold",     "t": 6,   "data": { "ms": 1, "noteLen": 412,
                                              "surf": { "anchor": 12, "peak": 17, "stops": [12,14,17],
                                                        "focus": "Gregor", "recs": [17], "rode": "bayesian-figure" } } },
    { "name": "prompt",   "t": 6,   "data": { "ms": 0, "promptLen": 540 } },
    { "name": "llm",      "t": 481, "data": { "ms": 475, "outputLen": 132, "maxTokens": 512 } },
    { "name": "bind",     "t": 489, "data": { "ms": 8, "claims": 2, "cited": 2 } },
    { "name": "veto",     "t": 491, "data": { "ms": 1, "fired": [], "refused": false } },
    { "name": "settle",   "t": 512, "data": { "ms": 0 } }
  ],
  "prompt":     "system: …\n\nuser: Spans:\n[s2] …\n[s7] …\n\nQuestion: …",
  "rawOutput":  "Alice said the meeting would start at noon. Bob agreed.",
  "bound": [
    { "claim": "Alice said the meeting would start at noon.", "citation": "s2", "score": 0.83 },
    { "claim": "Bob agreed.",                                  "citation": "s7", "score": 0.61 }
  ],
  "vetoes": [],
  "answer":  "Alice said the meeting would start at noon. [s2] Bob agreed. [s7]",
  "sources": [2, 7]
}
```

## What's load-bearing

The load-bearing parts are **the verbatim prompt and the verbatim raw
output**. Without those you can't tell whether the model went wrong, the
spans were misleading, the citation binding was too strict, or the veto
battery refused for a bad reason. They're the difference between debugging
and guessing.

## Ring buffer

The audit log holds the last 300 turns in memory. Older turns roll off.
If you need durability, export JSONL periodically — the export is
append-friendly (one JSON record per line).

## Steps

Every stage of the turn pipeline gets one `step` entry. The `t` is the
offset in ms from `startedAt`; the `data` is small per-step shape data,
capped at the holon boundary so the audit never grows unbounded.

A non-grounded turn (math, who, confirm, error) still produces a record;
fields like `prompt`, `rawOutput`, `bound`, `vetoes` simply remain `null`.

## How to use it to enhance performance

The audit is for tuning, not just for incidents.

- **Slow turns:** sort by `durationMs`, look at the dominant `step.ms`.
  If `llm` dominates, trim the prompt or change backend; if `retrieve`
  dominates on a small doc, the embedder is probably warming under load.
- **Wrong answers:** open the turn, read the raw output, see which claims
  failed to bind. Often the fix is in `parse` (entity wasn't admitted) or
  `retrieve` (the right span wasn't surfaced), not in the model.
- **Veto storms:** if `low-coverage` fires often, your prompt is letting
  the model over-claim. Re-tighten in `model/prompt.js`.
- **Routing drift:** if `route` is `grounded` for math questions, the
  mechanical path is broken; the audit shows it instantly.

The trail is the optimization surface.

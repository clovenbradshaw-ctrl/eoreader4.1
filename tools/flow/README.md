# tools/flow — the flow-prior pipeline

Corpus → trajectories → distilled prior. The runtime scorer is the holon at
`src/flow/index.js`; these are the offline tools that build what it loads.

```
# 1. extract one vector per NATURAL section per book (resumable)
#    --segment sections (default) | sentences --per-sentences N | equal --steps N
node tools/flow/eo_trajectory.mjs corpus.jsonl --eoreader . --sample 0 --resume

# 2. distill the corpus into a small, provenance-stamped prior
python3 tools/flow/flow_distill.py trajectories.jsonl --min-sent 300 --grid 24 --out data/flow-prior.json

# 3. validate — rank a corpus, or score one draft through the live parse
node tools/flow/flow_scorer.mjs --prior data/flow-prior.json --trajectories trajectories.jsonl
node tools/flow/flow_scorer.mjs --prior data/flow-prior.json --text draft.txt --eoreader .
```

`corpus.jsonl` is one `{ id, title, text }` per line. `flow_distill.py` needs
`numpy`. Full write-up, wiring, and caveats: **`docs/flow-prior.md`**.

# tools/flow — the flow-prior pipeline

Corpus → trajectories → distilled prior. The runtime scorer is the holon at
`src/flow/index.js`; these are the offline tools that build what it loads.

```
# 1. extract one vector per NATURAL section per book (resumable)
#    --segment sections (default) | sentences --per-sentences N | equal --steps N
node tools/flow/eo_trajectory.mjs corpus.jsonl --eoreader . --sample 0 --resume

# 2. distill the corpus into a small, provenance-stamped prior
python3 tools/flow/flow_distill.py trajectories.jsonl --min-sent 300 --grid 24 --out data/flow-prior.json

# 3a. analyze — smooth-vs-lurching ranking + manifold, RAGGED-SAFE for variable
#     section counts (this is the one to use, not a fixed-grid flow_analyze.py that
#     np.array()s the whole corpus and collapses born-rule output to 1 row)
python3 tools/flow/flow_analyze.py trajectories.jsonl --top 8

# 3b. validate — rank a corpus, or score one draft through the live parse
node tools/flow/flow_scorer.mjs --prior data/flow-prior.json --trajectories trajectories.jsonl
node tools/flow/flow_scorer.mjs --prior data/flow-prior.json --text draft.txt --eoreader .
```

```
# 4. install into the facet-keyed registry, then diagnose a READING against it
python3 tools/flow/flow_distill.py trajectories.jsonl --lang en --domain science --register expository --out sci.json
node tools/flow/install_prior.mjs sci.json --name expository-en-science
node tools/flow/flow_diagnose.mjs --text article.txt --select '{"lang":"en","domain":"science"}'
```

`corpus.jsonl` is one `{ id, title, text, lang?, region?, era?, domain?, register? }`
per line (facets optional but recommended). `flow_distill.py` needs `numpy`. Corpus /
prior / registry format: **`docs/flow-corpus.md`**. Prior + wiring: **`docs/flow-prior.md`**.
Reading diagnostic + omnimodal framing: **`docs/flow-reading.md`**. Validity: **`docs/flow-validity.md`**.

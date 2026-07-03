# Large models, OPFS, and the 2 GB shard limit

How a model larger than the browser's per-file ceiling runs here, and where it
lives between sessions.

## OPFS caching is automatic

wllama — the CPU/WASM runtime behind the `pleias-*` and `wllama` backends — caches
every GGUF it downloads to the **Origin Private File System**, and *streams* the
download (it never holds the whole file in memory at once). The backends pass
`allowOffline: true`, so once a model is cached it reloads from disk with no
network. You pay the download exactly once per browser profile; clearing site
data clears it.

Nothing in the app has to manage this — it is the wllama default
([`src/model/wllama.js`](../src/model/wllama.js)).

## The 2 GB per-file ceiling

wllama reads each GGUF into a single `ArrayBuffer`, capped at 2³¹−1 bytes
(≈ 2.14 GB). A single file over that **cannot load**, no matter how much disk or
RAM you have — it fails as a bare "network error". (The total model, summed
across shards, can still approach the 4 GB wasm32 memory ceiling.)

That is why `pleias-rag` ships as the 744 MB **Q4_K_M** build rather than the
official 2.39 GB bf16 file: the bf16 file is over the ceiling. Q4_K_M is the same
1.2 B-parameter model with every parameter intact, quantised to 4-bit.

The loader turns this failure mode into an honest message instead of a cryptic
"network error": on any load failure it makes a best-effort `HEAD` to read the
real size, and if the file is over the ceiling it says so (`diagnoseLoadFailure`).

## Running the full-precision model: split it into shards

To run Pleias-RAG-1B (or any model) at full precision, split the GGUF into
sub-2 GB shards and host them. wllama loads a *first* shard and fetches, caches
and assembles the rest automatically.

1. **Split** with `llama-gguf-split` (ships with a llama.cpp build):

   ```sh
   # ~1.5 GB shards keeps each piece well under the 2 GB ceiling
   llama-gguf-split --split --split-max-size 1500M \
     Pleias-RAG-1B.gguf Pleias-RAG-1B
   # → Pleias-RAG-1B-00001-of-00002.gguf, Pleias-RAG-1B-00002-of-00002.gguf
   ```

2. **Host** the shards somewhere that serves them with CORS. A Hugging Face model
   repo is simplest — its `/resolve/` URLs already send the right headers (GitHub
   will not work: it caps files at 100 MB and jsdelivr will not resolve LFS
   pointers):

   ```sh
   huggingface-cli upload <you>/Pleias-RAG-1B-bf16-gguf Pleias-RAG-1B-00001-of-00002.gguf
   huggingface-cli upload <you>/Pleias-RAG-1B-bf16-gguf Pleias-RAG-1B-00002-of-00002.gguf
   ```

3. **Point the backend** at the *first* shard — set `RAG_GGUF` in
   [`src/model/pleias.js`](../src/model/pleias.js) to:

   ```
   https://huggingface.co/<you>/Pleias-RAG-1B-bf16-gguf/resolve/main/Pleias-RAG-1B-00001-of-00002.gguf
   ```

That is the whole change. The first load downloads both shards (in parallel) and
caches them to OPFS; every load after that opens from disk.

## Ceilings, in one place

| limit | value | set by |
|-------|-------|--------|
| single GGUF file | 2³¹−1 bytes (≈ 2.14 GB) | `ArrayBuffer` max length |
| total model (all shards) in memory | ~4 GB | wasm32 address space |
| OPFS cache | free disk (browser quota) | the user's machine |

# Installable corpora and priors — the content format

A flow prior is a **modality-register grammar**: a model of how competent readings in
*one* register move. Because the right grammar depends on the target — a French novel,
a contemporary science explainer, and a courtroom transcript move differently — priors
are **installable and facet-keyed**. This is the format for the content that builds one,
and how it gets installed and selected.

## 1. The corpus format (input)

One JSON object per line (`.jsonl`). Only `text` is required; everything else is
provenance that makes the resulting prior self-describing and selectable.

```json
{"id": "1342",
 "title": "Pride and Prejudice",
 "text": "It is a truth universally acknowledged, that a single man …",
 "lang": "en",
 "region": "gb",
 "era": "1810s",
 "domain": "literature",
 "register": "narrative"}
```

| field | required | meaning |
|---|---|---|
| `text` | **yes** | the full document as plain text (boilerplate stripped) |
| `id` | recommended | stable identifier (used for `--resume`) |
| `title` | recommended | human label, shown in rankings/diagnostics |
| `lang` `region` `era` `domain` `register` | recommended | the **facets** — see below. May be given per-document, or once at distil time via CLI flags. |

Facets may instead be nested under a `facets` object. The extractor is **liberal at the
boundary** — it accepts a small set of common aliases so a Wikipedia / archive dump drops
in without a bespoke transform: `language` → `lang`, `genre` → `register`. (Source-specific
*text* cleaning — stripping wiki `== References ==` apparatus, etc. — is **not** the app's
job; do it in your acquisition step, keeping `parseText` source-agnostic.) No text is
retained past extraction — the prior holds only operator statistics plus these facet
labels — so any CC / public-domain source is a clean input.

### Flat registers (encyclopedic / reference)

Born-rule segmentation assumes the text *articulates itself* — parts, mode shifts. Some
registers don't: encyclopedic reference prose is near-pure INS (introducing facts), with
no NUL re-groundings and no INS↔SEG alternation, so most documents collapse to a single
section and can't form a trajectory. The extractor **warns** when >30% of documents
collapse. The fix is not more tuning (there are no joints to find) but a fixed window:

```
node tools/flow/eo_trajectory.mjs corpus.jsonl --eoreader . --segment sentences --per-sentences 12
```

### The facet vocabulary

Free strings, but be consistent (selection matches on equality, case-insensitive). Suggested:

- **`lang`** — ISO code (`en`, `fr`, `de`, `zh`). *Load-bearing:* a different language is a
  different operator grammar, so selection treats `lang` as a hard filter.
- **`region`** — `us`, `gb`, `gb-us`, `global`, `in`, … (dialect/provenance).
- **`era`** — `1810s`, `1900s`, `contemporary`, `c20`, … (period; prose moves differ by era).
- **`domain`** — `literature`, `science`, `law`, `journalism`, `medicine`, `policy`, …
- **`register`** — `narrative`, `expository`, `argument`, `rhetoric`, `reference`, `dialogue`, …

Pick the granularity you'll actually select on. One prior per (lang × domain × register)
you care about is a good default; region/era refine ties.

## 2. Build and install

```
# extract born-rule trajectories (facets ride through from the corpus)
node tools/flow/eo_trajectory.mjs corpus.jsonl --eoreader . --sample 0 --resume

# distil — facets come from the corpus, or override/set them here
python3 tools/flow/flow_distill.py trajectories.jsonl --min-sent 150 \
        --lang en --domain science --register expository --era contemporary --out sci.json

# install into the facet-keyed registry (rebuilds data/flow-priors/index.json)
node tools/flow/install_prior.mjs sci.json --name expository-en-science
```

The registry lives in **`data/flow-priors/`**: one self-describing prior JSON per file
plus `index.json`, the manifest the runtime loads. A prior is ~16 KB, provenance-stamped
(`meta.facets`, corpus size, source hash, timestamp).

## 3. Select and diagnose (reading)

```
# pick the prior by facets, flag the sections a reading most likely under-read
node tools/flow/flow_diagnose.mjs --text article.txt \
     --select '{"lang":"en","domain":"science","register":"expository"}'
```

In code (browser or Node): fetch/read `data/flow-priors/index.json`, then

```js
import { selectPrior, loadPrior, diagnoseReading } from './src/flow/index.js';
const pick = selectPrior(manifest.priors, { lang:'en', domain:'science' });   // facet match; lang is a hard filter
const prior = loadPrior(await (await fetch(`data/flow-priors/${pick.file}`)).json());
const report = diagnoseReading(prior, doc);   // doc = parseText(...)
// report.flagged: sections OFF the manifold of competent readings — likely under-read, worth re-reading
```

`diagnoseReading(prior, doc)` returns per-section `{from, to, pos, dom, residual,
residualPercentile, arcAdherence, underRead}` and the `flagged` subset (residual ≥ p95).
It is the reading-side companion to `flowVerdict`, validated in `docs/flow-reading.md`
(corrupting a parse raises the residual and localizes to the damaged region).

## 4. Two priors ship as examples

| name | facets | corpus |
|---|---|---|
| `narrative-en-1900s` | en · gb-us · 1900s · literature · narrative | 36 Project Gutenberg books |
| `expository-en-science` | en · global · contemporary · science · expository | 32 Wikipedia science articles |

Both are bootstraps (statistics only, no text). Replace or extend them by installing
priors for the registers, regions, eras, languages, and domains you actually read and
write — the pipeline builds one from a few hundred documents in an afternoon.

# templates/ — how the machine learns to make things

This folder is the task creator's durable memory. When the system is asked to make
something it has not made before — an essay, a sonnet, a lab report, a melody — it
**learns the shape** (researches how the thing is structured), then writes that shape
here as `<kind>.json`. The next request reads it back instantly. You can also **install**
a shape by hand: drop a `<kind>.json` in this folder and it's available immediately.

We ship **no** artifact-specific guide in code. The only built-in shape is the universal
arc (open → develop → close), used as an offline floor. Everything specific lives here, as
data — learned or installed, never hard-coded. See `docs/task-creator.md` and
`docs/omnimodal-task-language.md`.

## The format

A template is a small JSON object describing a kind — its *structure* (sections, budgets,
form) and, when learned from examples, its *content* (the recurring vocabulary, stock
phrases, and per-section themes read off the examples):

```json
{
  "schema": 1,
  "kind": "essay",
  "organ": "text",
  "format": "prose",
  "size": 700,
  "note": "learned from a definition (3 elements)",
  "source": "installed",
  "sections": [
    { "role": "introduction", "share": 1.0, "dir": { "act": "open", "detail": "state the thesis" } },
    { "role": "body",         "share": 1.6, "dir": { "act": "develop", "detail": "one point with evidence" } },
    { "role": "conclusion",   "share": 1.0, "dir": { "act": "close", "detail": "draw together; add nothing new" } }
  ]
}
```

| field | meaning |
| --- | --- |
| `kind` | the artifact noun this shape is for (open-vocabulary) |
| `organ` | the output organ that renders it: `text` (tokens) or `music` (beats) |
| `size` | the default total budget at normal length, in the organ's native unit |
| `sections[].role` | the section's name in the artifact |
| `sections[].share` | its slice of the budget (relative; normalised at build) |
| `sections[].dir` | a **neutral directive** — `{ act, detail }`. `act` ∈ open · develop · close · state · vary · resolve · enumerate · summarize. The output organ lowers it to an instruction (text → a sentence, music → a phrase), so a template is modality-neutral. |
| `sections[].goal` | (alternative to `dir`) a literal text instruction; `{subject}` is substituted at build. Prefer `dir` for shapes meant to be shared across modalities. |
| `form` | (learned-from-examples only) the observable form — stanzas, lines per stanza, syllable pattern, line terminator, and the core engine's segmentation score (`segF1`). |
| `content` | (learned-from-examples only) the matter — `lexicon` (the kind's recurring open-class words) and `phrases` (repeated word runs: refrains, slogans). Per-section themes ride in each `dir.detail`. |

`source` is `learned` (the machine built it), `installed` (a person added it), or
`builtin`. The budget drives the structure: any section whose budget exceeds the organ's
single-reach ceiling is split into smaller leaves, so a longer request nests deeper —
nothing about length is fixed here.

## Wiring (Node)

```js
import { createSpecLibrary, runArtifact } from '../src/tasks/index.js';
import { loadTemplatesDir, templatePersister } from '../src/tasks/templates.js';

const dir = 'templates';
const library = createSpecLibrary({
  seed: await loadTemplatesDir(dir),     // installed + previously-learned shapes
  onLearn: templatePersister(dir),       // persist whatever it learns next
});

await runArtifact({ request: 'write a sonnet about the sea', library, webSearch, organs });
// if "sonnet" isn't known, it researches it, writes templates/sonnet.json, and uses it.
```

The engine never touches the network itself — `webSearch` is injected (proposer-only,
the same discipline as the rest of the repo).

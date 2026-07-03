# Document structure — found emergently, not from a keyword list

The reader's table of contents and its section-to-section cursor jumps do **not** come from
matching the word "Chapter". There is no vocabulary of `chapter`/`canto`/`part` in the code.
Structure is *discovered* from the document's own regularities — in the spirit of the
music/vision probes, where the category is the output of the reading, not its input. The
implementation is `detectStructure(p, paras)` in [`src/reader/app.dc.js`](../src/reader/app.dc.js).

## Why a keyword list is the wrong primitive

A heading regex (`/^chapter\b/i`, numerals, all-caps) fails in both directions: it misses
untitled and non-English chapters, and it fires on stray numerals, datelines and captions.
Worse, it *names the category in advance* — the opposite of how the rest of this repo works.
An earlier version of this file documented exactly that hardcoded approach; this is the
rewrite that removes the vocabulary.

## How a marker emerges

`detectStructure` reads short, non-sentence lines and reduces each to a **form** — never a
word match:

- markdown depth (`##` → level 2),
- a **lead word + a numeral at a fixed token position** (`CHAPTER I` → `chapter|R@1`,
  `Inferno: Canto I` → `canto|R@2`, bare `IV` → `|R@0`),
- a decimal section number that *starts* the line (`3.2.1` → level 3),
- or a bare title / all-caps shape.

Lines are then **grouped by that form**, and a family is admitted only when it behaves like
real structure:

- it **recurs** (≥ 3 members),
- its numerals **run** — consecutive, or resetting to 1 at a higher boundary (so Dante's
  cantos, which restart each canticle, still count),
- it **spans** the document (not clustered like a front-matter list),
- it **tiles regularly** (low coefficient of variation between markers) and **sparsely** (a
  page-footer or dictionary headword recurs far too densely to be a chapter).

So the token `canto` is admitted **because lines of that form recur and partition the text**,
not because it is on a list — and the same machinery admits `chapter`, `глава`, `##`, or a
decimal tree with no change. Author-**declared** markup (markdown, decimal numbers) is
honored directly; it's the author's own structure. When *no* form recurs, sections fall back
to the engine's projected **entity field** (boundaries where the field shifts and persists,
with a contrast guard) — which carries short, heading-less texts.

## Stress battery — real fetched documents

| Source | Discovered marker | Result |
|---|---|---|
| *Pride & Prejudice* (PG 1342) | `chapter\|R@1` | **61 chapters** — the illustration-caption list (same word, different position) is *not* admitted |
| *Dracula* (PG 345, epistolary) | `chapter\|R@1` | **27/27** — dated journal entries don't fragment it |
| *Divine Comedy* (PG 1004) | `canto\|R@2` | **~100 cantos** across the three canticles (numbering resets handled) |
| *the-art-of-command-line* (Markdown) | `md1/2/3` | **16, nested** — declared markup, code fences ignored |
| RFC 2616 | decimal | decimal tree `1.1`/`3.2.1` with levels (literal ToC still duplicates) |
| *Devil's Dictionary* (flat A–Z) | — | **0** — headword field is too dense to be chapters |
| *Spoon River* / short-story coll. | — | **0** — per-entry families too dense; honest flat |
| arXiv HTML paper | — | **0** — section numbers lost in flattened two-column HTML |
| essay traps (`42`, dateline, `MIX`) | — | **0** — no recurring family |

No keyword list is consulted for any row above. The marker that wins is whatever form the
document repeats in a regular, spanning, sparse way.

## Known limits (honest)

- **Flat collections** (a dictionary, a poem/epitaph anthology, a dialogue-heavy story
  collection) return **0** rather than a noisy TOC — their per-entry "markers" are too dense
  to be chapters. The conservative call; a real per-entry index is lost.
- **Shallow nesting** — markdown and decimals carry true levels; a numbered prose family is
  one level. Drama Act→Scene and scripture Book:Chapter:Verse are not modelled as a hierarchy.
- **A literal Table of Contents** (RFC 2616) duplicates the body's decimal headings.
- **HTML/PDF** depend on text extraction; semantic `<h2>` tags are flattened to text lines
  (the detector reads the *prose*, not the markup), so a two-column arXiv paper can lose its
  numbering — it returns nothing rather than nav-chrome noise.
- **The engine's entity field is weak at book scale** — per-paragraph it averages ~2
  entities, so the windowed-shift signal saturates on long texts. That is *why* form-recurrence
  leads and the field is only the fallback for short documents.

It remains a *best guess*: it finds real structure a regex cannot (untitled, multilingual,
markdown, decimal) by discovering the marker form, and it refuses to invent structure where a
document has none — but unusual formatting can still fool it.

## Bookmarks — where the reading is surprised

Separate from the TOC, `detectBookmarks(p, paras)` flags the passages the reading finds
*important*. The signal is **surprise**, read off the same per-paragraph entity field:

- **Connectivity surprise** (primary): two entities that were each already *established*
  (seen ≥ 2× before) meet for the **first time** in a paragraph — a collision of threads (a
  meeting, a letter, a reveal). Scored by the lesser of the two entities' weights, summed
  over the newly-formed pairs.
- **Novelty** (secondary): an important entity makes its first appearance.

A paragraph is bookmarked when its score stands well above the book's **own** background
(mean + 1.2σ), spaced apart and capped (~12), so a calm text gets few and a turbulent one
more. On *Metamorphosis* this lands on the transformation's aftermath, the family turning on
Gregor ("Leave my home. Now!"), and the departure after his death; on *Pride & Prejudice*,
the Netherfield ball, the Pemberley turn, Lydia's elopement, the pivotal letters. It is
strongest on **narrative** — on a dictionary or a how-to (no plot) it marks the
entity-dense entries instead, which is honest but less meaningful. The "why" caption is shown
only when both colliding entities read as proper, recurring names (the parse otherwise picks
up archaic pronouns).

The reader's **❖** toggle highlights these in the page and drops clickable **markers on the
right-edge rail** at each spot's scroll fraction.

## The same boundaries move the cursor

Every section anchor (`id="eo-ch-N"`) is a structural stop. The reader's ⏮/⏭ controls
(`jumpSection`) step from the section you're in to the previous/next, the Contents menu jumps
to any of them, and nested levels indent — so the cursor moves by the structure the reading
*discovered*, not by scroll distance.

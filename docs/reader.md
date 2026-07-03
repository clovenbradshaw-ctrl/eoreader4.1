# The EO Reader (`index.html`)

`index.html` is now the **EO Reader** — a reading surface where every recognized
entity in a page is clickable and a right-hand side panel says what we know about it
(definition, mentions, neighbors/relations, sources, an ego-graph). It reads live URLs,
renders the fetched page as a page (iframe), and decorates it with clickable entities.
**Almost all of this is computed without an LLM** — purely from the structural parse
(`parseText` → `projectGraph`). The original chat app is preserved at `chat.html`.

What you can do:

- **Read a website two ways — and switch any time.** Paste a URL; while EO is still reading
  it the fetched page renders live in the center (sandboxed iframe) with its known names
  highlighted and clickable. Once the read finishes, a **Reader / Page** toggle rides in the
  toolbar and **both renderings carry the same contents nav and flagged passages**:
  - **Reader** (the default) is the stripped book view every source gets — drop-cap prose,
    the engine's table of contents, the flagged passages, with all ads, chrome and other
    distractions gone (only the extracted article remains).
  - **Page** is the site's *own* layout, kept intact, with the same contents nav built from
    its headings and the same flagged passages highlighted in place over it.

  The choice persists, so every page afterwards opens the way you prefer. Only a URL you
  haven't read yet (browsing ahead of the reading) stays a plain live page, because it has
  no parsed propositions yet to draw a contents or find its surprises from.
- **Read a book as a book** — import a `.txt`/`.md` file (📄) or search **Project
  Gutenberg** (type a title/author in the search bar). The work renders as a readable
  book — drop-cap, serif, the author's paragraphs — entities clickable. A book is
  **read fully** (fetched, PG boilerplate stripped, parsed) before it becomes a source
  and can be chatted with. Search results show cover art, genre tags and download counts.
  The same book treatment — the table of contents and the auto-flagged passages below —
  applies to **every read document**, web pages included (in either the Reader or Page
  rendering above), not just Gutenberg books.
- **Reading controls, like a real e-reader.** With a book open, a reading toolbar rides
  above the page: text size (A− / A+), line spacing (↕), column width (Narrow · Normal ·
  Wide), typeface (Serif / Sans) and paper theme (Light · Sepia · Night). Every choice
  applies *live* to the open book (no reload, so your place and the entity highlights
  survive) and persists across sessions. A slim progress bar + percentage tracks how far
  you've read, and your **place is remembered per book** — reopen a work and it scrolls
  back to where you left off.
- **Bookmarks the reading places itself.** A **❖** toggle turns on auto-bookmarks — spots
  the reading flags as *important* because something surprising happens there: chiefly
  **connectivity surprise** (two entities that were each already established meet for the
  first time — a collision of threads) plus a lighter novelty term. When the mode is on the
  flagged passages lift off the page (an accent wash + rule, captioned with the colliding
  entities), and little **markers ride the right edge** of the page at each spot — click one
  to jump there. The spots are whatever stands well above the book's *own* background of
  surprise, so a calm book gets few and a turbulent one gets more. See
  [`docs/structure.md`](structure.md#bookmarks).
- **Structure read by the engine.** The **Contents** menu and the ⏮/⏭ section jumps come
  from a best-guess of the document's structure that the engine makes from its *own
  reading* — validated heading runs where they exist, and otherwise sections that **emerge**
  where the entity field shifts and persists. It recovers chapters a keyword match misses
  (untitled, multilingual) and refuses to invent them where there are none (a stray page
  number or dateline is not a chapter). The same boundaries are the cursor's structural
  stops, so you move through a book by section, not by scrolling. See
  [`docs/structure.md`](structure.md).
- **Chat — normal chat, grounded when it can be.** A model answers like a normal
  assistant (the old backends: Llama-3.2-3B over WebGPU by default, or Echo offline;
  pick in Settings). Clock questions ("what's the date?") are answered without any model;
  when you've read something relevant it's woven in as grounding and the answer links the
  entities/sources it drew on. If no model loads, chat falls back to a structural answer
  from your reading. Chats are first-class: a "New chat" button + a Chats section in the
  left panel, and any source has a ✦ button to chat about just that source.
- **A new chat is a net-new space.** Hitting the top-bar **Chat** or **New chat** opens an
  *isolated* chat — nothing you've read is in scope, so it answers as a plain assistant (plus
  the web, if on) rather than silently drawing on the whole library. From the **About** row you
  then choose what it draws on: tap **✦ Everything** to ground across everything you've read, or
  **+ Add source** to pick sources from a picker organized by topic — each primary page with the
  branching pages found from it nested underneath. "✦ Ask about this page" and a source's ✦
  button still open a chat pre-scoped to that one source, by intent.
- **The page stays the hero.** With a page or book open, chat rides as a right-hand
  drawer over it (the page stays readable) — opened by the "✦ Ask about this page" button.
  With nothing open, chat takes the center.
- **Swap panels** — the ⇄ toolbar button swaps the sources/chats side and the entities
  side; the choice persists.

The implementation lives in `src/reader/app.dc.js` (logic) and `src/reader/view.xdc.html`
(view); the entity engine and the fetch proxy are the repo's own.

This UI is the front end the engine was always built for; its footer reads *"Live
projection of your reading log over the real eoreader4 engine."* It is React + a small
`<x-dc>` view runtime, driving the repo's own engine.

## Layout

- `index.html` — **generated**, self-contained. Do not hand-edit; run the build below.
- `src/reader/app.dc.js` — the app logic (`class Component extends DCLogic`). Edit here.
- `src/reader/view.xdc.html` — the `<x-dc>` view template. Edit here.
- `src/reader/app.props.txt` — the DC `data-props` schema (seedUrl, accent).
- `vendor/react.production.min.js`, `vendor/react-dom.production.min.js` — pinned React 18.
- `vendor/dc-runtime.js` — the `<x-dc>` view runtime (third-party; loaded as a UMD global).
- `scripts/build-reader.mjs` — assembles the three sources above into `index.html`.

## Build

```sh
node scripts/build-reader.mjs   # regenerate index.html after editing the sources
npm run serve                   # python http.server on :8000, then open /index.html
```

## Engine wiring

`window.__resources` (set in `index.html`) points each engine/data resource at a real
repo file, resolved to an absolute URL against `document.baseURI` (the app's dynamic
`import()`/`fetch` run inside `vendor/dc-runtime.js`, so relative paths would resolve
against `/vendor/`):

| resource      | path                                   | role |
|---------------|----------------------------------------|------|
| `eoEngine`    | `src/reader/eoreader4-bundle.js`       | the engine: `parseText`, `projectGraph`, `DEFAULT_PROJECTION_RULES` (a single-file build of `src/`) |
| `eoSvo`       | `src/reader/svo-llm.js`                | optional LLM relation reader — inert without `window.claude` |
| `eoPhase`/`eoEmbed` | `src/reader/eo/*.js`             | optional MiniLM "measured reading" lens classifier |
| `eoCells`/`eoCentroids` | `src/reader/eo/*.json`       | data for the lens classifier |

To run against the **live** source under `src/` instead of the prebuilt bundle (so
edits there take effect with no rebuild), point `eoEngine` at `src/reader/engine-entry.js`
in `scripts/build-reader.mjs` and rebuild. Both expose the same three names.

The reader fetches pages through the same proxy the rest of the repo uses
(`https://n8n.intelechia.com/webhook`, see `src/ingest/webfetch.js`).

## Without an LLM

Entity detection and everything the side panel shows come from `parseText` +
`projectGraph` — no model in the loop. The SVO-LLM relation reader and the MiniLM lens
classifier are optional enhancements that degrade gracefully when no model is present
(`this.SVO = null`; the classifier fails closed).

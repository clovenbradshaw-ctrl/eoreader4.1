---
name: verify
description: Build, launch, and drive the EO Reader in headless Chromium to verify a change at its surface (the browser UI).
---

# Verifying EO Reader changes

The app is a single static page. `index.html` is BUILT — never edit it directly;
edit `src/reader/app.dc.js` (logic) or `src/reader/view.xdc.html` (template), then:

```bash
npm run build        # regenerates index.html (inlines app.dc.js + view)
python3 -m http.server 8137 &   # serve the repo root; any static server works
```

## Driving it (Playwright, headless)

No test-ids — select by the `title="…"` attributes on buttons/cards (note: some use
curly apostrophes, e.g. `title="Open this site’s profile"`). Useful handles:

- Boot: wait for `input[data-eo-import]` (attached, it's `display:none`), then ~3s.
- Import a text file (the real user path — same event as the OS picker):
  `page.setInputFiles('input[data-eo-import]', 'book.txt')`. Ingestion done when
  `document.body.innerText.includes('proposition')`. Files < 40KB take the fast
  ingest path (a few seconds); bigger ones fold in slowly.
- Sites directory: click `[title="Browse every source as a profile page"]`.
- Site profile: click a card `[title="Open this site’s profile"]`.
- Read a URL into memory: the top search box + Read button.

If the installed Playwright doesn't match the preinstalled browsers, launch with
`chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`.

## Gotchas

- The app runs model-less in this environment and degrades gracefully — reads,
  ingestion, profiles, and entity pages all work without a model.
- App state persists (per browser profile); launch a fresh browser per scenario
  so leftover sources don't shadow your fixture.
- `pg5200.txt` (Gutenberg Metamorphosis, full header) is a repo fixture good for
  import tests; trim with `head -c 38000` to stay on the fast ingest path.

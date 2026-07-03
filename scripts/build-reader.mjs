// build-reader.mjs — assemble the self-contained EO Reader index.html from its
// editable sources. The DC runtime boots on DOMContentLoaded and reads the app
// logic from the inline <script type="text/x-dc"> textContent and the view from
// the <x-dc> element's innerHTML, so both must be inlined here. React/ReactDOM
// are vendored as UMD globals (loaded before dc-runtime) so nothing is fetched
// from a CDN. Edit src/reader/app.dc.js or src/reader/view.xdc.html, then re-run
// `node scripts/build-reader.mjs`.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const view  = read('src/reader/view.xdc.html');           // <x-dc>…</x-dc> template
const appJs = read('src/reader/app.dc.js');               // class Component extends DCLogic
const props = read('src/reader/app.props.txt').trim();    // data-props (HTML-escaped)
const phCss = read('vendor/phosphor/phosphor.css');       // @font-face for the Phosphor icon font

// Inlining the logic into a <script> would end early on any literal </script>.
const safeJs = appJs.replace(/<\/script/gi, '<\\/script');

// window.__resources points every engine/data resource at a real repo file.
// eoEngine → the single-file build of src/ (swap to src/reader/engine-entry.js
// to run against the live source instead). The SVO + lens/embedder resources are
// model-side extras that degrade gracefully when no model is present.
//
// Paths are RELATIVE here but resolved to absolute URLs against document.baseURI
// at load time (see the inline resolver below). They must be absolute because the
// app's dynamic import()/fetch run inside dc-runtime.js (under /vendor/), so a bare
// './src/…' would wrongly resolve relative to /vendor/.
const resources = {
  eoEngine:    'src/reader/eoreader4-bundle.js',
  eoModel:     'src/reader/model-entry.js',
  eoSvo:       'src/reader/svo-llm.js',
  eoPhase:     'src/reader/eo/phasepost.js',
  eoEmbed:     'src/reader/eo/embed.js',
  eoCells:     'src/reader/eo/phasepost-cells.json',
  eoCentroids: 'src/reader/eo/centroids-27.json',
};

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f5f6f8">
<title>EO Reader</title>
<link rel="icon" href="favicon.ico" sizes="any">
<link rel="icon" type="image/svg+xml" href="favicon.svg">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<style>${phCss}</style>
<script src="vendor/react.production.min.js"></script>
<script src="vendor/react-dom.production.min.js"></script>
<script>(function(){var R=${JSON.stringify(resources)},b=document.baseURI,o={};for(var k in R)o[k]=new URL(R[k],b).href;window.__resources=o;})();</script>
<script src="vendor/dc-runtime.js"></script>
<!-- The generation pipeline + the essay organ (src/reader/eo-gen.js), exposed as window.eoGen:
     the chat routes an essay ask through the arc (runContinuation) or the commission-driven
     organ walk (essayCompose, ≥2500-word floor, learned types). Loaded off the base URL so it
     works deployed; the app degrades to its old paths if absent. Lives HERE in the builder —
     it was once hand-added to index.html and a rebuild silently dropped it. -->
<script type="module">import(new URL('src/reader/eo-gen.js', document.baseURI).href).catch(e=>console.warn('eoGen load failed:', e));</script>
</head>
<body>
${view}
<script type="text/x-dc" data-dc-script data-props="${props}">
${safeJs}
</script>
</body>
</html>
`;

writeFileSync(join(root, 'index.html'), html);
console.log('wrote index.html (' + html.length + ' bytes)');

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
  eoChorus:    'src/reader/eo/chorus.js',
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
<!-- The everything-workspace filing model (src/workspace): a pure folder + membership
     algebra over the Record, exposed as window.EOWorkspace. The DC app script is inlined
     (not a module) so it can't import; it reads this global instead and degrades to a
     no-op file explorer until the module lands. -->
<script type="module">import(new URL('src/workspace/index.js', document.baseURI).href).then(m=>{window.EOWorkspace=m;}).catch(e=>console.warn('workspace load failed:', e));</script>
<!-- The EOT ledger + its live terminal surface (src/audit/): every operation the app
     performs — a read, a search, a route, a prompt, a generation, a bind, a veto — read
     out as one EOT line the moment it happens, tailed in a terminal drawer (Ctrl+backtick),
     exportable as a re-parseable .eot document or a .jsonl trail. Exposed as window.__eot;
     the app's feedLine / ingest mirror into it, and the model bridge is wrapped here so
     every prompt and generation is captured verbatim (the load-bearing audit artifact). -->
<script type="module">
(async function(){
  try{
    var base=document.baseURI;
    var mods=await Promise.all([
      import(new URL('src/audit/eot-ledger.js', base).href),
      import(new URL('src/audit/eot-terminal.js', base).href)
    ]);
    var ledger=mods[0].createEotLedger({capacity:1000});
    window.__eot=ledger;
    mods[1].mountEotTerminal(ledger,{hotkey:true});
    ledger.record({op:'INS',door:'enactor',agent:'app',target:'reader',operand:{type:'Engine'},kind:'boot'});
    // Wrap the model bridge so every prompt + generation lands in the ledger, verbatim,
    // through the ENACTOR door (the model's own act — reafference, it cannot witness).
    var wrap=function(){
      var c=window.claude;
      if(!c||typeof c.complete!=='function'||c.__eotWrapped)return !!(c&&c.__eotWrapped);
      var orig=c.complete.bind(c),n=0;
      c.complete=function(p){
        var rest=Array.prototype.slice.call(arguments,1);
        var turn='gen'+(++n);
        try{ledger.prompt({turn:turn,text:typeof p==='string'?p:JSON.stringify(p),agent:'model:bridge'});}catch(e){}
        var t0=Date.now();
        return Promise.resolve(orig.apply(null,[p].concat(rest))).then(function(out){
          try{ledger.generate({turn:turn,text:typeof out==='string'?out:JSON.stringify(out),ms:Date.now()-t0,agent:'model:bridge'});}catch(e){}
          return out;
        },function(err){
          try{ledger.veto({turn:turn,id:'error',from:'generating',to:'failed',message:String((err&&err.message)||err),agent:'model:bridge'});}catch(e){}
          throw err;
        });
      };
      c.__eotWrapped=true;return true;
    };
    if(!wrap()){var tries=0,iv=setInterval(function(){if(wrap()||++tries>40)clearInterval(iv);},500);}
  }catch(e){console.warn('EOT ledger load failed:',e);}
})();
</script>
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

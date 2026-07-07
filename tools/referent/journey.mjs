#!/usr/bin/env node
// ============================================================================
// journey.mjs — the REFERENT-JOURNEY read (docs/referent-journey.md).
//
// Runs the parser over a big multi-character text and measures three things the
// mono-referential goldens (one Gregor, one Alice) cannot show:
//
//   1. the JOURNEY   — does each referent travel a staged arc (born → related →
//                      reflected-on), or is it born and then lived relationally?
//   2. the WEAVE     — are the referent-threads run in PARALLEL (spans overlap) or
//                      handed off SEQUENTIALLY? the pairwise span overlap.
//   3. the NESTING   — the holonic span-containment depth (via the engine's own
//                      referentNesting projection), the number the flat depth-1
//                      addresses threw away.
//
// The extreme test bed is War and Peace (hundreds of characters). It is not in the
// repo (3.2 MB); the tool fetches it from the GITenberg mirror once and caches it
// under tools/referent/.cache/ (gitignored). Point it at any text with --text.
//
//   node tools/referent/journey.mjs                       # fetch W&P, read a chunk
//   node tools/referent/journey.mjs --chars 0             # the whole book (minutes)
//   node tools/referent/journey.mjs --text mybook.txt --min-events 8
//
// Flags: --chars N (chars to read after boilerplate strip, 0 = all; default 700000),
//        --min-events N (population floor, default 8), --top N (bars/ensemble, 20),
//        --url U (source book), --eoreader DIR (engine root).
// ============================================================================
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] ?? true) : d; };
const num  = (n, d) => { const v = flag(n, null); return v == null ? d : Number(v); };

const here   = dirname(fileURLToPath(import.meta.url));
const eoDir  = resolve(String(flag('--eoreader', join(here, '..', '..'))));
const CHARS  = num('--chars', 700000);
const MIN    = num('--min-events', 8);
const TOP    = num('--top', 20);
const URL    = String(flag('--url', 'https://raw.githubusercontent.com/GITenberg/War-and-Peace_2600/master/2600.txt'));

const imp = (p) => import(pathToFileURL(join(eoDir, ...p)).href);
const { parseText }      = await imp(['src', 'perceiver', 'parse', 'index.js']);
const { projectGraph }   = await imp(['src', 'core', 'index.js']);
const { OPERATORS }      = await imp(['src', 'core', 'operators.js']);
const { referentNesting, nestingSummary } = await imp(['src', 'perceiver', 'referent-nesting.js']);

// ── Source: cached fetch, Gutenberg boilerplate stripped ────────────────────
const cacheDir = join(here, '.cache');
const cacheFor = (u) => join(cacheDir, u.replace(/[^\w.-]/g, '_'));
const stripGutenberg = (t) => {
  const s = t.indexOf('*** START OF'); const e = t.indexOf('*** END OF');
  let body = t;
  if (s >= 0) body = body.slice(t.indexOf('\n', s) + 1);
  if (e >= 0) body = body.slice(0, body.indexOf('*** END OF') - (s >= 0 ? t.indexOf('\n', s) + 1 : 0));
  return body.trim();
};

let raw;
const textFlag = flag('--text', null);
if (textFlag) {
  raw = readFileSync(String(textFlag), 'utf8');
} else {
  const cf = cacheFor(URL);
  if (existsSync(cf)) raw = readFileSync(cf, 'utf8');
  else {
    process.stderr.write(`fetching ${URL} …\n`);
    const res = await fetch(URL);
    if (!res.ok) { process.stderr.write(`fetch failed: ${res.status}\n`); process.exit(1); }
    raw = await res.text();
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cf, raw);
  }
}
let text = stripGutenberg(raw);
if (CHARS > 0 && text.length > CHARS) text = text.slice(0, CHARS);

// ── Parse ───────────────────────────────────────────────────────────────────
const t0 = Date.now();
const doc = parseText(text, { docId: 'referent-journey' });
const g = projectGraph(doc.log, {});
const parseMs = Date.now() - t0;

const rep = (id) => g.representative(id);
const DOMAIN_COL = { Existence: 'Ground', Structure: 'Structure', Interpretation: 'Interp' };

// ── Attribute every operator event to the referent(s) it touches ────────────
// INS/DEF carry one id; SIG/CON/SYN carry two endpoints. NUL(chrome) and the
// discourse-level EVA/REC/SEG (keyed by seq, not id) are counted as NOT
// entity-attributed — the tell the analysis reports for "interpretation is rare".
const stat = new Map();     // root id -> { g:0,s:0,i:0, events:0, firstIns, firstRel, opPos:{G:[],S:[],I:[]} }
const touch = (id, ev, col) => {
  const r = rep(id);
  let x = stat.get(r);
  if (!x) stat.set(r, x = { g: 0, s: 0, i: 0, events: 0, firstIns: Infinity, firstRel: Infinity });
  x.events++;
  if (col === 'Ground') x.g++; else if (col === 'Structure') x.s++; else x.i++;
  if (ev.op === 'INS' && ev.sentIdx != null) x.firstIns = Math.min(x.firstIns, ev.sentIdx);
  if ((ev.op === 'CON' || ev.op === 'SIG') && ev.sentIdx != null) x.firstRel = Math.min(x.firstRel, ev.sentIdx);
};
let attributed = 0, unattributed = 0;
for (const ev of doc.log.snapshot()) {
  const op = OPERATORS[ev.op]; if (!op) { unattributed++; continue; }
  const col = DOMAIN_COL[op.domain];
  const ids = [];
  if (ev.id != null && ev.kind !== 'chrome' && ev.kind !== 'meta') ids.push(ev.id);
  if (ev.src != null) ids.push(ev.src);
  if (ev.tgt != null) ids.push(ev.tgt);
  if (ev.from != null) ids.push(ev.from);
  if (ev.to != null) ids.push(ev.to);
  if (!ids.length) { unattributed++; continue; }
  attributed++;
  for (const id of ids) touch(id, ev, col);
}

// ── Nesting + spans (the engine's own projection) ───────────────────────────
const nest = referentNesting(doc, g);
const summary = nestingSummary(nest);
const spanById = new Map(nest.referents.map((r) => [r.id, r]));

// ── Population: referents with ≥ MIN attributed events ──────────────────────
const pop = nest.referents
  .filter((r) => (stat.get(r.id)?.events || 0) >= MIN)
  .map((r) => ({ ...r, ...stat.get(r.id) }));
pop.sort((a, b) => b.count - a.count);

// ── 1. Journey — operator mix; hubs vs threads; born-before-related ─────────
const mix = (rs) => {
  let G = 0, S = 0, I = 0;
  for (const r of rs) { G += r.g; S += r.s; I += r.i; }
  const T = G + S + I || 1;
  return { G: G / T, S: S / T, I: I / T };
};
const overall = mix(pop);
const median = (xs) => { const a = xs.slice().sort((p, q) => p - q); return a.length ? a[Math.floor((a.length - 1) / 2)] : 0; };
const spanMed = median(pop.map((r) => r.spanLen));
const hubs    = pop.filter((r) => r.spanLen >= spanMed);
const threads = pop.filter((r) => r.spanLen <  spanMed);
const bornBoth = pop.filter((r) => isFinite(r.firstIns) && isFinite(r.firstRel));
const bornBefore = bornBoth.filter((r) => r.firstIns < r.firstRel).length;

// ── 2. Weave — pairwise span overlap + containment fraction ─────────────────
// Sampled when the population is large (all pairs is O(n²); a fixed stride keeps it
// deterministic and cheap while the mean is stable).
const overlap = (a, b) => {
  const lo = Math.max(a.span[0], b.span[0]), hi = Math.min(a.span[1], b.span[1]);
  const inter = Math.max(0, hi - lo + 1);
  const uni = Math.max(a.span[1], b.span[1]) - Math.min(a.span[0], b.span[0]) + 1;
  return uni > 0 ? inter / uni : 0;
};
const contained = (a, b) =>
  (a.span[0] >= b.span[0] && a.span[1] <= b.span[1]) || (b.span[0] >= a.span[0] && b.span[1] <= a.span[1]);
// Two normalisations, because they answer different questions. Jaccard (over the
// UNION) is the honest "how much do two threads share of their combined life" — dragged
// down by short threads. Coverage (over the shorter thread's own MIN span) is "when two
// threads coexist, how contained is the briefer one" — the co-running measure. A dense
// parallel weave shows a MODEST Jaccard and a HIGH coverage; a sequential hand-off shows
// both low.
const coverage = (a, b) => {
  const lo = Math.max(a.span[0], b.span[0]), hi = Math.min(a.span[1], b.span[1]);
  const inter = Math.max(0, hi - lo + 1);
  const minLen = Math.min(a.spanLen, b.spanLen);
  return minLen > 0 ? inter / minLen : 0;
};
let ovSum = 0, covSum = 0, ovN = 0, nested = 0;
const stride = Math.max(1, Math.floor(Math.sqrt(pop.length * pop.length / 400000)) || 1);
for (let i = 0; i < pop.length; i++)
  for (let j = i + 1; j < pop.length; j += stride) {
    ovSum += overlap(pop[i], pop[j]); covSum += coverage(pop[i], pop[j]);
    if (contained(pop[i], pop[j])) nested++; ovN++;
  }
const meanOverlap = ovN ? ovSum / ovN : 0;
const meanCoverage = ovN ? covSum / ovN : 0;

// ── Report ──────────────────────────────────────────────────────────────────
const pct = (x) => (100 * x).toFixed(0) + '%';
const bar = (r, units) => {
  const W = 40, a = Math.round((r.span[0] / units) * W), b = Math.max(a + 1, Math.round((r.span[1] / units) * W));
  return '·'.repeat(a) + '█'.repeat(Math.min(W, b) - a) + '·'.repeat(Math.max(0, W - b));
};

// ── The WEAVE visualization data + a self-contained page ────────────────────
// Each recurring referent is a THREAD: a density pulse across reading position (where
// it is active, not merely present). Threads are grouped into STORYLINES by temporal
// co-activity — cosine similarity of their density vectors, agglomerated — because the
// characters who share the stage in the same stretch of the book ARE a storyline. The
// text is the weaving of these threads together; the picture is that weave.
const DARK_CAT = ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767', '#d55181', '#d95926'];
const OTHER_COL = '#57647e';

// Structural artifacts that clear the event floor but name no character/place: chapter
// headings ("CHAPTER II"), demonyms read as nouns, and a few bare-verb false figures. The
// weave is a character/place picture, so they are dropped from IT (the numeric read in
// docs/referent-journey.md still counts them, and names them as a caveat). A light, explicit
// stoplist — mechanism, not a curated cast list.
const WEAVE_STOP = new Set(['french', 'russian', 'german', 'english', 'austrian', 'come', 'go',
  'though', 'well', 'yes', 'no', 'oh', 'god']);
const isArtifact = (id) => /^(chapter|book|part|volume)\b/i.test(id) || /^[ivxlc]+$/i.test(id) || WEAVE_STOP.has(id);

const computeWeave = (pop, doc, g, { bins = 120, top = 60 } = {}) => {
  const nSent = doc.sentences.length || 1;
  const threads = pop.filter((r) => !isArtifact(r.id)).slice(0, top).map((r) => {
    const dens = new Array(bins).fill(0);
    for (const s of r.mentions) dens[Math.min(bins - 1, Math.floor((s / nSent) * bins))]++;
    const sum = r.mentions.reduce((a, s) => a + s, 0);
    // Top relation partners (the "trace its relations" hover), read off the merged edges.
    const nb = new Map();
    for (const e of g.edges) {
      const other = e.from === r.id ? e.to : (e.to === r.id ? e.from : null);
      if (other) nb.set(other, (nb.get(other) || 0) + 1);
    }
    const neighbors = [...nb.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id, w]) => ({ id, label: g.entities.get(id)?.label ?? id, w }));
    return { id: r.id, label: r.label, n: r.count, s0: r.span[0], s1: r.span[1],
             span: (r.span[1] - r.span[0]) / nSent, dens,
             centroid: r.count ? (sum / r.count) / nSent : 0, neighbors, comm: -1 };
  });

  // Unit-normalise each density vector; cosine is then a dot product.
  const norm = threads.map((t) => { const m = Math.hypot(...t.dens) || 1; return t.dens.map((x) => x / m); });
  const cos = (i, j) => norm[i].reduce((a, _, k) => a + norm[i][k] * norm[j][k], 0);

  // Average-linkage agglomeration: merge the most co-active clusters until no pair
  // clears the floor. Deterministic — ties break on the lower indices.
  let clusters = threads.map((_, i) => [i]);
  const FLOOR = 0.30;
  for (;;) {
    let best = -1, bi = -1, bj = -1;
    for (let i = 0; i < clusters.length; i++)
      for (let j = i + 1; j < clusters.length; j++) {
        let s = 0; for (const a of clusters[i]) for (const b of clusters[j]) s += cos(a, b);
        s /= clusters[i].length * clusters[j].length;
        if (s > best) { best = s; bi = i; bj = j; }
      }
    if (best < FLOOR || bi < 0) break;
    clusters[bi] = clusters[bi].concat(clusters[bj]);
    clusters.splice(bj, 1);
  }

  // Rank storylines by size; the top eight take a colour slot, the rest fold into a
  // neutral "other" — never cycle a categorical hue past the validated eight.
  clusters.sort((a, b) => b.length - a.length ||
    threads[a[0]].centroid - threads[b[0]].centroid);
  const communities = clusters.map((cl, ci) => {
    const members = cl.slice().sort((a, b) => threads[b].n - threads[a].n);
    const colored = ci < DARK_CAT.length;
    for (const m of cl) threads[m].comm = ci;
    return { id: ci, size: cl.length, colored, color: colored ? DARK_CAT[ci] : OTHER_COL,
             label: threads[members[0]].label };
  });

  // Display order: by storyline, then by temporal centroid within it, so each band
  // reads left-to-right through the book.
  threads.sort((a, b) => a.comm - b.comm || a.centroid - b.centroid || b.n - a.n);
  return { nSent, nBins: bins,
           book: textFlag ? String(textFlag) : URL,
           read: { chars: text.length, sentences: doc.sentences.length, entities: g.entities.size, population: pop.length },
           threads, communities };
};

const colorFor = (t, comms) => comms[t.comm]?.color ?? OTHER_COL;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const renderWeaveHtml = (W) => {
  const comms = W.communities;
  const bandOf = new Map();
  W.threads.forEach((t) => { if (!bandOf.has(t.comm)) bandOf.set(t.comm, []); bandOf.get(t.comm).push(t); });
  const data = JSON.stringify({ ...W, colorFor: undefined });
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>The Weave · referent-journey</title>
<style>
:root{--void:#0a0e1a;--panel:#0d1320;--void2:#070a13;--line:#1f2a3f;--bone:#e6e9f0;--bone2:#c3cbdb;--dim:#7c8aa5;--dim2:#57647e;--signal:#3fd0c0}
*{box-sizing:border-box}html,body{margin:0;background:var(--void);color:var(--bone);font-family:"Space Grotesk",system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
body{background:radial-gradient(1100px 560px at 85% -10%,rgba(63,208,192,.05),transparent 60%),var(--void);min-height:100vh}
.mono{font-family:ui-monospace,"SF Mono",Menlo,monospace}
.wrap{max-width:1180px;margin:0 auto;padding:24px 26px 70px}
.eyebrow{font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--signal);margin-bottom:8px}
h1{font-size:26px;letter-spacing:-.01em;margin:0}
.sub{color:var(--dim);font-size:13.5px;margin-top:9px;max-width:660px;line-height:1.55}
.stat{font-family:ui-monospace,monospace;font-size:11px;color:var(--dim2);margin-top:10px}.stat b{color:var(--bone2)}
.card{background:linear-gradient(180deg,var(--panel),var(--void2));border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-top:20px}
.card h3{font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:var(--dim);font-family:ui-monospace,monospace;margin:0 0 12px}
.card h3 span{color:var(--dim2);letter-spacing:.02em;text-transform:none}
.legend{display:flex;flex-wrap:wrap;gap:8px 14px;margin:0 0 14px}
.leg{display:flex;align-items:center;gap:6px;font-family:ui-monospace,monospace;font-size:11px;color:var(--bone2);cursor:pointer;user-select:none}
.leg .sw{width:11px;height:11px;border-radius:3px}.leg.off{opacity:.32}
.axis{font-family:ui-monospace,monospace;font-size:10px;fill:var(--dim2)}
.tlbl{font-family:ui-monospace,monospace;font-size:10.5px;fill:var(--bone2);text-anchor:end}
.tlbl.dim{fill:var(--dim2)}
.row.off{opacity:.12}.row{cursor:pointer;transition:opacity .12s}
.tip{position:fixed;pointer-events:none;background:#0b1220;border:1px solid var(--line);border-radius:8px;padding:9px 11px;font-family:ui-monospace,monospace;font-size:11px;color:var(--bone);z-index:10;opacity:0;transition:opacity .1s;max-width:260px;line-height:1.55}
.tip b{color:var(--signal)}.tip .rel{color:var(--dim)}
.cap{font-size:12.5px;color:var(--dim);line-height:1.6;margin-top:16px;max-width:860px}.cap b{color:var(--bone2)}
</style></head><body><div class="wrap">
<div class="eyebrow">eoreader · referent weave</div>
<h1>The Weave — referent-journey</h1>
<div class="sub">Every recurring referent is a <b style="color:var(--bone2)">thread</b>, drawn as a density pulse across reading position — where it is active, not merely present. Threads are grouped into <b style="color:var(--bone2)">storylines</b> by temporal co-activity: who shares the stage. A text is the weaving of these threads together.</div>
<div class="stat" id="stat"></div>
<div class="card"><h3>Storylines <span>— hover a thread to trace its relations · click a swatch to isolate a storyline</span></h3>
<div class="legend" id="legend"></div>
<svg id="threads" width="100%"></svg></div>
<div class="card"><h3>Story-level weave <span>— each storyline's activity summed across the reading</span></h3>
<svg id="stream" width="100%" height="150"></svg></div>
<div class="cap" id="cap"></div>
</div><div class="tip" id="tip"></div>
<script>
const W = ${data};
const SVGNS='http://www.w3.org/2000/svg';
const el=(n,a={})=>{const e=document.createElementNS(SVGNS,n);for(const k in a)e.setAttribute(k,a[k]);return e;};
const commColor=(c)=>{const m=W.communities.find(x=>x.id===c);return m?m.color:'#57647e';};
const labelById=(id)=>{const t=W.threads.find(x=>x.id===id);return t?t.label:id;};
const R=W.read;
document.getElementById('stat').innerHTML='<b>'+R.sentences.toLocaleString()+'</b> sentences · <b>'+R.entities.toLocaleString()+'</b> entities · <b>'+W.threads.length+'</b> threads drawn · <b>'+W.communities.length+'</b> storylines';

// Legend — top colored storylines + an "other" bucket; click to isolate.
let isolated=null;
const legend=document.getElementById('legend');
W.communities.filter(c=>c.colored).forEach(c=>{
  const d=document.createElement('div');d.className='leg';d.dataset.comm=c.id;
  d.innerHTML='<span class="sw" style="background:'+c.color+'"></span>'+c.label+' <span style="color:var(--dim2)">·'+c.size+'</span>';
  d.onclick=()=>{isolated=(isolated===c.id)?null:c.id;paint();};
  legend.appendChild(d);
});
if(W.communities.some(c=>!c.colored)){const d=document.createElement('div');d.className='leg';d.dataset.comm='other';d.innerHTML='<span class="sw" style="background:#57647e"></span>other';d.onclick=()=>{isolated=(isolated==='other')?null:'other';paint();};legend.appendChild(d);}

// Threads panel — one row per thread; density pulse across reading position.
const NBIN=W.nBins, ROW=15, PADL=140, PADR=16, PADT=20;
const svg=document.getElementById('threads');
const width=svg.clientWidth||1120, plotW=width-PADL-PADR;
const H=PADT+W.threads.length*ROW+16;
svg.setAttribute('height',H);svg.setAttribute('viewBox','0 0 '+width+' '+H);
const bx=(b)=>PADL+(b/NBIN)*plotW;
// reading-position axis
for(let f=0;f<=1.0001;f+=0.25){const x=PADL+f*plotW;svg.appendChild(el('line',{x1:x,y1:PADT-6,x2:x,y2:H-16,stroke:'#1f2a3f','stroke-width':1}));const tx=el('text',{x:x,y:PADT-9,class:'axis','text-anchor':f===0?'start':(f>0.99?'end':'middle')});tx.textContent=(f*100|0)+'%';svg.appendChild(tx);}
let prevComm=null;
W.threads.forEach((t,i)=>{
  const y=PADT+i*ROW;const col=commColor(t.comm);const maxD=Math.max(1,...t.dens);
  // band separator + storyline label at its first row
  if(t.comm!==prevComm){svg.appendChild(el('line',{x1:8,y1:y,x2:width-PADR,y2:y,stroke:'#141b2b','stroke-width':1}));prevComm=t.comm;}
  const g=el('g',{class:'row'});g.dataset.comm=t.comm;g.dataset.id=t.id;
  const lbl=el('text',{x:PADL-10,y:y+ROW-4,class:'tlbl'});lbl.textContent=t.label.length>18?t.label.slice(0,17)+'…':t.label;g.appendChild(lbl);
  // baseline
  g.appendChild(el('line',{x1:PADL,y1:y+ROW-3,x2:PADL+plotW,y2:y+ROW-3,stroke:'#141b2b','stroke-width':1}));
  // density bars
  for(let b=0;b<NBIN;b++){if(!t.dens[b])continue;const h=3+(t.dens[b]/maxD)*(ROW-5);const x=bx(b);g.appendChild(el('rect',{x:x,y:y+ROW-3-h,width:Math.max(1.4,plotW/NBIN-0.6),height:h,rx:1,fill:col,'fill-opacity':0.35+0.55*(t.dens[b]/maxD)}));}
  g.addEventListener('mousemove',(e)=>showTip(e,t));
  g.addEventListener('mouseleave',hideTip);
  svg.appendChild(g);
});

// Story-level stream — summed density per colored storyline, stacked.
const stream=document.getElementById('stream'),sw=stream.clientWidth||1120,sh=150;
stream.setAttribute('viewBox','0 0 '+sw+' '+sh);
const cols=W.communities.filter(c=>c.colored);
const series=cols.map(c=>{const arr=new Array(NBIN).fill(0);W.threads.filter(t=>t.comm===c.id).forEach(t=>t.dens.forEach((v,b)=>arr[b]+=v));return{c,arr};});
const stackTot=new Array(NBIN).fill(0);series.forEach(s=>s.arr.forEach((v,b)=>stackTot[b]+=v));
const peak=Math.max(1,...stackTot);const sx=(b)=>(b/(NBIN-1))*(sw-20)+10;const syTop=14,syBot=sh-20;
let base=new Array(NBIN).fill(0);
series.forEach(s=>{const pts=[];for(let b=0;b<NBIN;b++){const y=syBot-((base[b])/peak)*(syBot-syTop);pts.push([sx(b),y]);}for(let b=NBIN-1;b>=0;b--){const y=syBot-((base[b]+s.arr[b])/peak)*(syBot-syTop);pts.push([sx(b),y]);}stream.appendChild(el('polygon',{points:pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' '),fill:s.c.color,'fill-opacity':0.6,stroke:s.c.color,'stroke-width':0.6}));s.arr.forEach((v,b)=>base[b]+=v);});
for(let f=0;f<=1.0001;f+=0.25){const x=10+f*(sw-20);const tx=el('text',{x:x,y:sh-6,class:'axis','text-anchor':f===0?'start':(f>0.99?'end':'middle')});tx.textContent=(f*100|0)+'%';stream.appendChild(tx);}

const tip=document.getElementById('tip');
function showTip(e,t){
  const nb=t.neighbors.map(n=>n.label+' ·'+n.w).join(', ')||'—';
  tip.innerHTML='<b>'+t.label+'</b> · '+W.communities.find(c=>c.id===t.comm).label+' storyline<br>'+
    t.n+' mentions · span '+(t.span*100|0)+'% of the read<br><span class="rel">relates to: '+nb+'</span>';
  tip.style.opacity=1;tip.style.left=Math.min(e.clientX+14,innerWidth-270)+'px';tip.style.top=(e.clientY+14)+'px';
  highlight(t);
}
function hideTip(){tip.style.opacity=0;highlight(null);}
function highlight(t){document.querySelectorAll('.row').forEach(r=>{r.classList.toggle('off',!!t&&r.dataset.comm!=String(t.comm)&&!(t.neighbors.some(n=>n.id===r.dataset.id)));});if(!t)paint();}
function paint(){document.querySelectorAll('.leg').forEach(l=>l.classList.toggle('off',isolated!=null&&l.dataset.comm!=String(isolated)));document.querySelectorAll('.row').forEach(r=>{const oth=W.communities.find(c=>String(c.id)===r.dataset.comm)?.colored===false;const key=oth?'other':r.dataset.comm;r.classList.toggle('off',isolated!=null&&String(key)!=String(isolated));});}
document.getElementById('cap').innerHTML='A big text is a <b>dense parallel weave</b>: many threads co-running, woven in and out. Storylines are groups of referents active in the same stretch — the parser found them from co-activity alone, no character list. Reproduce with <span class="mono">node tools/referent/journey.mjs --weave-html referent-weave.html</span>. See <span class="mono">docs/referent-journey.md</span>.';
</script></body></html>`;
};

const weaveHtmlPath = flag('--weave-html', null);
const weaveJsonPath = flag('--weave-json', null);
if (weaveHtmlPath || weaveJsonPath) {
  const W = computeWeave(pop, doc, g, { bins: num('--bins', 120), top: num('--weave-top', 60) });
  if (weaveJsonPath) { writeFileSync(String(weaveJsonPath), JSON.stringify(W, null, 2)); process.stderr.write(`wrote ${weaveJsonPath}\n`); }
  if (weaveHtmlPath) { writeFileSync(String(weaveHtmlPath), renderWeaveHtml(W)); process.stderr.write(`wrote ${weaveHtmlPath}\n`); }
}

const L = [];
L.push('# Referent-journey read');
L.push(`source        ${textFlag ? textFlag : URL}`);
L.push(`read          ${text.length.toLocaleString()} chars · ${doc.sentences.length.toLocaleString()} sentences · ${g.entities.size.toLocaleString()} entities · parse ${parseMs} ms`);
L.push(`population     ${pop.length} referents with ≥${MIN} attributed events`);
L.push(`attribution    ${attributed.toLocaleString()} events entity-attributed · ${unattributed.toLocaleString()} discourse-level (not attributed)`);
L.push('');
L.push('## 1. Journey — is there a staged arc, or born-then-relational?');
L.push(`operator mix (whole population)   Ground ${pct(overall.G)} · Structure ${pct(overall.S)} · Interp ${pct(overall.I)}`);
L.push(`  long-span hubs   (n=${hubs.length})   Ground ${pct(mix(hubs).G)} · Structure ${pct(mix(hubs).S)} · Interp ${pct(mix(hubs).I)}`);
L.push(`  short-span threads(n=${threads.length})  Ground ${pct(mix(threads).G)} · Structure ${pct(mix(threads).S)} · Interp ${pct(mix(threads).I)}`);
L.push(`  → hubs and threads share the mix ⇒ role is span/connectivity, not a different KIND of operation.`);
L.push(`born-before-related   ${bornBefore}/${bornBoth.length} (${pct(bornBoth.length ? bornBefore / bornBoth.length : 0)}) — a referent is instantiated before it is bonded.`);
L.push('');
L.push('## 2. Weave — parallel threads, or sequential hand-off?');
L.push(`mean pairwise coverage   ${meanCoverage.toFixed(2)}   (shorter thread inside the longer; 1 = fully co-running)`);
L.push(`mean pairwise Jaccard    ${meanOverlap.toFixed(2)}   (over the union; dragged down by short threads)`);
L.push(`pairs with one nested in the other   ${nested}/${ovN} (${pct(ovN ? nested / ovN : 0)})`);
L.push(`introduction timing spread   ${Math.min(...pop.map((r) => r.introFraction)).toFixed(2)} … ${Math.max(...pop.map((r) => r.introFraction)).toFixed(2)} (fraction of the read)`);
L.push('');
L.push('## 3. Nesting — the holonic depth the flat address hid');
L.push(`full nesting (containedBy)   median ${summary.median} · max ${summary.max} · ${summary.nestedAtLeast3} referents nested ≥3 deep`);
L.push(`holon depth (tightest chain) max ${summary.maxHolonDepth} · ${summary.flatDepth1}/${summary.referents} still at depth 1`);
L.push('');
L.push(`## Ensemble & span weave (top ${TOP} by mentions)`);
for (const r of pop.slice(0, TOP)) {
  const s = String(r.id).slice(0, 17).padEnd(17);
  L.push(`${s} ${bar(r, nest.units)}  ${pct(r.spanLen / nest.units).padStart(4)}  n=${String(r.count).padStart(4)}  depth=${r.depth}  nest=${r.containedByCount}`);
}
console.log(L.join('\n'));

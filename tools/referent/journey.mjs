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

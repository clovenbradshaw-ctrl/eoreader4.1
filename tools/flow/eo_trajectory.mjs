#!/usr/bin/env node
// ============================================================================
// eo_trajectory.mjs — a book is a PATH through shape-space, not a point.
//
//   node tools/flow/eo_trajectory.mjs corpus.jsonl --eoreader . --sample 150
//   node tools/flow/eo_trajectory.mjs corpus.jsonl --eoreader . --segment sections --resume
//
// For each book: parse the FULL text (flow needs the whole arc), segment the
// sentence stream, and emit one 102-dim vector per segment:
//   [ 0:9 ]   local operator distribution  — what's happening here
//   [ 9:90]   local bigram transitions      — how moves connect here
//   [90:102]  CUMULATIVE graph features     — structure accumulated so far
//
// SEGMENTATION (--segment):
//   sections   one vector per NATURAL section — the reading's own dominant-operator
//              runs bounded by NUL births (default). The delta between consecutive
//              sections is a real mode-change, not a grid artifact.
//   sentences  a fixed sentence window (--per-sentences N).
//   equal      the legacy fixed grid of --steps equal slices (comparability).
//
// Segmentation + step math live in the eoreader flow holon (src/flow/index.js), so
// the extractor and the runtime scorer are one source of truth. Output
// trajectories.jsonl → distil with tools/flow/flow_distill.py.
// ============================================================================
import { createReadStream, createWriteStream, existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flag = (n,d)=>{ const i=args.indexOf(n); return i>=0?(args[i+1]??true):d; };
const INPUT    = args.find(a=>!a.startsWith('--') && /\.jsonl?$/i.test(a));
const EOREADER = resolve(String(flag('--eoreader','.')));
const OUT      = String(flag('--out','trajectories.jsonl'));
const SEGMENT  = String(flag('--segment','sections'));
const STEPS    = parseInt(flag('--steps','40'),10);
const PER_SENT = parseInt(flag('--per-sentences','12'),10);
const MIN_RUN  = parseInt(flag('--min-run', flag('--min-len','6')),10);   // section min length
const WINDOW   = parseInt(flag('--window','8'),10);                        // mode-smoothing half-width
const HEAD     = parseInt(flag('--head','400000'),10);   // full arc; cap protects pathological files
const SAMPLE   = parseInt(flag('--sample','150'),10);
const MIN_SENT = parseInt(flag('--min-sent','80'),10);
const RESUME   = args.includes('--resume');
if (!INPUT){ console.error('usage: node tools/flow/eo_trajectory.mjs corpus.jsonl --eoreader .'); process.exit(1); }
const parseEntry = join(EOREADER,'src','perceiver','parse','index.js');
const flowEntry  = join(EOREADER,'src','flow','index.js');
if (!existsSync(parseEntry)){ console.error(`can't find eoreader parse at ${parseEntry}`); process.exit(1); }
if (!existsSync(flowEntry)){ console.error(`can't find flow holon at ${flowEntry}`); process.exit(1); }
const { parseText } = await import(pathToFileURL(parseEntry).href);
const { trajectoryFromDoc } = await import(pathToFileURL(flowEntry).href);

const segOpts = SEGMENT==='sentences' ? { perSentences: PER_SENT }
  : SEGMENT==='equal' ? { segment:'equal', steps: STEPS }
  : { segment:'sections', minRun: MIN_RUN, window: WINDOW };

function trajectory(text){
  const doc = parseText(HEAD ? text.slice(0,HEAD) : text);
  if (doc.sentences.length < MIN_SENT) return null;
  const { steps, nSent, pos, sections, segment } = trajectoryFromDoc(doc, segOpts);
  const r4 = x=>Math.round(x*1e4)/1e4;
  return {
    nSent, segment,
    steps: steps.map(s=>[...s].map(r4)),
    pos: pos.map(r4),
    // the discourse path, legible in operator terms: every section's span, length,
    // dominant operator, whether it opens on a NUL birth, and its reading position.
    sections: sections ? sections.map((s,i)=>({ from:s.lo, to:s.hi, len:s.len, dom:s.op, birth:!!s.born, pos:r4(pos[i]) })) : null,
  };
}

// --resume: skips books already in OUT, appends new. Interruption is free.
const done=new Set();
if (RESUME && existsSync(OUT)){
  for (const line of readFileSync(OUT,'utf8').split('\n')){
    try { const r=JSON.parse(line); if(r.id) done.add(r.id); } catch {}
  }
  console.log(`resume: ${done.size} already extracted`);
}
const rl = createInterface({ input: createReadStream(INPUT), crlfDelay: Infinity });
const out = createWriteStream(OUT, RESUME ? { flags:'a' } : {});
let n=done.size, skipped=0, t0=Date.now();
console.log(`trajectory extract · segment=${SEGMENT} · head=${HEAD||'full'} · sample=${SAMPLE||'all'}\n`);
for await (const line of rl){
  if (!line.trim()) continue;
  if (SAMPLE && n>=SAMPLE) break;
  let rec; try { rec=JSON.parse(line); } catch { continue; }
  const rid=String(rec.id||'').padStart(4,'0');
  if (RESUME && done.has(rid)) continue;
  const text=rec.text||rec.body||'';
  if (typeof text!=='string' || text.length<3000){ skipped++; continue; }
  let tr; try { tr=trajectory(text); } catch { skipped++; continue; }
  if (!tr){ skipped++; continue; }
  const id=String(rec.id||(n+1)).padStart(4,'0');
  out.write(JSON.stringify({ id, title: rec.title||`source ${id}`, subjects: rec.subjects||null,
    nSent: tr.nSent, segment: tr.segment, nSteps: tr.steps.length,
    stepDim: tr.steps[0]?.length||102, localDim: 90,
    steps: tr.steps, pos: tr.pos, sections: tr.sections }) + '\n');
  n++;
  if (n%25===0){ const r=(n/((Date.now()-t0)/1000)).toFixed(1); process.stdout.write(`\r  ${n} books · ${r}/s · ${skipped} skipped`); }
}
out.end();
console.log(`\n\n[done] wrote ${n} trajectories → ${OUT}  (${skipped} skipped)`);
console.log(`  python3 tools/flow/flow_distill.py ${OUT}`);

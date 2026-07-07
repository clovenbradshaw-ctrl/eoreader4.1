#!/usr/bin/env node
// ============================================================================
// eo_trajectory.mjs — a book is a PATH through shape-space, not a point.
//
//   node eo_trajectory.mjs corpus.jsonl --eoreader ./eoreader4.1 --sample 150
//   node eo_trajectory.mjs corpus.jsonl --eoreader ./eoreader4.1 --steps 40 --head 400000
//
// For each book: parse the FULL text (flow needs the whole arc), split the
// sentence stream into `steps` equal segments, and emit one vector per segment:
//   [ 0:9 ]   local operator distribution  — what's happening here
//   [ 9:90]   local bigram transitions      — how moves connect here
//   [90:102]  CUMULATIVE graph features     — structure accumulated so far
// The trajectory is those `steps` vectors in reading order. Deltas between
// consecutive steps are where flow lives; the cumulative block is the build arc.
//
// Output trajectories.jsonl → analyze with flow_analyze.py.
// ============================================================================
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flag = (n,d)=>{ const i=args.indexOf(n); return i>=0?(args[i+1]??true):d; };
const INPUT    = args.find(a=>!a.startsWith('--') && /\.jsonl?$/i.test(a));
const EOREADER = resolve(String(flag('--eoreader','./eoreader4.1')));
const OUT      = String(flag('--out','trajectories.jsonl'));
const STEPS    = parseInt(flag('--steps','40'),10);
const HEAD     = parseInt(flag('--head','400000'),10);   // full arc; cap protects pathological files
const SAMPLE   = parseInt(flag('--sample','150'),10);
const MIN_SENT = parseInt(flag('--min-sent','80'),10);   // need enough sentences to trace an arc
const RESUME   = args.includes('--resume');
if (!INPUT){ console.error('usage: node eo_trajectory.mjs corpus.jsonl --eoreader ./eoreader4.1'); process.exit(1); }
const parseEntry = join(EOREADER,'src','perceiver','parse','index.js');
if (!existsSync(parseEntry)){ console.error(`can't find eoreader parse at ${parseEntry}`); process.exit(1); }
const { parseText } = await import(pathToFileURL(parseEntry).href);

const OPERATORS = ["NUL","SIG","INS","SEG","CON","SYN","DEF","EVA","REC"];
const OP_INDEX = Object.fromEntries(OPERATORS.map((o,i)=>[o,i]));
const nOps = 9, LOCAL_DIM = 9 + 81, GRAPH_DIM = 12, STEP_DIM = LOCAL_DIM + GRAPH_DIM; // 102
const sq = (x,k)=> x/(x+k);

// local operator state over a slice of events: distribution(9) + transitions(81)
function localBlock(evs){
  const v = new Float64Array(LOCAL_DIM);
  if (!evs.length) return v;
  const seq = evs.map(e=>OP_INDEX[e.op]);
  for (const o of seq) v[o] += 1;                          // 0:9 counts
  let s=0; for(let i=0;i<nOps;i++) s+=v[i]; if(s>0) for(let i=0;i<nOps;i++) v[i]/=s;   // -> distribution
  for (let i=0;i<seq.length-1;i++) v[9 + seq[i]*nOps + seq[i+1]] += 1;   // 9:90 bigrams
  for (let op=0;op<nOps;op++){ let t=0; for(let j=0;j<nOps;j++) t+=v[9+op*nOps+j]; if(t>0) for(let j=0;j<nOps;j++) v[9+op*nOps+j]/=t; }
  return v;
}

// cumulative graph over ALL events up to (and incl.) sentence `cut`
function cumGraph(evs, mentions, cut, nSentSoFar){
  const opc={}; for(const e of evs) opc[e.op]=(opc[e.op]||0)+1;
  const total=Object.values(opc).reduce((a,b)=>a+b,0)||1;
  // entity mentions up to cut
  const mcounts=[];
  for (const arr of mentions.values()){ const c=arr.filter(u=>u<=cut).length; if(c>0) mcounts.push(c); }
  const nEnt=mcounts.length||1, tot=mcounts.reduce((a,b)=>a+b,0)||1;
  const shares=mcounts.map(c=>c/tot);
  const herf=shares.reduce((a,x)=>a+x*x,0);
  const entRaw=-shares.filter(x=>x>0).reduce((a,x)=>a+x*Math.log(x),0);
  const entNorm=nEnt>1?entRaw/Math.log(nEnt):0;
  const con=evs.filter(e=>e.op==='CON'); const nCON=con.length;
  const deg={}; for(const e of con) deg[e.src]=(deg[e.src]||0)+1;
  const maxDeg=Math.max(0,...Object.values(deg),0);
  const nSent=Math.max(1,nSentSoFar);
  let spanSum=0,spanN=0;
  for(const arr of mentions.values()){ const a=arr.filter(u=>u<=cut); if(a.length>=2){ spanSum+=(Math.max(...a)-Math.min(...a))/nSent; spanN++; } }
  return Float64Array.from([
    sq(nEnt/nSent,0.3), herf, entNorm, sq(nCON/nEnt,4),
    nCON?maxDeg/nCON:0, sq((opc.SYN||0)/nEnt,0.3),
    ((opc.SIG||0)+(opc.CON||0)+(opc.EVA||0))/total,
    ((opc.INS||0)+(opc.SYN||0)+(opc.REC||0))/total,
    nCON?con.filter(e=>e.relType).length/nCON:0,
    spanN?spanSum/spanN:0, sq((opc.DEF||0)/nEnt,1.5),
    nCON?con.reduce((a,e)=>a+(typeof e.w==='number'?e.w:0.5),0)/nCON:0,
  ]);
}

function trajectory(text){
  const doc = parseText(HEAD ? text.slice(0,HEAD) : text);
  const nSent = doc.sentences.length;
  if (nSent < MIN_SENT) return null;
  const raw = doc.log.events.filter(e=>e.op in OP_INDEX).slice().sort((a,b)=>(a.seq||0)-(b.seq||0));
  // events are frozen — build lightweight anchored copies (carry-forward sentIdx)
  const evs=[]; let last=0;
  for (const e of raw){ if(typeof e.sentIdx==='number') last=e.sentIdx; evs.push({ op:e.op, s:last, src:e.src, relType:e.relType, w:e.w }); }
  const mentions = doc.mentions instanceof Map ? doc.mentions
    : new Map(Object.entries(doc.mentions||{}).map(([k,v])=>[k,Array.isArray(v)?v:[]]));

  const steps=[];
  for (let k=0;k<STEPS;k++){
    const lo=Math.floor(nSent*k/STEPS), hi=Math.floor(nSent*(k+1)/STEPS)-1;
    const local = localBlock(evs.filter(e=>e.s>=lo && e.s<=hi));
    const graph = cumGraph(evs.filter(e=>e.s<=hi), mentions, hi, hi+1);
    const step = new Float64Array(STEP_DIM);
    step.set(local,0); step.set(graph,LOCAL_DIM);
    steps.push([...step].map(x=>Math.round(x*1e4)/1e4));
  }
  return { nSent, steps };
}

// --resume: for the full-corpus run — skips books already in OUT, appends new.
// A 3,400-book pass at ~3/s is ~20 min; resume makes interruption free.
const done=new Set();
if (RESUME && existsSync(OUT)){
  const { readFileSync } = await import('node:fs');
  for (const line of readFileSync(OUT,'utf8').split('\n')){
    try { const r=JSON.parse(line); if(r.id) done.add(r.id); } catch {}
  }
  console.log(`resume: ${done.size} already extracted`);
}
const rl = createInterface({ input: createReadStream(INPUT), crlfDelay: Infinity });
const out = createWriteStream(OUT, RESUME ? { flags:'a' } : {});
let n=done.size, skipped=0, t0=Date.now();
console.log(`trajectory extract · steps=${STEPS} · head=${HEAD||'full'} · sample=${SAMPLE||'all'}\n`);
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
    nSent: tr.nSent, stepDim: STEP_DIM, localDim: LOCAL_DIM, steps: tr.steps }) + '\n');
  n++;
  if (n%25===0){ const r=(n/((Date.now()-t0)/1000)).toFixed(1); process.stdout.write(`\r  ${n} books · ${r}/s · ${skipped} skipped`); }
}
out.end();
console.log(`\n\n[done] wrote ${n} trajectories → ${OUT}  (${skipped} skipped)`);
console.log(`  python3 flow_distill.py ${OUT}`);

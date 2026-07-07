// The flow holon — the FLOW WITNESS. (companion to write/witness.js §7)
//
// A book is a PATH through shape-space, not a point. This holon loads a distilled
// corpus prior (data/flow-prior.json) and scores text — whole documents or one
// paragraph-at-a-time continuations — against three questions the prior answers:
//
//   • DELTA      is each structural transition a move the corpus makes from that
//                reading position, or a lurch?                 (delta percentile)
//   • MANIFOLD   does each step lie on the corpus's low-dim trajectory manifold,
//                or off it?                                     (residual percentile)
//   • BUILD ARC  is cumulative structure (entities, relations, coref) accumulating
//                on the corpus schedule?                        (per-feature z)
//
// DROP-IN CONTRACT
//   • Pure JS, zero imports — browser-safe (the reader bundle pulls this in via
//     write/witness.js). The reproduction pipeline (extractor/distiller/CLI) lives
//     in tools/flow/; this file is the library the runtime imports.
//   • trajectoryFromDoc() takes the SAME doc parseText() returns — inside eoreader
//     you hand it the live parse, no re-parsing.
//   • Wiring surface (each opt-in and default-off — no prior, no behavior change):
//       write/witness.js  ← flowVerdict()   per rendered beat (the spurt loop)
//       longgen/shape.js  ← arcTarget()     the build-arc schedule as a phase target
//       longgen/audit.js  ← scoreTrajectory() the whole-piece flow report
//
// The prior is provenance-stamped and regenerable from pointers — see
// docs/flow-prior.md and tools/flow/. The step math below is byte-identical to
// tools/flow/eo_trajectory.mjs; if you change one, change both.

// ── constants (must match tools/flow/eo_trajectory.mjs and the prior) ────────
export const OPERATORS = ["NUL","SIG","INS","SEG","CON","SYN","DEF","EVA","REC"];
export const OP_INDEX = Object.fromEntries(OPERATORS.map((o,i)=>[o,i]));
const nOps=9, LOCAL_DIM=90, GRAPH_DIM=12, STEP_DIM=LOCAL_DIM+GRAPH_DIM;
const sq=(x,k)=>x/(x+k);

// ── step construction (identical math to eo_trajectory.mjs) ─────────────────
function localBlock(evs){
  const v=new Float64Array(LOCAL_DIM);
  if(!evs.length) return v;
  const seq=evs.map(e=>OP_INDEX[e.op]);
  for(const o of seq) v[o]+=1;
  let s=0; for(let i=0;i<nOps;i++) s+=v[i]; if(s>0) for(let i=0;i<nOps;i++) v[i]/=s;
  for(let i=0;i<seq.length-1;i++) v[9+seq[i]*nOps+seq[i+1]]+=1;
  for(let op=0;op<nOps;op++){ let t=0; for(let j=0;j<nOps;j++) t+=v[9+op*nOps+j]; if(t>0) for(let j=0;j<nOps;j++) v[9+op*nOps+j]/=t; }
  return v;
}
function cumGraph(evs, mentions, cut, nSentSoFar){
  const opc={}; for(const e of evs) opc[e.op]=(opc[e.op]||0)+1;
  const total=Object.values(opc).reduce((a,b)=>a+b,0)||1;
  const mcounts=[];
  for(const arr of mentions.values()){ const c=arr.filter(u=>u<=cut).length; if(c>0) mcounts.push(c); }
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

// Build a trajectory from an eoreader parseText() doc. INSIDE eoreader4.1 this is
// the only entry you need — hand it the live doc, get steps back.
//   steps: a fixed count (whole-document scoring, comparable to the prior), or
//   {perSentences:n} for a running trajectory (the paragraph-at-a-time witness).
export function trajectoryFromDoc(doc, steps=40){
  const nSent=doc.sentences.length;
  const raw=(doc.log?.events||[]).filter(e=>e.op in OP_INDEX).slice().sort((a,b)=>(a.seq||0)-(b.seq||0));
  const evs=[]; let last=0;
  for(const e of raw){ if(typeof e.sentIdx==='number') last=e.sentIdx; evs.push({op:e.op,s:last,src:e.src,relType:e.relType,w:e.w}); }
  const mentions=doc.mentions instanceof Map?doc.mentions
    :new Map(Object.entries(doc.mentions||{}).map(([k,v])=>[k,Array.isArray(v)?v:[]]));
  const nSteps = typeof steps==='object' ? Math.max(2,Math.floor(nSent/steps.perSentences)) : steps;
  const out=[];
  for(let k=0;k<nSteps;k++){
    const lo=Math.floor(nSent*k/nSteps), hi=Math.floor(nSent*(k+1)/nSteps)-1;
    const local=localBlock(evs.filter(e=>e.s>=lo&&e.s<=hi));
    const graph=cumGraph(evs.filter(e=>e.s<=hi),mentions,hi,hi+1);
    const step=new Float64Array(STEP_DIM); step.set(local,0); step.set(graph,LOCAL_DIM);
    out.push(step);
  }
  return { steps: out, nSent };
}

// ── prior + scoring ──────────────────────────────────────────────────────────
export function loadPrior(json){
  const p=typeof json==='string'?JSON.parse(json):json;
  if(p.kind!=='eo-flow-prior') throw new Error('not a flow prior');
  return {
    mean:Float64Array.from(p.manifold.mean),
    comps:p.manifold.components.map(r=>Float64Array.from(r)),
    residQ:p.manifold.residualQ,
    arcMean:p.buildArc.mean, arcSd:p.buildArc.sd, arcKeys:p.buildArc.keys,
    dPosMean:p.delta.posMean, dPosSd:p.delta.posSd, dGlobalQ:p.delta.globalQ,
    bookFlowQ:p.books.flowQ, steps:p.meta.steps, meta:p.meta,
  };
}
const QLEVELS=[0.05,0.10,0.25,0.50,0.75,0.90,0.95];
function percentileFromQ(qmap, x){
  const qs=QLEVELS.map(q=>qmap[String(q)]);
  if(x<=qs[0]) return 5; if(x>=qs[qs.length-1]) return 95;
  for(let i=0;i<qs.length-1;i++){
    if(x>=qs[i]&&x<=qs[i+1]){
      const f=(x-qs[i])/Math.max(qs[i+1]-qs[i],1e-9);
      return Math.round(100*(QLEVELS[i]+f*(QLEVELS[i+1]-QLEVELS[i])));
    }
  }
  return 50;
}
const unit=v=>{ let n=0; for(const x of v)n+=x*x; n=Math.sqrt(n)||1; return v.map(x=>x/n); };
const cosD=(a,b)=>{ let s=0; for(let i=0;i<a.length;i++) s+=a[i]*b[i]; return 1-s; };

function manifoldResidual(prior, step){
  const c=new Float64Array(step.length);
  for(let i=0;i<c.length;i++) c[i]=step[i]-prior.mean[i];
  let projNorm2=0;
  for(const comp of prior.comps){ let d=0; for(let i=0;i<c.length;i++) d+=c[i]*comp[i]; projNorm2+=d*d; }
  let cn2=0; for(const x of c) cn2+=x*x;
  return Math.sqrt(Math.max(0,cn2-projNorm2))/Math.sqrt(Math.max(cn2,1e-12));
}
export { manifoldResidual };

// Score a whole trajectory (array of Float64Array steps).
export function scoreTrajectory(prior, steps){
  const S=steps.length;
  const per=[];
  const locals=steps.map(s=>unit(Array.from(s.slice(0,LOCAL_DIM))));
  for(let k=0;k<S;k++){
    const resid=manifoldResidual(prior, steps[k]);
    const entry={ step:k, manifoldResidual:+resid.toFixed(4),
      residualPercentile: percentileFromQ(prior.residQ, resid) };
    if(k>0){
      const d=cosD(locals[k],locals[k-1]);
      const pk=Math.min(prior.steps-2, Math.floor((k-1)*(prior.steps-1)/Math.max(1,S-1)));
      entry.delta=+d.toFixed(4);
      entry.deltaPercentile=percentileFromQ(prior.dGlobalQ,d);
      entry.deltaZ=+(((d-prior.dPosMean[pk])/prior.dPosSd[pk])).toFixed(2);
    }
    const pk=Math.min(prior.steps-1, Math.floor(k*(prior.steps-1)/Math.max(1,S-1)));
    const g=steps[k].slice(LOCAL_DIM);
    const zs={};
    let zsum=0;
    for(let j=0;j<GRAPH_DIM;j++){ const z=(g[j]-prior.arcMean[pk][j])/prior.arcSd[pk][j]; zs[prior.arcKeys[j]]=+z.toFixed(2); zsum+=Math.abs(z); }
    entry.arcZ=zs; entry.arcAdherence=+(zsum/GRAPH_DIM).toFixed(2);   // mean |z|: <1 on-schedule
    per.push(entry);
  }
  const deltas=per.filter(e=>e.delta!=null).map(e=>e.delta);
  const flow=deltas.reduce((a,b)=>a+b,0)/Math.max(1,deltas.length);
  return {
    flowScore:+flow.toFixed(4),
    flowPercentile: percentileFromQ(prior.bookFlowQ, flow),   // low = smoother than corpus
    meanResidual:+(per.reduce((a,e)=>a+e.manifoldResidual,0)/S).toFixed(4),
    meanArcAdherence:+(per.reduce((a,e)=>a+e.arcAdherence,0)/S).toFixed(2),
    steps:per,
  };
}

// ── THE WIRING SURFACE for eoreader4.1 ───────────────────────────────────────
// 1) write/witness.js — per-beat flow verdict in the paragraph-at-a-time loop.
//    After spurt.js renders a beat and the cumulative doc re-parses, the witness
//    calls flowVerdict(prior, prevStep, doc). It returns {ok, delta,
//    deltaPercentile, residualPercentile, ...} — treat deltaPercentile>90 or
//    residualPercentile>95 as the same class of flag as a source veto: don't
//    hard-fail, surface it (to EVA). Returns null if no prior is wired.
export function flowVerdict(prior, prevStep, doc, opts={}){
  if(!prior||!doc) return null;
  const { steps }=trajectoryFromDoc(doc, opts.steps||{perSentences:opts.perSentences||8});
  const cur=steps[steps.length-1];
  const out={ step:cur };
  out.manifoldResidual=manifoldResidual(prior,cur);
  out.residualPercentile=percentileFromQ(prior.residQ,out.manifoldResidual);
  if(prevStep){
    const d=cosD(unit(Array.from(prevStep.slice(0,LOCAL_DIM))), unit(Array.from(cur.slice(0,LOCAL_DIM))));
    out.delta=d; out.deltaPercentile=percentileFromQ(prior.dGlobalQ,d);
  }
  out.ok=(out.deltaPercentile==null||out.deltaPercentile<=90)&&out.residualPercentile<=95;
  return out;
}
// 2) longgen/shape.js — the build-arc SCHEDULE as a phase target: at arc phase
//    t∈[0,1], arcTarget(prior,t) returns the corpus-typical cumulative graph state
//    (each feature's {mean, sd}) — feed it to the phase machinery so the planner
//    knows whether the piece should still be introducing (early: ent_dens high) or
//    developing (late: rel_dens, coref rising). Condition the artifact, not the
//    behavior: the target is a measured state, not a rule. Null if no prior.
export function arcTarget(prior, t){
  if(!prior) return null;
  const pk=Math.min(prior.steps-1, Math.max(0, Math.round(t*(prior.steps-1))));
  const out={};
  for(let j=0;j<GRAPH_DIM;j++) out[prior.arcKeys[j]]={mean:prior.arcMean[pk][j], sd:prior.arcSd[pk][j]};
  return out;
}
// 3) longgen/audit.js — whole-piece report: scoreTrajectory(prior,
//    trajectoryFromDoc(doc).steps) in the export audit, alongside diagnose().

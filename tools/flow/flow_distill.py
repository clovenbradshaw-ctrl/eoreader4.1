#!/usr/bin/env python3
"""
flow_distill.py — compress the trajectory corpus into a small, loadable FLOW PRIOR.

    python3 tools/flow/flow_distill.py trajectories.jsonl
    python3 tools/flow/flow_distill.py trajectories.jsonl --min-sent 300 --grid 24

Trajectories are now one vector per NATURAL SECTION (variable count per book), each
carrying its fractional reading position `pos`. So the per-position statistics are
computed on a canonical grid the books are resampled onto by `pos`, while the
manifold and the delta distribution pool the sections directly (no alignment needed).

The prior, in a few hundred KB of JSON:
  manifold   PCA mean + top components + explained variance + residual quantiles
  build_arc  per-GRID-position mean/sd of each cumulative graph feature (resampled)
  delta      per-grid-position mean/sd + global quantiles of section-to-section change
  sections   section-length quantiles, sections-per-book, dominant-op mix + transition
             matrix (the INS<->SEG alternation, measured)
  books      book-level flow-score quantiles (for whole-document percentile)

Provenance-stamped: corpus size, segmentation, grid, source hash, timestamp.
Back-compatible: legacy equal-grid trajectories (fixed nSteps, no `pos`) still distil.
"""
import argparse, hashlib, json, sys
import numpy as np

OPS = ["NUL","SIG","INS","SEG","CON","SYN","DEF","EVA","REC"]
OPI = {o:i for i,o in enumerate(OPS)}

def load(path, min_sent):
    T=[]
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line=line.strip()
            if not line: continue
            try:
                t=json.loads(line)
                if t.get("nSent",0) >= min_sent and len(t.get("steps",[]))>=2: T.append(t)
            except json.JSONDecodeError: pass
    return T

def qtiles(x, qs):
    return [float(np.quantile(x,q)) for q in qs]

QS=[0.05,0.10,0.25,0.50,0.75,0.90,0.95]

def positions(t):
    """fractional reading position per step — from `pos`, else uniform (legacy)."""
    k=len(t["steps"])
    p=t.get("pos")
    if p and len(p)==k: return np.asarray(p, dtype=float)
    return np.linspace(0,1,k) if k>1 else np.zeros(k)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("trajectories")
    ap.add_argument("--out", default="flow-prior.json")
    ap.add_argument("--min-sent", type=int, default=300,
                    help="exclude short texts whose 'lurch' is a slicing artifact")
    ap.add_argument("--pcs", type=int, default=10)
    ap.add_argument("--grid", type=int, default=24,
                    help="canonical position resolution the per-position stats resample onto")
    a=ap.parse_args()

    T=load(a.trajectories, a.min_sent)
    if len(T)<20: sys.exit(f"only {len(T)} trajectories >={a.min_sent} sentences — need >=20")
    L=T[0]["localDim"]; D=T[0]["stepDim"]; G=a.grid
    seg=T[0].get("segment","sections")
    books=[np.array(t["steps"],dtype=float) for t in T]
    nsec=[b.shape[0] for b in books]
    print(f"distilling from {len(books)} books · segment={seg} · sections/book {min(nsec)}-{max(nsec)} (med {int(np.median(nsec))}) · grid {G} · dim {D} (local {L})")

    # ── manifold: PCA over ALL pooled section vectors (order-free) ────────────
    X=np.vstack(books)
    mu=X.mean(0); Xc=X-mu
    U,S,Vt=np.linalg.svd(Xc, full_matrices=False)
    K=min(a.pcs, Vt.shape[0]); P=Vt[:K]
    ev=(S**2); ev=ev/ev.sum()
    proj=Xc@P.T@P
    resid=np.linalg.norm(Xc-proj,axis=1)/np.maximum(np.linalg.norm(Xc,axis=1),1e-9)
    print(f"manifold: top-{K} PCs capture {100*ev[:K].sum():.0f}% · residual p50={np.median(resid):.3f}")

    gridpos=np.linspace(0,1,G)
    def unit(m):
        n=np.linalg.norm(m,axis=1,keepdims=True); n[n==0]=1; return m/n

    # ── build arc + delta: resample each book onto the canonical grid by pos ──
    arcG=np.zeros((len(books),G,D-L)); dG=np.zeros((len(books),G))
    all_dl=[]; flow_scores=[]
    for bi,(b,t) in enumerate(zip(books,T)):
        pos=positions(t)
        graph=b[:,L:]                                    # [k, 12] cumulative features
        for j in range(D-L):
            arcG[bi,:,j]=np.interp(gridpos, pos, graph[:,j])
        loc=unit(b[:,:L])
        dl=1.0-np.sum(loc[1:]*loc[:-1],axis=1)           # section-to-section change
        all_dl.append(dl); flow_scores.append(float(dl.mean()) if len(dl) else 0.0)
        dpos=pos[1:] if len(pos)>1 else pos
        dG[bi,:]=np.interp(gridpos, dpos, dl) if len(dl) else 0.0
    arc_mean=arcG.mean(0); arc_sd=np.maximum(arcG.std(0),1e-4)
    Dl_all=np.concatenate(all_dl) if all_dl else np.zeros(1)
    dpos_mean=dG.mean(0); dpos_sd=np.maximum(dG.std(0),1e-4)
    flow_scores=np.asarray(flow_scores)

    # ── sections: length, count, dominant-op mix + transition matrix ──────────
    def sec_ops(t):   # dominant-operator sequence — from the `sections` array (new) or the legacy arrays
        if t.get("sections"): return [s.get("dom") for s in t["sections"]]
        return t.get("sectionOps") or []
    def sec_lens(t):
        if t.get("sections"): return [s.get("len") for s in t["sections"]]
        return t.get("sectionLens") or []
    sec_block=None
    if any(sec_ops(t) for t in T):
        lens=[l for t in T for l in sec_lens(t)]
        opdist=np.zeros(len(OPS)); trans=np.zeros((len(OPS),len(OPS)))
        for t in T:
            ops=sec_ops(t)
            for o in ops:
                if o in OPI: opdist[OPI[o]]+=1
            for x,y in zip(ops[:-1],ops[1:]):
                if x in OPI and y in OPI: trans[OPI[x],OPI[y]]+=1
        opdist=(opdist/opdist.sum()).tolist() if opdist.sum() else opdist.tolist()
        rs=trans.sum(1,keepdims=True); rs[rs==0]=1; trans=(trans/rs)
        sec_block={
          "keys":OPS,
          "lenQ":dict(zip([str(q) for q in QS], qtiles(lens,QS))) if lens else {},
          "perBookQ":dict(zip([str(q) for q in QS], qtiles(nsec,QS))),
          "opDist":[round(float(x),4) for x in opdist],
          "opTransition":[[round(float(x),3) for x in row] for row in trans],
        }

    prior={
      "kind":"eo-flow-prior","version":"2",
      "meta":{"books":len(books),"segment":seg,"grid":G,"steps":G,"stepDim":D,"localDim":L,
              "minSent":a.min_sent,
              "sourceSha256":hashlib.sha256(open(a.trajectories,'rb').read()).hexdigest()[:16],
              "generated":__import__("datetime").datetime.utcnow().isoformat()+"Z"},
      "manifold":{"mean":[round(float(x),5) for x in mu],
                  "components":[[round(float(x),5) for x in row] for row in P],
                  "explained":[round(float(x),4) for x in ev[:K]],
                  "residualQ":dict(zip([str(q) for q in QS], qtiles(resid,QS)))},
      "buildArc":{"mean":[[round(float(x),4) for x in row] for row in arc_mean],
                  "sd":[[round(float(x),4) for x in row] for row in arc_sd],
                  "keys":["ent_dens","mention_conc","ment_entropy","rel_dens","hub_share",
                          "coref","relate","generate","reltyped","ent_span","def_dens","edge_w"]},
      "delta":{"posMean":[round(float(x),4) for x in dpos_mean],
               "posSd":[round(float(x),4) for x in dpos_sd],
               "globalQ":dict(zip([str(q) for q in QS], qtiles(Dl_all,QS)))},
      "books":{"flowQ":dict(zip([str(q) for q in QS], qtiles(flow_scores,QS)))},
    }
    if sec_block: prior["sections"]=sec_block
    with open(a.out,"w") as fh: json.dump(prior,fh)
    import os
    print(f"OK wrote {a.out} ({os.path.getsize(a.out)/1024:.0f} KB) — load with flow_scorer.mjs / eoreader4.1")
    if sec_block:
        top=sorted(zip(OPS, sec_block["opDist"]), key=lambda kv:-kv[1])[:4]
        print("  section dominant-op mix:", ", ".join(f"{o} {100*p:.0f}%" for o,p in top))

if __name__=="__main__":
    main()

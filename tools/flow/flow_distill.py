#!/usr/bin/env python3
"""
flow_distill.py — compress the trajectory corpus into a small, loadable FLOW PRIOR.

    python3 flow_distill.py trajectories.jsonl
    python3 flow_distill.py trajectories.jsonl --min-sent 300 --pcs 10 --out flow-prior.json

The prior is everything the runtime scorer needs, in a few hundred KB of JSON:
  manifold   PCA mean + top components + explained variance + residual quantiles
             (is a new step ON the corpus manifold or off it?)
  build_arc  per-step mean/sd of each cumulative graph feature
             (is structure accumulating on the corpus schedule?)
  delta      per-position mean/sd + global quantiles of step-to-step change
             (is this transition a move the corpus makes, or a lurch?)
  books      book-level flow-score quantiles (for whole-document percentile)

Provenance-stamped: corpus size, step config, source file hash, timestamp.
"""
import argparse, hashlib, json, sys
import numpy as np

def load(path, min_sent):
    T=[]
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line=line.strip()
            if not line: continue
            try:
                t=json.loads(line)
                if t.get("nSent",0) >= min_sent: T.append(t)
            except json.JSONDecodeError: pass
    return T

def qtiles(x, qs):
    return [float(np.quantile(x,q)) for q in qs]

QS=[0.05,0.10,0.25,0.50,0.75,0.90,0.95]

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("trajectories")
    ap.add_argument("--out", default="flow-prior.json")
    ap.add_argument("--min-sent", type=int, default=300,
                    help="exclude short texts (speeches etc.) whose 'lurch' is slicing artifact")
    ap.add_argument("--pcs", type=int, default=10)
    a=ap.parse_args()

    T=load(a.trajectories, a.min_sent)
    if len(T)<20: sys.exit(f"only {len(T)} trajectories ≥{a.min_sent} sentences — need ≥20")
    L=T[0]["localDim"]; D=T[0]["stepDim"]; STEPS=len(T[0]["steps"])
    books=[np.array(t["steps"],dtype=float) for t in T if len(t["steps"])==STEPS]
    print(f"distilling from {len(books)} books · {STEPS} steps · dim {D} (local {L})")

    # ── manifold: PCA over pooled steps ──────────────────────────────────────
    X=np.vstack(books)                       # [N*steps, D]
    mu=X.mean(0); Xc=X-mu
    U,S,Vt=np.linalg.svd(Xc, full_matrices=False)
    K=min(a.pcs, Vt.shape[0])
    P=Vt[:K]                                  # [K, D]
    ev=(S**2); ev=ev/ev.sum()
    # residuals of the training steps themselves → what "on-manifold" looks like
    proj=Xc@P.T@P
    resid=np.linalg.norm(Xc-proj,axis=1)/np.maximum(np.linalg.norm(Xc,axis=1),1e-9)
    print(f"manifold: top-{K} PCs capture {100*ev[:K].sum():.0f}% · residual p50={np.median(resid):.3f}")

    # ── build arc: cumulative graph features per step ────────────────────────
    G=np.array([b[:,L:] for b in books])      # [nb, steps, 12]
    arc_mean=G.mean(0); arc_sd=np.maximum(G.std(0), 1e-4)

    # ── delta: local-block cosine change per transition ─────────────────────
    def unit(m):
        n=np.linalg.norm(m,axis=1,keepdims=True); n[n==0]=1; return m/n
    deltas=[]
    for b in books:
        loc=unit(b[:,:L])
        deltas.append(1.0-np.sum(loc[1:]*loc[:-1],axis=1))
    Dl=np.array(deltas)                       # [nb, steps-1]
    flow_scores=Dl.mean(1)

    prior={
      "kind":"eo-flow-prior","version":"1",
      "meta":{"books":len(books),"steps":STEPS,"stepDim":D,"localDim":L,
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
      "delta":{"posMean":[round(float(x),4) for x in Dl.mean(0)],
               "posSd":[round(float(x),4) for x in np.maximum(Dl.std(0),1e-4)],
               "globalQ":dict(zip([str(q) for q in QS], qtiles(Dl.ravel(),QS)))},
      "books":{"flowQ":dict(zip([str(q) for q in QS], qtiles(flow_scores,QS)))},
    }
    with open(a.out,"w") as fh: json.dump(prior,fh)
    import os
    print(f"✓ wrote {a.out} ({os.path.getsize(a.out)/1024:.0f} KB) — load with flow_scorer.mjs / eoreader4.1")

if __name__=="__main__":
    main()

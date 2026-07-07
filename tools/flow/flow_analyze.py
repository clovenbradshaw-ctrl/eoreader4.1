#!/usr/bin/env python3
"""
flow_analyze.py — the smooth-vs-lurching ranking + manifold summary, for
VARIABLE-LENGTH (born-rule) trajectories.

    python3 tools/flow/flow_analyze.py trajectories.jsonl [--top 8]

Why this exists: a fixed-grid extractor emits N x 40 x D, so
`np.array([t["steps"] for t in T])` is a clean 3-D array. Born-rule sections are
variable-count, so that same call makes a RAGGED object-array and the run collapses
to a single row (the "1 trajectories" bug). This never rectangularises across books —
it pools section VECTORS (all the same width) for the manifold, and loops per book for
the deltas. Dim-agnostic: it reads localDim from the data, so 102-dim and 109-dim
(with the level-3 block) both work.
"""
import argparse, json, sys
import numpy as np

def load(path):
    T=[]
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line=line.strip()
            if not line: continue
            try:
                t=json.loads(line)
                if t.get("steps") and len(t["steps"])>=2: T.append(t)
            except json.JSONDecodeError: pass
    return T

def unit(m):
    n=np.linalg.norm(m,axis=1,keepdims=True); n[n==0]=1; return m/n

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("trajectories")
    ap.add_argument("--top", type=int, default=8)
    a=ap.parse_args()
    T=load(a.trajectories)
    if not T: sys.exit("no usable trajectories")

    L=T[0].get("localDim",90); D=len(T[0]["steps"][0])
    seg=T[0].get("segment","sections")
    nsec=[len(t["steps"]) for t in T]
    pooled=[]; flows=[]
    for t in T:
        b=np.array(t["steps"],dtype=float)          # per-book rectangle — safe
        pooled.append(b)
        loc=unit(b[:,:L]); d=1.0-np.sum(loc[1:]*loc[:-1],axis=1)
        flows.append({"title":t.get("title","?"),"n":b.shape[0],"flow":float(d.mean())})
    X=np.vstack(pooled)                              # sections x D — safe (fixed width)
    fl=np.array([f["flow"] for f in flows])

    print(f"{len(T)} trajectories · segment={seg} · sections/book {min(nsec)}–{max(nsec)} (median {int(np.median(nsec))}) · dim {D} (local {L})\n")
    print(f"FLOW: mean section-delta {fl.mean():.3f} ± {fl.std():.3f}")
    flows.sort(key=lambda f:f["flow"])
    print("  smoothest (small, even deltas):")
    for f in flows[:a.top]: print(f"    {f['flow']:.3f}  [{f['n']:>3} sec]  {str(f['title'])[:48]}")
    print("  most lurching (large/erratic deltas):")
    for f in flows[-a.top:][::-1]: print(f"    {f['flow']:.3f}  [{f['n']:>3} sec]  {str(f['title'])[:48]}")

    mu=X.mean(0); Xc=X-mu
    U,S,Vt=np.linalg.svd(Xc, full_matrices=False)
    ev=(S**2); ev=ev/ev.sum()
    print(f"\nmanifold: PC1+PC2 capture {100*ev[:2].sum():.0f}% · top-10 {100*ev[:10].sum():.0f}% of section variance (shared low-dim arc)")

    if any("l3summary" in t for t in T):
        keys=["overallEntropy","maxRun","transDiversity","palindrome","arcOrder"]
        agg={k:np.mean([t["l3summary"][k] for t in T if "l3summary" in t and k in t["l3summary"]]) for k in keys}
        print("level-3 discourse shape (corpus mean): " + " · ".join(f"{k}={agg[k]:.2f}" for k in keys if np.isfinite(agg[k])))

if __name__=="__main__":
    main()

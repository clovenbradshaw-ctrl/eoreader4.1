"""
manifold_compare.py — does natural-section segmentation give a sharper manifold and
more meaningful deltas than a fixed grid?  Extract the same corpus three ways, then
compare (same parse + step-math; only --segment differs):

    node tools/flow/eo_trajectory.mjs corpus.jsonl --eoreader . --sample 0 --segment equal --steps 40      --out DIR/traj_grid40.jsonl
    node tools/flow/eo_trajectory.mjs corpus.jsonl --eoreader . --sample 0 --segment sentences --per-sentences 12 --out DIR/traj_sent12.jsonl
    node tools/flow/eo_trajectory.mjs corpus.jsonl --eoreader . --sample 0 --segment sections            --out DIR/traj_sections.jsonl
    python3 tools/flow/manifold_compare.py DIR

Finding on the 36-book bootstrap corpus: raw manifold-tightness favors the grid, but
only because averaging over long cells blurs the cloud; the delta magnitude (~2x) and
the mode separability (~1.27x) — the tests of whether the joints are real — favor
sections.  See docs/flow-prior.md.
"""
import json, numpy as np, sys
OPS=["NUL","SIG","INS","SEG","CON","SYN","DEF","EVA","REC"]

def load(path):
    T=[]
    for line in open(path):
        line=line.strip()
        if line:
            t=json.loads(line)
            if len(t.get("steps",[]))>=4: T.append(t)
    return T

def unit(m):
    n=np.linalg.norm(m,axis=1,keepdims=True); n[n==0]=1; return m/n

def analyze(path, name, L=90):
    T=load(path)
    books=[np.array(t["steps"],float) for t in T]
    X=np.vstack(books)
    loc=X[:,:L]
    mu=loc.mean(0); Xc=loc-mu
    U,S,Vt=np.linalg.svd(Xc,full_matrices=False)
    ev=(S**2); ev=ev/ev.sum(); cum=np.cumsum(ev)
    k90=int(np.searchsorted(cum,0.90)+1)
    var10=100*cum[min(9,len(cum)-1)]
    P=Vt[:10]; proj=Xc@P.T@P
    resid=np.linalg.norm(Xc-proj,axis=1)/np.maximum(np.linalg.norm(Xc,axis=1),1e-9)
    # deltas + lag-1 autocorrelation of the delta series (redundancy of consecutive steps)
    deltas=[]; autos=[]
    for b in books:
        u=unit(b[:,:L]); d=1-np.sum(u[1:]*u[:-1],1); deltas.append(d)
        if len(d)>3:
            a=np.corrcoef(d[:-1],d[1:])[0,1]
            if np.isfinite(a): autos.append(a)
    dall=np.concatenate(deltas)
    # mode separability: how cleanly do steps cluster by DOMINANT operator (argmax of
    # the first 9 dims)?  Fisher ratio (between/within) in the top-10 PC space.
    labels=np.argmax(X[:,:9],1)
    Z=Xc@Vt[:10].T; gmean=Z.mean(0); sw=0.0; sb=0.0
    for c in np.unique(labels):
        Zc=Z[labels==c]
        if len(Zc)<2: continue
        cm=Zc.mean(0); sw+=((Zc-cm)**2).sum(); sb+=len(Zc)*((cm-gmean)**2).sum()
    sep=sb/max(sw,1e-9)
    print(f"{name:12} steps={X.shape[0]:5}  k@90%={k90:2}  var@10={var10:4.0f}%  resid_p50={np.median(resid):.3f}  "
          f"meanΔ={dall.mean():.3f}  Δautocorr={np.mean(autos):+.3f}  mode_sep={sep:.2f}")
    return dict(name=name, k90=k90, var10=var10, resid=float(np.median(resid)),
                meanD=float(dall.mean()), auto=float(np.mean(autos)), sep=float(sep))

D=sys.argv[1]
print("Same corpus, same parse & step-math — only the SEGMENTATION differs.\n")
print("  k@90%     PCs to explain 90% of local-block variance (lower = lower intrinsic dim)")
print("  var@10    variance captured by top-10 PCs")
print("  meanΔ     mean step-to-step cosine change (larger = each step is a real move)")
print("  Δautocorr lag-1 autocorrelation of the delta series (lower = less redundant steps)")
print("  mode_sep  between/within variance ratio by dominant operator (higher = cleaner joints)\n")
g=analyze(f"{D}/traj_grid40.jsonl","grid-40")
s=analyze(f"{D}/traj_sent12.jsonl","sentences-12")
n=analyze(f"{D}/traj_sections.jsonl","sections")
print()
print(f"sections vs grid:  meanΔ ×{n['meanD']/g['meanD']:.2f}   redundancy {n['auto']-g['auto']:+.3f}   mode_sep ×{n['sep']/g['sep']:.2f}")

// The meaning reader — the richer `read` the skeleton was built to receive (§11).
//
// The enacted loop (loop.js) is unchanged. The skeleton fed it the cheap γ-mass
// surprise — modelless, thin, real but blind to meaning: it spikes when a new
// FIGURE arrives, and misses a topic or tone shift that introduces no new name.
// This deepens the surprise WITHOUT touching the loop, exactly as the design
// promised: "the same machinery deepens with no shape change — only a richer
// read." The frames, strain, REC, cross-layer testing, and the arrow of time are
// identical; only the per-cursor divergence is now measured in MEANING space.
//
// SURPRISE is the prediction error in the centroids' space: how far the clause
// sits from the γ-decayed semantic prior the reading carried into it. A clause
// that continues the current sense is near the prior (low surprise, the frame
// holds); a clause that turns the sense is far (high surprise, strain accrues
// toward a REC) — even when no new figure enters, which is the depth the γ-mass
// reader cannot see.
//
// THE FIREWALL. Meaning-distance is only real in the space the embedder measures.
// Under the hash organ a cosine is spelling, not meaning, so buildMeaningRead
// returns null and the caller falls back to the cheap reader — the same no-commit
// discipline the classifier runs. The meaning reader is honest only on MiniLM.
//
// TERMS stay the salient figures (the frame's human-readable label); the deepening
// is the surprise that DRIVES restructuring, not the labelling. Frames standing on
// semantic terrain rather than figure lists is a further step, noted in the doc.
//
// CONTRIB is the per-dimension axis the surprise strains ALONG — the same bayesBy the
// cheap path supplies. The meaning 1−cos says HOW FAR the sense moved (the magnitude
// that breaks the frame); bayesBy says along WHICH figures belief moved (the axis the
// REC restructures toward). Wiring it is what lets the deep reader restructure toward
// the cause of the break, not whatever figures were merely in view — the cheap path
// got this; the meaning path, the one that matters, had been left without it.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Build the per-cursor meaning-distance surprise over a document's clauses, async.
// Reuses the doc's shared sentence-embedding cache when present (the same vectors
// retrieval uses), else embeds each clause once. Returns { surprise, terms, contrib }
// ready to drive createEnactedLoop, or null when the embedder cannot measure meaning.
export const buildMeaningRead = async (doc, embedder, { gamma = 0.7, termsAt, contribAt } = {}) => {
  if (!embedder?.measuresMeaning) return null;          // hash organ → fall back (firewall)
  const sentences = doc.units || doc.sentences || [];
  if (!sentences.length) return { surprise: [], terms: [] };

  // Embed with THIS embedder directly — never the doc's shared sentence cache,
  // which ingest may have populated with the hash organ from the retrieval path;
  // a meaning-distance off spelling-space vectors would measure nothing. Run once
  // per (doc, embedder); the caller caches the resulting enacted log.
  const embs = [];
  for (const s of sentences) embs.push(await embedder.embed(s));
  const dim = embs[0]?.length || 0;

  const surprise = new Array(sentences.length).fill(0);
  const prior = new Float64Array(dim);                  // γ-decayed running sum of prior clauses
  let priorMass = 0;
  for (let c = 0; c < sentences.length; c++) {
    const e = embs[c];
    if (priorMass > 0 && e) {
      // cosine of this clause against the prior DIRECTION (both normalised in the
      // cosine, so the prior need not be a unit vector). 1 − cos is the divergence.
      let dot = 0, np = 0, ne = 0;
      for (let i = 0; i < dim; i++) { dot += e[i] * prior[i]; np += prior[i] * prior[i]; ne += e[i] * e[i]; }
      const cos = dot / (Math.sqrt(np) * Math.sqrt(ne) + 1e-9);
      surprise[c] = clamp01(1 - cos);                   // c=0 stays 0: the opening cannot surprise
    }
    if (e) for (let i = 0; i < dim; i++) prior[i] = prior[i] * gamma + e[i];
    priorMass = priorMass * gamma + 1;
  }

  const terms = termsAt
    ? sentences.map((_, c) => termsAt(c))
    : sentences.map(() => []);
  // The per-dimension strain axis (the cheap path's bayesBy), one entry per cursor.
  // The caller already reads the cheap reading for the terms, so the contrib comes off
  // the same read — no second pass. Null per cursor when no per-dimension signal is
  // supplied, in which case the REC falls back to the in-view terms (loop.js).
  const contrib = contribAt
    ? sentences.map((_, c) => contribAt(c))
    : sentences.map(() => null);
  return { surprise, terms, contrib };
};

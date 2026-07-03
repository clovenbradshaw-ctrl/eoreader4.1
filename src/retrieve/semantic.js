// Semantic retrieval. Uses the embedder if warm; otherwise returns nothing.
// The hot lexical path never blocks on this.
//
// The doc's sentence embeddings are cached on the doc itself (set up in
// ingest), so a turn re-uses them across retrieval, fold, and form.

export const retrieveSemantic = async (doc, query, embedder, k = 8) => {
  if (!embedder || !embedder.isWarm()) return [];
  if (typeof doc.sentenceEmbeddings !== 'function') return [];
  const qVec = await embedder.embed(query);
  const vecs = await doc.sentenceEmbeddings(embedder);
  const out = vecs.map((v, idx) => ({ idx, score: cosine(qVec, v) }));
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, k).map(s => ({
    idx: s.idx,
    score: s.score,
    text: doc.sentences[s.idx],
    kind: 'sem',
  }));
};

const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
};

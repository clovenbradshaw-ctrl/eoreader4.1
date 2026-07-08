// Move the fold on surprise, not similarity — the Step 0 measurement (the directive
// "Move the Fold on Surprise, Not Similarity").
//
// Read-only. No behavior change. `refold` is NOT rewired. This measures whether the
// writing walk's fold-advance would cover more distinct ground if it selected the
// next beat's anchor by GROUNDABLE SURPRISE — prediction error against the running
// document, Born-scored — the way the READING walk's `_leads` already selects the
// next hop (novelty = 1/(1+had), weight = count·novelty), instead of by SIMILARITY
// to the prior paragraph's tail (what `refold` → `groundNotes` does today).
//
// THE TWO RANKINGS, computed at every beat transition over the SAME unseen fold:
//
//   SIMILARITY (today)  — cue = the prior anchor's text + the question (the walk's
//                         "last forty words of the prior paragraph plus the question").
//                         Rank unseen spans by cosine to that cue; pick the argmax.
//                         This is what `groundNotes` returns: the span most LIKE the
//                         cue — the second-most-redundant move (the most redundant,
//                         the prior span itself, is already excluded as seen).
//
//   GROUNDABLE SURPRISE — prediction error against the RUNNING DOCUMENT (the mean of
//                         the spans selected so far): error_i = 1 − cos(span_i, doc).
//                         Born-scored (bornWeights: amplitude², self-normalizing, no
//                         hand-set threshold — the same rule significance uses), then
//                         LEASHED by groundability so surprise cannot pick a
//                         non-sequitur: only spans still on the question's topic
//                         (question-cosine ≥ a fraction of the fold's max) are
//                         eligible. Surprise steers, groundability leashes — exactly
//                         curiosity-steers / competency-leashes on the reading side.
//
// THE GATE (the falsifier the directive names). Predictive fold-advance is justified
// ONLY if, relative to similarity selection:
//   (a) the two rankings pick DIFFERENT spans often enough to matter, AND
//   (b) surprise selection LOWERS inter-paragraph redundancy — measured two ways,
//       cited-slice overlap (Jaccard of each beat's anchor+neighbours) and n-gram
//       overlap between consecutive selected spans — AND raises coverage spread.
// If the rankings agree, or surprise does not lower redundancy, predictive
// processing adds nothing to fold-advance and the rewire is not justified. The
// negative result is the finding. Stop and report it.
//
// Selection grain, model-free (MiniLM only): the probe simulates the walk's ANCHOR
// selection across N beats under each ranking. It does not generate prose — the
// question is which spans the fold-advance reaches, not how they get written up,
// and prose would only add the talker's noise on top of the selection being tested.

import { readFileSync } from 'node:fs';
import { createMiniLM, setupDoc } from './mechanics/harness.mjs';
import { bornWeights } from '../src/chorus/born.js';
import { tok } from '../src/perceiver/parse/index.js';

const ROOT = new URL('../', import.meta.url);
const readText = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const stripGutenberg = (t) => {
  const s = t.indexOf('*** START'), e = t.indexOf('*** END');
  let b = t; if (s >= 0) b = b.slice(b.indexOf('\n', s) + 1); if (e >= 0) b = b.slice(0, b.indexOf('*** END'));
  return b.trim();
};

// The worked corpus, each fold anchored on a broad question — the shape a longform
// ask hands the walk (a topic, then paragraph-by-paragraph coverage of the reading).
const CORPUS = [
  { id: 'metamorphosis-full', text: stripGutenberg(readText('pg5200.txt')),
    question: 'How does Gregor\'s transformation change his life and his family?' },
  { id: 'esker', text: readText('data/esker.txt'),
    question: 'What shapes the esker landscape and its meaning?' },
];

const BEATS = 5;         // paragraphs per simulated walk
const SLICE = 3;         // anchor + 2 neighbours — the walk's LIVE_WIDTH
const FOLD_WIDTH = 24;   // top-N relevant sentences — the walk's fold

const cos = (a, b) => {
  let d = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};
const meanVec = (vecs) => {
  if (!vecs.length) return null;
  const out = new Float32Array(vecs[0].length);
  for (const v of vecs) for (let i = 0; i < v.length; i++) out[i] += v[i];
  for (let i = 0; i < out.length; i++) out[i] /= vecs.length;
  return out;
};
const trigrams = (s) => {
  const t = tok(s); const g = new Set();
  for (let i = 0; i + 2 < t.length; i++) g.add(t[i] + ' ' + t[i + 1] + ' ' + t[i + 2]);
  return g;
};
const jaccard = (a, b) => {
  if (!a.size && !b.size) return 0;
  let inter = 0; for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
};
const idxJaccard = (a, b) => {
  const A = new Set(a), B = new Set(b); let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter || 1);
};
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

// Build the fold: the FOLD_WIDTH sentences most relevant to the question, embedded.
const buildFold = async (doc, question, embedder) => {
  const qv = await embedder.embed(question);
  const qtok = new Set(tok(question));
  const scored = [];
  for (let i = 0; i < doc.sentences.length; i++) {
    const text = doc.sentences[i];
    if (String(text).trim().length < 24) continue;
    const v = await embedder.embed(text);
    const stok = new Set(tok(text));
    let hit = 0; for (const t of qtok) if (stok.has(t)) hit++;
    const rel = 0.5 * cos(v, qv) + 0.5 * (qtok.size ? hit / qtok.size : 0);   // meaning + keyword, like groundNotes
    scored.push({ idx: i, text, v, rel, qcos: cos(v, qv) });
  }
  scored.sort((a, b) => b.rel - a.rel);
  return { spans: scored.slice(0, FOLD_WIDTH), qv };
};

// The anchor's slice — itself plus its 2 nearest neighbours in the fold (the cited
// set a paragraph written from this anchor would draw on). Redundancy is measured
// on these slices, not the bare anchor, to match what the walk actually commits.
const sliceOf = (anchor, fold) => {
  const others = fold.spans.filter(s => s.idx !== anchor.idx)
    .map(s => ({ s, d: cos(s.v, anchor.v) })).sort((a, b) => b.d - a.d);
  return [anchor, ...others.slice(0, SLICE - 1).map(x => x.s)];
};

// Run one walk under a selection rule. rule(unseen, {priorAnchor, docVec, fold}) → anchor.
const runWalk = (fold, first, rule) => {
  const chosen = [first];
  const seen = new Set([first.idx]);
  for (let b = 1; b < BEATS; b++) {
    const unseen = fold.spans.filter(s => !seen.has(s.idx));
    if (!unseen.length) break;
    const docVec = meanVec(chosen.map(c => c.v));
    const anchor = rule(unseen, { priorAnchor: chosen[chosen.length - 1], docVec, fold });
    if (!anchor) break;
    chosen.push(anchor); seen.add(anchor.idx);
  }
  return chosen;
};

// SIMILARITY rule — cosine to (prior anchor text + question), the refold cue.
const similarityRule = async (embedder, question) => {
  const cache = new Map();
  const cueVec = async (priorText) => {
    const key = priorText;
    if (cache.has(key)) return cache.get(key);
    const v = await embedder.embed((priorText + ' ' + question).trim());
    cache.set(key, v); return v;
  };
  return async (unseen, { priorAnchor }) => {
    const cue = await cueVec(priorAnchor.text);
    let best = null, bs = -Infinity;
    for (const s of unseen) { const d = cos(s.v, cue); if (d > bs) { bs = d; best = s; } }
    return best;
  };
};

// GROUNDABLE SURPRISE rule — Born-scored prediction error vs the running doc,
// leashed to on-topic spans. The leash floor is a FRACTION of the fold's max
// question-cosine (drop the drifters, keep the groundable), so surprise selects
// among spans the binder could still cite — never a non-sequitur.
const surpriseRule = (leashFrac = 0.5) => {
  return (unseen, { docVec, fold }) => {
    const maxQ = Math.max(...fold.spans.map(s => s.qcos));
    const groundable = unseen.filter(s => s.qcos >= leashFrac * maxQ);
    const pool = groundable.length ? groundable : unseen;     // never leash to empty
    const errs = pool.map(s => 1 - cos(s.v, docVec));         // prediction error = residual amplitude
    const w = bornWeights(errs);                              // amplitude², self-normalizing
    let best = null, bw = -Infinity;
    for (let i = 0; i < pool.length; i++) if (w[i] > bw) { bw = w[i]; best = pool[i]; }
    return best;
  };
};

// Redundancy of a selection: mean consecutive slice-overlap (Jaccard of index sets),
// mean consecutive n-gram overlap, mean consecutive semantic cosine, and coverage
// spread (1 − mean pairwise cosine across all chosen anchors: higher = more distinct).
const measure = (chosen, fold) => {
  const slices = chosen.map(a => sliceOf(a, fold).map(s => s.idx));
  const sliceOverlap = [], ngram = [], adjCos = [];
  for (let i = 1; i < chosen.length; i++) {
    sliceOverlap.push(idxJaccard(slices[i - 1], slices[i]));
    ngram.push(jaccard(trigrams(chosen[i - 1].text), trigrams(chosen[i].text)));
    adjCos.push(cos(chosen[i - 1].v, chosen[i].v));
  }
  let pair = [], n = chosen.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pair.push(cos(chosen[i].v, chosen[j].v));
  return {
    n: chosen.length,
    sliceOverlap: mean(sliceOverlap),
    ngram: mean(ngram),
    adjCos: mean(adjCos),
    spread: 1 - mean(pair),
    idxs: chosen.map(c => c.idx),
  };
};

const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) : '—').padStart(6);

const run = async () => {
  const embedder = await createMiniLM();
  const rows = [];
  let agreeAll = 0, agreeN = 0;

  for (const { id, text, question } of CORPUS) {
    const doc = setupDoc(text, id);
    const fold = await buildFold(doc, question, embedder);
    if (fold.spans.length < BEATS + 2) { process.stderr.write(`${id}: fold too small (${fold.spans.length})\n`); continue; }
    const first = fold.spans[0];   // both walks start on the top-relevance span
    const simRule = await similarityRule(embedder, question);
    const surRule = surpriseRule(0.5);

    // runWalk takes a sync rule; the similarity rule is async (it embeds the cue),
    // so run the similarity walk inline and the surprise walk through runWalk.
    const simChosen = [first]; { const seen = new Set([first.idx]);
      for (let b = 1; b < BEATS; b++) { const unseen = fold.spans.filter(s => !seen.has(s.idx)); if (!unseen.length) break;
        const a = await simRule(unseen, { priorAnchor: simChosen[simChosen.length - 1] }); if (!a) break; simChosen.push(a); seen.add(a.idx); } }
    const surChosen = runWalk(fold, first, surRule);

    // Per-beat agreement (do the two rankings pick the same next span?).
    { const seenS = new Set([first.idx]), seenU = new Set([first.idx]); let cs = [first], cu = [first];
      for (let b = 1; b < BEATS; b++) {
        const unS = fold.spans.filter(s => !seenS.has(s.idx)); const unU = fold.spans.filter(s => !seenU.has(s.idx));
        if (!unS.length || !unU.length) break;
        const aS = await simRule(unS, { priorAnchor: cs[cs.length - 1] });
        const aU = surRule(unU, { docVec: meanVec(cu.map(c => c.v)), fold });
        if (aS && aU) { agreeN++; if (aS.idx === aU.idx) agreeAll++; }
        if (aS) { cs.push(aS); seenS.add(aS.idx); } if (aU) { cu.push(aU); seenU.add(aU.idx); }
      } }

    const sim = measure(simChosen, fold);
    const sur = measure(surChosen, fold);
    rows.push({ id, sim, sur });
  }

  console.log('\nFOLD ADVANCE — Step 0: does groundable-surprise selection cover more distinct ground than similarity?');
  console.log(`corpus: ${CORPUS.map(c => c.id).join(', ')}   beats: ${BEATS}   fold: top-${FOLD_WIDTH}   (read-only; refold NOT rewired)\n`);
  console.log('per corpus (lower overlap = less redundant; higher spread = more distinct coverage)');
  console.log('  corpus                sliceOverlap%   trigram%     adjCos%     spread%     picks');
  for (const r of rows) {
    console.log(`  ${r.id.padEnd(20)}  SIM  ${pct(r.sim.sliceOverlap)} ${pct(r.sim.ngram)} ${pct(r.sim.adjCos)} ${pct(r.sim.spread)}   [${r.sim.idxs.join(',')}]`);
    console.log(`  ${''.padEnd(20)}  SUR  ${pct(r.sur.sliceOverlap)} ${pct(r.sur.ngram)} ${pct(r.sur.adjCos)} ${pct(r.sur.spread)}   [${r.sur.idxs.join(',')}]`);
  }

  const d = (k) => mean(rows.map(r => r.sur[k] - r.sim[k]));
  console.log('\nAGGREGATE Δ (surprise − similarity)');
  console.log(`  slice-overlap Δ ${pct(d('sliceOverlap'))}   trigram Δ ${pct(d('ngram'))}   adjCos Δ ${pct(d('adjCos'))}   spread Δ ${pct(d('spread'))}`);
  console.log(`  ranking agreement: ${agreeN ? (100 * agreeAll / agreeN).toFixed(1) : '—'}%  (${agreeAll}/${agreeN} beat transitions pick the SAME span)`);

  const lowersRedund = d('sliceOverlap') < 0 && d('adjCos') < 0;
  const differs = agreeN && (agreeAll / agreeN) < 0.8;
  console.log('\nVERDICT: ' + (
    !differs ? 'NEGATIVE — the two rankings pick the same spans; surprise adds nothing to fold-advance.'
    : lowersRedund ? 'POSITIVE — surprise selection differs from similarity AND lowers inter-paragraph redundancy. The rewire is justified; build it behind a flag with golden parity, per the discipline.'
    : 'NEGATIVE — surprise differs but does not lower redundancy relative to similarity. Not justified.'));
  console.log('\nThe gate is falsifiable: it flips only if surprise BOTH differs from similarity AND reduces overlap.');
};

run().catch((e) => { console.error(e); process.exit(1); });

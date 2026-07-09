// Move the fold on surprise, not similarity — the LIVE re-read (Step 1 gate).
//
// The Step 0 probe (fold-advance-probe.mjs) measured SELECTION: which spans each
// ranking reaches, model-free. It came back positive. This is the follow-on the
// finding asked for before defaulting the flag on: run the REAL walk — the walk
// engine's live path, a real CPU talker writing a paragraph per beat — under two
// refold rankings over the SAME fold, and measure redundancy of the GENERATED
// paragraphs, not the selected spans. The question: does the selection-grain win
// survive contact with the talker?
//
//   SIMILARITY refold  — rank unseen fold spans by cosine to (prior paragraph tail +
//                        question); hand the top as the next beat's slice. What the
//                        reader's refold does today.
//   SURPRISE refold    — rank unseen fold spans by Born prediction error against the
//                        running document (the paragraphs written so far); groundable
//                        by construction (the fold is the on-topic pool). Step 1.
//
// Both walks share the seed, the fold, the talker, and groundLater:true — the only
// variable is the ranking. Redundancy is measured on the accepted paragraphs:
// consecutive-paragraph trigram overlap and consecutive-paragraph cosine. Lower =
// less restatement. The gate: surprise lowers generated redundancy relative to
// similarity. If it does not, the selection-grain win did not survive the talker and
// the flag should stay off.
//
// Slow: two live walks on the CPU completion talker (~minutes each). One-off.

import { readFileSync } from 'node:fs';
import { createMiniLM, createCpuCompleter, setupDoc } from './mechanics/harness.mjs';
import { walk } from '../src/longgen/index.js';
import { bornWeights } from '../src/chorus/born.js';
import { tok } from '../src/perceiver/parse/index.js';

const ROOT = new URL('../', import.meta.url);
const readText = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const stripGutenberg = (t) => {
  const s = t.indexOf('*** START'), e = t.indexOf('*** END');
  let b = t; if (s >= 0) b = b.slice(b.indexOf('\n', s) + 1); if (e >= 0) b = b.slice(0, b.indexOf('*** END'));
  return b.trim();
};

const SOURCE = { id: 'metamorphosis-full', text: stripGutenberg(readText('pg5200.txt')),
  question: 'How does Gregor\'s transformation change his life and his family?' };
const BEATS = 4;
const FOLD_WIDTH = 24;
const SLICE = 3;

const cos = (a, b) => { let d = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return d / (Math.sqrt(na) * Math.sqrt(nb) || 1); };
const meanVec = (vs) => { if (!vs.length) return null; const o = new Float32Array(vs[0].length);
  for (const v of vs) for (let i = 0; i < o.length; i++) o[i] += v[i]; for (let i = 0; i < o.length; i++) o[i] /= vs.length; return o; };
const trigrams = (s) => { const t = tok(s); const g = new Set(); for (let i = 0; i + 2 < t.length; i++) g.add(t[i] + ' ' + t[i + 1] + ' ' + t[i + 2]); return g; };
const jacc = (a, b) => { if (!a.size && !b.size) return 0; let x = 0; for (const t of a) if (b.has(t)) x++; return x / (a.size + b.size - x || 1); };
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

const buildFold = async (doc, question, emb) => {
  const qv = await emb.embed(question); const qtok = new Set(tok(question)); const out = [];
  for (let i = 0; i < doc.sentences.length; i++) {
    const text = doc.sentences[i]; if (String(text).trim().length < 24) continue;
    const v = await emb.embed(text); const stok = new Set(tok(text));
    let hit = 0; for (const t of qtok) if (stok.has(t)) hit++;
    out.push({ idx: i, text, v, rel: 0.5 * cos(v, qv) + 0.5 * (qtok.size ? hit / qtok.size : 0) });
  }
  out.sort((a, b) => b.rel - a.rel);
  return out.slice(0, FOLD_WIDTH);
};

// A refold over the STATIC fold, in one of two rankings. Returns the next slice
// (anchor + 2 nearest neighbours), the anchor chosen by `rank`.
const makeRefold = (foldSpans, emb, question, mode) => {
  const byIdx = new Map(foldSpans.map(s => [s.idx, s]));
  let qCue = null;
  return async ({ prior, accepted, seen }) => {
    const unseen = foldSpans.filter(s => !seen.has(String(s.idx)));
    if (!unseen.length) return [];
    let anchor;
    if (mode === 'similarity') {
      const cue = await emb.embed(((prior || question) + ' ' + question).trim());
      let bs = -Infinity; for (const s of unseen) { const d = cos(s.v, cue); if (d > bs) { bs = d; anchor = s; } }
    } else {
      const dv = accepted && accepted.length ? meanVec(await Promise.all(accepted.map(p => emb.embed(String(p.text || ''))))) : null;
      if (!dv) { anchor = unseen[0]; }
      else {
        const errs = unseen.map(s => Math.max(0, 1 - cos(s.v, dv)));
        const w = bornWeights(errs); let bw = -Infinity;
        for (let i = 0; i < unseen.length; i++) if (w[i] > bw) { bw = w[i]; anchor = unseen[i]; }
      }
    }
    if (!anchor) return [];
    const nbrs = unseen.filter(s => s.idx !== anchor.idx).map(s => ({ s, d: cos(s.v, anchor.v) })).sort((a, b) => b.d - a.d);
    return [anchor, ...nbrs.slice(0, SLICE - 1).map(x => x.s)].map(s => ({ text: s.text, score: s.rel, i: s.idx, idx: s.idx }));
  };
};

const redundancy = async (paras, emb) => {
  const texts = paras.map(p => p.text).filter(Boolean);
  const vs = await Promise.all(texts.map(t => emb.embed(t)));
  const tri = [], cs = [];
  for (let i = 1; i < texts.length; i++) { tri.push(jacc(trigrams(texts[i - 1]), trigrams(texts[i]))); cs.push(cos(vs[i - 1], vs[i])); }
  return { paras: texts.length, trigram: mean(tri), adjCos: mean(cs) };
};

const runOne = async (mode, fold, emb, model, question) => {
  const refold = makeRefold(fold, emb, question, mode);
  const res = await walk({ fold: [], design: { demand: BEATS }, question, model, refold, groundLater: true });
  return res;
};

const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) : '—').padStart(6);

// The 360M talker is heavily sampled (temperature), so ONE run is not a verdict — a
// single pair swings ±15 points on cosine from talker noise alone. Average the
// paired Δ over RUNS to read the central tendency, and report how many runs favour
// surprise. The fold, seed, and ranking are identical across runs; only the talker's
// sampling differs, so the paired Δ isolates the ranking effect from that noise.
const RUNS = Number(process.env.LIVE_RUNS) || 6;

const run = async () => {
  const emb = await createMiniLM();
  const model = await createCpuCompleter();
  const doc = setupDoc(SOURCE.text, SOURCE.id);
  const fold = await buildFold(doc, SOURCE.question, emb);
  process.stderr.write(`fold: ${fold.length} spans · ${RUNS} paired runs\n`);

  const dCos = [], dTri = [];
  for (let r = 0; r < RUNS; r++) {
    process.stderr.write(`run ${r + 1}/${RUNS}…\n`);
    const sim = await runOne('similarity', fold, emb, model, SOURCE.question);
    const sur = await runOne('surprise', fold, emb, model, SOURCE.question);
    const rSim = await redundancy(sim.paragraphs, emb);
    const rSur = await redundancy(sur.paragraphs, emb);
    dCos.push(rSur.adjCos - rSim.adjCos);
    dTri.push(rSur.trigram - rSim.trigram);
    process.stderr.write(`  Δcos ${(100 * (rSur.adjCos - rSim.adjCos)).toFixed(1)}  (sim ${(100 * rSim.adjCos).toFixed(1)} / sur ${(100 * rSur.adjCos).toFixed(1)})\n`);
  }

  const favSur = dCos.filter(d => d < 0).length;
  const mCos = mean(dCos), mTri = mean(dTri);
  console.log('\nFOLD ADVANCE — LIVE re-read: redundancy of GENERATED paragraphs (real talker)');
  console.log(`source: ${SOURCE.id}   beats: ${BEATS}   talker: SmolLM2-360M base   ${RUNS} paired runs (same fold + seed; talker sampled)\n`);
  console.log(`  mean Δ consec-cosine  (surprise − similarity)  ${pct(mCos)}   ${mCos < 0 ? '(surprise less redundant)' : '(surprise more redundant)'}`);
  console.log(`  mean Δ consec-trigram (surprise − similarity)  ${pct(mTri)}`);
  console.log(`  runs where surprise lowered cosine redundancy: ${favSur}/${RUNS}`);
  console.log(`  per-run Δcos: [${dCos.map(d => (100 * d).toFixed(0)).join(', ')}]`);

  const positive = mCos < 0 && favSur > RUNS / 2;
  console.log('\nVERDICT: ' + (positive
    ? 'POSITIVE — averaged over talker noise, surprise lowers generated-paragraph redundancy; the selection-grain win survives the talker. Defaulting the flag on is justified (verify on the 3B before shipping the default).'
    : 'INCONCLUSIVE/NEGATIVE — the surprise win at selection grain does not clearly survive this talker\'s output; keep the flag OFF and re-read on the deployed 3B.'));
  console.log('\nNote: the CPU completion talker is a 360M base model — the DEPLOYED 3B writes far more coherent');
  console.log('prose, so its output tracks the selected spans more faithfully. Read this as a directional signal.');
};

run().catch((e) => { console.error(e); process.exit(1); });

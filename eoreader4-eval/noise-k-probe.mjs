// Grounding the number of steps in signal-vs-noise (follow-on to the Step 0 finding).
//
// The Step 0 measurement killed the Born-partition swap: `offMass > onMass` does not
// track where k·step breaks the frame. So the k·step MECHANISM stays. But its number
// of steps is still hand-set — `perLayerSteps = { proposition: 3, document: 8 }`, the
// seat. This probe tests the alternative: **derive the number of steps from the
// reading's own noise**, the same signal-from-noise discipline `deriveNull` /
// `boundedNull` already apply everywhere else in the tree.
//
// THE IDEA. The frame breaks when the leaky-accumulated strain crosses a threshold.
// The strain deltas d_c = max(0, surprise − band) arrive over read time. Under the
// null — deltas arriving INDEPENDENTLY (no clustering) — the leaky accumulator still
// wanders up to some level by chance. A genuine crisis is a run of straining lines
// that pushes the accumulator ABOVE that chance level. So the threshold is not k·step
// with k picked by hand; it is the (1−α) level of the accumulator under iid arrival,
// and the implied number of steps k = threshold / step FALLS OUT of the noise.
//
// This probe, per layer, over the same corpus + the same live meaning reading:
//   1. pulls the real strain-delta series and the real k·step break cursors;
//   2. builds the iid noise floor of the leaky accumulator (Monte-Carlo: shuffle the
//      deltas — destroy the clustering — accumulate, take the (1−α) level);
//   3. reads off the implied k_noise = threshold_noise / step, per layer, per α;
//   4. re-simulates breaks with the noise threshold on the REAL deltas and reports
//      overlap with today's k·step breaks (the parity check).
//
// TWO QUESTIONS it answers by measurement, not taste:
//   (A) Does a noise-derived threshold reproduce the k·step break sequence? (parity)
//   (B) Does the layer ratio (document holds ~2.7× harder) FALL OUT of the noise, or
//       is it a prior not present in the signal? Both layers are fed the SAME surprise
//       stream and the SAME leak, so the honest expectation is that the marginal noise
//       gives them the SAME k — and the ratio does NOT fall out. The probe checks.

import { createMiniLM, setupDoc } from './mechanics/harness.mjs';
import { enactedReadingMeaning } from '../src/enact/index.js';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const readText = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const stripGutenberg = (t) => {
  const s = t.indexOf('*** START'), e = t.indexOf('*** END');
  let b = t;
  if (s >= 0) b = b.slice(b.indexOf('\n', s) + 1);
  if (e >= 0) b = b.slice(0, b.indexOf('*** END'));
  return b.trim();
};
const CORPUS = [
  { id: 'metamorphosis-excerpt', text: readText('data/metamorphosis.txt') },
  { id: 'esker', text: readText('data/esker.txt') },
  { id: 'metamorphosis-full', text: stripGutenberg(readText('pg5200.txt')) },
];

const LEAK = 0.9;                                   // DEFAULT_STRAIN_LEAK
const REFRACTORY = 3;                               // DEFAULT_REFRACTORY
const HANDSET_K = { proposition: 3, document: 8 };  // the seat under test
const ALPHAS = [0.10, 0.05, 0.02, 0.01];
const SHUFFLES = 400;

// The leaky accumulator's full trajectory over a delta series (dt = 1 per cursor).
const accumulate = (deltas, leak = LEAK) => {
  const out = new Array(deltas.length); let s = 0;
  for (let c = 0; c < deltas.length; c++) { s = s * leak + deltas[c]; out[c] = s; }
  return out;
};

// Simulate breaks on a delta series against a fixed threshold: leaky accumulate,
// reset to 0 on break, honor the refractory window — exactly the loop's accumulation
// path, but with `thr` in place of k·step.
const simulateBreaks = (deltas, thr, { leak = LEAK, refractory = REFRACTORY } = {}) => {
  const breaks = []; let s = 0, last = -Infinity;
  for (let c = 0; c < deltas.length; c++) {
    s = s * leak + deltas[c];
    if (c - last > refractory && s >= thr) { breaks.push(c); s = 0; last = c; }
  }
  return breaks;
};

const quantile = (xs, q) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1));
  return s[i];
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// The iid noise floor of the accumulator: shuffle the deltas (kill the clustering),
// accumulate, and read the (1−α) level of what a chance arrival of these same deltas
// reaches. Two nulls, both deriveNull's discipline (a boundary read off the field's
// own chance draws), specialized to the leaky sum:
//   'pointwise'  — the (1−α) level of ALL trajectory points (α = per-CURSOR exceedance
//                  rate; lenient — a document has N cursors, so α·N chance crossings).
//   'extreme'    — the (1−α) level of the per-shuffle MAXIMUM (α = per-DOCUMENT false-
//                  break budget; the bar the largest chance excursion reaches — the
//                  extreme-value null the surfer's void boundary uses). The principled
//                  headline: it answers "how high does the accumulator go by chance in
//                  a whole reading," which is what a break threshold must beat.
const noiseThreshold = (deltas, alpha, { leak = LEAK, shuffles = SHUFFLES, mode = 'extreme' } = {}) => {
  const arr = [...deltas];
  const pool = [], maxima = [];
  for (let m = 0; m < shuffles; m++) {
    for (let i = arr.length - 1; i > 0; i--) {       // Fisher–Yates
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    const traj = accumulate(arr, leak);
    let mx = 0;
    for (let c = 0; c < traj.length; c++) { pool.push(traj[c]); if (traj[c] > mx) mx = traj[c]; }
    maxima.push(mx);
  }
  return mode === 'pointwise' ? quantile(pool, 1 - alpha) : quantile(maxima, 1 - alpha);
};

// Overlap of two break-cursor sets within a tolerance (a break one cursor off is the
// same break — the refractory blurs exact placement). Returns precision/recall/F1 of
// the noise-rule breaks against the real k·step breaks.
const overlap = (predicted, actual, tol = 1) => {
  const A = [...actual].sort((x, y) => x - y);
  const matchedA = new Set(), matchedP = new Set();
  for (let i = 0; i < predicted.length; i++) {
    for (let j = 0; j < A.length; j++) {
      if (matchedA.has(j)) continue;
      if (Math.abs(predicted[i] - A[j]) <= tol) { matchedA.add(j); matchedP.add(i); break; }
    }
  }
  const tp = matchedP.size;
  const precision = predicted.length ? tp / predicted.length : 0;
  const recall = actual.length ? tp / actual.length : 0;
  const f1 = (precision + recall) ? 2 * precision * recall / (precision + recall) : 0;
  return { tp, predicted: predicted.length, actual: actual.length, precision, recall, f1 };
};

const pct = (x) => (100 * x).toFixed(0) + '%';

const run = async () => {
  const embedder = await createMiniLM();

  // Per-layer aggregate delta pools (for the implied-k summary) and per-doc series
  // (for the parity simulation).
  const pool = { proposition: [], document: [] };
  const perDoc = [];   // { id, layer, deltas, realBreaks, step }

  for (const { id, text } of CORPUS) {
    process.stderr.write(`\n[${id}] reading (MiniLM)…\n`);
    const doc = setupDoc(text, id);
    const units = doc.units || doc.sentences || [];
    if (!units.length) continue;
    const reading = await enactedReadingMeaning(doc, units.length - 1, { embedder });
    if (reading.reader !== 'meaning') { process.stderr.write(`  fell back to ${reading.reader}, skip\n`); continue; }
    const events = reading.events;
    const layers = [...new Set(events.filter((e) => e.op === 'DEF').map((e) => e.layer))];

    for (const layer of layers) {
      const deltas = new Array(units.length).fill(0);
      for (const e of events) if (e.op === 'EVA' && e.frameLayer === layer)
        deltas[e.cursor] = e.strainDelta || 0;
      const realBreaks = events.filter((e) => e.op === 'REC' && e.layer === layer && e.trigger === 'accumulation').map((e) => e.cursor);
      const positive = deltas.filter((d) => d > 0);
      const step = mean(positive);                    // mean excess over band = the loop's `step`
      pool[layer] = (pool[layer] || []).concat(deltas);
      perDoc.push({ id, layer, deltas, realBreaks, step });
      process.stderr.write(`  ${layer}: units=${units.length} strainingLines=${positive.length} step=${step.toFixed(3)} realBreaks=${realBreaks.length}\n`);
    }
  }

  const line = '─'.repeat(78);
  console.log('\n' + line);
  console.log('NOISE-DERIVED NUMBER OF STEPS  —  k = threshold_noise / step, per layer');
  console.log(line);

  // (A/B) Implied k per layer per α, from the aggregate noise floor.
  const layers = Object.keys(pool).filter((L) => pool[L].length);
  const impliedK = {};
  let impliedKx = null;   // extreme-value implied k, reported alongside the pointwise headline
  for (const layer of layers) {
    const deltas = pool[layer];
    const step = mean(deltas.filter((d) => d > 0));
    console.log(`\nLAYER ${layer}   (hand-set k = ${HANDSET_K[layer]},  step = ${step.toFixed(3)})`);
    impliedK[layer] = {};
    for (const alpha of ALPHAS) {
      const thrX = noiseThreshold(deltas, alpha, { mode: 'extreme' });
      const thrP = noiseThreshold(deltas, alpha, { mode: 'pointwise' });
      const kX = step > 0 ? thrX / step : Infinity;
      const kP = step > 0 ? thrP / step : Infinity;
      impliedK[layer][alpha] = kP;   // pointwise is length-robust; used for parity (extreme is length-confounded)
      impliedKx = impliedKx || {}; impliedKx[layer] = impliedKx[layer] || {}; impliedKx[layer][alpha] = kX;
      console.log(`  α=${alpha.toFixed(2)}   extreme-value: thr=${thrX.toFixed(3)} k=${kX.toFixed(2)}   |   per-cursor: thr=${thrP.toFixed(3)} k=${kP.toFixed(2)}`);
    }
  }

  // The ratio: does "document holds harder" fall out of the noise, or is it a prior?
  console.log('\n' + line);
  console.log('DOES THE LAYER RATIO FALL OUT OF THE NOISE?');
  console.log(line);
  if (impliedK.proposition && impliedK.document) {
    for (const alpha of ALPHAS) {
      const kp = impliedK.proposition[alpha], kd = impliedK.document[alpha];
      const ratio = kp > 0 ? kd / kp : Infinity;
      console.log(`  α=${alpha.toFixed(2)}   k_doc/k_prop = ${ratio.toFixed(2)}   (hand-set ratio = ${(HANDSET_K.document / HANDSET_K.proposition).toFixed(2)})`);
    }
    console.log('  → a ratio ≈ 1 means the marginal noise does NOT separate the layers (shared surprise + shared leak);');
    console.log('    the 8:3 hierarchy is then a prior, not in the signal. A ratio ≈ 2.7 means it falls out.');
  }

  // (A) Parity: re-simulate breaks with the noise threshold on the REAL deltas, at the
  // α whose implied k lands closest to today's — the honest "same mechanism, grounded
  // number" — and measure overlap with today's k·step breaks.
  console.log('\n' + line);
  console.log('PARITY — noise-derived breaks vs today\'s k·step breaks (per layer, best α)');
  console.log(line);
  for (const layer of layers) {
    // choose α minimizing |implied k − hand-set k| (grounding the existing number)
    let bestAlpha = ALPHAS[0], bestGap = Infinity;
    for (const alpha of ALPHAS) {
      const gap = Math.abs(impliedK[layer][alpha] - HANDSET_K[layer]);
      if (gap < bestGap) { bestGap = gap; bestAlpha = alpha; }
    }
    const step = mean(pool[layer].filter((d) => d > 0));
    const thr = noiseThreshold(pool[layer], bestAlpha, { mode: 'pointwise' });
    let tp = 0, pred = 0, act = 0;
    for (const rec of perDoc.filter((r) => r.layer === layer)) {
      const breaks = simulateBreaks(rec.deltas, thr);
      const o = overlap(breaks, rec.realBreaks);
      tp += o.tp; pred += o.predicted; act += o.actual;
    }
    const precision = pred ? tp / pred : 0, recall = act ? tp / act : 0;
    const f1 = (precision + recall) ? 2 * precision * recall / (precision + recall) : 0;
    console.log(`\nLAYER ${layer}   best α=${bestAlpha.toFixed(2)}  implied k=${impliedK[layer][bestAlpha].toFixed(2)} (hand-set ${HANDSET_K[layer]})  thr=${thr.toFixed(3)}`);
    console.log(`  noise-rule breaks=${pred}  today's k·step breaks=${act}  matched=${tp}`);
    console.log(`  precision=${pct(precision)}  recall=${pct(recall)}  F1=${pct(f1)}`);
  }

  console.log('\n' + line);
  console.log('JSON ' + JSON.stringify({ impliedK_pointwise: impliedK, impliedK_extreme: impliedKx, handsetK: HANDSET_K }));
  console.log(line + '\n');
};

run().catch((e) => { console.error(e); process.exit(1); });

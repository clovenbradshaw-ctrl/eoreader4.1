// Step 0 — the measurement that can come back negative (docs "Born-measure frame
// breaking, and the stance as a fold").
//
// Read-only. No behavior change. This reruns the worked corpus through the CURRENT
// enacted loop (the meaning-driven reading, MiniLM live — the same reading the app
// produces), and at every cursor where the ACCUMULATION trigger fires
// (`frame.strain >= thresholdOf(layer)`, the k·step verdict), computes the Born
// partition of the reading at that cursor: the on-frame mass versus the off-frame
// mass (src/chorus/born.js `frameMassPartition`). It logs both alongside the k·step
// verdict.
//
// THE GATE. Proceed to Step 2 (swap the trigger) only if the fraction of
// accumulation-break cursors where off-frame mass ALREADY exceeds on-frame mass is
// high. If the Born partition disagrees with k·step at most break cursors, the two
// measures track different things and the swap will not hold parity — the negative
// result is the finding, and the work stops here.
//
// TWO ADMISSIBLE MAPPINGS from a frame's terms to a cell/term set, chosen by
// measurement (§Step 1), not by taste:
//   (a) BY CELL   — map each frame term to its argmax cell over the 27 centroids
//                   (the classifier's own measurement), partition the reading's
//                   27-cell Born distribution by that cell set.
//   (b) BY TERM   — project the reading onto the frame's own term embeddings PLUS
//                   the figures newly in view at the cursor, Born-normalize, split
//                   on-frame terms vs the new (off-frame) figures.
// The probe runs both and reports the separation each gives, so the cleaner one is
// selected on the record.

import { readFileSync } from 'node:fs';
import { createMiniLM, loadCentroids, setupDoc } from './mechanics/harness.mjs';
import { enactedReadingMeaning } from '../src/enact/index.js';
import { readingAt } from '../src/perceiver/index.js';
import {
  signedCosine, cubeAmplitudes, centeredAmplitudes, frameMassPartition,
} from '../src/chorus/born.js';

const ROOT = new URL('../', import.meta.url);
const readText = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');

// The worked corpus — the same texts the eval mechanics read. Full Metamorphosis
// (pg5200) is stripped to its body so the Gutenberg boilerplate does not stand in as
// prose; the short worked excerpts stand as-is.
const stripGutenberg = (t) => {
  const start = t.indexOf('*** START');
  const end = t.indexOf('*** END');
  let body = t;
  if (start >= 0) body = body.slice(body.indexOf('\n', start) + 1);
  if (end >= 0) body = body.slice(0, body.indexOf('*** END'));
  return body.trim();
};

const CORPUS = [
  { id: 'metamorphosis-excerpt', text: readText('data/metamorphosis.txt') },
  { id: 'esker', text: readText('data/esker.txt') },
  { id: 'metamorphosis-full', text: stripGutenberg(readText('pg5200.txt')) },
];

// The argmax cell for a term over the 27 centroids — the classifier's measurement
// (phasepost.js: score against the centroids, take the argmax). Uncentered cosine,
// exactly the classifier's `sim`. Empty term → null (no cell).
const cellOfTerm = async (term, embedder, vectors) => {
  const t = String(term || '').trim();
  if (!t) return null;
  const q = await embedder.embed(t);
  const amps = cubeAmplitudes(q, vectors);
  if (!amps.length) return null;
  let best = amps[0];
  for (const a of amps) if (a.amp > best.amp) best = a;
  return best.key;
};

// MAPPING (a) — partition the reading's 27-cell Born distribution by the cells the
// frame's terms occupy.
const partitionByCell = async (qVec, frameTerms, embedder, vectors) => {
  const readingAmps = centeredAmplitudes(cubeAmplitudes(qVec, vectors));
  const cells = new Set();
  for (const t of frameTerms) { const c = await cellOfTerm(t, embedder, vectors); if (c) cells.add(c); }
  return frameMassPartition(readingAmps, cells);
};

// MAPPING (b) — project the reading onto a basis of the frame's own term vectors PLUS
// the figures in view at the cursor; Born-split on-frame terms vs the new figures.
// This is "split by term rather than by cell": on-frame is the reading's mass on the
// figures the frame stands on, off-frame its mass on the figures the frame does not.
const partitionByTerm = async (qVec, frameTerms, viewFigs, embedder) => {
  const frameSet = new Set(frameTerms.map(String));
  const basis = [...new Set([...frameTerms, ...viewFigs].map(String))].filter(Boolean);
  const amps = [];
  for (const t of basis) {
    const v = await embedder.embed(t);
    amps.push({ key: t, amp: signedCosine(qVec, v) });
  }
  // Center on the basis mean — the same "fix the basis" step the cube uses, here over
  // the frame's own terms (correlated in MiniLM space just as the centroids are).
  const centered = centeredAmplitudes(amps);
  return frameMassPartition(centered, frameSet);
};

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const pct = (x) => (100 * x).toFixed(1) + '%';

// The frame terms live GOING INTO cursor c at a layer — the terms of the latest DEF
// strictly before c (the frame Step 2's trigger would test at c). At a break cursor
// this is the frame that broke (== the REC's `from.terms`), so break and non-break
// cursors are measured against the same "frame going in" — a fair comparison.
const frameGoingInto = (defsByLayer, layer, c) => {
  const defs = defsByLayer.get(layer) || [];
  let terms = null;
  for (const d of defs) { if (d.cursor < c) terms = d.terms; else break; }
  return terms;
};

const run = async () => {
  // Only the MiniLM organ + the centroid prior are needed here — no generative model
  // (this is a read-only measurement over the enacted reading, not a turn).
  const geometricEmbedder = await createMiniLM();
  const centroids = loadCentroids();
  const vectors = centroids.vectors;

  // Records tagged with `brk` (this cursor is a k·step accumulation break at this
  // layer) so the discrimination — off>on at breaks vs at non-breaks — can be read.
  const recsA = [];   // mapping (a) by cell
  const recsB = [];   // mapping (b) by term
  let totalBreaks = 0, impulseBreaks = 0, totalCursors = 0;

  for (const { id, text } of CORPUS) {
    process.stderr.write(`\n[${id}] parsing + reading (MiniLM)…\n`);
    const doc = setupDoc(text, id);
    const units = doc.units || doc.sentences || [];
    if (!units.length) { process.stderr.write(`  (empty)\n`); continue; }

    const reading = await enactedReadingMeaning(doc, units.length - 1, { embedder: geometricEmbedder });
    if (reading.reader !== 'meaning') {
      process.stderr.write(`  WARNING: reading fell back to '${reading.reader}' (embedder not live?) — skipping\n`);
      continue;
    }
    const events = reading.events;
    const layers = [...new Set(events.filter((e) => e.op === 'DEF').map((e) => e.layer))];

    // Index the DEFs per layer (frame history) and the accumulation-break cursors.
    const defsByLayer = new Map();
    for (const e of events) if (e.op === 'DEF') {
      if (!defsByLayer.has(e.layer)) defsByLayer.set(e.layer, []);
      defsByLayer.get(e.layer).push({ cursor: e.cursor, terms: (e.frame?.terms || []).filter(Boolean) });
    }
    const accumBreak = new Set();   // "layer@cursor"
    for (const e of events) if (e.op === 'REC') {
      if (e.trigger === 'accumulation') { accumBreak.add(`${e.layer}@${e.cursor}`); totalBreaks++; }
      else if (e.trigger === 'impulse') impulseBreaks++;
    }
    process.stderr.write(`  units=${units.length}  layers=[${layers}]  accumulation=${accumBreak.size}\n`);

    // Walk EVERY cursor at EVERY layer — the population Step 2's trigger would decide
    // over — and partition the reading against the frame going into it.
    for (let c = 1; c < units.length; c++) {
      const clause = String(units[c] || '');
      if (!clause.trim()) continue;
      const qVec = await geometricEmbedder.embed(clause);
      const viewFigs = readingAt(doc, c)?.predicted?.figures || [];
      for (const layer of layers) {
        const frameTerms = frameGoingInto(defsByLayer, layer, c);
        if (!frameTerms) continue;                       // no frame yet at this layer
        const brk = accumBreak.has(`${layer}@${c}`);
        const a = await partitionByCell(qVec, frameTerms, geometricEmbedder, vectors);
        const b = await partitionByTerm(qVec, frameTerms, viewFigs, geometricEmbedder);
        recsA.push({ id, cursor: c, layer, brk, ...a });
        recsB.push({ id, cursor: c, layer, brk, ...b });
        totalCursors++;
      }
    }
  }

  // Discrimination report: off>on rate and mean off-mass at break vs non-break
  // cursors. A trigger swap holds parity only if off>on is HIGH at k·step breaks AND
  // LOW at non-breaks — else `offMass > onMass` fires everywhere (or nowhere) and is
  // not tracking the break decision (the base-rate trap: a frame occupying ~k of 27
  // cells reads ~k/27 on-mass regardless of whether the mass moved).
  const stats = (rows) => {
    const scored = rows.filter((r) => r.onMass + r.offMass > 0);
    const fracOff = scored.length ? scored.filter((r) => r.offMass > r.onMass).length / scored.length : 0;
    return { n: scored.length, fracOff, meanOff: mean(scored.map((r) => r.offMass)), meanOn: mean(scored.map((r) => r.onMass)) };
  };
  const report = (label, rows) => {
    const brk = stats(rows.filter((r) => r.brk));
    const non = stats(rows.filter((r) => !r.brk));
    return {
      label, brk, non,
      discrimination: brk.fracOff - non.fracOff,       // Δ off>on rate (break − non-break)
      massGap: brk.meanOff - non.meanOff,              // Δ mean off-mass
    };
  };

  const ra = report('(a) by cell', recsA);
  const rb = report('(b) by term', recsB);

  const line = '─'.repeat(74);
  console.log('\n' + line);
  console.log('STEP 0 — BORN PARTITION vs k·step ACCUMULATION BREAKS  (with baseline)');
  console.log(line);
  console.log(`corpus: ${CORPUS.map((c) => c.id).join(', ')}`);
  console.log(`cursor×layer decisions: ${totalCursors}   accumulation breaks: ${totalBreaks}   (impulse, context: ${impulseBreaks})`);
  console.log(line);
  for (const r of [ra, rb]) {
    console.log(`\nMAPPING ${r.label}`);
    console.log(`  at BREAK cursors      n=${r.brk.n}  off>on ${pct(r.brk.fracOff)}  meanOff ${r.brk.meanOff.toFixed(3)}  meanOn ${r.brk.meanOn.toFixed(3)}`);
    console.log(`  at NON-break cursors  n=${r.non.n}  off>on ${pct(r.non.fracOff)}  meanOff ${r.non.meanOff.toFixed(3)}  meanOn ${r.non.meanOn.toFixed(3)}`);
    console.log(`  DISCRIMINATION (Δ off>on rate, break − non-break): ${r.discrimination >= 0 ? '+' : ''}${r.discrimination.toFixed(3)}`);
    console.log(`  mass gap (Δ mean off-mass): ${r.massGap >= 0 ? '+' : ''}${r.massGap.toFixed(3)}`);
  }

  // Choose the mapping that best DISCRIMINATES break from non-break (not the one with
  // the biggest raw off-mass — that is the base-rate artifact).
  const chosen = rb.discrimination > ra.discrimination ? rb : ra;
  console.log('\n' + line);
  console.log(`CHOSEN MAPPING: ${chosen.label}  (best discrimination: ${chosen.discrimination.toFixed(3)})`);
  // POSITIVE needs BOTH: off>on is the strong-majority verdict at breaks, AND it is
  // materially rarer at non-breaks (the measure tracks the break, is not a constant).
  const positive = chosen.brk.fracOff >= 0.7 && chosen.discrimination >= 0.25;
  const weak = chosen.brk.fracOff >= 0.5 && chosen.discrimination >= 0.1;
  const verdict = positive
    ? 'POSITIVE — Born tracks the k·step break; proceed to Step 2 (swap the accumulation trigger)'
    : weak
      ? 'WEAK — some discrimination but not a clean majority; revisit Step 1 mapping before Step 2'
      : 'NEGATIVE — Born does not track the k·step break (fires everywhere or nowhere); STOP and report (§Step 0)';
  console.log(`GATE — off>on at breaks: ${pct(chosen.brk.fracOff)}   at non-breaks: ${pct(chosen.non.fracOff)}   Δ: ${chosen.discrimination.toFixed(3)}`);
  console.log(`VERDICT: ${verdict}`);
  console.log(line + '\n');

  console.log('JSON ' + JSON.stringify({
    corpus: CORPUS.map((c) => c.id), cursorLayerDecisions: totalCursors,
    accumulationBreaks: totalBreaks, impulseBreaks,
    mappingA: ra, mappingB: rb, chosen: chosen.label,
    verdict: verdict.split(' —')[0],
  }));
};

run().catch((e) => { console.error(e); process.exit(1); });

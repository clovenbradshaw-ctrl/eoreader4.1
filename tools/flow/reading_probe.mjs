#!/usr/bin/env node
// ============================================================================
// reading_probe.mjs — does flow residual detect a bad READING? (docs/flow-reading.md)
//
// The mirror of validity_test.mjs. That test corrupts the TEXT (writing quality) and
// finds ~nothing — coherence is semantic, invisible to operator structure. This test
// corrupts the READING: it drops relations (CON events) and fragments coreference in a
// known middle region — a parser that misses links — and asks whether the flow residual
// RISES and LOCALIZES there. A bad reading is a STRUCTURAL anomaly, which residual can see.
//
//   node tools/flow/reading_probe.mjs --prior expo-prior.json --test held-out.jsonl [--eoreader .]
//
// Result on the bootstrap corpus: clean, monotonic dose-response; the residual rise
// concentrates in the corrupted region (inside/outside ratio grows to ~190x).
// ============================================================================
import { readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] ?? true) : d; };
const here = dirname(fileURLToPath(import.meta.url));
const eoDir = resolve(String(flag('--eoreader', join(here, '..', '..'))));
const F = await import(pathToFileURL(join(eoDir, 'src', 'flow', 'index.js')).href);
const { parseText } = await import(pathToFileURL(join(eoDir, 'src', 'perceiver', 'parse', 'index.js')).href);

const prior = F.loadPrior(readFileSync(String(flag('--prior', 'expo-prior.json')), 'utf8'));
const docs = readFileSync(String(flag('--test', 'held-out.jsonl')), 'utf8').trim().split('\n').map(l => JSON.parse(l));
const R0 = parseFloat(flag('--region-lo', '0.4')), R1 = parseFloat(flag('--region-hi', '0.6'));

let seed = 1234567; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

// simulate a degraded parse in sentences [lo,hi): drop fraction f of relations, and
// drop/fragment fraction f of coreference mentions (missed link → a new singleton entity).
function corrupt(doc, lo, hi, f) {
  const inR = i => i >= lo && i < hi;
  const events = (doc.log?.events || []).filter(e => (e.op === 'CON' && typeof e.sentIdx === 'number' && inR(e.sentIdx)) ? rnd() > f : true);
  const srcM = doc.mentions instanceof Map ? doc.mentions : new Map(Object.entries(doc.mentions || {}));
  const m = new Map(); let nid = 1e6;
  for (const [id, idxs] of srcM) {
    const keep = [], frag = [];
    for (const i of idxs) { if (inR(i) && rnd() < f) { if (rnd() < 0.5) frag.push(i); } else keep.push(i); }
    m.set(id, keep); for (const i of frag) m.set('f' + (nid++), [i]);
  }
  return { sentences: doc.sentences, log: { events }, mentions: m };
}

const B = 20, mean = a => a && a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
console.log(`READING-CORRUPTION PROBE · ${docs.length} docs · region ${R0}–${R1} · prior=${flag('--prior')}\n`);
console.log(' f     detect(Δmean)   inside-Δ   outside-Δ   ratio   docs in>out');
for (const f of [0.1, 0.3, 0.5, 0.8]) {
  let inS = 0, inN = 0, outS = 0, outN = 0, cm = 0, km = 0, nd = 0, iw = 0;
  for (const d of docs) {
    const doc = parseText(d.text); const n = doc.sentences.length; if (n < 80) continue;
    const lo = Math.floor(n * R0), hi = Math.floor(n * R1);
    const cl = F.trajectoryFromDoc(doc, { segment: 'sections' });
    const co = F.trajectoryFromDoc(corrupt(doc, lo, hi, f), { segment: 'sections' });
    const rc = F.scoreTrajectory(prior, cl.steps, cl.pos), rk = F.scoreTrajectory(prior, co.steps, co.pos);
    cm += rc.meanResidual; km += rk.meanResidual; nd++;
    const cb = Array(B), kb = Array(B);
    rc.steps.forEach(s => { const b = Math.min(B - 1, Math.floor((s.pos ?? 0) * B)); (cb[b] = cb[b] || []).push(s.manifoldResidual); });
    rk.steps.forEach(s => { const b = Math.min(B - 1, Math.floor((s.pos ?? 0) * B)); (kb[b] = kb[b] || []).push(s.manifoldResidual); });
    let di = 0, ci = 0, dobj = 0, co2 = 0;
    for (let b = 0; b < B; b++) { const c = mean(cb[b]), k = mean(kb[b]); if (c == null || k == null) continue; const t = (b + 0.5) / B, dd = k - c;
      if (t >= R0 && t < R1) { inS += dd; inN++; di += dd; ci++; } else { outS += dd; outN++; dobj += dd; co2++; } }
    if (ci && co2 && di / ci > dobj / co2) iw++;
  }
  const inD = inS / Math.max(1, inN), outD = outS / Math.max(1, outN);
  console.log(` ${f.toFixed(1)}    ${(km / nd - cm / nd).toFixed(3).padStart(8)}     ${inD.toFixed(3).padStart(7)}    ${outD.toFixed(3).padStart(7)}    ${(inD / Math.max(1e-3, Math.abs(outD))).toFixed(0)}x     ${iw}/${nd}`);
}

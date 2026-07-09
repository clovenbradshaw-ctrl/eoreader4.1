#!/usr/bin/env node
// Task 3 split decision: score held-out trajectories under N priors with the flow
// holon's scoreTrajectory (src/flow/index.js) and report mean/median residual per
// prior. Usage:
//   node score_compare.mjs --eoreader <repo> --traj heldout.traj.jsonl \
//        --prior pooled=/path/a.json --prior book=/path/b.json [--min-steps 4]
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] ?? true) : d; };
const eoDir = resolve(String(flag('--eoreader', '.')));
const F = await import(pathToFileURL(join(eoDir, 'src', 'flow', 'index.js')).href);

const priors = {};
for (let i = 0; i < args.length; i++) if (args[i] === '--prior') {
  const [name, path] = String(args[i + 1]).split('=');
  priors[name] = F.loadPrior(readFileSync(path, 'utf8'));
}
const MIN_STEPS = parseInt(flag('--min-steps', '4'), 10);
const lines = readFileSync(String(flag('--traj')), 'utf8').split('\n').filter(Boolean);

const per = Object.fromEntries(Object.keys(priors).map(k => [k, []]));
let used = 0, dropped = 0;
for (const line of lines) {
  let t; try { t = JSON.parse(line); } catch { continue; }
  if (!t.steps || t.steps.length < MIN_STEPS) { dropped++; continue; }
  const steps = t.steps.map(s => Float64Array.from(s));
  for (const [k, p] of Object.entries(priors)) {
    const r = F.scoreTrajectory(p, steps, t.pos || null);
    per[k].push(r.meanResidual);
  }
  used++;
}
const stat = a => {
  const s = a.slice().sort((x, y) => x - y);
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  const med = s[Math.floor(s.length / 2)];
  const sd = Math.sqrt(a.reduce((x, y) => x + (y - mean) ** 2, 0) / a.length);
  return { mean, med, sd };
};
const out = { file: flag('--traj'), used, dropped, priors: {} };
for (const [k, a] of Object.entries(per)) {
  const { mean, med, sd } = stat(a);
  out.priors[k] = { meanResidual: +mean.toFixed(4), medianResidual: +med.toFixed(4), sd: +sd.toFixed(4), n: a.length };
}
// paired per-doc comparison for every prior pair
const names = Object.keys(per);
out.paired = {};
for (let i = 0; i < names.length; i++) for (let j = 0; j < names.length; j++) {
  if (i === j) continue;
  const a = per[names[i]], b = per[names[j]];
  const diffs = a.map((x, k) => x - b[k]);
  const { mean, sd } = stat(diffs);
  const winRate = diffs.filter(d => d < 0).length / diffs.length;
  out.paired[`${names[i]}-vs-${names[j]}`] = {
    meanDiff: +mean.toFixed(4), sdDiff: +sd.toFixed(4),
    tLike: +(mean / (sd / Math.sqrt(diffs.length) || 1)).toFixed(2),
    winRate: +winRate.toFixed(3),
  };
}
console.log(JSON.stringify(out, null, 1));

#!/usr/bin/env node
// ============================================================================
// flow_scorer.mjs — CLI over the flow holon (src/flow/index.js).
//
// The scoring core is the drop-in holon; this is only the command line around
// it (for testing/validating a prior outside the reader). Same math, one source.
//
//   node tools/flow/flow_scorer.mjs --prior data/flow-prior.json \
//        --trajectories trajectories.jsonl [--top 8]
//   node tools/flow/flow_scorer.mjs --prior data/flow-prior.json \
//        --text draft.txt --eoreader . [--steps 40]
// ============================================================================
import { readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadPrior, trajectoryFromDoc, scoreTrajectory } from '../../src/flow/index.js';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] ?? true) : d; };
const prior = loadPrior(readFileSync(String(flag('--prior', 'data/flow-prior.json')), 'utf8'));
const trajFile = flag('--trajectories', null), textFile = flag('--text', null);

if (trajFile) {
  const lines = readFileSync(String(trajFile), 'utf8').split('\n').filter(Boolean);
  const N = parseInt(flag('--top', '8'), 10);
  const scored = [];
  for (const line of lines) {
    let t; try { t = JSON.parse(line); } catch { continue; }
    const steps = t.steps.map(s => Float64Array.from(s));
    scored.push({ title: t.title, nSent: t.nSent, ...scoreTrajectory(prior, steps, t.pos || null) });
  }
  scored.sort((a, b) => a.flowScore - b.flowScore);
  console.log(`scored ${scored.length} trajectories against prior (${prior.meta.books} books)\n`);
  console.log('SMOOTHEST (flowScore · flow%ile · arc adherence):');
  for (const s of scored.slice(0, N)) console.log(`  ${s.flowScore.toFixed(3)} · p${String(s.flowPercentile).padStart(2)} · arc${s.meanArcAdherence}  ${String(s.title).slice(0, 46)}`);
  console.log('MOST LURCHING:');
  for (const s of scored.slice(-N).reverse()) console.log(`  ${s.flowScore.toFixed(3)} · p${String(s.flowPercentile).padStart(2)} · arc${s.meanArcAdherence}  ${String(s.title).slice(0, 46)}`);
} else if (textFile) {
  const here = dirname(fileURLToPath(import.meta.url));
  const eoDir = resolve(String(flag('--eoreader', join(here, '..', '..'))));
  const { parseText } = await import(pathToFileURL(join(eoDir, 'src', 'perceiver', 'parse', 'index.js')).href);
  const doc = parseText(readFileSync(String(textFile), 'utf8'));
  const seg = args.includes('--steps') ? { segment: 'equal', steps: parseInt(flag('--steps', '40'), 10) } : { segment: 'sections' };
  const { steps, pos } = trajectoryFromDoc(doc, seg);
  const r = scoreTrajectory(prior, steps, pos);
  console.log(JSON.stringify({
    file: textFile, nSent: doc.sentences.length, nSections: r.nSections,
    flowScore: r.flowScore, flowPercentile: r.flowPercentile,
    meanResidual: r.meanResidual, meanArcAdherence: r.meanArcAdherence,
    worstSteps: r.steps.filter(s => s.deltaPercentile >= 90).map(s => s.step),
  }, null, 1));
} else {
  console.log('usage:\n  node tools/flow/flow_scorer.mjs --prior data/flow-prior.json --trajectories trajectories.jsonl\n  node tools/flow/flow_scorer.mjs --prior data/flow-prior.json --text draft.txt --eoreader .');
}

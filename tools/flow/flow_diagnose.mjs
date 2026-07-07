#!/usr/bin/env node
// ============================================================================
// flow_diagnose.mjs — the READING self-diagnostic CLI (docs/flow-reading.md).
//
// Score a document's reading against a register-matched prior and flag the sections
// that lie OFF the manifold of competent readings — the ones most likely under-read
// (missed relations/coref) and worth re-reading.
//
//   # pick the prior by facets from the installed registry
//   node tools/flow/flow_diagnose.mjs --text draft.txt --select '{"lang":"en","domain":"science"}'
//   # or name a prior file directly
//   node tools/flow/flow_diagnose.mjs --text draft.txt --prior data/flow-priors/expository-en.json
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

// resolve the prior: explicit --prior file, or --select facets against the registry
let priorPath = flag('--prior', null);
if (!priorPath) {
  const regDir = resolve(String(flag('--registry', join(eoDir, 'data', 'flow-priors'))));
  const manifest = JSON.parse(readFileSync(join(regDir, 'index.json'), 'utf8'));
  const query = JSON.parse(String(flag('--select', '{}')));
  const pick = F.selectPrior(manifest.priors, query);
  if (!pick) { console.error('no prior matched', query, '— installed:', manifest.priors.map(p => p.name)); process.exit(1); }
  priorPath = join(regDir, pick.file);
  console.error(`selected prior: ${pick.name}  (${JSON.stringify(pick.facets)})`);
}
const prior = F.loadPrior(readFileSync(String(priorPath), 'utf8'));
const desc = F.describePrior(prior);

const text = readFileSync(String(flag('--text', 'draft.txt')), 'utf8');
const doc = parseText(text);
const d = F.diagnoseReading(prior, doc, { residualPct: parseInt(flag('--threshold', '95'), 10) });

console.log(`\nreading diagnosis vs [${desc.label}]`);
console.log(`  ${doc.sentences.length} sentences → ${d.sections.length} sections · mean residual ${d.meanResidual}`);
console.log(`  ${d.flaggedCount} section(s) flagged as likely under-read (residual ≥ p${flag('--threshold', '95')}):`);
for (const s of d.flagged) {
  console.log(`    sentences ${s.from}-${s.to} · pos ${(s.pos ?? 0).toFixed(2)} · dom ${s.dom} · residual ${s.residual.toFixed(3)} (p${s.residualPercentile})`);
}
if (!d.flaggedCount) console.log('    (none — the reading looks competent throughout this prior)');

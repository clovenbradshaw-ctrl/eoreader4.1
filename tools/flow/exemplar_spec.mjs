#!/usr/bin/env node
// ============================================================================
// exemplar_spec.mjs — turn ONE admired piece into a loadable flow SPEC.
//
// A prior (tools/flow/flow_distill.py) is a distribution over many pieces: it has
// variance, a manifold, percentiles. A single exemplar has none of that — it is one
// target TRAJECTORY. So this overlays the exemplar's own build-arc and delta rhythm
// onto a base prior's spread + manifold: "move like competent prose in general
// (corpus tolerance + manifold), but aim for THIS exemplar's specific shape."
//
// The result is still kind:"eo-flow-prior", so src/flow/index.js loads it unchanged —
// arcTarget() returns the exemplar's arc, scoreTrajectory() measures a draft's
// conformance to the exemplar, flowVerdict() flags beats that drift from it.
//
//   node tools/flow/exemplar_spec.mjs --text exemplar.txt --prior data/flow-prior.json \
//        --eoreader . --title "Introduction to viruses" --source <url> \
//        --out data/flow-spec-exemplar.json
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { trajectoryFromDoc } from '../../src/flow/index.js';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] ?? true) : d; };
const here = dirname(fileURLToPath(import.meta.url));
const eoDir = resolve(String(flag('--eoreader', join(here, '..', '..'))));
const raw = JSON.parse(readFileSync(String(flag('--prior', 'data/flow-prior.json')), 'utf8'));
if (raw.kind !== 'eo-flow-prior') throw new Error('base --prior is not a flow prior');

const { parseText } = await import(pathToFileURL(join(eoDir, 'src', 'perceiver', 'parse', 'index.js')).href);
const text = readFileSync(String(flag('--text', 'exemplar.txt')), 'utf8');
const STEPS = raw.meta.steps, L = raw.meta.localDim;

const doc = parseText(text);
const { steps, nSent } = trajectoryFromDoc(doc, STEPS);

const r4 = (x) => Math.round(x * 1e4) / 1e4;
const unit = (v) => { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; return v.map(x => x / n); };
const cosD = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return 1 - s; };

// the exemplar's OWN build-arc (per-step cumulative graph block) and delta rhythm
const arcMean = steps.map(s => Array.from(s.slice(L)).map(r4));
const locals = steps.map(s => unit(Array.from(s.slice(0, L))));
const posMean = [];
for (let k = 1; k < steps.length; k++) posMean.push(r4(cosD(locals[k], locals[k - 1])));

// overlay onto the base prior: exemplar means become the TARGET; corpus sd + manifold
// + quantiles stay as the tolerance/scale a draft is measured against.
const spec = JSON.parse(JSON.stringify(raw));
spec.buildArc.mean = arcMean;                 // aim for the exemplar's arc
spec.delta.posMean = posMean;                 // aim for the exemplar's transition rhythm
spec.meta.kind = 'exemplar-spec';             // provenance label (kind field stays eo-flow-prior)
spec.meta.exemplar = {
  title: String(flag('--title', 'exemplar')),
  source: flag('--source', null) || null,
  sentences: nSent,
  basePrior: raw.meta.sourceSha256,
  generated: new Date().toISOString(),
};

writeFileSync(String(flag('--out', 'data/flow-spec-exemplar.json')), JSON.stringify(spec));
console.log(`✓ exemplar spec from "${spec.meta.exemplar.title}" (${nSent} sentences, ${STEPS} steps)`);
console.log(`  target arc[0] ent_dens=${arcMean[0][0]} → arc[last] ent_dens=${arcMean[STEPS - 1][0]}  (new-entity introduction over the arc)`);
console.log(`  wrote ${flag('--out', 'data/flow-spec-exemplar.json')} — load with src/flow (arcTarget / scoreTrajectory / flowVerdict)`);

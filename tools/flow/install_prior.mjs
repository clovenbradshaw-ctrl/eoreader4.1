#!/usr/bin/env node
// ============================================================================
// install_prior.mjs — install a distilled prior into the facet-keyed registry.
//
//   node tools/flow/install_prior.mjs flow-prior.json --name narrative-en-1900s \
//        --lang en --region gb-us --era 1900s --domain literature --register narrative
//
// Copies the prior into data/flow-priors/<name>.json (stamping any facet overrides
// into meta.facets), then rebuilds data/flow-priors/index.json — the manifest the
// runtime loads and selectPrior() chooses from. A prior is self-describing; the
// manifest is a fast index of what's installed.
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] ?? true) : d; };
const src = args.find(a => !a.startsWith('--') && a.endsWith('.json'));
if (!src) { console.error('usage: node tools/flow/install_prior.mjs <prior.json> --name <name> [--lang en --domain ... ]'); process.exit(1); }
const root = resolve(String(flag('--root', join(dirname(fileURLToPath(import.meta.url)), '..', '..'))));
const dir = resolve(String(flag('--dir', join(root, 'data', 'flow-priors'))));
mkdirSync(dir, { recursive: true });

const prior = JSON.parse(readFileSync(src, 'utf8'));
if (prior.kind !== 'eo-flow-prior') throw new Error('not a flow prior');
prior.meta = prior.meta || {}; prior.meta.facets = prior.meta.facets || {};
for (const k of ['lang', 'region', 'era', 'domain', 'register']) { const v = flag('--' + k, null); if (v) prior.meta.facets[k] = String(v); }
const name = String(flag('--name', basename(src, '.json')));
writeFileSync(join(dir, name + '.json'), JSON.stringify(prior));

// rebuild the manifest from every prior in the directory
const priors = [];
for (const f of readdirSync(dir)) {
  if (!f.endsWith('.json') || f === 'index.json') continue;
  let p; try { p = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { continue; }
  if (p.kind !== 'eo-flow-prior') continue;
  priors.push({ name: basename(f, '.json'), file: f, facets: p.meta?.facets || {},
    books: p.meta?.books ?? null, segment: p.meta?.segment ?? null,
    grid: p.meta?.grid ?? null, sourceSha256: p.meta?.sourceSha256 ?? null, generated: p.meta?.generated ?? null });
}
priors.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(join(dir, 'index.json'), JSON.stringify({ kind: 'eo-flow-prior-registry', version: '1', priors }, null, 1));
console.log(`✓ installed "${name}" · facets ${JSON.stringify(prior.meta.facets)}`);
console.log(`  registry now lists ${priors.length}: ${priors.map(p => p.name).join(', ')}`);
console.log(`  → data/flow-priors/index.json`);

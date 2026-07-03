// chorus-probe-a — Gate zero, run for real (docs/chorus.md, "Gate zero: measure
// before building"). The spec is emphatic: "Probe A first, read-only, and if it
// fails, stop and fix the basis before anything else." This is the runner.
//
// It embeds a real corpus of clauses with the SAME MiniLM the 27 centroids were
// built in, projects each onto the centroids (the signed amplitudes), and runs:
//   • Probe A — sparsification: does the Born mass concentrate in the head?
//   • Probe B — interference: do the signed amplitudes cancel across clauses?
// No build depends on Probe C, so this runner leaves it to the test-bench.
//
//   prereq:  npm install            (installs @huggingface/transformers, a devDependency)
//   run:     node eoreader4-eval/chorus-probe-a.mjs [path/to/corpus.txt] [--n=200]
//            first run downloads the q8 MiniLM (~a few hundred MB) to the HF cache.
//   verify:  node eoreader4-eval/chorus-probe-a.mjs --mock
//            runs the SAME probe wiring against a deterministic fake embedder — no
//            transformers, no download. Proves the harness end to end.
//
// NOTE: in the standard agent environment the REAL run does not complete —
// onnxruntime-node's post-install downloads its native binary from github releases
// and the egress policy returns 403 (see essay-real-model.mjs). The wiring is
// correct (verified via --mock and tests/chorus-probe.test.js); run the real path
// where that fetch is allowed and MiniLM can reach the HF cache.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { cubeAmplitudes, centeredAmplitudes } from '../src/chorus/born.js';
import { probeA, probeB } from '../src/chorus/probe.js';
import { segmentClauses } from '../src/perceiver/parse/clauses.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const MOCK = process.argv.includes('--mock');
const nArg = process.argv.find((a) => a.startsWith('--n='));
const N = nArg ? parseInt(nArg.slice(4), 10) : 200;
const pathArg = process.argv.slice(2).find((a) => !a.startsWith('--'));

const log = (...a) => console.log(...a);

// The centroid bundle, read straight off disk — the same file the browser fetches.
const centroids = JSON.parse(readFileSync(join(ROOT, 'data/centroids-27.json')));

// A deterministic fake embedder for --mock: a sharp reading per clause (one big
// amplitude, the rest near zero), so the harness demonstrably passes Probe A
// end to end without a model. NOT a measurement — the wiring, only.
const createMockEmbedder = () => {
  const dim = centroids.vectors[Object.keys(centroids.vectors)[0]].length;
  let seed = 0;
  return {
    measuresMeaning: true,
    async embed(text) {
      // pick a centroid deterministically from the text and return it (near) verbatim,
      // so the clause reads as sharply that one cell — a synthetic sparse reading.
      const keys = Object.keys(centroids.vectors);
      let h = 0; for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) % keys.length;
      const base = centroids.vectors[keys[h]];
      const v = new Float32Array(dim);
      for (let i = 0; i < dim; i++) v[i] = base[i] + (((i + seed) % 7) - 3) * 1e-3;
      seed++;
      return v;
    },
  };
};

// The real MiniLM organ, mirroring eoreader4-eval/mechanics/harness.mjs.
const createMiniLM = async () => {
  const { pipeline } = await import('@huggingface/transformers');
  log('loading MiniLM organ (q8, cpu)…');
  const pipe = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    { dtype: 'q8', device: 'cpu' });
  log('organ ready');
  return {
    measuresMeaning: true,
    async embed(text) {
      const out = await pipe(String(text), { pooling: 'mean', normalize: true });
      return new Float32Array(out.data);
    },
  };
};

// The corpus: clauses from a real document (default: the Metamorphosis sample).
const loadCorpus = () => {
  const file = pathArg ? join(process.cwd(), pathArg) : join(ROOT, 'data/metamorphosis.txt');
  const raw = readFileSync(file, 'utf8');
  const clauses = [];
  for (const line of raw.split(/\n+/)) {
    const s = line.trim();
    if (s.length < 8) continue;
    for (const c of segmentClauses(s)) {
      const cl = (typeof c === 'string' ? c : c.text || '').trim();
      if (cl.length >= 8) clauses.push(cl);
      if (clauses.length >= N) return clauses;
    }
  }
  return clauses;
};

const main = async () => {
  const embedder = MOCK ? createMockEmbedder() : await createMiniLM();
  const clauses = loadCorpus();
  log(`\ncorpus: ${clauses.length} clauses  ·  centroids: ${Object.keys(centroids.vectors).length} cells  ·  ${MOCK ? 'MOCK embedder' : 'MiniLM'}\n`);

  const raw = [], centered = [];
  for (const clause of clauses) {
    const q = await embedder.embed(clause);
    const amps = cubeAmplitudes(q, centroids.vectors);
    raw.push(amps);
    centered.push(centeredAmplitudes(amps));   // the "fix the basis" candidate
  }

  // Probe A — sparsification, under BOTH amplitude conventions. The raw cosines
  // against these correlated centroids tend to spread flat; the centered residual
  // (signed above/below the clause's mean projection) is where concentration lives.
  const report = (label, r) => {
    log(`  [${label}] mean top-3 Born mass : ${r.meanTopMass.toFixed(3)}   (pass line ${r.passLine.toFixed(3)})`);
    log(`  [${label}] clauses clearing bar : ${(r.clearedFrac * 100).toFixed(0)}%   (need ${(r.mostFrac * 100).toFixed(0)}%)`);
    log(`  [${label}] VERDICT              : ${r.pass ? 'PASS' : 'FAIL'}`);
  };
  const aRaw = probeA(raw, { k: 3 });
  const aCentered = probeA(centered, { k: 3 });
  log('── Probe A — sparsification ──');
  report('raw     ', aRaw);
  report('centered', aCentered);
  const a = aCentered.pass ? aCentered : aRaw;   // centered is the basis we build on
  log(`  → ${a.pass ? 'PASS — the basis concentrates; build the governor' : 'FAIL — flat spread; fix the basis before anything else'}\n`);

  // Probe B — interference, treating each clause as a contributing span. Uses the
  // RAW signed cosines (interference is about the sign surviving to the sum).
  const b = probeB(raw);
  log('── Probe B — interference ──');
  log(`  max |coherent − incoherent| gap : ${b.maxGap.toFixed(3)}`);
  log(`  interference present            : ${b.interference}`);
  log(`  destructive (signed cancel)     : ${b.destructive}`);
  log(`  VERDICT                         : ${b.destructive ? 'interference EARNED — the word leaves quotes' : 'no cancellation — "interference" stays in quotes'}\n`);

  if (!MOCK && !a.pass)
    log('Per the spec: Probe A failed. Stop. Fix the basis before building the render.\n');
};

main().catch((e) => {
  console.error('\nchorus-probe-a could not complete:', e?.message || e);
  console.error('If this is the onnxruntime-node egress block, run --mock to verify the wiring,');
  console.error('or run the real path in an environment where the HF cache is reachable.\n');
  process.exit(1);
});

// Build data/centroids-27.json — the geometric reader's verified instrument.
//
// The classifier (src/classify/phasepost.js) measures a clause against 27 cell
// centroids in paraphrase-multilingual-MiniLM-L12-v2 space. Those centroids are
// not authored here; they are BUILT, in the lexical-analysis project, by
// mean-pooling the top-100 discriminative exemplars per cell and re-normalizing.
// This script is the bridge: it takes that verified bundle and rewrites it into
// the loader's schema, recording provenance so the artifact is auditable rather
// than a mystery blob.
//
// SOURCE (verified):
//   repo     clovenbradshaw-ctrl/eo-lexical-analysis-2.0
//   commit   58079c69ac7243e0d239084d43f66131ba9f7fae
//   file     archetypes-27-paraphrase-multilingual-MiniLM-L12-v2-2026-04-24T20-22-54.json
//   built    from run_2026-03-15_122636/exemplars.json (top-100 per cell)
//
// TWO TRANSFORMS, both mechanical and both verified:
//   1. Key shape.    'CON(Binding, Link)'  →  'CON_Binding_Link'  (OP_Stance_Site).
//   2. Operator name. The lexical project names two of the nine operators
//      differently from eoreader4's core (src/core/operators.js). They are the
//      SAME cell — same mode × domain × stance × site — only a different letter:
//         ALT  (Differentiate × Interpretation)  ≡  DEF  (assert/define)
//         SUP  (Relate × Interpretation)         ≡  EVA  (evaluate)
//      Verified against the lexical repo's own composite_test.json
//      ("ALT (DIFF×SIG_D)", "SUP (RELA×SIG_D)") and app2.py ("SIG, SUP — other
//      RELATING operators").
//
// GRAIN (verified): the exemplars are full multilingual CLAUSES, not single
// verbs — so construction is 'clause', eoreader4's design target. The query the
// classifier embeds must be the clause (it is).
//
// SAFETY: the resulting 27 keys must EXACTLY equal the cell registry's keys
// (data/phasepost-cells.json). The script throws on any mismatch — a drift in
// either project's cell set must fail the build, never ship a mislabeled vector.
//
//   node scripts/build-centroids.mjs [sourceArchetypes.json]

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = process.argv[2] ||
  join(ROOT, 'data', 'archetypes-27-paraphrase-multilingual-MiniLM-L12-v2-2026-04-24T20-22-54.json');
const CELLS_FILE = join(ROOT, 'data', 'phasepost-cells.json');
const OUT = join(ROOT, 'data', 'centroids-27.json');

// Lexical-project operator letter → eoreader4 operator letter (see header).
const OP_RENAME = { ALT: 'DEF', SUP: 'EVA' };

// 'CON(Binding, Link)' → 'CON_Binding_Link', applying the operator rename.
const toRegistryKey = (k) => {
  const m = /^([A-Z]+)\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)$/.exec(k);
  if (!m) throw new Error(`unparseable centroid key: ${JSON.stringify(k)}`);
  const op = OP_RENAME[m[1]] || m[1];
  return `${op}_${m[2]}_${m[3]}`;
};

const norm = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

const src = JSON.parse(readFileSync(SOURCE, 'utf8'));
const cellsDoc = JSON.parse(readFileSync(CELLS_FILE, 'utf8'));
const registryKeys = new Set(Object.keys(cellsDoc.CELLS || cellsDoc));

// Validate the source is the bundle we think it is.
if (src.face !== '27cell') throw new Error(`unexpected face: ${src.face}`);
if (typeof src.model !== 'string' || !src.model) throw new Error('source has no model');
const dim = src.dim;
if (!Number.isInteger(dim) || dim <= 0) throw new Error(`bad dim: ${dim}`);
if (!src.centroids || typeof src.centroids !== 'object') throw new Error('source has no centroids map');

// Transform, validating each vector as we go.
const vectors = {};
for (const [rawKey, vec] of Object.entries(src.centroids)) {
  const key = toRegistryKey(rawKey);
  if (key in vectors) throw new Error(`duplicate key after rename: ${key} (from ${rawKey})`);
  if (!Array.isArray(vec) || vec.length !== dim) throw new Error(`bad vector for ${rawKey}: len ${vec?.length}`);
  if (!vec.every((x) => typeof x === 'number' && Number.isFinite(x))) throw new Error(`non-finite values in ${rawKey}`);
  const n = norm(vec);
  if (Math.abs(n - 1) > 1e-3) throw new Error(`vector for ${rawKey} not unit-norm (|v|=${n.toFixed(4)})`);
  vectors[key] = vec;
}

// SAFETY: the cell set must match the registry exactly — no extra, none missing.
const got = new Set(Object.keys(vectors));
const missing = [...registryKeys].filter((k) => !got.has(k));
const extra = [...got].filter((k) => !registryKeys.has(k));
if (missing.length || extra.length) {
  throw new Error(`cell-set mismatch vs registry.\n  missing: ${missing.join(', ') || '(none)'}\n  extra:   ${extra.join(', ') || '(none)'}`);
}

const bundle = {
  meta: {
    model: src.model,
    construction: 'clause',
    dim,
    built: src.built_at,
    derived_at: new Date().toISOString(),
    source: {
      repo: 'clovenbradshaw-ctrl/eo-lexical-analysis-2.0',
      commit: '58079c69ac7243e0d239084d43f66131ba9f7fae',
      file: 'archetypes-27-paraphrase-multilingual-MiniLM-L12-v2-2026-04-24T20-22-54.json',
      exemplars: src.source,
      build_method: src.build_method,
      eval: src.eval_summary,
    },
    operator_rename: OP_RENAME,
    note: 'Keys converted OP(Stance, Site) → OP_Stance_Site; ALT/SUP renamed to '
        + 'eoreader4 DEF/EVA (same mode×domain×stance×site). Vectors are unit-norm, '
        + 'copied unchanged from the verified source.',
  },
  vectors,
};

// Serialize meta pretty, one vector per line — small, deterministic, diff-friendly.
const sortedKeys = Object.keys(vectors).sort();
const lines = sortedKeys.map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(vectors[k])}`);
const text =
  '{\n' +
  `  "meta": ${JSON.stringify(bundle.meta, null, 2).replace(/\n/g, '\n  ')},\n` +
  '  "vectors": {\n' +
  lines.join(',\n') + '\n' +
  '  }\n' +
  '}\n';

writeFileSync(OUT, text);
console.log(`wrote ${OUT}`);
console.log(`  ${sortedKeys.length} cells · dim ${dim} · model ${src.model}`);
console.log(`  eval top1=${src.eval_summary?.top1?.toFixed(3)} top3=${src.eval_summary?.top3?.toFixed(3)} (chance ${src.eval_summary?.chance?.toFixed(3)})`);
console.log(`  bytes: ${Buffer.byteLength(text)}`);

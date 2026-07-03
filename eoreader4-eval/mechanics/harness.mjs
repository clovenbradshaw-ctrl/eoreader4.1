// Mechanics Test Battery — shared harness.
//
// Stands up a VALID scorecard config (docs/ai-user-battery.md §7 validity gate):
//   (a) a real GENERATIVE model that can invent — SmolLM2-360M-Instruct, run on the
//       CPU through transformers.js (onnxruntime-node, q8). Not echo.
//   (b) the MiniLM organ LIVE — Xenova/paraphrase-multilingual-MiniLM-L12-v2, the
//       SAME space the phasepost centroids were built in, so the classifier's
//       cosines mean something and the significance column / relational vetoes fire.
//
// Everything is wired by dependency injection exactly as src/turn/pipeline.js expects:
// model, embedder (hash, lexical fallback), geometricEmbedder (MiniLM, the meaning
// organ), classifier (phasepost over the centroids), centroids (the significance prior).
//
// Pure Node — no DOM, no fetch, no IndexedDB. The browser loaders (model/onnx.js's CDN
// import, embed.js's CDN import, classify/centroids.js's fetch) are replaced with the
// locally-installed @huggingface/transformers and a direct JSON read, but the MODELS
// and the centroid bundle are byte-identical to what the app loads in the browser.

import { readFileSync } from 'node:fs';
import { pipeline } from '@huggingface/transformers';

import { parseText } from '../../src/perceiver/parse/pipeline.js';
import { createHashEmbedder } from '../../src/model/embed-hash.js';
import { createPhasepostClassifier } from '../../src/classify/index.js';

const ROOT = new URL('../../', import.meta.url);
const DTYPE = 'q8';            // onnxruntime-node parses the q8 builds (q4 here is genai-format)
const DEVICE = 'cpu';

// ── The CPU generative talker — SmolLM2-360M-Instruct, ChatML, run locally. ────────
// Mirrors src/model/onnx.js's `chat` format: hand the messages to the pipeline (it
// applies the model's own chat template) and read the last assistant turn back out.
let _pipe = null;
export const createCpuLlm = async ({ onProgress } = {}) => {
  if (!_pipe) {
    onProgress?.('loading SmolLM2-360M-Instruct (q8, cpu)…');
    _pipe = await pipeline('text-generation', 'HuggingFaceTB/SmolLM2-360M-Instruct',
      { dtype: DTYPE, device: DEVICE });
    onProgress?.('talker ready');
  }
  return {
    id: 'smollm2-360m', kind: 'local', isLoaded: () => true,
    async load() {},
    async phrase(messages, opts = {}) {
      const gen = {
        max_new_tokens: opts.maxTokens ?? 192,
        repetition_penalty: 1.1,
        return_full_text: false,
      };
      const temperature = opts.temperature ?? 0;
      if (temperature > 0) { gen.do_sample = true; gen.temperature = temperature; }
      const out = await _pipe(messages, gen);
      const gentext = Array.isArray(out) ? out[0]?.generated_text : out?.generated_text;
      if (Array.isArray(gentext)) return String(gentext[gentext.length - 1]?.content || '').trim();
      return String(gentext || '').trim();
    },
  };
};

// ── The MiniLM meaning organ — the SAME model the centroids were built in. ─────────
// measuresMeaning:true is the firewall the classifier reads (embed.js): a cosine in
// this space is a real meaning-distance, so the geometric reader commits.
let _mini = null;
export const createMiniLM = async ({ onProgress } = {}) => {
  if (!_mini) {
    onProgress?.('loading MiniLM organ (q8, cpu)…');
    _mini = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
      { dtype: DTYPE, device: DEVICE });
    onProgress?.('organ ready');
  }
  const cache = new Map();
  return {
    id: 'minilm', measuresMeaning: true, organ: 'minilm',
    model: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    isWarm: () => true, async warm() {},
    async embed(text) {
      const key = String(text);
      if (cache.has(key)) return cache.get(key);
      const out = await _mini(key, { pooling: 'mean', normalize: true });
      const v = new Float32Array(out.data);
      cache.set(key, v);
      return v;
    },
  };
};

// The centroid bundle (the significance prior) and the phasepost cell registry, read
// straight off disk — the same files data/centroids-27.json / data/phasepost-cells.json
// the browser fetches.
export const loadCentroids = () =>
  JSON.parse(readFileSync(new URL('data/centroids-27.json', ROOT)));
export const loadCells = () =>
  JSON.parse(readFileSync(new URL('data/phasepost-cells.json', ROOT)).toString()).CELLS;

export const buildClassifier = (centroids, embedder) =>
  createPhasepostClassifier({ cells: loadCells(), centroids, embedder });

// One assembled, valid environment: model + both embedders + classifier + prior.
// Loads the two CPU models once and reuses them across tests.
let _env = null;
export const makeEnv = async ({ onProgress = (m) => process.stderr.write(m + '\n') } = {}) => {
  if (_env) return _env;
  const model = await createCpuLlm({ onProgress });
  const geometricEmbedder = await createMiniLM({ onProgress });
  const embedder = createHashEmbedder();
  const centroids = loadCentroids();
  const classifier = buildClassifier(centroids, geometricEmbedder);
  _env = { model, embedder, geometricEmbedder, centroids, classifier,
           valid: true,
           validity: 'SCORECARD — live generative model (SmolLM2-360M) + MiniLM organ live + 27-cell centroid prior' };
  return _env;
};

// Parse a document and attach the lazy sentence-embedding cache the retrieve + fold
// stages read. KEYED BY EMBEDDER ID — the retrieve stage embeds with the meaning organ
// while the significance fold also asks for the meaning organ; a single un-keyed memo
// would hand one stage the other's vectors. (The ai-user harness's memo is un-keyed,
// safe only because its default geometricEmbedder is absent.)
export const setupDoc = (text, docId, opts = {}) => {
  const doc = parseText(text, { docId, ...opts });
  const caches = new Map();
  doc.sentenceEmbeddings = async (e) => {
    const k = e?.id || 'default';
    if (caches.has(k)) return caches.get(k);
    const p = Promise.all(doc.sentences.map((s) => e.embed(s)));
    caches.set(k, p);
    return p;
  };
  return doc;
};

export const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};

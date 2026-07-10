// EO: INS·SEG(Field → Entity, Making,Dissecting) — ONNX transformers.js talkers
// ONNX talkers via transformers.js — the clean, browser-native small models.
//
// WHY a second local runtime. wllama (wllama.js) runs GGUF on CPU/WASM; webllm
// runs MLC on WebGPU. Neither reaches the onnx-community builds of the Pleias
// family or SmolLM2 — the cleanest small models we have, published as ONNX
// precisely for transformers.js. The geometric reader already loads transformers.js
// (embed.js) for the MiniLM embedder; this reuses that same runtime family for
// TEXT GENERATION, so the talker roster gains the onnx-community models with no
// new toolchain — a text-generation pipeline instead of feature-extraction.
//
// WHICH models — all verified onnx-community / HuggingFaceTB repos (no broken ids):
//   pleias-pico-onnx · onnx-community/Pleias-Pico            · ~350M · grounded
//   pleias-350m-onnx · onnx-community/Pleias-350m-Preview    · ~350M · grounded
//   pleias-1.2b-onnx · onnx-community/Pleias-1.2b-Preview    · ~1.2B · grounded
//   pleias-nano-onnx · onnx-community/Pleias-Nano            · ~1.2B · grounded
//   smollm2-360m     · HuggingFaceTB/SmolLM2-360M-Instruct   ·  360M · chat
//
// HOW they're driven — two formats, both fed by the turn the app already assembled.
// The app's retrieval IS the RAG: drop a .txt, its verbatim spans become the
// sources the prompt carries. Nothing in the turn pipeline changes.
//
//   'pleias' — the Pleias models speak their native RAG schema, not ChatML. We pull
//     the question and the verbatim excerpts back out of the grounded prompt
//     (extractGroundedInput) and rebuild Pleias's <|query_start|>/<|source_start|>
//     structure (buildPicoPrompt) — the SAME builders the GGUF Pleias backend uses
//     (pleias.js) — then strip Pleias's scaffolding off the completion
//     (extractPleiasAnswer) so the binder receives clean prose, exactly as from
//     every other backend.
//
//   'chat' — SmolLM2 is a ChatML instruct model. We hand the messages straight to
//     the pipeline, which applies the model's own chat template; the grounded turn
//     already carries the excerpts in the user message, so the chatty model "gets
//     the source as context" with no special framing. No-doc chat works the same.
//
// Caching: transformers.js stores every ONNX/tokenizer file it fetches in the
// browser Cache Storage, so a model is downloaded once per profile and reopens
// from disk thereafter — the same once-per-browser cost as wllama's OPFS cache.
//
// Sources:
//   https://huggingface.co/onnx-community/Pleias-Pico
//   https://huggingface.co/onnx-community/Pleias-350m-Preview
//   https://huggingface.co/onnx-community/Pleias-1.2b-Preview
//   https://huggingface.co/onnx-community/Pleias-Nano
//   https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct

import { registerBackend } from './interface.js';
import { extractGroundedInput, buildPicoPrompt, extractPleiasAnswer } from './pleias.js';

// transformers.js v4 — the @huggingface/transformers line (the v2 @xenova line in
// embed.js predates WebGPU and these architectures). Pinned so the runtime and the
// onnx-community builds it loads stay a matched pair, exactly as embed.js pins v2.
const TRANSFORMERS_URL =
  'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/+esm';

// Pick the runtime target. WebGPU when the browser exposes it (far faster for a
// 1.2B model), CPU/WASM otherwise — with a matching dtype: q4f16 leans on GPU
// fp16, q4 is the broadly-portable 4-bit build for WASM. Both are real files in
// every repo here (model_q4f16.onnx / model_q4.onnx). Overridable per backend.
const hasWebGPU = () => typeof navigator !== 'undefined' && !!navigator.gpu;
const defaultDevice = () => (hasWebGPU() ? 'webgpu' : 'wasm');
const defaultDtype  = () => (hasWebGPU() ? 'q4f16' : 'q4');

// Map transformers.js progress events ({status,file,progress,loaded,total}) onto
// the { phase, pct } shape every backend reports, so the app's status line shows a
// real percent. Per-file events arrive for the onnx weights and the tokenizer; we
// surface the file being fetched and its own percent — enough to show motion.
const onProgressShape = (onProgress) => (e) => {
  if (!onProgress) return;
  const file = String(e?.file || 'weights').split('/').pop();
  if (e?.status === 'progress') {
    const pct = e.total ? e.loaded / e.total : (e.progress ?? 0) / 100;
    onProgress({ phase: `fetch ${file}`, pct: 0.05 + 0.9 * pct });
  } else if (e?.status === 'ready') {
    onProgress({ phase: 'ready', pct: 1 });
  } else if (e?.status === 'initiate' || e?.status === 'download') {
    onProgress({ phase: `fetch ${file}`, pct: 0.05 });
  }
};

// Build the model input for one phrase, by format. Exported for tests.
//   pleias → a single native-schema STRING (query + sources + source-analysis prime)
//   chat   → the messages array, for the pipeline to apply the model's chat template
export const buildOnnxInput = (format, messages) =>
  format === 'pleias' ? buildPicoPrompt(extractGroundedInput(messages)) : messages;

// Pull clean prose out of one completion, by format. Exported for tests.
//   pleias → generated_text is the continuation string; strip Pleias's scaffolding
//   chat   → generated_text is the full message array; the last turn is the reply
export const readOnnxOutput = (format, out) => {
  const gen = Array.isArray(out) ? out[0]?.generated_text : out?.generated_text;
  if (format === 'pleias') return extractPleiasAnswer(typeof gen === 'string' ? gen : '');
  if (Array.isArray(gen)) return String(gen[gen.length - 1]?.content || '').trim();
  return String(gen || '').trim();
};

const makeOnnx = ({ id, modelId, format, minPredict = 0 }) =>
  registerBackend(id, (opts = {}) => {
    let pipe = null;
    let loading = null;
    let Streamer = null;             // transformers.js TextStreamer, captured at load
    const repo   = opts.modelId || modelId;
    const device = opts.device  || defaultDevice();
    const dtype  = opts.dtype   || defaultDtype();

    return {
      id,
      kind: 'local',
      isLoaded: () => !!pipe,
      async load(onProgress) {
        if (pipe)    return;
        if (loading) return loading;
        loading = (async () => {
          onProgress?.({ phase: 'fetch-runtime', pct: 0.02 });
          const { pipeline, TextStreamer } = await import(/* @vite-ignore */ TRANSFORMERS_URL);
          Streamer = TextStreamer || null;
          pipe = await pipeline('text-generation', repo, {
            device, dtype,
            progress_callback: onProgressShape(onProgress),
          });
          onProgress?.({ phase: 'ready', pct: 1 });
        })();
        return loading;
      },
      async phrase(messages, opts = {}) {
        if (!pipe) throw new Error(`${id}: not loaded`);
        // CANCELLATION (the Stop button): an optional AbortSignal halts generation. Pleias
        // draws whole (no streamer), so we can only honour an abort that landed before the
        // draw; a chat model streams, so we throw out of the streamer callback to stop the
        // decode and return whatever tokens arrived.
        const signal = opts.signal || null;
        if (signal?.aborted) return '';
        // Pleias spends tokens on its reasoning scaffold before the answer, so give
        // the grounded format a floor under the task's max_tokens (as pleias.js does).
        // A short utility call passes opts.minPredict: 0 to opt out and stay fast.
        const temperature = opts.temperature ?? (format === 'pleias' ? 0.3 : 0.7);
        const gen = {
          max_new_tokens: Math.max(opts.maxTokens ?? 256, opts.minPredict ?? minPredict),
          repetition_penalty: 1.1,   // a gentle guard against the small-model loop
          return_full_text: false,   // string inputs: keep only the continuation
        };
        if (temperature > 0) { gen.do_sample = true; gen.temperature = temperature; }
        // The streaming capability (model/stream.js §): a ChatML model emits clean
        // continuation tokens, so stream them live through `onToken` via a
        // TextStreamer. The Pleias formats are NOT streamed — their native schema
        // wraps the answer in a reasoning scaffold that extractPleiasAnswer strips
        // only at the end, so a live stream would surface the scaffold; they draw and
        // the cleaned answer is emitted whole by the loop's draw-then-emit fallback.
        const onToken = typeof opts.onToken === 'function' ? opts.onToken : null;
        let streamed = '';   // accumulated so an abort can return the partial answer
        if (onToken && format === 'chat' && Streamer && pipe.tokenizer) {
          gen.streamer = new Streamer(pipe.tokenizer, {
            skip_prompt: true, skip_special_tokens: true,
            callback_function: (t) => {
              if (t) { streamed += t; onToken(t); }
              // Stop the decode loop by throwing out of the callback when the user aborts.
              if (signal?.aborted) throw new DOMException('stopped', 'AbortError');
            },
          });
        }
        try {
          const out = await pipe(buildOnnxInput(format, messages), gen);
          return readOnnxOutput(format, out);
        } catch (err) {
          if (signal?.aborted) return streamed.trim();   // user stopped — keep the partial answer
          throw err;
        }
      },
    };
  });

makeOnnx({ id: 'smollm2-360m',     modelId: 'HuggingFaceTB/SmolLM2-360M-Instruct', format: 'chat' });
makeOnnx({ id: 'pleias-pico-onnx', modelId: 'onnx-community/Pleias-Pico',          format: 'pleias', minPredict: 384 });
makeOnnx({ id: 'pleias-350m-onnx', modelId: 'onnx-community/Pleias-350m-Preview',  format: 'pleias', minPredict: 384 });
makeOnnx({ id: 'pleias-1.2b-onnx', modelId: 'onnx-community/Pleias-1.2b-Preview',  format: 'pleias', minPredict: 512 });
makeOnnx({ id: 'pleias-nano-onnx', modelId: 'onnx-community/Pleias-Nano',          format: 'pleias', minPredict: 512 });

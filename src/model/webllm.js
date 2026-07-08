// webllm backend — WebGPU, Llama-3.2-3B default.
//
// Heavier than wllama; loads only when explicitly chosen. Same shape
// as the other backends; the rest of the system does not know which is in use.
//
// THE LENS PORT IS RETIRED HERE. This backend used to register a LogitProcessor
// (write/lens-port.js) through logitProcessorRegistry. Registering ANY processor
// forces web-llm onto its slow sampling path — on EVERY decoded token the full
// vocab logit vector is copied GPU→CPU behind a device.sync() stall, handed to JS,
// and copied back to the GPU — whether or not the lens was armed, and it pins the
// engine in-thread (the worker engine ignores the registry). The steering never
// demonstrably moved the surface. The posture now is: trust the model with the
// fold's content (write/paragraphs.js) and keep grounding mechanical and
// downstream — the binder cites, the fact-checker adjudicates, the veto flags.
// write/lens-port.js remains as the pure implementation should a propose-capable
// backend ever want the port back.

import { registerBackend } from './interface.js';

const WEBLLM_URL = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2/+esm';

// The backend is a parameterised builder so a coding-model variant (model/coders.js)
// can bind a different MLC artifact under its own id WITHOUT duplicating the engine
// wiring below. `webllm` itself is just the builder with the Llama-3.2-3B default;
// a coder passes { id, model } and reuses every line of this path.
export const makeWebllmBackend = (defaults = {}) => (opts = {}) => {
  const id    = defaults.id || 'webllm';
  // An explicit pin (a caller's opts.model / a coder variant's defaults.model) is honoured as-is;
  // otherwise the default 3B build is chosen ADAPTIVELY at load, keyed to the GPU (pickModel below).
  const pinned = opts.model || defaults.model || null;
  let engine  = null;
  let loading = null;

  // PICK THE 3B BUILD BY WHAT THE GPU CAN DO. The suffix is the accumulation dtype, not the weight
  // width (both are 4-bit): q4f16_1 accumulates in fp16 and decodes fast — but ONLY on a GPU that
  // exposes the WebGPU `shader-f16` feature. Without it (many integrated/older GPUs, some browsers)
  // q4f16 runs an emulated path that is SLOWER than q4f32_1, so the fp32-accumulation build is the
  // right, broadly-portable default there. So: probe the adapter for shader-f16 and take the fast
  // build only when it's real; fall back to the portable build otherwise. Fail-soft — any detection
  // fault (no navigator, no adapter, a throw) resolves to the portable build, never a broken fetch.
  const pickModel = async () => {
    const PORTABLE = 'Llama-3.2-3B-Instruct-q4f32_1-MLC';
    const FAST     = 'Llama-3.2-3B-Instruct-q4f16_1-MLC';
    try {
      if (typeof navigator === 'undefined' || !navigator.gpu) return PORTABLE;
      const adapter = await navigator.gpu.requestAdapter();
      return (adapter && adapter.features && adapter.features.has('shader-f16')) ? FAST : PORTABLE;
    } catch { return PORTABLE; }
  };

  return {
    id,
    kind: 'local',
    isLoaded: () => !!engine,
    async load(onProgress) {
      if (engine)  return;
      if (loading) return loading;
      loading = (async () => {
        const model = pinned || await pickModel();
        const mod = await import(/* @vite-ignore */ WEBLLM_URL);
        engine = await mod.CreateMLCEngine(model, {
          initProgressCallback: (p) =>
            onProgress?.({ phase: p.text || 'loading', pct: p.progress ?? 0 }),
        });
      })();
      return loading;
    },
    async phrase(messages, opts = {}) {
      if (!engine) throw new Error(`${id}: not loaded`);
      // CANCELLATION (the Stop button): an optional AbortSignal lets the caller halt
      // generation. Already aborted before we start ⇒ draw nothing. Mid-stream we ask
      // the engine to interruptGenerate() and return whatever decoded so far, so the
      // user keeps the partial answer rather than losing the whole beat.
      const signal = opts.signal || null;
      if (signal?.aborted) return '';
      const params = {
        messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens:  opts.maxTokens ?? 256,
      };
      // The streaming capability (model/stream.js §): when the turn hands an
      // `onToken`, drive web-llm's streaming completion and emit each delta as it
      // decodes, so the answer fills in live. The accumulated text is returned
      // exactly as the non-streaming call would — byte-identical to before when no
      // callback is handed.
      const onToken = typeof opts.onToken === 'function' ? opts.onToken : null;
      if (onToken) {
        // Halt the in-flight decode the moment the caller aborts — web-llm ends the
        // streaming iterator on interruptGenerate().
        const onAbort = () => { try { engine.interruptGenerate(); } catch { /* engine gone — the break below still stops us */ } };
        if (signal) signal.addEventListener('abort', onAbort, { once: true });
        try {
          const chunks = await engine.chat.completions.create({ ...params, stream: true });
          let text = '';
          for await (const chunk of chunks) {
            const piece = chunk.choices?.[0]?.delta?.content || '';
            if (piece) { text += piece; onToken(piece); }
            if (signal?.aborted) break;
          }
          if (signal?.aborted) return text.trim();   // user stopped — keep the partial answer
          if (text.trim()) return text.trim();
        } catch { /* a streaming hiccup degrades to the plain draw below — the answer still lands */ }
        finally { if (signal) signal.removeEventListener('abort', onAbort); }
      }
      if (signal?.aborted) return '';
      const out = await engine.chat.completions.create(params);
      return out.choices?.[0]?.message?.content?.trim() || '';
    },
  };
};

registerBackend('webllm', makeWebllmBackend());

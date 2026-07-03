// webllm backend — WebGPU, Llama-3.2-3B default.
//
// Heavier than wllama; loads only when explicitly chosen. Same shape
// as the other backends; the rest of the system does not know which is in use.

import { registerBackend } from './interface.js';
import { createLensStack } from '../write/lens-port.js';

const WEBLLM_URL = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2/+esm';
// The tokenizer the bridge needs (spec "Tokenizer access — RESOLVED"): the SAME library
// web-llm's own asyncLoadTokenizer uses, fed the SAME tokenizer.json, so our token ids are
// byte-identical to the engine's by construction — no reliance on undocumented internals.
const WEB_TOKENIZERS_URL = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-tokenizers@0.1/+esm';

// The backend is a parameterised builder so a coding-model variant (model/coders.js)
// can bind a different MLC artifact under its own id WITHOUT duplicating the engine,
// tokenizer, and lens-port wiring below. `webllm` itself is just the builder with the
// Llama-3.2-3B default; a coder passes { id, model } and reuses every line of this path.
export const makeWebllmBackend = (defaults = {}) => (opts = {}) => {
  const id    = defaults.id || 'webllm';
  const model = opts.model || defaults.model || 'Llama-3.2-3B-Instruct-q4f32_1-MLC';
  let engine  = null;
  let loading = null;
  let tokenizer = null;     // the injected seam { encode, decode } | null when unavailable
  let stack = null;         // the registered LogitProcessor (the lens port) | null

  // Live steering feed (the Gates surface, src/ui/gates-view.js): every logit-limit
  // event the lens port fires — a void-gate suppression, a masked-name void-conflict, a
  // span-gated re-grounding, the per-completion reset — forwarded to any UI subscriber as
  // it happens, so the limits on the logits can be watched in real time during decode.
  // Independent of drainEvents() (which the audit uses per turn); best-effort, never a
  // decode is sunk. Empty listener set → the closure is a no-op, so the golden path is
  // byte-identical whether or not a surface is listening.
  const lensListeners = new Set();
  const emitLensEvent = (ev) => {
    for (const fn of lensListeners) { try { fn(ev); } catch { /* best-effort */ } }
  };

  // Mirror web-llm's asyncLoadTokenizer: fetch tokenizer.json from the model artifact and
  // build a Tokenizer with @mlc-ai/web-tokenizers. Best-effort — a failure simply leaves the
  // lens port unavailable (the golden path is untouched), never a dead load.
  const loadTokenizer = async () => {
    try {
      const { Tokenizer } = await import(/* @vite-ignore */ WEB_TOKENIZERS_URL);
      const url = opts.tokenizerUrl || `https://huggingface.co/mlc-ai/${model}/resolve/main/tokenizer.json`;
      const buf = await (await fetch(url)).arrayBuffer();
      const tk = await Tokenizer.fromJSON(buf);
      return {
        encode: (text) => Array.from(tk.encode(String(text ?? ''))),
        decode: (ids) => tk.decode(Int32Array.from(Array.isArray(ids) ? ids : [ids])),
      };
    } catch { return null; }
  };

  return {
    id,
    kind: 'local',
    isLoaded: () => !!engine,
    // The optional bridge capability (parallels `propose`): the turn builds the concept→token
    // map with this; a backend without it leaves the lens port a no-op.
    getTokenizer: () => tokenizer,
    // Drain/inspect the steering provenance the stack accumulated this turn (Given-Log).
    lensEvents: () => (stack ? stack.drainEvents() : []),
    lensAudit:  () => (stack ? stack.audit() : null),
    lensRules:  () => (stack ? stack.rules : null),
    // Track F (the EVA loop): the span-gated re-grounding decision, the re-grounded surfaces the
    // next turn folds back into the bridge, and the staleness decay on a Horizon re-ground.
    lensApproved: () => (stack ? stack.approvedSurfaces() : []),
    lensRecGate:  (surface, sources) => (stack ? stack.recGate(surface, sources) : null),
    lensDecay:    (info) => stack?.decay(info),
    // Subscribe to the live steering feed (the Gates surface): `fn` is called with each
    // logit-limit event as the lens port fires it during decode. Returns an unsubscribe.
    // Present only on a backend with a lens port; the UI feature-detects it.
    onLensEvent:  (fn) => { lensListeners.add(fn); return () => lensListeners.delete(fn); },
    async load(onProgress) {
      if (engine)  return;
      if (loading) return loading;
      loading = (async () => {
        const mod = await import(/* @vite-ignore */ WEBLLM_URL);
        tokenizer = await loadTokenizer();
        // The lens port: a LogitProcessor registered ONLY on the in-thread MLCEngine
        // (logitProcessorRegistry is ignored for the web-worker engine — hence in-thread).
        const engineCfg = {
          initProgressCallback: (p) =>
            onProgress?.({ phase: p.text || 'loading', pct: p.progress ?? 0 }),
        };
        if (tokenizer) {
          stack = createLensStack({ tokenizer, logSink: emitLensEvent });
          engineCfg.logitProcessorRegistry = new Map([[model, stack]]);
        }
        engine = await mod.CreateMLCEngine(model, engineCfg);
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
      // Arm or disarm the lens port for this generation. When the turn hands a `lens` config
      // (lensPort on, doc+surf in hand) the stack steers; otherwise it is the identity, so the
      // golden phrase()+veto path is byte-identical. web-llm calls resetState per completion.
      if (stack) stack.configure(opts.lens ? { ...opts.lens, enabled: true } : { enabled: false });
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

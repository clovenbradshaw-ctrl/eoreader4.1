// Chat models for the reader — the backends the chat surface can pick.
// echo (instant, offline), webllm (Llama-3.2-3B over WebGPU, the old default),
// and the Pleias family (Pico / RAG-1B, source-grounded talkers trained only on
// the public-domain Common Corpus, loaded as GGUF through wllama). Each registers
// on import; none pulls anything from a CDN until load() runs. The reader stays
// LLM-free for reading and the grounded panel — a model is only loaded when you
// actually chat, and chat falls back to a structural answer if none is available.
export { createModel } from '../model/interface.js';
export { streamPhrase } from '../model/stream.js';
export { buildChatMessages, buildGroundedMessages, shapeForScope, LIBRARIAN_CUE, GROUNDING_CUE, CAPABILITY_CUE } from '../model/prompt.js';
export { CODER_MODELS, browserCoders } from '../model/coders.js';
import '../model/echo.js';
import '../model/webllm.js';
import '../model/pleias.js';
// The local coding models (Qwen2.5-Coder family). Browser-runnable members register
// here; each loads only when picked, like every other backend.
import '../model/coders.js';

// EO: INS·SEG·SYN(Field → Entity, Making,Dissecting) — Pleias RAG backends
// Pleias backends — the ethical, source-grounded talkers.
//
// WHY Pleias. Every other small talker in this project is trained on web crawl;
// Pleias is trained exclusively on the Common Corpus — public-domain and
// permissively licensed text, no CommonCrawl, fully auditable. That is the only
// family in this size class created by means we can stand behind. And the RAG
// variants are trained to do exactly what this app's whole discipline demands:
// quote their sources and ground every claim. A model trained to cite is a
// better fit for a system whose rule is "no figure at a void" than a general
// chat model we then have to fence in.
//
// HOW they load. Identically to the wllama SmolLM2 backend: a GGUF fetched by
// URL through the same WASM runtime (`loadWllamaModel`). The only thing that
// differs from wllama is the prompt template — Pleias does not speak ChatML, it
// speaks a structured RAG format with special tokens for the query and each
// source. We rebuild that structure from the grounded prompt the turn already
// assembled, then strip Pleias's scaffolding back off on the way out so the
// binder (turn/stages.js `bind`) receives clean prose, exactly as it does from
// every other backend. The talker still never emits a citation token the user
// sees — the source ids live inside Pleias's own framing and never escape.
//
// Two members, both loading the same way (and both cached to OPFS on first use):
//   pleias-pico  · Pleias-Pico (353M)   · 709 MB bf16 GGUF   · the light default
//   pleias-rag   · Pleias-RAG-1B (1.2B) · 744 MB Q4_K_M GGUF · the larger grounder
//
// Why Q4_K_M for the RAG member. wllama reads each GGUF into a single ArrayBuffer
// (max 2^31-1 bytes), so the official 2.39 GB bf16 Pleias-RAG-1B cannot load in
// the browser at all — it fails as a bare "network error". The Q4_K_M build is
// the same 1.2B RAG-trained model with every parameter intact, quantised to 4-bit
// so it fits under the ceiling. For full bf16 precision, split the official file
// into sub-2GB shards and host them (docs/large-models.md); wllama then fetches,
// caches and assembles a sharded model transparently.
//
// Sources:
//   https://huggingface.co/PleIAs/Pleias-Pico-GGUF
//   https://huggingface.co/PleIAs/Pleias-RAG-1B-gguf             (official bf16, >2GB)
//   https://huggingface.co/brendanddev/Pleias-RAG-1B-Q4_K_M-GGUF (the 4-bit build we load)
//   https://github.com/Pleias/Pleias-RAG-Library

import { registerBackend } from './interface.js';
import { loadWllamaModel } from './wllama.js';
import { EXCERPTS_HEADER } from './prompt.js';

const PICO_GGUF =
  'https://huggingface.co/PleIAs/Pleias-Pico-GGUF/resolve/main/pleias_pico_bf16.gguf';
// The 744 MB Q4_K_M build — the full 1.2B model, under wllama's 2GB ceiling. The
// official 2.39 GB bf16 file can't load single-file; see docs/large-models.md to
// run it at full precision via shards (then point this at the first shard).
const RAG_GGUF =
  'https://huggingface.co/brendanddev/Pleias-RAG-1B-Q4_K_M-GGUF/resolve/main/Pleias-RAG-1B-Q4_K_M.gguf';

// ---------------------------------------------------------------------------
// Rebuilding Pleias's structured input from the grounded prompt.
//
// `buildGroundedMessages` hands the talker a system message and one user
// message whose blocks are joined by blank lines. We need two things back out:
// the user's question and the verbatim excerpts. We read them by their stable
// markers ("User: " and the excerpts header) rather than by position, so a turn
// with no notes / no conversation history still parses cleanly.

const blockAfter = (text, marker) => {
  const at = text.indexOf(marker);
  if (at < 0) return '';
  const rest = text.slice(at + marker.length);
  const end = rest.indexOf('\n\n');          // blocks are separated by a blank line
  return (end < 0 ? rest : rest.slice(0, end)).trim();
};

export const extractGroundedInput = (messages) => {
  const user = [...messages].reverse().find(m => m.role === 'user');
  const content = user?.content || '';

  // The question: the subjective frame wraps it as "...\nThey asked you: <question>"
  // (model/prompt.js §1); the no-doc chat path passes the bare question as the whole
  // user message. The legacy "\nUser: " marker is still tried for back-compatibility.
  let query = blockAfter(content, '\nThey asked you: ')
           || blockAfter(content, '\nUser: ');
  if (!query) query = content.trim();

  // The sources: the verbatim lines under the "What you read:" header, one per line.
  const excerpts = blockAfter(content, `${EXCERPTS_HEADER}\n`);
  const sources = excerpts
    ? excerpts.split('\n').map(s => s.trim()).filter(Boolean)
    : [];

  return { query, sources };
};

// A stable 16-hex-char id for a source, as Pleias expects ("standardized hashes
// of 16 characters"). Deterministic so the same span gets the same id — FNV-1a
// run twice over the text to fill 64 bits.
export const sourceId = (text) => {
  let h1 = 2166136261 >>> 0, h2 = 0x811c9dc5 >>> 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 16777619) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 16);
};

// Pleias-Pico schema (preview generation): query, then each source wrapped in
// <|source_start|> with a hashed id, then <|source_analysis_start|> to begin
// generation. Matches the literal example on the Pleias-Pico model card.
export const buildPicoPrompt = ({ query, sources }) => {
  const blocks = [`<|query_start|>${query}<|query_end|>`];
  for (const text of sources) {
    blocks.push(
      `<|source_start|><|source_id_start|>${sourceId(text)}<|source_id_end|>${text}<|source_end|>`,
    );
  }
  blocks.push('<|source_analysis_start|>');
  return blocks.join('\n');
};

// Pleias-RAG-1B schema (current generation): query, then each source with a
// numbered <|source_id|>, then <|language_start|> to begin the reasoning
// pipeline (language → query/source analysis → draft → answer). Matches the
// Pleias-RAG-Library input format.
export const buildRagPrompt = ({ query, sources }) => {
  const blocks = [`<|query_start|>${query}<|query_end|>`];
  sources.forEach((text, i) => {
    blocks.push(`<|source_start|><|source_id|>${i + 1} ${text}<|source_end|>`);
  });
  blocks.push('<|language_start|>');
  return blocks.join('\n');
};

// ---------------------------------------------------------------------------
// Stripping Pleias's scaffolding back off, so the binder gets clean prose.

// Pleias cites natively as <ref name="...">cited text</ref>. The binder
// re-attaches citations mechanically against the spans, so we keep the cited
// text and drop the tag — the same prose any other backend would have produced.
export const stripRefs = (text) =>
  text
    .replace(/<ref\b[^>]*>([\s\S]*?)<\/ref>/g, '$1')   // keep inner text, drop the tag
    .replace(/<\/?ref\b[^>]*>/g, '');                  // any stray, unbalanced ref tag

// Pull the final answer out of a Pleias completion. The model emits a reasoning
// pipeline before the answer; we want only the <|answer_start|>…<|answer_end|>
// span. We fall back to the draft, then to the whole completion stripped of
// every special token, so a truncated or unexpected completion still yields the
// best prose available rather than nothing.
export const extractPleiasAnswer = (raw) => {
  const text = String(raw || '');

  const between = (startTok, endTok) => {
    const at = text.indexOf(startTok);
    if (at < 0) return null;
    const from = at + startTok.length;
    const end = text.indexOf(endTok, from);
    return text.slice(from, end < 0 ? undefined : end);
  };

  let body =
    between('<|answer_start|>', '<|answer_end|>') ??
    between('<|draft_start|>',  '<|draft_end|>')  ??
    text;

  return stripRefs(body)
    .replace(/<\|[^|]*\|>/g, '')   // drop any remaining special tokens
    .replace(/\s+\n/g, '\n')
    .trim();
};

// ---------------------------------------------------------------------------
// The backends. Both load through `loadWllamaModel` — the same runtime, the
// same loadModelFromUrl, the same progress shape as the wllama backend.

const makePleias = ({ id, modelUrl, buildPrompt, minPredict }) =>
  registerBackend(id, (opts = {}) => {
    let inst = null;
    let loading = null;
    const url = opts.modelUrl || modelUrl;

    return {
      id,
      kind: 'local',
      isLoaded: () => !!inst,
      async load(onProgress) {
        if (inst)    return;
        if (loading) return loading;
        loading = loadWllamaModel(url, onProgress).then((i) => { inst = i; });
        return loading;
      },
      async phrase(messages, opts = {}) {
        if (!inst) throw new Error(`${id}: not loaded`);
        const prompt = buildPrompt(extractGroundedInput(messages));
        // The reasoning pipeline spends tokens before the answer, so give Pleias
        // a floor under the task's max_tokens — otherwise the budget can run out
        // mid-reasoning and never reach <|answer_start|>. A caller doing a SHORT
        // utility generation (a search query, a one-line prediction) passes
        // opts.minPredict: 0 to opt out of the floor and stay fast — otherwise every
        // such call pads to 384 tokens of CPU/WASM decode (~80s) for a few words.
        const nPredict = Math.max(opts.maxTokens ?? 384, opts.minPredict ?? minPredict);
        const out = await inst.createCompletion(prompt, {
          nPredict,
          sampling: { temp: opts.temperature ?? 0.3 },
        });
        return extractPleiasAnswer(out);
      },
    };
  });

makePleias({ id: 'pleias-pico', modelUrl: PICO_GGUF, buildPrompt: buildPicoPrompt, minPredict: 384 });
makePleias({ id: 'pleias-rag',  modelUrl: RAG_GGUF,  buildPrompt: buildRagPrompt,  minPredict: 768 });

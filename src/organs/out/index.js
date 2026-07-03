// organs/out — the OUTPUT membrane (reshape §3, docs/omnimodal-task-language.md).
//
// The mirror of organs/in. An input organ RAISES a modality onto the modality-neutral
// spine (source → doc); an output organ LOWERS a task directive onto a modality (a task
// leaf → a native atom). The interior between them — the core, the cube, the task graph
// — is modality-blind, so the same `createTaskSpec`/`runTaskGraph` plan and run an essay
// or a melody, differing only in which renderer the leaves dispatch to.
//
// An organ has TWO halves, split so planning needs no model:
//
//   descriptor  PURE, plan-time: { id, unit, ceiling, minBudget, contextUnit, contextOf }.
//               The creator reads it to turn a section's abstract share into a budget in
//               the organ's NATIVE UNIT, and the budget drives the Figure/Pattern split
//               off the organ's own `ceiling` (a paragraph for text, a phrase for music).
//   render      run-time: render(view) → { output, sources }. Built from a caller-injected
//               generator (the model call), so this membrane never imports a model — the
//               same discipline the runner keeps. Bare renderers; the judging stays in the
//               modality-blind enactor (cf. organs/out/speech).
//
// New output modalities (image → regions, video → frames) are new files exporting the
// same two halves onto the same registry. The task language does not change.

import { textOrgan, renderText } from './text.js';
import { musicOrgan, renderMusic } from './music.js';

// The plan-time registry: id → descriptor. `organFor` defaults to text, so an untagged
// leaf behaves exactly as it did before output organs existed (non-breaking).
export const OUTPUT_ORGANS = Object.freeze({
  text: textOrgan,
  music: musicOrgan,
});

export const organFor = (id) => OUTPUT_ORGANS[id] || OUTPUT_ORGANS.text;

// The render factory per organ — id → (generate) => render(view). A caller wires the
// generators it has (a model for text, a music engine for music); `createOutputRegistry`
// turns a map of generators into a map of renderers the task runner dispatches on.
const RENDER_FACTORIES = Object.freeze({
  text: renderText,
  music: renderMusic,
});

// createOutputRegistry({ text: gen, music: gen }) → { text: render, music: render }.
// Only the organs a generator was supplied for are built; the rest are absent and the
// dispatch falls back to text. A bare function (not a map) is taken as the text generator,
// so `createOutputRegistry(modelGenerate)` is the one-modality shorthand.
export const createOutputRegistry = (generators = {}) => {
  const gens = typeof generators === 'function' ? { text: generators } : (generators || {});
  const registry = {};
  for (const [id, gen] of Object.entries(gens)) {
    const factory = RENDER_FACTORIES[id];
    if (factory && typeof gen === 'function') registry[id] = factory(gen);
  }
  return registry;
};

export { textOrgan, renderText } from './text.js';
export { musicOrgan, renderMusic } from './music.js';

// The archival publish family — doc/claim → a self-verifying artifact. Not task-leaf
// renderers (they carry no descriptor/ceiling), so they stay off OUTPUT_ORGANS and are
// re-exported as their own namespace. Each is pure; the renderer is injected.
export * as publish from './publish/index.js';

// The ESSAY organ — a commission → a whole arc-walked, ≥2500-word piece. Not a task-leaf
// renderer either (it walks MANY talker passes rather than lowering one leaf), so like the
// publish family it stays off OUTPUT_ORGANS and is re-exported as its own namespace. The
// talker is injected; the walk is pure orchestration (organs/out/essay.js).
export * as essay from './essay.js';

// The essay TYPES — templates that LEARN (organs/out/essay-types.js): each type couples a
// shipped voice cue + seed arc with a per-type profile folded from every completed essay,
// steering the next one. Pure fold/steer/serialize; the surface owns persistence.
export * as essayTypes from './essay-types.js';

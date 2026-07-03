// eo-gen — the generation pipeline, exposed to the chat app (browser).
//
// The shipped reader answers an "essay" ask with a capped grounded blurb (answerQuestion →
// three sentences). This wires src/longgen into the app so an essay ask instead WALKS THE
// ARC — open, develop, turn, land — over a rich ground: self-register (edge ops on the self),
// the field read (turns), decision-as-relaxation (the cadence emerges), NUL (hold uncohered
// ground honestly), and the audit. It is a thin adapter: the app builds a ground and hands its
// own talker; this runs runContinuation and returns the joined prose plus the audit.
//
// Loaded as a module by index.html; sets window.eoGen. The app checks for it and routes essay
// intents through eoGen.essay when the setting is on (default on), else keeps its old path.

import { runContinuation, exportAudit } from '../longgen/index.js';
import { composeEssay, composeEssayGrounded, ESSAY_MIN_WORDS } from '../organs/out/essay.js';
import * as essayTypes from '../organs/out/essay-types.js';
import { streamPhrase } from '../model/stream.js';
import { bindCitations, CONTACT_FLOOR } from '../ground/bind.js';
import { reflectAnswer } from '../ground/reflect.js';
import { walkComposition, sentenceRenderer } from '../write/composition.js';
import { parseText } from '../perceiver/parse/pipeline.js';
import { surfFold } from '../surfer/index.js';

// THE ESSAY SPAN-BINDER — the same cite-or-veto grounding normal chat uses (ground/bind.js),
// adapted to the essay organ's bind(text, spans) → { kept, struck, boundFraction } contract.
// composeEssay walks free prose; when the app gathered research it injects this so each section
// is bound to the REAL sources. bindCitations splits the section into claims and cites each
// against the spans (no doc → pure lexical, idf flat). A claim that cites nothing AND makes no
// lexical contact with any span (score ≤ CONTACT_FLOOR) is prose from nowhere — a fabricated fact
// or invented mechanism — so it is STRUCK. A cited claim, or one that at least contacts a span
// (a paraphrase the lexical binder can't pin to one sentence), RIDES. boundFraction is the cited
// share — the honest number behind the "grounded in N sources" banner. This is the check that
// catches fake FACTS, which the surface veto (fake scholarship) cannot.
const essayBinder = (draft, spans = []) => {
  const text = String(draft || '');
  const bound = bindCitations(text, Array.isArray(spans) ? spans : []);
  if (!bound.length) return { kept: text, struck: [], boundFraction: 1 };
  const kept = [];
  const struck = [];
  for (const b of bound) {
    if (!b.citation && (b.score || 0) <= CONTACT_FLOOR) struck.push(b.claim);
    else kept.push(b.claim);
  }
  const cited = bound.filter((b) => b.citation).length;
  return { kept: kept.join(' '), struck, boundFraction: cited / bound.length };
};

// Build the pipeline ground from the app's scored spans. Each span is {text, score, i, u};
// runContinuation wants {idx, score, text} ranked. Keep the source url on the side so the
// answer can still cite. A rich ground (many spans) is what lets the arc actually develop.
const toGround = (spans = []) => spans
  .filter((s) => s && s.text)
  .map((s, k) => ({ idx: s.i ?? k, score: Number.isFinite(s.score) ? s.score : 1, text: String(s.text), u: s.u }));

// Compose an essay over the ground with the app's talker. `embed` (the app's MiniLM organ)
// turns on the semantic field read when provided. Returns { text, audit, stop, moves, sources }.
const essay = async ({ spans = [], model, embed = null, question = '', signal = null } = {}) => {
  const ground = toGround(spans);
  const cfg = {
    arc: true, temperature: 1, maxSteps: 40,
    selfRegister: true, dynamics: true, confine: true, nul: true,
    fieldRead: !!embed, embed: embed || undefined,
  };
  const res = await runContinuation({ ground, model, question, signal, ...cfg });
  const audit = exportAudit(res, { config: { ...cfg, embed: !!embed }, question, label: 'app-essay' });
  // The atoms, joined as prose. NUL / refusal returns its single honest atom.
  const text = res.units.map((u) => u.text).filter(Boolean).join(' ');
  // The source urls the cited spans came from (by idx → span.u).
  const byIdx = new Map(ground.map((g) => [g.idx, g.u]));
  const sources = [...new Set(res.sources.map((i) => byIdx.get(i)).filter(Boolean))];
  return { text, audit, stop: res.stop, moves: res.units.map((u) => u.move), sources, units: res.units };
};

// ── THE COMPOSITION WALK — the omnimodal path (write/composition.js) ──
//
// The plan is read off the surfer's own physics, not authored: the gathered ground is folded
// into a doc, the surfer arrests where that reading was rewritten, and each arrest is one
// BEAT. A cursor walks beat by beat — identity collapsed at the cursor, the renderer handed
// surface-only (one resolved relation + its grounded spans + the running tail + the arc
// context with each turn's weight), the fold advanced, the witness binding back, the
// connective leash checking every surface against the arc. `renderer` swaps the modality
// (default: the sentence renderer over the app's talker); the walk stays. Returns null when
// nothing resolves — the caller falls back to the flat paths, non-breaking by construction.
const composeGrounded = async ({ doc = null, text = '', spans = null, model = null, renderer = null,
  focus = [], anchor = 0, alpha, onToken = null, onBeat = null, signal = null } = {}) => {
  let d = doc;
  if (!d) {
    const body = String(text || (Array.isArray(spans) ? spans.map((s) => s && s.text).filter(Boolean).join(' ') : '')).trim();
    if (!body) return null;
    try { d = parseText(body, { docId: 'compose' }); } catch { return null; }
  }
  const r = renderer || (model ? sentenceRenderer({ model, onToken, signal }) : null);
  if (!r) return null;
  let surf;
  try { surf = surfFold(d, anchor, alpha != null ? { alpha } : {}); } catch { return null; }
  const out = await walkComposition({ doc: d, surf, renderer: r, focus, alpha, signal, onBeat });
  return out ? { ...out, surf } : null;
};

// ── THE ESSAY ORGAN, for the reader's chat (organs/out/essay.js + essay-types.js) ──
//
// Distinct from `essay` above (the longgen arc over a READING ground): this is the
// commission-driven organ — plan an outline, walk section after section until the piece
// clears the ≥2500-word floor, land on a conclusion — steered by a learned essay TYPE
// (cue + plan hints + word target, essay-types.steerFrom). The app hands its chat model;
// the talker is streamPhrase over it, so hooks.onToken streams live. The app owns the
// type profiles (persistence) and the thinking-trail beats; this is the pure walk.
// `ground` (optional) is the research the app gathered before commissioning the essay — excerpts
// from the web walk it ran and/or the reading already in scope. Passed through to composeEssay so
// the plan and every section are written grounded in real sources instead of the model's thin prior.
const essayCompose = ({ model, topic, signal = null, cue = null, planHints = null, targetPerSection = undefined, ground = null, hooks = {} } = {}) =>
  composeEssay({
    topic,
    talker: (messages, opts) => streamPhrase(model, messages, opts),
    signal, cue, planHints,
    ...(targetPerSection ? { targetPerSection } : {}),
    ...(ground ? { ground, bind: essayBinder } : {}),
    hooks,
  });

// THE GROUNDED WALK (organs/out/essay.js composeEssayGrounded): the essay routed through
// the reading's own physics — plan read off the surfer's arrests over the app's merged
// log-doc, one beat per arrest, the witness and the connective leash after every beat,
// the talker at the very end. The witness's claim-grounder at THIS register is the same
// cite-or-contact rule the flat path's binder trusts (bindCitations + CONTACT_FLOOR):
// the strict verbatim-overlap default suits an answer's quoted beats, not an essay's
// own-words paragraphs — holding essays to it would retract nearly every faithful
// sentence. Returns null when no plan resolves; the app falls back to essayCompose.
// The memo is keyed on the anchors array AND its length: the walk's anchor set is one
// growing array (cumulative across beats), so identity alone would serve a stale shape.
const _essaySpanShape = new WeakMap();   // anchors array → { len, spans } at last mapping
const groundedClaimAtEssay = (claim, anchors) => {
  let m = anchors && _essaySpanShape.get(anchors);
  if (!m || m.len !== anchors.length) {
    m = { len: anchors ? anchors.length : 0, spans: (anchors || []).map((s) => ({ text: s.text ?? s, idx: s.idx })) };
    if (anchors) _essaySpanShape.set(anchors, m);
  }
  const bound = bindCitations(String(claim || ''), m.spans);
  if (!bound.length) return true;
  return bound.some((b) => b.citation || (b.score || 0) > CONTACT_FLOOR);
};

// The walk is ANCHORED where retrieval set the reading down (the top ground span) and its
// reach is bounded to the ground's own region — capped hard, because the surf pays a full
// perceiver read per cursor and ground spans are score-ranked across the whole merged
// corpus (an uncapped min..max window would be the corpus). The caps are the walk's cost
// ceiling, not a quality knob.
const REACH_BEHIND_CAP = 24;
const REACH_AHEAD_CAP = 72;
const reachFromGround = (ground = []) => {
  const idxs = ground.map((s) => s && s.i).filter(Number.isFinite);
  if (!idxs.length) return { anchor: 0, reach: null };
  const anchor = idxs[0];                                  // the top-ranked span — retrieval's choice
  const lo = Math.min(...idxs), hi = Math.max(...idxs);
  return {
    anchor,
    reach: {
      behind: Math.min(REACH_BEHIND_CAP, Math.max(8, anchor - lo)),
      ahead: Math.min(REACH_AHEAD_CAP, Math.max(24, hi - anchor)),
    },
  };
};

const essayComposeGrounded = ({ model, doc, topic, ground = null, signal = null, hooks = {}, ...rest } = {}) => {
  const { anchor, reach } = reachFromGround(ground || []);
  return composeEssayGrounded({
    doc, topic, anchor, reach,
    talker: (messages, opts) => streamPhrase(model, messages, opts),
    signal, hooks,
    witnessOpts: { grounded: groundedClaimAtEssay },
    ...rest,
  });
};

if (typeof window !== 'undefined') {
  // reflectAnswer (ground/reflect.js): parse a settled answer BACK into EOT, compare each
  // proposition with the reading's graph, judge every claim by the diversity of the sources
  // that witness it. The app calls this after each grounded turn (docs/creative-grounded-modes.md).
  window.eoGen = { essay, toGround, essayCompose, essayComposeGrounded, essayBinder, essayTypes, ESSAY_MIN_WORDS, reflectAnswer,
    composeGrounded, walkComposition, sentenceRenderer, version: 5 };
  window.dispatchEvent(new Event('eogen-ready'));
}

export { essay, toGround, essayCompose, essayComposeGrounded, essayBinder, essayTypes, ESSAY_MIN_WORDS, reflectAnswer,
  composeGrounded, walkComposition, sentenceRenderer };

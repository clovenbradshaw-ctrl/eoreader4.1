// conversation-fold.js — the Conversation Fold: a pure projection over the
// conversation event log (a chat's turns), sibling to projectGraph. It carries
// the STANCE forward so a turn inherits what it's doing instead of re-deciding
// it from the bare string. This is README principle 2 — the high sets the
// probabilities for the low — made concrete for the conversation dimension.
//
// The diagnosis (see docs/conversation-fold.md): the router keeps asking "what
// KIND is this input?" (compose-shaped or retrieval-shaped) and assumes the kind
// is a property of the string. It isn't — "write me one" has no intrinsic kind;
// its kind is inherited from the thread. So continuation is the DEFAULT, a
// transition is the only thing that ever needs detecting, and the absence of a
// detected transition means continue.
//
// A turn resolves to three independent axes the fold keeps separate:
//   stance  compose | ground        — continuation-default, overridden on a switch
//   scope   isolated | everything | specific(pins) — explicit markers (#283 seed)
//   warm    CON-reachable refs, by turn-distance decay — the fold's emergent reach
//
// This module owns stance + warm (the fold); scope lives in the app's answerScope,
// which unions `warm` on top of its explicit base.

// The compose grammar, kept in sync with app.dc.js's _CV()/_CK(). A creative
// KIND (poem, story, song…) plus a compose VERB is an explicit compose marker;
// the KIND phrase alone names what a bare "write me one" is continuing.
export const COMPOSE_VERBS =
  'write|compose|draft|create|pen|author|generate|make(?:\\s+me|\\s+up)?|come\\s+up\\s+with|give\\s+me|tell\\s+me';
export const COMPOSE_KINDS =
  'poems?|poetry|sonnets?|haikus?|limericks?|ballads?|odes?|verses?|villanelles?|couplets?|elegy|elegies|' +
  'epigrams?|hymns?|psalms?|songs?|lyrics?|jingles?|raps?|stories|story|tales?|fables?|fairy[\\s-]?tales?|' +
  'myths?|legends?|anecdotes?|jokes?|riddles?|dialogues?|monologues?|screenplays?|scripts?|plays?|skits?|rhymes?';

const VERB_RE = new RegExp('\\b(?:' + COMPOSE_VERBS + ')\\b', 'i');
const KIND_RE = new RegExp('\\b(?:' + COMPOSE_KINDS + ')\\b', 'i');

// An EXPLICIT compose request: a compose verb AND a creative kind ("write a
// haiku about the sea"). Mirrors app.dc.js _composeIntent — a marker that sets
// stance directly, so a question never trips it. This is the fresh-turn regex
// seed of §5: it fires to seed a stance, never to enumerate the kind of an
// anaphor (continuation covers anaphora without it).
export function isExplicitCompose(text) {
  const s = String(text || '');
  return VERB_RE.test(s) && KIND_RE.test(s);
}

// A model-free SWITCH-OUT seed (§5 fresh-regex-seed, §11). Continuation-by-default
// inherits a `compose` stance, but a clearly SELF-CONTAINED question — a wh-opener or a
// trailing '?' with no back-reference to the piece being made — is a fresh turn, not an
// anaphoric compose follow-up. It is the cold-path seed for the ONE switch direction the
// warm detector (rung 4) will own: "what is 237 * 637?" / "who wrote Hamlet?" must leave a
// composing thread, not be answered as another poem. Deliberately NARROW so it never fights
// continuation: anything with an anaphor (it/this/one/another/shorter…) or no question shape
// stays a continuation. Only ever clears a `compose` baseline — a ground stance is untouched.
export function switchesFromCompose(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  if (isExplicitCompose(s)) return false;   // an explicit make-request stays compose
  const wh = /^(?:what|whats|what's|who|who's|whos|why|how|when|where|which|whose|whom)\b/i.test(s);
  const endsQ = /\?\s*$/.test(s);
  if (!wh && !endsQ) return false;          // not question-shaped → continue composing
  // A back-reference to the piece keeps it a compose refinement ("what if it were shorter?",
  // "can you make this about the sea?") — anaphora, not a fresh subject.
  const backRef = /\b(?:it|its|it's|this|that|those|them|they|one|another|again|more|shorter|longer|instead|version|the\s+(?:poem|story|piece|song|essay|draft|version))\b/i.test(s);
  return !backRef;
}

// The KIND phrase for a compose request, kept whole ("emily dickinson poem",
// "haiku"), length/style words peeled. Mirrors app.dc.js _composeKind. Returns
// '' when no kind is named (a bare "write me one") so the caller can fall back
// to the fold's carried focus.kind.
export function composeKind(text) {
  const m = String(text || '').match(new RegExp(
    '\\b(?:' + COMPOSE_VERBS + ')\\s+(?:me\\s+|us\\s+)?(?:an?|another|one|some|the)?\\s*' +
    '([^.?!,;]*?\\b(?:' + COMPOSE_KINDS + '))\\b', 'i'));
  if (!m) return '';
  let k = m[1].trim();
  k = k.replace(/^\s*(?:(?:\d+|one|two|three|four|five|several|a\s+few)[-\s]?(?:word|line|stanza|verse)s?\s+)+/i, '').trim();
  k = k.replace(/^\s*(?:short|long|longer|brief|quick|little|simple|original|creative|nice|good|beautiful|funny|sad|happy|silly)\s+/i, '').trim();
  return k;
}

// The running SUBJECT slot: the noun phrase after "about / on / regarding …".
// Naive by design (§12: "the NP after about"); the warm model can refine later.
// "now one about the city" → "the city". Returns '' when no subject is named,
// so the fold carries the prior subject forward instead of clobbering it.
export function composeSubject(text) {
  const m = String(text || '').match(
    /\b(?:about|on|regarding|concerning|describing|inspired\s+by|in\s+the\s+style\s+of)\s+(.+)$/i);
  if (!m) return '';
  return m[1].replace(/[?.!]+$/, '').trim();
}

// A human phrase for the router prompt (§6) and the compose label.
export function stanceDescOf(fold) {
  if (!fold || !fold.stance) return 'an isolated assistant chat';
  if (fold.stance === 'compose') {
    const k = (fold.focus && fold.focus.kind) || 'piece';
    const subj = fold.focus && fold.focus.subject;
    return 'composing a ' + k + (subj ? ' about ' + subj : '');
  }
  // ground
  const n = fold.warm ? fold.warm.length : 0;
  if (n === 1) return 'grounding in 1 source';
  if (n > 1) return 'grounding in ' + n + ' sources';
  return 'grounding in your reading';
}

// Decay config, serialized into the memo key so a memo is never read across a
// rules change (the projectGraph decay_gamma bug, engine.js:7052). Turn-distance
// only — no wall-clock (§4, §11): a source cools by conversational distance, not
// idle seconds, which is both purer and more correct.
export function foldRules(frame) {
  const r = (frame && (frame.foldRules || frame.rules)) || {};
  return { warmWindow: Number.isFinite(r.warmWindow) ? r.warmWindow : 3 };
}

function frameSig(frame, rules) {
  const chat = (frame && frame.chatId) || '';
  return chat + '|w=' + rules.warmWindow;
}

// A conversation "turn" for the fold's purposes is an ENACTED assistant
// resolution tagged with a stance, paired with the user message that drove it.
// pending (still-streaming) bubbles are excluded — the fold at turn N is a
// function of the N−1 settled turns (§3).
function turnsOf(events) {
  const out = [];
  let lastUser = null;
  for (const m of events || []) {
    if (!m || m.pending) continue;
    if (m.role === 'user') { lastUser = String(m.text || ''); continue; }
    if (m.role === 'asst' && m.stance) {
      out.push({
        stance: m.stance,
        user: lastUser,
        focus: m.focus || null,
        sources: Array.isArray(m.sources) ? m.sources : [],
      });
    }
  }
  return out;
}

function computeFold(events, rules) {
  const turns = turnsOf(events);
  const last = turns.length ? turns[turns.length - 1] : null;
  const stance = last ? last.stance : null;

  // focus: only meaningful for a compose stance. Walk the compose turns oldest→
  // newest so the KIND and SUBJECT each carry forward until a later turn renames
  // them — "haiku about the sea" then "now one about the city" keeps kind=haiku,
  // updates subject to "the city". A turn's own stored focus (tagged when the
  // turn enacted) wins over re-deriving from its user text.
  let focus = null;
  if (stance === 'compose') {
    let kind = 'poem', subject = null;
    for (const t of turns) {
      if (t.stance !== 'compose') continue;
      const f = t.focus || {};
      const k = f.kind || composeKind(t.user);
      if (k) kind = k;
      const s = (f.subject != null ? f.subject : composeSubject(t.user)) || '';
      if (s) subject = s;
    }
    focus = { kind, subject };
  }

  // warm: refs touched within the last `warmWindow` turns, most-recent weighted,
  // deduped keeping the strongest weight. Turn-distance decay — a hard window for
  // now (§12: "start with the simplest pure function"), a knob not an architecture.
  const warm = [];
  const seen = new Map();
  for (let i = turns.length - 1, d = 0; i >= 0; i--, d++) {
    if (d >= rules.warmWindow) break;
    const w = (rules.warmWindow - d) / rules.warmWindow;   // 1 nearest → →0 at the edge
    for (const ref of turns[i].sources) {
      if (!ref) continue;
      if (!seen.has(ref) || seen.get(ref) < w) seen.set(ref, w);
    }
  }
  for (const [ref, weight] of seen) warm.push({ ref, weight });

  const fold = { stance, focus, warm };
  fold.stanceDesc = stanceDescOf(fold);
  return fold;
}

// Memo keyed on (chatId, settled-turn count, frameSig) — safe because the
// conversation log is append-only (§4). Same key → same fold. The decay config
// is in the key, so changing warmWindow invalidates the memo (impurity guard).
const MEMO = new Map();
const MEMO_CAP = 64;

// projectFold(events, frame) → ConversationFold {stance, focus, warm, stanceDesc}.
// PURE: a function of the event sequence and the frame's decay rules only — no
// wall-clock, no ambient state (§4). Rehydrate by replaying the log.
export function projectFold(events, frame = {}) {
  const rules = foldRules(frame);
  const settled = (events || []).filter((m) => m && !m.pending);
  const key = frameSig(frame, rules) + '|n=' + settled.length;
  const hit = MEMO.get(key);
  if (hit) return hit;
  const fold = computeFold(settled, rules);
  if (MEMO.size >= MEMO_CAP) MEMO.delete(MEMO.keys().next().value);   // evict oldest
  MEMO.set(key, fold);
  return fold;
}

export function clearFoldMemo() { MEMO.clear(); }

// The §6 transition detector's verdict vocabulary.
export const VERDICTS = ['CONTINUE', 'COMPOSE', 'GROUND', 'ISOLATE'];

// routeStance(message, fold, opts) → 'compose' | 'ground' | null — the §5 routing
// algorithm as a pure function. Decision order: markers → (fresh ? regex-seed :
// continuation) → warm-model override.
//
//   opts.marker  a structural marker's resolved stance ('compose'|'ground'), if
//                the user performed a transition (new-chat, ask-this-page, slash).
//                Handled by the caller before this in practice; accepted here so
//                the router is complete.
//   opts.model   { warm:bool, transitionVerdict(message, stanceDesc)->VERDICT }.
//                Consulted ONLY when warm; can override the baseline only on a
//                clean COMPOSE/GROUND/ISOLATE. Any non-matching/empty/stalled
//                verdict degrades to the baseline (the fallback contract).
//
// Fallback contract: with the model cold or absent, routing =
//   markers → continuation → fresh-regex-seed
// — never worse than today, and it fixes anaphora WITHOUT a model.
export function routeStance(message, fold, opts = {}) {
  // 1. Structural marker — an unambiguous act, sets stance directly.
  if (opts.marker === 'compose' || opts.marker === 'ground' || opts.marker === 'isolate') {
    return opts.marker === 'isolate' ? null : opts.marker;
  }

  // 2. Baseline — continuation-by-default. Inherit the carried stance; this is
  //    the fix for "write me one" / "do it" / "now one about the sea".
  let baseline;
  if (fold && fold.stance) {
    baseline = fold.stance;
    // A self-contained question switches OUT of a compose thread — the cold-path seed for the
    // switch direction the warm detector will own at rung 4. Only clears compose; leaves ground.
    if (baseline === 'compose' && switchesFromCompose(message)) baseline = null;
  } else {
    // Fresh turn — no stance to inherit. Regex earns exactly one job: an instant
    // offline seed. An explicit compose request seeds compose; otherwise defer to
    // the app's scope-driven default (returned as null → app's ground/web path).
    baseline = isExplicitCompose(message) ? 'compose' : null;
  }

  // 3. Semantic override — only a warm model, only a clean TRANSITION overrides.
  const model = opts.model;
  if (model && model.warm && typeof model.transitionVerdict === 'function') {
    let v = '';
    try { v = String(model.transitionVerdict(message, (fold && fold.stanceDesc) || stanceDescOf(fold)) || '').trim().toUpperCase(); }
    catch (_) { v = ''; }
    if (v === 'COMPOSE') return 'compose';
    if (v === 'GROUND') return 'ground';
    if (v === 'ISOLATE') return null;
    // 'CONTINUE', empty, unparseable, stalled → fall through to the baseline.
  }

  return baseline;
}

// The §6 prompt, exposed so the app and tests share one wording.
export function transitionPrompt(message, stanceDesc) {
  return (
    'You route one chat turn. Current stance: ' + (stanceDesc || 'an isolated assistant chat') + '.\n' +
    'The user just said: "' + String(message || '') + '"\n' +
    'Answer with exactly one word:\n' +
    'CONTINUE — same activity as the current stance\n' +
    'COMPOSE  — they now want something made (poem, html, diagram, email, code…)\n' +
    'GROUND   — they now want something answered from the reading\n' +
    'ISOLATE  — a fresh, unrelated question\n' +
    'Answer:'
  );
}

// organs/out/essay-types — essay TYPE templates that LEARN.
//
// The essay organ (organs/out/essay.js) walks the arc; a TYPE steers the walk. Each type is
// a template in the sense tasks/templates.js means it — a small, inspectable description of
// how to make a thing, never code — with two halves:
//
//   SHIPPED   a voice cue (one plain sentence the plan and every section system prompt carry)
//             and a seed arc (the section moves this type opens from before it has seen
//             anything). This is the installed half — the same for everyone on day one.
//
//   LEARNED   a per-type PROFILE folded from every essay the type actually completes: which
//             section headings produced substantial prose (and how often), the running mean
//             of section length, and the recent titles. The profile steers the NEXT essay of
//             the type — its best headings ride to the planner as hints (use / adapt /
//             ignore), and the per-section word target drifts toward what the type really
//             produces. So a type is not a fixed genre: it is a template that gets better at
//             being itself the more it is used.
//
// Deliberately learned FORM, not content: no topic words from one essay ever steer another
// (an "argument" essay about dolphins must not tint the next argument about tax law). The
// profile keeps titles for display only — they never re-enter a prompt.
//
// PURE, storage-agnostic: fold/steer/serialize only. The surface owns persistence (the chat
// keeps profiles in localStorage); a test folds and steers entirely in memory.

// The profile schema version, so an older stored profile is migrated or dropped, never misread.
export const ESSAY_PROFILE_SCHEMA = 1;

// ── The shipped half: the type registry ───────────────────────────────────────
// Each: { id, label, cue, seedArc }. The cue is written as an instruction fragment that
// slots after "You are an accomplished essayist…" / the planner frame. The seed arc is the
// type's opening repertoire — the planner's hints on run one, before anything is learned.
export const ESSAY_TYPES = Object.freeze([
  Object.freeze({
    id: 'argument',
    label: 'Argument',
    cue: 'This is an ARGUMENTATIVE essay: stake a clear claim early, reason for it honestly, meet the strongest objections, and press the claim home.',
    seedArc: Object.freeze(['The claim', 'The strongest case for it', 'The strongest case against it', 'Why the claim survives', 'What follows if it is right']),
  }),
  Object.freeze({
    id: 'explainer',
    label: 'Explainer',
    cue: 'This is an EXPLANATORY essay: make a difficult subject genuinely clear — build from what a reader already knows, define terms as they arrive, and favour concrete examples over abstraction.',
    seedArc: Object.freeze(['What this is and why it matters', 'The core mechanism', 'A worked example', 'Common misconceptions', 'The edges and open questions']),
  }),
  Object.freeze({
    id: 'narrative',
    label: 'Narrative',
    cue: 'This is a NARRATIVE essay: carry the ideas on a story — scenes, people, and time — and let the reflection rise out of the events rather than being announced.',
    seedArc: Object.freeze(['Where it begins', 'The world it happens in', 'The turn', 'What it cost', 'What it left behind']),
  }),
  Object.freeze({
    id: 'review',
    label: 'Review',
    cue: 'This is a CRITICAL REVIEW: describe the thing fairly on its own terms, judge it against explicit criteria, weigh strengths against failures with evidence, and land a verdict a reader can use.',
    seedArc: Object.freeze(['The thing itself', 'What it is trying to do', 'Where it succeeds', 'Where it fails', 'The verdict']),
  }),
  Object.freeze({
    id: 'reflection',
    label: 'Reflection',
    cue: 'This is a REFLECTIVE essay: think on the page in the first person — circle the subject, admit uncertainty, follow associations, and let the piece find what it actually believes.',
    seedArc: Object.freeze(['The thing that will not leave me alone', 'First look', 'A memory it touches', 'Turning it over', 'What I think now']),
  }),
]);

export const essayTypeOf = (id) => ESSAY_TYPES.find((t) => t.id === id) || null;

// ── The learned half: the profile ─────────────────────────────────────────────

// A fresh profile for a type — nothing learned yet.
export const emptyProfile = (typeId) => ({
  schema: ESSAY_PROFILE_SCHEMA,
  type: String(typeId || ''),
  runs: 0,
  // heading (as written) → { n: times it produced a substantial section, words: total words }.
  headings: {},
  // running mean of substantial-section length, the word-target drift.
  sectionWords: { n: 0, mean: 0 },
  // the last few titles — display/provenance only, never re-prompted.
  titles: [],
});

// A section only teaches if it actually produced prose. Below this it was a stall or a
// clipped pass, and folding it would teach the type to be thin.
const TEACHES_AT_WORDS = 60;
const TITLES_KEPT = 8;

// foldEssay(profile, res) → a NEW profile with one completed essay folded in. `res` is the
// composeEssay result ({ title, sections:[{heading, words, role}], aborted }). An aborted or
// empty walk teaches nothing — the profile comes back unchanged (same reference).
export const foldEssay = (profile, res = {}) => {
  const p = profile && profile.schema === ESSAY_PROFILE_SCHEMA ? profile : emptyProfile(profile?.type);
  const sections = (res.sections || []).filter((s) => s && s.heading && Number(s.words) >= TEACHES_AT_WORDS);
  if (res.aborted || !sections.length) return p;

  const headings = { ...p.headings };
  let { n, mean } = p.sectionWords;
  for (const s of sections) {
    const key = String(s.heading).trim();
    const prev = headings[key] || { n: 0, words: 0 };
    headings[key] = { n: prev.n + 1, words: prev.words + Number(s.words) };
    n += 1;
    mean = mean + (Number(s.words) - mean) / n;   // running mean, no history kept
  }
  const titles = [String(res.title || '').trim(), ...p.titles].filter(Boolean).slice(0, TITLES_KEPT);
  return {
    ...p,
    runs: p.runs + 1,
    headings,
    sectionWords: { n, mean: Math.round(mean * 10) / 10 },
    titles,
  };
};

// The word-target drift is clamped: the floor arithmetic (2500 words / target sections) must
// stay sane even if a type's history is all stalls or all sprawl.
const TARGET_MIN = 300, TARGET_MAX = 500, TARGET_DEFAULT = 380;
const HINTS_MAX = 6;

// steerFrom(profile, typeId) → what composeEssay consumes: { cue, planHints, targetPerSection }.
// Run one steers from the shipped half alone (the seed arc); after that the learned headings
// lead and the seed arc backfills. The generic openers the organ itself supplies (Introduction /
// Conclusion) are excluded from hints — they would be offered anyway and teach nothing.
const GENERIC_HEADING = /^\s*(?:introduction|conclusion|background(?:\s+and\s+context)?)\s*$/i;

export const steerFrom = (profile, typeId) => {
  const type = essayTypeOf(typeId || profile?.type);
  if (!type) return { cue: null, planHints: null, targetPerSection: TARGET_DEFAULT };
  const p = profile && profile.schema === ESSAY_PROFILE_SCHEMA ? profile : emptyProfile(type.id);

  // Learned headings, best first: by how often they produced a substantial section, then by
  // the prose volume they carried. Generic organ-supplied headings are excluded.
  const learned = Object.entries(p.headings)
    .filter(([h]) => !GENERIC_HEADING.test(h))
    .sort(([, a], [, b]) => b.n - a.n || b.words - a.words)
    .map(([h]) => h);

  const hints = [];
  for (const h of [...learned, ...type.seedArc]) {
    if (hints.length >= HINTS_MAX) break;
    if (!hints.some((x) => x.toLowerCase() === h.toLowerCase())) hints.push(h);
  }

  // The word target drifts toward what this type actually produces, once it has seen enough
  // sections to mean anything (a single essay's worth).
  const enough = p.sectionWords.n >= 5;
  const target = enough
    ? Math.max(TARGET_MIN, Math.min(TARGET_MAX, Math.round(p.sectionWords.mean)))
    : TARGET_DEFAULT;

  return { cue: type.cue, planHints: hints, targetPerSection: target };
};

// ── Serialization (the durable template half, like tasks/templates.js) ────────

export const profileToJSON = (profile) => JSON.stringify(profile);

// profileFromJSON(s) → a validated profile, or null when malformed / wrong schema — a bad
// stored profile is dropped (the type starts fresh), never crashes the surface.
export const profileFromJSON = (s) => {
  let j = null;
  try { j = typeof s === 'string' ? JSON.parse(s) : s; } catch { return null; }
  if (!j || typeof j !== 'object' || j.schema !== ESSAY_PROFILE_SCHEMA) return null;
  if (typeof j.type !== 'string') return null;
  const headings = {};
  if (j.headings && typeof j.headings === 'object') {
    for (const [h, v] of Object.entries(j.headings)) {
      if (v && Number.isFinite(v.n) && Number.isFinite(v.words)) headings[h] = { n: v.n, words: v.words };
    }
  }
  const sw = j.sectionWords || {};
  return {
    schema: ESSAY_PROFILE_SCHEMA,
    type: j.type,
    runs: Number.isFinite(j.runs) ? j.runs : 0,
    headings,
    sectionWords: { n: Number.isFinite(sw.n) ? sw.n : 0, mean: Number.isFinite(sw.mean) ? sw.mean : 0 },
    titles: Array.isArray(j.titles) ? j.titles.filter((t) => typeof t === 'string').slice(0, TITLES_KEPT) : [],
  };
};

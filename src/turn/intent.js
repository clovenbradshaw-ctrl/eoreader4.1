// The task register — the turn's task, read off the question mechanically.
// (docs/prompt-assembly.md, "The task register")
//
// The same cheap regex pass as the smalltalk and math answerers, no model. It sets
// three things:
//
//   1. the prompt register — whether the summary degeneracy guard rides (summary
//      task only); a faithfulness instruction, NOT a length instruction.
//   2. the token ceiling (max_tokens) — the REAL length bound. The old contract
//      carried "Reply in at most N sentences," which a small model read as the task
//      ("summarize" came back as a literal three-sentence stub). There is no length
//      prescription in the prompt now; the answer is as long as max_tokens allows.
//   3. the CUBE PLACEMENT — where on the EO cube the task operates: its DOMAIN (the
//      order of question / reading level — Existence / Structure / Interpretation),
//      its GRAIN (the Object axis — Ground / Figure / Pattern, "at what grain"), and
//      the SITE-FACE TERRAIN the two name ("where it lands"). A task is not
//      grain-blind: reading one without its grain is exactly the error the cube
//      forbids — a Figure fix applied to a Pattern problem (docs/cube.md). The
//      placement rides into the turn context (turn/stages.js spreads the register),
//      so every downstream stage knows the grain the question is asked at.
//
// Order matters: summary is read before list/explain because "what is this about"
// must not be captured by explain's "how/why".
//
// The whole-document IDENTITY question is a summary, not a pointed lookup. "what is this
// document?", "what is this about", "what is this?" all ask the talker to say what the
// WHOLE document is — drawing the excerpts together — not to find a fact at one location.
// Routing them to `summary` does two things the bare `answer` task could not: it exempts
// the turn from the answerability void gate (a whole-document task is never "the document
// does not say"), and it rides the faithfulness guard instead of the hardened abstention
// line that made "what is this document?" come back as a refusal even with the answer in
// the excerpts. The doc-noun group lets "what is this DOCUMENT about" through — the plain
// "this … about" branch missed it — without capturing pointed "what is this WORD?" lookups.

import { terrainOf } from '../core/index.js';

export const TASK_MAX_TOKENS = Object.freeze({
  summary: 512,
  list:    448,
  explain: 448,
  answer:  384,   // the default
});

// ── The cube register — where on the EO cube each task operates ──────────────────
// Each task names the DOMAIN it reads in (the reading level, docs/reading-levels.md)
// and the GRAIN it reads at (the Object axis, core/cube.js). The pair fixes the
// Site-face TERRAIN — "where it lands" — derived from the cube authority below, never
// hardcoded, so an entry can only name a real cell. The readings:
//
//   answer  · a fact at ONE location — a concrete individual you fetch.   Existence × Figure  → Entity
//   summary · the WHOLE document read as one frame — not a fact to fetch. Interpretation × Pattern → Paradigm
//   list    · the SET of members as one regularity — enumeration.         Structure × Pattern → Network
//   explain · a thing read UNDER a frame — the how/why of one figure.     Interpretation × Figure → Lens
//
// summary and explain both live in Interpretation (level 3) but at different grains —
// summary works the Pattern (the document-as-paradigm), explain works a Figure (one
// thing, through a Lens). list is Structure (level 2): the network of parts. answer is
// the Existence default (level 1): presence at a point. That a pointed lookup and a
// "what is this document" question sit at DIFFERENT grains is the whole reason summary
// must not be answered as a lookup — the cube names the difference the router enforces.
const LEVEL = Object.freeze({ Existence: 1, Structure: 2, Interpretation: 3 });
const TASK_CUBE = Object.freeze({
  answer:  { domain: 'Existence',      grain: 'Figure'  },
  summary: { domain: 'Interpretation', grain: 'Pattern' },
  list:    { domain: 'Structure',      grain: 'Pattern' },
  explain: { domain: 'Interpretation', grain: 'Figure'  },
});

// The full cube placement of a task: its domain, grain, the terrain the two name
// (from the cube authority, core/cube.js), and the reading level. Defaults to the
// `answer` cell for any unknown task, so the register is total.
export const cubeOf = (task) => {
  const c = TASK_CUBE[task] || TASK_CUBE.answer;
  return Object.freeze({
    domain:  c.domain,
    grain:   c.grain,
    terrain: terrainOf(c.domain, c.grain),   // Site face — where it lands
    level:   LEVEL[c.domain],
  });
};

// The nouns that name the document as a whole — "what is this DOCUMENT" is a summary,
// "what is this WORD" is not. Kept narrow on purpose.
const DOCNOUN = 'document|doc|text|file|story|book|passage|article|work|novel|essay|paper|chapter';
const SUMMARY = new RegExp(
  '\\b(summar(?:y|ies|ise|ize|ising|izing)|tl;?dr|recap|gist|overview)\\b' +
  `|\\bwhat(?:'s| is| are)\\s+(?:this|it)\\b(?:` +
    `\\s+(?:${DOCNOUN})s?\\b(?:\\s+about\\b|\\s*\\??\\s*$)` +  // "what is this document?", "what is this text about"
    '|\\s*(?:mainly\\s+)?about\\b' +                          // "what is this about", "what is this mainly about"
    '|\\s*\\??\\s*$' +                                        // "what is this?" — the bare identity question
  ')',
  'i',
);
// A COVERAGE continuation — "what about the rest?", "the rest of it", "the whole thing",
// "everything else". The audit's t2: after a "summarize", the user pushed back that the
// reply was "just the top part, what about the rest?" — a request to cover the WHOLE
// document, which the bare `answer` task read as a pointed lookup and answered from a
// handful of arbitrary spans. It is a whole-document task like a summary: routing it here
// takes retrieval onto the structural skeleton (an even spread across the body), which is
// the coverage the user is asking for. Kept narrow — it matches scope-of-document phrases,
// not a pointed "what about X" naming a real term.
const COVERAGE = new RegExp(
  '\\bthe\\s+rest\\b' +                                      // "the rest", "what about the rest"
  `|\\brest\\s+of\\s+(?:it|this|that|the)\\b` +              // "the rest of it / the document"
  `|\\bthe\\s+whole\\s+(?:thing|${DOCNOUN})\\b` +            // "the whole thing / document"
  '|\\beverything\\s+else\\b|\\bwhat\\s+else\\b',            // "everything else", "what else"
  'i',
);
const LIST    = /\b(list|enumerate|bullet(?:s|ed)?|name\s+(?:every|all|each)|what\s+are\s+the)\b/i;
const EXPLAIN = /\b(explain|elaborate|walk\s+me\s+through|in\s+detail|why|how)\b/i;

// META-CONVERSATIONAL detection — a question that is ABOUT the conversation itself, not
// (only) about the document. "which topic we've discussed is in France?", "what did you
// say earlier?", "of the things we covered, which…". These route grounded (the answer
// still needs the page — "in France" wants the Eiffel-Tower spans) but ALSO need the
// prior turns as their SUBJECT, which the default grounded register withholds (it feeds
// the user's thread "for context only, answer just the latest" — the opposite of what a
// meta question wants). The flag is orthogonal to the task register: it widens what
// conversation the prompt carries and how it is framed, it does not change the task.
//
// The history-poisoning firewall the grounded register guards (a wrong prior ANSWER
// becoming a premise) is asymmetric: here the prior turns are the question's subject, not
// a premise it anchors a fact to, so opening the assistant side is the point, not a leak.
//
// Kept narrow: a subject (we / you / I, with contractions) bound to a PAST/progressive
// conversing verb ("we've discussed", "you said", "I asked"); or an explicit conversation
// noun ("this conversation", "our chat"); or a topic/thing/question noun tied back to
// we/you/I ("the topics we explored"). Present-tense bare forms that double as polite
// document phrasings ("what would you say is the theme") are deliberately NOT verbs here.
const META_SUBJ = "(?:we|you|i)(?:['’](?:ve|d|ll|m|re))?";
const META_AUX  = "(?:\\s+(?:have|had|has|been|already|just|also|recently|earlier|previously|both|now))*";
const META_VERB = "(?:discuss(?:ed|ing)|talk(?:ed|ing)|cover(?:ed|ing)|mention(?:ed|ing)|" +
  "said|saying|spoke|told|asked|brought\\s+up|went\\s+over|gone\\s+over|chat(?:ted|ting)|" +
  "establish(?:ed)?|noted|review(?:ed)?|gone\\s+through|been\\s+over)";
const META_CONV = new RegExp(
  `\\b${META_SUBJ}\\b${META_AUX}\\s+${META_VERB}\\b` +                              // "we've discussed", "you said"
  `|\\b(?:did|do|does)\\s+${META_SUBJ}\\s+(?:say|said|tell|mention|ask|asked|put|word|claim|cover|discuss|mean)\\b` +  // "did you say earlier?"
  '|\\b(?:this|our|that)\\s+(?:conversation|chat|thread|discussion|exchange|dialogue|session)\\b' +  // "this conversation"
  `|\\b(?:topics?|things?|subjects?|questions?|points?)\\b(?:\\s+\\w+){0,3}\\s+\\b${META_SUBJ}\\b` +  // "the topics we explored"
  // The IMPLICIT meta form — selecting over a TOPIC/SUBJECT without naming the conversation
  // ("which topic is in France?", "of the topics, which is oldest?"). "topic"/"subject" used as
  // a selector presupposes a set the conversation already established — you ask which CHARACTER
  // or PLACE inside a document, but which TOPIC refers back to what was discussed. This was the
  // residual routing gap: the question is about the conversation but trips the grounded route,
  // and without an explicit we/you/I the older branches missed it, so the assistant side stayed
  // closed and the cross-conversation answer failed. Narrow on purpose — only these two nouns,
  // only in a selection frame; the ordinary document questions stay non-meta.
  '|\\bwhich(?:ever)?\\s+(?:of\\s+(?:the|those|these)\\s+)?(?:topics?|subjects?)\\b' +  // "which topic", "which of the subjects"
  '|\\bof\\s+(?:the|those|these)\\s+(?:topics?|subjects?)\\b' +                          // "of the topics, which…"
  '|\\b(?:my|your|the)\\s+(?:first|second|third|last|previous|earlier|original|initial|prior|other)' + // "my first question", "your earlier answer"
    '\\s+(?:questions?|answers?|points?|repl(?:y|ies)|messages?|responses?|asks?)\\b',
  'i',
);

// Does the question invoke the conversation itself? Pure, regex-only — the same cheap
// register read as the task pass. Used by the route stage to open the assistant side of
// the session fold to the grounded prompt (turn/stages.js).
export const isMetaConversational = (question) => META_CONV.test(String(question || ''));

export const readTask = (question) => {
  const q = String(question || '');
  if (SUMMARY.test(q))  return 'summary';
  if (COVERAGE.test(q)) return 'summary';
  if (LIST.test(q))    return 'list';
  if (EXPLAIN.test(q)) return 'explain';
  return 'answer';
};

// The full register for a turn: the task name, its token ceiling, and its cube
// placement (domain / grain / terrain / level). The budget stays empty by default —
// no sentence line — so the only bound is max_tokens. The cube fields ride into the
// turn context (turn/stages.js), so the grain the question is asked at is available
// to every downstream stage — retrieval shape, the prompt register, the veto grain.
export const taskOf = (question) => {
  const task = readTask(question);
  const cube = cubeOf(task);
  return {
    task,
    maxTokens: TASK_MAX_TOKENS[task] ?? TASK_MAX_TOKENS.answer,
    domain:  cube.domain,
    grain:   cube.grain,
    terrain: cube.terrain,
    level:   cube.level,
  };
};

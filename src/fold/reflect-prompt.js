// fold/reflect-prompt.js — the SIGNIFICANCE reflection prompt: elicit ONLY the one form
// the generation fold wants, and enforce it on the way out.
//
// The deep reader leaves `reflect` injected (fold/deep-reading.js) so the model voice is a
// first-class, tunable artifact. A reflection is an EVA — the reader judging WHY a place
// matters (significance), not WHAT it says (existence/structure). For it to slot into the
// writer's fold it must be:
//   · a judgment of significance, not a summary of content;
//   · ONE plain sentence in the writer's own register (input must not be far from output —
//     a continuation model handed a list or a "Certainly, here's…" preamble mimics it);
//   · free of preamble, quotation, and enumeration.
// A small model will not obey the instruction alone, so `cleanReflection` enforces the shape
// deterministically — strip the leaked scaffolding, keep the first plain sentence. Prompt
// design AND output discipline, because on a 0.5B model the instruction is only half of it.

// We do NOT ask the model what is interesting — the surfer already found the place of most
// interest (the surprise peak). Asking it to re-identify the interest just yields the empty
// frame ("the most surprising aspect is …"). The job the reflection actually does is make
// the IMPLICIT CONNECTION explicit: the surprise is there precisely because the region
// implies a relation the text does not state. Drawing that unstated link is the developmental
// move a list of facts lacks (churn is facts without their connections) — and it is the
// reader's own inference, reafference, correctly held uncitable. One thing the reflection
// does; others (a tension held, an absence named) can follow the same shape.
export const SIGNIFICANCE_REFLECT_SYSTEM =
  'You are a careful reader drawing out what a passage implies but does not say outright. ' +
  'Given a few statements, name the connection between them that the text leaves unstated — ' +
  'what they imply together that none says alone. Reply with that connection as one plain ' +
  'sentence in your own voice: no lead-in, no list, and do not merely repeat what a ' +
  'statement already says.';

// The chat messages for one reflection over the folded region (verbatim prose at the peak).
export const significanceReflectMessages = (region) => [
  { role: 'system', content: SIGNIFICANCE_REFLECT_SYSTEM },
  { role: 'user', content: `Statements:\n${String(region || '').trim()}\n\nWhat connection between these is implied but not stated? Answer in one plain sentence — the connection itself.` },
];

// Decode hint for the caller — one short sentence, greedy, stop at a line break so the model
// cannot slide into a second "Also,…" clause or a bulleted expansion.
export const REFLECT_DECODE = Object.freeze({ maxTokens: 45, greedy: true, stop: ['\n'] });

// A leading interjection ("Certainly!", "Sure,", "Of course —") with its trailing
// punctuation, stripped whole so the first-sentence match never grabs the stray "!".
const INTERJECTION = /^(?:certainly|sure|of course|absolutely|indeed|well|okay|ok|right)\b[\s!,.:;—-]*/i;
// A "here's … :" / "the point is :" / "what's striking is :" scaffold lead.
const PREAMBLE = /^(?:here(?:'s| is)\b[^:.]*[:.]?|the (?:key |main |central )?(?:point|insight|significance|takeaway)\b[^:.]*[:.]?|this (?:passage|paragraph|text|excerpt)\b[^,.]*[,.]?|in (?:summary|short)[,.]?|to summarize[,.]?|what(?:'s| is)\b[^:.]*[:.]?)\s*/i;
// The parroted evaluation FRAME — "The most surprising and interesting aspect of X is [that]"
// and kin — that a small model echoes back from a "what is most surprising/interesting"
// prompt. Stripping it leaves the actual observation (the tail), which de-boilerplates the
// reflections so they stop colliding into churn. The subject X is recoverable from context.
const FRAME = /^the most\s+\w+(?:\s+(?:and|or|,)\s+\w+)*\s+(?:aspect|thing|part|feature|point|fact|idea)\s+(?:of|about)\s+.+?\s+(?:is|was)\s+(?:that\s+)?/i;
// The parroted CONNECTION frame — the implicit-connection prompt's own echo ("The (implicit)
// connection between X and Y is that …", "These statements imply that …", "Together they
// suggest …"). Stripped to the link itself so the reflections stop opening the same way.
const CONNECTION_FRAME = /^(?:the\s+(?:implicit\s+|unstated\s+|underlying\s+|key\s+)?(?:connection|link|implication|relationship)\b.*?\b(?:is|seems to be|indicates?|means?|shows?|reveals?|suggests?)\s+(?:that\s+)?|(?:these|the)\s+(?:statements|facts|points|two)\b.*?\b(?:imply|suggest|show|reveal|indicate)\s+(?:that\s+)?|together[,]?\s+(?:they|these)\b.*?\b(?:imply|suggest|show|reveal|indicate)\s+(?:that\s+)?)/i;
const LIST_LEAD = /^\s*(?:[-*•]|\d+[.)])\s+/;
// "It's implied that X" / "This implies that X" — a frame around a real link X; strip it and
// keep X (distinct from the bare non-answer below, which has no X).
const IMPLIES_FRAME = /^(?:it'?s?|it is|this|which)\s+(?:implied|implies|means|suggests?)\s+(?:that\s+)?/i;
// A NON-ANSWER — the model echoing the prompt ("implied but not explicitly stated") or
// gesturing at a link without stating one. Rejected so the caller feeds nothing rather than
// scaffolding. (A small model reaches for these when it cannot actually find the connection.)
const NON_ANSWER = /^(?:implied\b|not\s+(?:explicitly\s+)?stated|it\s+(?:is|'?s)\s+related\b|there(?:'s| is)\s+(?:a\s+)?(?:connection|link|relationship)\b)/i;

// cleanReflection — enforce the one-sentence, no-scaffolding form the prompt asks for.
// Strips a leaked interjection, a scaffold preamble, and any list lead, unwraps surrounding
// quotes, keeps the first sentence, caps length. Returns '' when nothing survives (a pure
// preamble / empty) so the caller feeds no reflection rather than a scaffold.
export const cleanReflection = (raw, { maxLen = 220 } = {}) => {
  let t = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  // take the first non-empty line (the decode stop is '\n', but be robust if it leaked more)
  t = t.split('\n').map((s) => s.trim()).find(Boolean) || '';
  t = t.replace(LIST_LEAD, '');
  // reject a bare non-answer BEFORE stripping frames (so "implied but not stated" dies whole)
  if (NON_ANSWER.test(t)) return '';
  // strip up to two stacked scaffolds ("Certainly! Here's the point:") and the parroted frames
  for (let i = 0; i < 2; i++) { const s = t.replace(INTERJECTION, '').replace(PREAMBLE, '').replace(FRAME, '').replace(CONNECTION_FRAME, '').replace(IMPLIES_FRAME, ''); if (s === t) break; t = s.trim(); }
  // unwrap a fully-quoted sentence
  const q = t.match(/^["“'](.+?)["”']\.?$/); if (q) t = q[1].trim();
  // keep the first sentence
  const m = t.match(/^.*?[.!?](?=\s|$)/); if (m) t = m[0].trim();
  if (t.length > maxLen) t = t.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
  // a stripped frame leaves a lowercase tail ("their ability to …") — capitalize so it reads
  // as a statement the writer can drop in.
  if (t) t = t.charAt(0).toUpperCase() + t.slice(1);
  // reject a degenerate residue: too short, a prompt-echo non-answer, or a truncation left
  // dangling on a function word ("… related to the") — an incomplete link is worse than none.
  if (t.replace(/[^a-z]/gi, '').length < 8) return '';
  if (NON_ANSWER.test(t)) return '';
  if (!/[.!?]$/.test(t) && /\b(?:the|a|an|of|to|and|or|with|for|that|is|are)$/i.test(t)) return '';
  return t;
};

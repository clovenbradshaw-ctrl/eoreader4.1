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

// The ask is first-person and surprise-oriented — "to you" — which is right on both counts:
// it matches the deep reader's surprise-peak selection (reflect where the reading was most
// surprised), and it keeps the epistemics honest (the answer is the reader's OWN reaction,
// reafference, not a fact about the world). The light system framing only holds the FORM
// (plain prose, the reader's voice, no scaffolding); cleanReflection enforces it.
export const SIGNIFICANCE_REFLECT_SYSTEM =
  'You are a careful reader noting your own reaction, for yourself, before you write. ' +
  'Answer in one or two plain sentences, in your own voice — the reaction itself, with no ' +
  'lead-in, no list, no quotation, and no "the passage".';

// The chat messages for one reflection over the folded region (verbatim prose at the peak).
export const significanceReflectMessages = (region) => [
  { role: 'system', content: SIGNIFICANCE_REFLECT_SYSTEM },
  { role: 'user', content: `Background information:\n${String(region || '').trim()}\n\nGiven this background information, what is most surprising and/or interesting about this to you?` },
];

// Decode hint for the caller — one short sentence, greedy, stop at a line break so the model
// cannot slide into a second "Also,…" clause or a bulleted expansion.
export const REFLECT_DECODE = Object.freeze({ maxTokens: 30, greedy: true, stop: ['\n'] });

// A leading interjection ("Certainly!", "Sure,", "Of course —") with its trailing
// punctuation, stripped whole so the first-sentence match never grabs the stray "!".
const INTERJECTION = /^(?:certainly|sure|of course|absolutely|indeed|well|okay|ok|right)\b[\s!,.:;—-]*/i;
// A "here's … :" / "the point is :" / "what's striking is :" scaffold lead.
const PREAMBLE = /^(?:here(?:'s| is)\b[^:.]*[:.]?|the (?:key |main |central )?(?:point|insight|significance|takeaway)\b[^:.]*[:.]?|this (?:passage|paragraph|text|excerpt)\b[^,.]*[,.]?|in (?:summary|short)[,.]?|to summarize[,.]?|what(?:'s| is)\b[^:.]*[:.]?)\s*/i;
const LIST_LEAD = /^\s*(?:[-*•]|\d+[.)])\s+/;

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
  // strip up to two stacked scaffolds ("Certainly! Here's the point:")
  for (let i = 0; i < 2; i++) { const s = t.replace(INTERJECTION, '').replace(PREAMBLE, ''); if (s === t) break; t = s.trim(); }
  // unwrap a fully-quoted sentence
  const q = t.match(/^["“'](.+?)["”']\.?$/); if (q) t = q[1].trim();
  // keep the first sentence
  const m = t.match(/^.*?[.!?](?=\s|$)/); if (m) t = m[0].trim();
  if (t.length > maxLen) t = t.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
  // reject a degenerate residue (too short, or still just a scaffold word)
  if (t.replace(/[^a-z]/gi, '').length < 8) return '';
  return t;
};

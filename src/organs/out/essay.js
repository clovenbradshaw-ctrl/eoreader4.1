// organs/out/essay — the ESSAY organ: prose lowered not as one beat but as a whole,
// arc-walked piece whose LENGTH IS EMERGENT — it stops when a section stops adding, not at a
// token count.
//
// The text organ (organs/out/text) renders a SINGLE task leaf into a sentence-scale beat:
// one directive, one generate call, capped at its `ceiling` of tokens. That is the right
// grain for an answer, and exactly the wrong one for an essay — it is why "write an essay
// on dolphins" comes back as a three-sentence dolphin blurb. An essay is not a bigger beat;
// it is a WALK: open, develop, turn, and land across many sections, each a full pass of the
// talker.
//
// THE GATES. A small model handed a long-form commission with nothing to draw on does two
// things reliably: it CONFABULATES evidence to fill argumentative slots ("declined by 60%",
// "a study published in Science"), and it REPEATS itself section to section because each pass
// only sees a short tail of the draft. src/arc/ was built to stop exactly this — a span-veto
// that strikes unwitnessed claims, a coverage gate that ends the walk when a section adds no
// new ground, disjoint sub-claims so sections do not re-argue each other. This organ ports
// those disciplines in a SOURCELESS form (there is no retrieval here — the essay surface runs
// ungrounded by default), so the same failure modes are caught without a corpus to bind to:
//
//   evidenceVeto     — strike sentences that assert statistics, studies, or named institutions
//                      the model cannot have witnessed (the sourceless bind-or-veto, src/arc
//                      /ground bindAndVeto). On an ungrounded run these are always fabrications.
//   sectionNovelty   — measure a section's fresh content against a ledger of what earlier
//                      sections already said; drop a section that merely restates (the
//                      sourceless evaCoverageGate, src/arc/saturation).
//   concession gate  — an "against"/objection section that pivots back to agreement is not an
//                      objection; hold its stance or cut it at the concession.
//
// Each defect gets ONE corrective regeneration that names exactly what failed; if the retry
// still fails, the text is cleaned (struck / truncated) or the section is dropped. The walk
// SATURATES — it stops developing when fresh sections stop landing — rather than padding to a
// word count. Length falls out of what there is to say.
//
// Model-INJECTED like every other output organ (organs/out never imports a talker): the caller
// hands a `talker(messages, opts) → Promise<string>` (the same contract streamPhrase satisfies).
// Pure orchestration — the only non-determinism is the injected talker — so it runs headless in
// a test with a stub talker as readily as it runs the chat surface's model.

// THE LENGTH ASPIRATION (not a floor). The walk TRIES to reach at least this many words by
// extending with fresh angles — but it yields to saturation: once new sections stop adding
// ground it lands, whatever the count. Kept for the surface's reporting and back-compat; it is
// no longer the governor. A rich subject runs well over; a thin one lands honestly short.
export const ESSAY_MIN_WORDS = 2500;

// Words, counted the honest way: whitespace-delimited runs. Headings count too — they are
// part of the piece — but the bulk is carried by the bodies.
export const countWords = (s) => (String(s ?? '').trim().match(/\S+/g) || []).length;

// The neutral arc a bodiless commission still gets. If the planner returns nothing usable we
// walk THIS — a real open/develop/turn/land skeleton. The conclusion is handled separately (it
// always lands last), so it is not in this list.
const DEFAULT_ARC = Object.freeze([
  'Introduction',
  'Background and context',
  'The central argument',
  'Evidence and illustration',
  'Complications and counterpoints',
  'Wider implications',
]);

// Padding for a THIN (but non-empty) plan. The planner's first heading is already the opener,
// so padding must NOT reintroduce an opener-role heading — that is the doubled-"Introduction"
// bug this list exists to avoid. Openers are excluded; only develop moves backfill.
const PAD_ARC = Object.freeze(
  DEFAULT_ARC.filter((h) => !/^(?:introduction|background)\b/i.test(h)),
);

// When the plan runs dry but the piece is still short of the aspiration, we develop further
// along these angles rather than repeating a heading. Cycled in order, bounded by `maxSections`
// and by SATURATION, so the walk always terminates.
const DEVELOP_ANGLES = Object.freeze([
  'A closer look',
  'Another dimension',
  'Objections considered',
  'A concrete illustration',
  'The longer view',
  'What remains unsettled',
  'Second thoughts',
  'One more thread',
]);

const CONCLUSION = 'Conclusion';

// The smallest body a real plan needs before we stop padding it. A doubled opener never appears
// because PAD_ARC carries no opener; three sections is enough to open, develop, and turn.
const MIN_BODY = 3;

// ── Gate thresholds ────────────────────────────────────────────────────────────
// A develop/against section must bring at least this fraction of FRESH content words (measured
// against the ledger of everything kept so far) or it triggers a corrective regen; below the
// harder floor it is dropped as pure restatement.
const NOVELTY_REGEN = 0.30;
const NOVELTY_DROP = 0.18;
// A kept section must clear this many words; below it the pass was a stall or was gutted by the
// veto, and folding it would teach the piece to be thin.
const MIN_SECTION_WORDS = 40;
// Consecutive dropped EXTENSIONS that end the walk — the field has saturated, there is nothing
// fresh left to say. (src/arc/saturation's loop-until-dry, K = 2.)
const SATURATE_STOP = 2;
// Consecutive EMPTY talker passes that end the walk — the model is dead, not the material. Kept
// distinct from a gate drop: a drop is the gate working; an empty pass is a broken talker.
const DEAD_STOP = 2;

// Strip the assistant preamble a small model tends to prepend ("Sure! Here is…", "Certainly:")
// so a section body starts on the prose, not the throat-clearing. Conservative: only a leading,
// single-line "here's/sure/certainly" opener goes.
const stripPreamble = (s) => String(s ?? '')
  .replace(/^\s*(?:sure[,!.]?\s+|certainly[,!.]?\s+|of course[,!.]?\s+|absolutely[,!.]?\s+|here(?:'s| is| you go|’s)\b[^\n:]*:?\s*)/i, '')
  .trim();

// A section body must not carry its own heading — the walk prints "## <heading>" itself. A small
// model sometimes echoes the heading (or the essay TITLE) at the top of the section — as a markdown
// "# …" line OR as PLAIN text — which is the "every heading printed twice" defect: the walk prints
// "## Dolphins" and then the body's first line is again "Dolphins". The old strip only caught a
// MARKDOWN heading line, so a plain-text echo slipped through and rendered twice. Strip a leading
// RUN of such lines instead: markdown heading lines, and plain lines whose normalized text matches
// the known heading or title. The run stops at the first real prose line, so prose that merely
// contains a "#", or a line that matches no known heading, is left untouched. The heading/title are
// passed by the caller (generate) — without them only the markdown case can be caught.
const _normHeadingLine = (line) => String(line ?? '')
  .replace(/^\s*#{1,6}\s*/, '')                                   // leading markdown hashes
  .replace(/\*\*|__|`/g, '')                                      // bold / emphasis / code marks
  .replace(/^[\s*_"'“”>«»]+|[\s*_"'“”:.\-–—!?]+$/g, '')           // wrapping quotes/emphasis + trailing punct
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();
const stripSectionHeading = (s, heading = '', title = '') => {
  const known = new Set([_normHeadingLine(heading), _normHeadingLine(title)].filter(Boolean));
  const lines = String(s ?? '').split('\n');
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    if (!raw.trim()) { i += 1; continue; }                        // blank lines inside the leading run
    if (/^\s*#{1,6}[ \t]/.test(raw) || known.has(_normHeadingLine(raw))) { i += 1; continue; }
    break;                                                        // first real prose line — stop stripping
  }
  return lines.slice(i).join('\n').trim();
};

// ── Sentence segmentation ──────────────────────────────────────────────────────
// Split prose into sentences for the veto and the concession cut. Splits on a terminal
// [.!?] followed by whitespace and a sentence-opening character (capital or quote). The final
// sentence (no trailing delimiter+capital) is kept as the last element. Good enough for the
// gates; it never needs to be perfect, only to isolate the offending clause.
// The negative lookbehinds keep a period that is NOT a sentence end from splitting a sentence in
// two: a middle initial ("Thomas R. Unruh") or a title/abbreviation before a capitalised word
// ("Dr. Maria Rodriguez", "Prof. Smith"). Without them the veto would see only a fragment of an
// expert-attributed claim and let the rest through — exactly how "As entomologist Thomas R. Unruh
// has pointed out…" slipped the veto.
export const sentencesOf = (text) => String(text ?? '')
  .replace(/\s+/g, ' ')
  .trim()
  .split(/(?<=[.!?])(?<!\b[A-Z]\.)(?<!\b(?:Dr|Mr|Mrs|Ms|Prof|Sr|Jr|St|vs|Inc|Ltd|Co|Fig|No|Vol)\.)\s+(?=["'“(]?[A-ZÀ-ÖØ-Þ])/)
  .map((s) => s.trim())
  .filter(Boolean);

// ── evidenceVeto: strike the unwitnessed claim ─────────────────────────────────
// On an UNGROUNDED run the model has no source to bind an evidentiary claim to, so any concrete
// statistic, cited study, or named institution it produces is a fabrication. These shapes catch
// the forms a small model reaches for to fill an argumentative slot. A sentence matching ANY of
// them is struck. The prose contract also tells the model not to write them — so on a clean pass
// there is nothing to strike; the veto is the backstop for when it does anyway.
export const EVIDENCE_SHAPES = Object.freeze([
  /\d+(?:\.\d+)?\s?%/,                                   // "60%", "30 %"
  /\b\d+(?:\.\d+)?\s?percent\b/i,                        // "60 percent"
  /\b(?:up to|as much as|as many as|as few as|as high as|as low as)\s+\d/i,
  /\bestimates?\s+that\b/i,                              // "the WWF estimates that…"
  /\b(?:a|an|the|one|another|recent|several)\s+stud(?:y|ies)\b/i,
  /\bstud(?:y|ies)\s+(?:conducted|published|found|showed?|shows|suggests?|revealed?)\b/i,
  /\bresearchers?\s+(?:at|from|found|have|had|observed|discovered|report(?:ed)?)\b/i,
  /\bpublished\s+in\b/i,                                 // "published in the journal Science"
  /\bin\s+the\s+journal\b/i,
  /\bconducted\s+at\b/i,
  // "According to the WWF / according to Smith" — the phrase either-cased, object capitalised.
  /\b[Aa]ccording to (?:the )?(?:[A-Z]{2,}|[A-Z][a-z]+)/,
  // A named institution: "Dolphin Research Center", "World Wildlife Fund", "Stanford University".
  /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Research\s+)?(?:Cent(?:er|re)|Foundation|Institute|Fund|Society|University|Association|Laborator(?:y|ies)|Agency)\b/,
  // ── The academic COSTUME (added after the mosquito essay) ──────────────────────
  // The dolphins essay fabricated stats and institutions; the mosquito essay dressed its
  // fabrications as scholarship — parenthetical author-date cites, "et al." reference lists, and
  // quotes pinned to named "experts". A fabricated quote attributed to a real person is the
  // hardest fabrication to catch and the one with real reputational exposure, so these are the
  // shapes that most need striking. On an ungrounded run they are always fabrication; on a
  // grounded run they are struck UNLESS the sentence also binds to a real span (see the binder).
  //
  // "(Williams et al., 2013)", "(Bergland 1984)", "(Smith and Jones, 2000)" — a parenthetical
  // author-date cite. The year is required (a bare "(the pupal stage)" is untouched); a name or
  // an "et al." must precede it (a bare "(2013)" year mention is left alone).
  /\([A-Z][\w.'’-]+(?:\s+(?:et al\.?|and\s+[A-Z][\w.'’-]+|&\s+[A-Z][\w.'’-]+|[A-Z][\w.'’-]+))*[,.]?\s+(?:19|20)\d{2}[a-z]?\s*\)/,
  // Inline author-year — "Bergland (1984)", "Hunt (2000)".
  /\b[A-Z][\w.'’-]+\s+\((?:19|20)\d{2}[a-z]?\)/,
  // "et al." anywhere — the reference-list tic. Vanishingly rare in honest general-knowledge
  // prose, a dead giveaway of an invented citation apparatus ("Patel et al. 2015", "Williams et al.").
  /\bet\s+al\b/i,
  // A claim pinned to a named authority — "As entomologist Thomas R. Unruh has pointed out…",
  // "As Dr. Maria Rodriguez notes…", "As noted by Dr. Jane Smith…", "As biologist John Taylor
  // explains…". The fabricated-expert-quote shape.
  /\bas\s+(?:noted|observed|argued|explained|pointed\s+out|shown|demonstrated|described|reported|put)\s+by\s+[A-Z]/i,
  /\bas\s+(?:dr\.?|professor|prof\.?|mr\.?|ms\.?|mrs\.?)\s+[A-Z]/i,
  /\bas\s+(?:the\s+)?(?:entomologist|biologist|ecologist|zoologist|researcher|scientist|professor|epidemiologist|physician|expert|economist|historian|psychologist|neuroscientist|philosopher|sociologist|virologist|immunologist|geneticist|chemist|physicist)\b/i,
  // "Dr. Maria Rodriguez", "Professor Jane Smith" — a titled name anywhere in the claim.
  /\b(?:Dr\.?|Professor|Prof\.?)\s+[A-Z][a-z]+/,
  // A quotation attributed to a speaker — '"…," says Dr. John Taylor', '"…," notes Rodriguez'.
  /["“][^"”“]{0,240}["”]\s*[,.]?\s*(?:said|says|noted|notes|explained|explains|argued|argues|observed|observes|wrote|writes|remarked|remarks)\b/i,
]);

// evidenceVeto(text) → { kept, struck, boundFraction }. `kept` is the prose with offending
// sentences removed; `struck` is the list of removed sentences; `boundFraction` is the share of
// sentences that survived (1 = clean, mirrors src/arc's boundFraction). Caller runs this only on
// the ungrounded path — a grounded run binds against real sources instead.
export const evidenceVeto = (text) => {
  const sents = sentencesOf(text);
  if (!sents.length) return { kept: '', struck: [], boundFraction: 1 };
  const kept = [];
  const struck = [];
  for (const s of sents) {
    if (EVIDENCE_SHAPES.some((re) => re.test(s))) struck.push(s);
    else kept.push(s);
  }
  return {
    kept: kept.join(' '),
    struck,
    boundFraction: sents.length ? kept.length / sents.length : 1,
  };
};

// ── sectionNovelty: the sourceless coverage gate ───────────────────────────────
// A ledger of content words already spent, and a section's novelty against it. Content words are
// lowercased alphabetic runs of length ≥ 4, minus a small stop set — enough to tell "re-argues
// intelligence and sociality again" from "opens a genuinely new line". novelty = fresh / total.
const STOPWORDS = new Set([
  'that', 'this', 'they', 'them', 'their', 'there', 'these', 'those', 'then', 'than',
  'with', 'from', 'have', 'has', 'had', 'been', 'being', 'were', 'was', 'will', 'would',
  'what', 'when', 'which', 'while', 'about', 'into', 'over', 'under', 'such', 'also',
  'more', 'most', 'some', 'many', 'much', 'very', 'only', 'even', 'just', 'like', 'because',
  'through', 'between', 'both', 'each', 'other', 'another', 'itself', 'themselves',
  'however', 'moreover', 'furthermore', 'therefore', 'thus', 'here', 'they’re', 'their',
  'often', 'still', 'rather', 'quite', 'indeed', 'perhaps', 'within', 'upon', 'against',
]);

export const contentWords = (text) => {
  const set = new Set();
  for (const w of String(text ?? '').toLowerCase().match(/[a-zà-öø-ÿ]{4,}/g) || []) {
    if (!STOPWORDS.has(w)) set.add(w);
  }
  return set;
};

// novelty of `text` against a Set `ledger` of content words already spent. Empty text → 0 (a
// stall adds nothing); empty ledger → 1 (the opening is all fresh by definition).
export const sectionNovelty = (text, ledger) => {
  const cw = contentWords(text);
  if (cw.size === 0) return 0;
  let fresh = 0;
  for (const w of cw) if (!ledger.has(w)) fresh += 1;
  return fresh / cw.size;
};

// ── The stance gate: an objection must actually oppose ─────────────────────────
// A heading that reads as the "against"/objection move.
export const isAgainstHeading = (heading) =>
  /\b(?:against|objection|objections|counter|counterpoint|critique|drawback|drawbacks|limitation|limitations|case against|fails?|failure|the other side|weakness(?:es)?)\b/i
    .test(String(heading ?? ''));

// Phrases that betray an against-section collapsing back into agreement.
const CONCESSION_SHAPES = Object.freeze([
  /\bof course\b/i,
  /\bnot to say that\b/i,
  /\b(?:are|is)\s+(?:indeed\s+)?worth(?:y)?\s+of\b/i,
  /\bworth(?:y)?\s+of\s+(?:protection|conservation|saving|preservation|respect)\b/i,
  /\bwe\s+(?:should|must|ought to)\s+(?:protect|preserve|conserve|save|celebrate|revere|value)\b/i,
  /\bmoral\s+imperative\b/i,
  /\boverwhelming(?:ly)?\s+(?:evidence|clear|support|case)\b/i,
  /\b(?:undeniabl|unquestionabl|indisputabl|without\s+doubt)/i,
]);

// concessionSplit(text) → { kept, conceded }. Keeps the sentences BEFORE the first concession
// (the part that still argued against), flags that a concession was found. If the very first
// sentence concedes, `kept` is empty — the whole section caved.
export const concessionSplit = (text) => {
  const sents = sentencesOf(text);
  const kept = [];
  let conceded = false;
  for (const s of sents) {
    if (CONCESSION_SHAPES.some((re) => re.test(s))) { conceded = true; break; }
    kept.push(s);
  }
  return { kept: kept.join(' '), conceded };
};

// ── Planning ────────────────────────────────────────────────────────────────
// The commission → an outline. The talker is asked for a title and a list of section headings
// in a strict, easy-to-parse shape; `parseOutline` tolerates the ways a small model bends that
// shape, and `planOutline` guarantees a usable arc no matter what comes back.

// `cue` is the TYPE's voice — one plain sentence naming the kind of essay this is (from the
// learned essay-type template, organs/out/essay-types.js). `hints` are headings that have
// WORKED for this type before — offered to the planner, never imposed. `sources` are excerpts
// research gathered on the subject (organs/out never fetches — the caller hands them in). All
// three absent → the prompt is byte-identical to the unsteered organ.
export const planMessages = (topic, { cue = null, hints = null, sources = null } = {}) => ([
  { role: 'system', content:
    'You are an essayist planning a long-form essay. Given a commission, produce a working outline: ' +
    'a title, then the section headings the essay will move through — an opening, several developing ' +
    'sections that each take a distinct angle, and a close. ' +
    (cue ? `${cue} ` : '') +
    'Reply in EXACTLY this format and nothing else:\n' +
    'TITLE: <the essay title>\n1. <first section heading>\n2. <second section heading>\n… (6 to 9 sections, ending on a conclusion).' },
  { role: 'user', content:
    `Commission: ${String(topic || '').trim()}` +
    (Array.isArray(hints) && hints.length
      ? `\n\nSection moves that have served this kind of essay well before — use, adapt, or ignore them as the subject demands: ${hints.join(' · ')}.`
      : '') +
    (Array.isArray(sources) && sources.length
      ? `\n\nResearch has gathered the following source material on the subject. Let the outline follow what it actually covers, rather than a generic template:\n"""\n${sources.join('\n\n')}\n"""`
      : '') },
]);

// Parse the planner's reply into { title, headings }. Tolerant: the title may be prefixed or
// bare; headings may be numbered, bulleted, or plain lines. Anything unparseable yields empty
// fields, which planOutline then backfills.
export const parseOutline = (text, topic = '') => {
  const lines = String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  let title = '';
  const headings = [];
  for (const line of lines) {
    const t = line.match(/^title\s*[:\-–]\s*(.+)$/i);
    if (t) { title = t[1].trim().replace(/^["'“”]|["'“”]$/g, ''); continue; }
    // A heading line: "1. X", "1) X", "- X", "• X", "## X", or a plain short line.
    const m = line.match(/^(?:\d+[.)]|[-*•]|#{1,4})\s*(.+)$/);
    const raw = m ? m[1] : line;
    const h = raw.replace(/^["'“”]|["'“”:]+$/g, '').replace(/\*\*/g, '').trim();
    if (!h) continue;
    // Skip a restated "title:" or an obvious meta line that slipped the format.
    if (/^title\b/i.test(h)) continue;
    if (h.length > 90) continue;                 // a paragraph, not a heading
    if (!/[a-z]/i.test(h)) continue;
    headings.push(h);
  }
  if (!title) {
    const topicWords = String(topic || '').trim();
    title = topicWords ? topicWords.replace(/\s+/g, ' ').replace(/^[a-z]/, (c) => c.toUpperCase()) : 'An Essay';
  }
  return { title, headings };
};

// planOutline(rawPlan, topic) → { title, body:[headings], conclusion }. Guarantees a usable arc.
// The fix over the old organ: backfill by ROLE SUFFICIENCY, not by concatenating DEFAULT_ARC.
//   • A non-empty plan keeps the planner's headings as-is — the FIRST is the opener, whatever it
//     is named — and pads (only if under MIN_BODY) from PAD_ARC, which carries no opener. So a
//     plan that already has an opening section never gets a second "Introduction" tacked on.
//   • A truly empty plan walks the full neutral arc (whose first entry IS "Introduction").
// This is the direct cure for the doubled-intro scaffold leak.
export const planOutline = (rawPlan, topic = '') => {
  const { title, headings } = parseOutline(rawPlan, topic);
  // Pull any heading that reads as the close out to the end; the walk lands on it explicitly.
  const body = headings.filter((h) => !/\bconclu(?:sion|de|ding)\b|\bin closing\b|\bfinal thoughts\b/i.test(h));
  if (body.length === 0) {
    // Bodiless plan — supply the whole neutral arc, opener included.
    return { title, body: [...DEFAULT_ARC], conclusion: CONCLUSION };
  }
  // Thin but non-empty — pad with DEVELOP moves only (never a second opener), to MIN_BODY.
  for (const h of PAD_ARC) {
    if (body.length >= MIN_BODY) break;
    if (!body.some((b) => b.toLowerCase() === h.toLowerCase())) body.push(h);
  }
  return { title, body: body.slice(0, 9), conclusion: CONCLUSION };
};

// ── Composing one section ────────────────────────────────────────────────────
// Each section is a full talker pass, prompted with the whole plan and a tail of the draft so
// the prose stays continuous. `role` names the arc move so the opening opens, an objection
// opposes, and the close lands. `corrective` is the targeted directive a REGEN carries, naming
// what the first pass got wrong (fabricated evidence, conceded the case, or restated).

// `sources` are the research excerpts (same set the planner saw). Present → the section is
// GROUNDED in them and told not to invent beyond them. Absent → the section carries the
// no-invented-evidence contract instead (the sourceless discipline), so a small model argues
// from reasoning rather than confabulating figures and studies.
export const sectionMessages = ({ topic, title, outline = [], heading, index = 0, total = 0, tail = '', targetWords = 380, role = 'develop', cue = null, sources = null, corrective = '' } = {}) => {
  const plan = outline.length ? `\nThe essay's outline: ${outline.join(' · ')}.` : '';
  const soFar = tail ? `\n\nThe essay so far ends:\n"""\n${tail}\n"""\nContinue from there — do not repeat what is already written.` : '';
  const grounded = Array.isArray(sources) && sources.length;
  const src = grounded
    ? `\n\nSource material research gathered on the subject — draw on it for this section, quote or paraphrase what bears on the heading, and do not assert facts beyond what it and well-established general knowledge support:\n"""\n${sources.join('\n\n')}\n"""`
    : '';
  const move = role === 'open'
    ? 'This is the OPENING section — set the essay in motion: frame the subject, stake the question, and draw the reader in. Do not summarise the whole essay.'
    : role === 'land'
      ? 'This is the CONCLUSION — land the essay: draw the threads together, say what it all amounts to, and close. Do not introduce a wholly new topic.'
      : role === 'against'
        ? 'This is the ADVERSARIAL section — argue the STRONGEST case AGAINST the essay\'s thesis. Press the opposing view on its own terms. Do NOT concede, hedge back to agreement, or end by re-affirming the thesis; the reader must feel the claim genuinely threatened.'
        : 'Develop this section fully with its own angle — reasoning and argument. Do not restate the introduction, do not repeat points earlier sections already made, and do not pre-empt the conclusion.';
  const fix = corrective ? `\n\nRevise your approach: ${corrective}` : '';
  return [
    { role: 'system', content:
      'You are an accomplished essayist writing one section of a longer essay. ' +
      (cue ? `${cue} ` : '') +
      (grounded
        ? 'Ground the section in the provided source material rather than inventing detail. '
        : 'Do not invent statistics, studies, named institutions, journals, or specific factual claims you cannot support; where you would otherwise need a source you do not have, argue from reasoning and well-established general knowledge instead. ') +
      'Write flowing, substantive prose in ' +
      'full paragraphs — no lists, no headings, no meta-commentary about the essay or these instructions. Aim for about ' +
      `${targetWords} words. Write ONLY the prose of this section.` },
    { role: 'user', content:
      `Essay commission: ${String(topic || '').trim()}\nWorking title: ${title}.${plan}\n\n` +
      `Section ${total ? `${index + 1} of ${total}+ ` : ''}— heading: "${heading}".\n${move}${soFar}${src}${fix}` },
  ];
};

// The tail of the draft handed to the next section for continuity — the last ~`words` words.
const tailOf = (text, words = 90) => {
  const toks = String(text ?? '').trim().match(/\S+/g) || [];
  return toks.slice(-words).join(' ');
};

// maxTokens for a section: enough headroom over the word target (words ≈ 0.75·tokens), capped
// so a runaway decode can't stall the walk. Floors at 256 so even a terse target has room.
const tokensFor = (targetWords) => Math.max(256, Math.min(1024, Math.round(targetWords * 1.7)));

// ── The walk ─────────────────────────────────────────────────────────────────
// composeEssay — plan, then walk the arc, GATING each section and letting the piece SATURATE:
// develop until fresh sections stop landing, then land on a conclusion. Model-injected; every
// talker pass streams through the hooks so a UI can render live. Returns the assembled markdown,
// the KEPT sections, the final word count, and a length-decision TRACE (why the walk ran as long
// as it did — every kept, corrected, and dropped section, with the reason).
//
//   talker(messages, { maxTokens, temperature, signal, onToken }) → Promise<string>
//
// The walk is deliberately EMITTED ACROSS MANY MESSAGES, not as one blob: each section is its
// own beat, announced by onSection, streamed through onToken, and then either closed by
// onSectionEnd (kept) or retracted by onSectionDrop (a gate dropped it — a UI must REMOVE the
// bubble it opened, not render it). onSectionEnd fires 1:1 with the kept sections in the result.
//
// hooks (all optional):
//   onPhase(name)                              — 'planning' | 'writing' | 'done'
//   onPlan({ title, outline })                 — the arc, once planned
//   onPlanToken(piece)                         — a token of the OUTLINE decode (liveness only; the
//                                                plan is handed whole by onPlan — this exists so a
//                                                no-progress guard is fed through the first, pre-onPlan
//                                                model call, which streams nowhere else)
//   onPulse(piece)                             — a token of any OTHER unstreamed decode (the
//                                                corrective regen). Liveness only, like onPlanToken:
//                                                the regen replaces the section on finalize, so its
//                                                tokens never paint — but a no-progress guard still
//                                                needs to see them, or a slow-but-live regen trips it
//   onSection({ heading, index, role, words }) — a new section beat opens (start a new message)
//   onToken(piece, heading)                    — a token of the current section (first pass only)
//   onSectionEnd({ heading, index, role, text, words, total }) — a KEPT section beat closes
//   onSectionDrop({ heading, role, reason })   — the opened beat was dropped by a gate (remove it)
export const composeEssay = async ({
  topic,
  talker,
  minWords = ESSAY_MIN_WORDS,   // the length ASPIRATION (see ESSAY_MIN_WORDS) — extend toward it,
                                //   but saturation, not this number, decides when to stop.
  maxSections = 24,             // a BACKSTOP against a misbehaving talker, not the governor.
  targetPerSection = 380,
  temperature = 0.7,            // lowered from 0.85: less ornament, less invention.
  signal = null,
  lens = null,                  // THE LENS PORT (write/lens-port.js): a logit-steer config passed
                                //   straight through to each SECTION talker pass. Null = the golden
                                //   phrase() path, byte-identical. The plan pass is left unsteered.
  cue = null,                   // THE TYPE'S VOICE (organs/out/essay-types.js): one plain sentence.
  planHints = null,             // THE LEARNED HALF of a type: headings offered to the planner.
  ground = null,                // RESEARCH GROUND: excerpts the caller gathered on the subject.
                                //   Present → plan and sections written grounded in this material.
  bind = null,                  // THE SPAN-BINDER (ground/bind.js via eo-gen): bind(text, spans)
                                //   → { kept, struck, boundFraction }. Injected on a grounded run so
                                //   each section is BOUND to the real source spans — a claim tied to
                                //   no span and making no lexical contact (fabricated fact / invented
                                //   mechanism) is struck, which no surface veto can catch. Null → the
                                //   surface veto is the only fabrication check (back-compat).
  hooks = {},
} = {}) => {
  if (typeof talker !== 'function') throw new TypeError('composeEssay: a talker function is required');
  const commission = String(topic || '').trim();
  if (!commission) throw new Error('composeEssay: an essay commission (topic) is required');
  const aborted = () => !!(signal && signal.aborted);

  // Normalise the research ground to a capped list of clean excerpt SPANS { idx, text, u }. The
  // idx/u are kept so the binder can cite a section's claims back to the span they rest on. Empty
  // → null → the ungrounded (veto-governed) path, prompts byte-identical to the parametric organ.
  const sources = (() => {
    if (!Array.isArray(ground)) return null;
    const seen = new Set();
    const out = [];
    for (const g of ground) {
      const t = String((g && g.text != null) ? g.text : g).replace(/\s+/g, ' ').trim();
      if (t.length < 20) continue;
      const clipped = t.length > 320 ? `${t.slice(0, 320)}…` : t;
      const key = clipped.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ idx: (g && Number.isFinite(g.i)) ? g.i : out.length, text: clipped, u: (g && g.u) || null });
      if (out.length >= 12) break;
    }
    return out.length ? out : null;
  })();
  const grounded = !!sources;
  // The excerpt STRINGS fed to the planner and each section prompt (unchanged shape), and the
  // { idx, text } SPAN SET the binder cites against. Both derive from the same normalised sources.
  const sourceTexts = sources ? sources.map((s) => s.text) : null;
  const spanSet = sources ? sources.map((s) => ({ idx: s.idx, text: s.text })) : null;
  // Binding only actually runs when a binder was injected AND there are spans to bind to.
  const binds = grounded && typeof bind === 'function';

  // 1) PLAN — outline the arc. A planner failure is non-fatal: planOutline backfills a neutral arc.
  hooks.onPhase?.('planning');
  let rawPlan = '';
  // onPlanToken is a LIVENESS feed, not content: the plan is delivered whole by onPlan below, but
  // this decode runs BEFORE the first hook, so without a per-token tick a no-progress stall guard
  // trips on a slow-but-live outline — the "essay could not complete: the chat model stalled" with
  // nothing streamed. (The corrective regen is the other unstreamed decode; it ticks onPulse.)
  try { rawPlan = await talker(planMessages(commission, { cue, hints: planHints, sources: sourceTexts }), { maxTokens: 400, temperature: 0.7, signal, onToken: (piece) => hooks.onPlanToken?.(piece) }); }
  catch (err) { if (aborted()) throw err; /* else walk the default arc */ }
  const { title, body: bodyHeadings, conclusion } = planOutline(rawPlan, commission);
  const outline = [...bodyHeadings, conclusion];   // the whole planned arc, handed to each section
  hooks.onPlan?.({ title, outline });

  // 2) WALK — compose the body, gating each section and extending with fresh angles until the
  //    field SATURATES (fresh sections stop landing) or the aspiration is met.
  const sections = [];           // KEPT sections only
  const ledger = new Set();      // content words spent so far — the coverage ledger
  const boundFractions = [];     // per-kept-section share of claims tied to a source (grounded runs)
  const trace = [];              // the length-decision record: every section, kept or dropped
  const droppedCandidates = [];  // veto-clean but too-thin/restating drops — for last resort
  let out = `# ${title}\n\n`;
  let words = countWords(title);
  const queue = [...bodyHeadings];
  let developIdx = 0;
  let consecutiveDrops = 0;
  let deadPasses = 0;
  let index = 0;

  // Run one talker pass for a section. `corrective` is empty on the first pass, a targeted
  // directive on the regen. Streams tokens only on the first pass (the regen replaces the bubble
  // on finalize anyway, so a double-stream would just flicker).
  const generate = async (heading, role, target, corrective, stream) => {
    const msgs = sectionMessages({
      topic: commission, title, outline, heading, index,
      total: queue.length + sections.length, tail: tailOf(out),
      targetWords: target, role, cue, sources: sourceTexts, corrective,
    });
    const raw = await talker(msgs, {
      maxTokens: tokensFor(target), temperature, signal,
      // Every decode carries a heartbeat: the first pass streams to the surface (onToken);
      // the regen replaces the section on finalize so its tokens never paint, but they still
      // tick onPulse — liveness only — so a no-progress guard doesn't trip on a slow regen.
      onToken: stream ? (piece) => hooks.onToken?.(piece, heading) : (piece) => hooks.onPulse?.(piece),
      ...(lens ? { lens } : {}),
    });
    return stripSectionHeading(stripPreamble(raw), heading, title);
  };

  // Clean a candidate for its role and return the cleaned text, which fixes it needed, and (on a
  // grounded run) the share of claims tied to a source. Two fabrication checks now run on BOTH
  // paths, because the mosquito essay proved they catch DIFFERENT failures:
  //   • the surface VETO strikes fabricated SCHOLARSHIP — stats, studies, institutions, author-
  //     date cites, "et al." lists, expert-attributed quotes. It runs even when grounded: a run
  //     that merely dresses an invention as scholarship gets it struck; a real figure the sources
  //     witness survives because it also binds below.
  //   • the injected BINDER strikes fabricated FACT — a claim tied to no span and making no
  //     lexical contact with one (invented mechanism, a parallel literature about the real topic).
  //     Only binding against real spans catches this; no surface pattern can, because the
  //     falseness is semantic, not lexical. Grounded runs only (needs spans to bind to).
  // Plus the against-section concession cut, as before.
  const cleanFor = (text, role) => {
    let t = text;
    const needed = [];
    let boundFraction = 1;
    const v = evidenceVeto(t);
    if (v.struck.length) { t = v.kept; needed.push('veto'); }
    if (binds && t) {
      const b = bind(t, spanSet);
      boundFraction = Number.isFinite(b && b.boundFraction) ? b.boundFraction : 1;
      if (b && Array.isArray(b.struck) && b.struck.length) { t = String(b.kept || '').trim(); needed.push('unground'); }
    }
    if (role === 'against') {
      const c = concessionSplit(t);
      if (c.conceded) { t = c.kept; needed.push('concede'); }
    }
    return { text: t.trim(), needed, boundFraction };
  };

  // Compose one section end-to-end: generate, clean, and — if the first pass tripped a gate —
  // regenerate once with a corrective, keeping whichever result is stronger. Returns the decision
  // { status:'kept'|'dropped'|'dead', text, words, reason, novelty }.
  const composeSection = async (heading, role) => {
    const target = role === 'land' ? Math.round(targetPerSection * 1.1) : targetPerSection;
    const gated = role === 'develop' || role === 'against';   // open and land are never dropped

    const first = await generate(heading, role, target, '', true);
    if (!first) return { status: 'dead', text: '', words: 0, reason: 'empty', novelty: 0 };
    const c1 = cleanFor(first, role);
    const nov1 = gated ? sectionNovelty(c1.text, ledger) : 1;

    // Does the first pass warrant a corrective regen? Yes if it fabricated / conceded, or (for a
    // gated section) restated, or came back too thin.
    const wants = new Set(c1.needed);
    if (gated && nov1 < NOVELTY_REGEN) wants.add('restate');
    if (countWords(c1.text) < MIN_SECTION_WORDS) wants.add('thin');

    let best = { text: c1.text, novelty: nov1, needed: c1.needed, boundFraction: c1.boundFraction };
    if (wants.size && !aborted()) {
      const corrective = [
        wants.has('veto') && 'Your previous attempt stated statistics, studies, journals, named institutions, author-date citations, or expert quotations that cannot be sourced here. Do NOT cite any figures, studies, organizations, references, or named authorities; argue from reasoning and general knowledge only.',
        wants.has('unground') && 'Your previous attempt asserted facts the provided sources do not support — invented mechanisms, figures, or a parallel literature. Ground EVERY claim strictly in the source material; do not introduce any fact, mechanism, statistic, study, quotation, or named authority the sources do not contain.',
        wants.has('concede') && 'Your previous attempt conceded the opposing case. Argue the strongest objection to the thesis without pivoting back to agreement.',
        wants.has('restate') && 'Your previous attempt largely repeated points already made. Take a genuinely new angle the earlier sections have not covered.',
        wants.has('thin') && 'Your previous attempt was too short. Develop the point fully across substantive paragraphs.',
      ].filter(Boolean).join(' ');
      const second = await generate(heading, role, target, corrective, false);
      if (second) {
        const c2 = cleanFor(second, role);
        const nov2 = gated ? sectionNovelty(c2.text, ledger) : 1;
        // Prefer the retry when it is cleaner (fewer forced fixes) or fresher and not thinner.
        const better = (c2.needed.length < best.needed.length)
          || (nov2 > best.novelty && countWords(c2.text) >= MIN_SECTION_WORDS);
        if (better) best = { text: c2.text, novelty: nov2, needed: c2.needed, boundFraction: c2.boundFraction };
      }
    }

    const bw = countWords(best.text);
    // Only GATED sections (develop / against) can be dropped. The opener and the landing are
    // structural — they are kept as long as they are non-empty, however thin, so the essay
    // always opens and always lands.
    if (bw === 0) {
      return { status: 'dropped', text: '', words: 0, reason: 'empty', novelty: 0 };
    }
    if (gated && bw < MIN_SECTION_WORDS) {
      return { status: 'dropped', text: best.text, words: bw, reason: 'thin', novelty: best.novelty };
    }
    if (gated && best.novelty < NOVELTY_DROP) {
      return { status: 'dropped', text: best.text, words: bw, reason: 'restates', novelty: best.novelty };
    }
    return { status: 'kept', text: best.text, words: bw, reason: best.needed.length ? `corrected:${best.needed.join('+')}` : 'clean', novelty: best.novelty, boundFraction: best.boundFraction };
  };

  // Write one section beat: open it, compose+gate it, then either keep (append, ledger, close) or
  // drop (retract the bubble). Returns the decision so the walk can read saturation and deadness.
  const writeSection = async (heading, role) => {
    hooks.onPhase?.('writing');
    hooks.onSection?.({ heading, index, role, words });
    let decision;
    try {
      decision = await composeSection(heading, role);
    } catch (err) {
      if (aborted()) throw err;
      decision = { status: 'dead', text: '', words: 0, reason: 'error', novelty: 0 };
    }

    if (decision.status === 'kept') {
      const at = index;
      sections.push({ heading, text: decision.text, role, words: decision.words });
      out += `## ${heading}\n\n${decision.text}\n\n`;
      words += decision.words + countWords(heading);
      for (const w of contentWords(decision.text)) ledger.add(w);
      if (binds && Number.isFinite(decision.boundFraction)) boundFractions.push(decision.boundFraction);
      index += 1;
      deadPasses = 0;
      consecutiveDrops = 0;
      trace.push({ heading, role, status: 'kept', reason: decision.reason, words: decision.words, novelty: Math.round(decision.novelty * 100) / 100, ...(binds ? { bound: Math.round((decision.boundFraction ?? 0) * 100) / 100 } : {}) });
      hooks.onSectionEnd?.({ heading, index: at, role, text: decision.text, words: decision.words, total: words });
    } else if (decision.status === 'dead') {
      deadPasses += 1;
      trace.push({ heading, role, status: 'dead', reason: decision.reason, words: 0, novelty: 0 });
      hooks.onSectionDrop?.({ heading, role, reason: decision.reason });
    } else {
      // A gate drop — the gate working, not a dead talker.
      deadPasses = 0;
      consecutiveDrops += 1;
      if (decision.words > 0) droppedCandidates.push({ heading, role, text: decision.text, words: decision.words });
      trace.push({ heading, role, status: 'dropped', reason: decision.reason, words: decision.words, novelty: Math.round(decision.novelty * 100) / 100 });
      hooks.onSectionDrop?.({ heading, role, reason: decision.reason });
    }
    return decision;
  };

  // Open, then develop. The opening is the first queued heading (usually "Introduction"); an
  // objection heading is walked as an adversarial 'against' section.
  while (sections.length < maxSections - 1 && !aborted()) {
    let heading, role;
    if (queue.length) {
      heading = queue.shift();
      role = sections.length === 0 ? 'open' : (isAgainstHeading(heading) ? 'against' : 'develop');
    } else {
      if (words >= minWords) break;                 // aspiration met — go land it
      if (consecutiveDrops >= SATURATE_STOP) break; // the field has saturated — nothing fresh left
      heading = DEVELOP_ANGLES[developIdx % DEVELOP_ANGLES.length];
      developIdx += 1;
      role = isAgainstHeading(heading) ? 'against' : 'develop';
    }
    await writeSection(heading, role);
    if (deadPasses >= DEAD_STOP) break;             // the talker is dead; stop the walk
    if (!queue.length && consecutiveDrops >= SATURATE_STOP) break;  // saturated after the plan
  }

  // FLOOR OF LAST RESORT: if the gates dropped EVERY body section (an over-repeating or gutted
  // talker), the piece would collapse to a title and a conclusion. Restore the single strongest
  // dropped candidate so the body is not empty — a gate is a decision, not a demolition.
  if (sections.length === 0 && droppedCandidates.length && !aborted()) {
    const best = droppedCandidates.slice().sort((a, b) => b.words - a.words)[0];
    const at = index;
    sections.push({ heading: best.heading, text: best.text, role: best.role, words: best.words });
    out += `## ${best.heading}\n\n${best.text}\n\n`;
    words += best.words + countWords(best.heading);
    for (const w of contentWords(best.text)) ledger.add(w);
    index += 1;
    trace.push({ heading: best.heading, role: best.role, status: 'restored', reason: 'last-resort', words: best.words, novelty: 0 });
    hooks.onSection?.({ heading: best.heading, index: at, role: best.role, words });
    hooks.onSectionEnd?.({ heading: best.heading, index: at, role: best.role, text: best.text, words: best.words, total: words });
  }

  // 3) LAND — always close on a conclusion, unless the walk was aborted or the talker is DEAD.
  //    A gate saturation is NOT a reason to skip the landing; only an unresponsive talker is. The
  //    conclusion binds no new ground by design, so it is exempt from the novelty gate.
  if (!aborted() && deadPasses < DEAD_STOP) await writeSection(conclusion, 'land');

  const text = out.trimEnd() + '\n';
  hooks.onPhase?.('done');
  const finalWords = countWords(text);
  return {
    title,
    sections,
    text,
    words: finalWords,
    metWords: finalWords >= minWords,
    saturated: consecutiveDrops >= SATURATE_STOP,     // did the walk stop because it ran dry?
    dropped: trace.filter((t) => t.status === 'dropped' || t.status === 'dead').length,
    trace,                                            // the length-decision audit log
    aborted: aborted(),
    grounded,                                         // was the piece written over researched sources?
    sourceCount: sources ? sources.length : 0,
    // The BOUND fraction: the mean share of kept-section claims actually tied back to a source
    // span — the honest measure behind the "grounded in N sources" banner. Null when no binder ran
    // (prompt-level grounding only, or the parametric path), so the banner can tell the two apart.
    boundFraction: binds && boundFractions.length
      ? Math.round((boundFractions.reduce((a, b) => a + b, 0) / boundFractions.length) * 100) / 100
      : null,
  };
};

// ── THE GROUNDED WALK — the essay routed through the reading's own physics ─────────────
//
// composeEssay above authors its plan with a model call and walks flat prose-over-spans.
// composeEssayGrounded reads the plan OFF THE PHYSICS instead: the surfer arrests where
// the reading was rewritten, each arrest is one beat, and the walk itself is the ONE
// omnimodal core (write/composition.js walkComposition — the same loop a shot list or a
// sonification would ride). This organ contributes only what is essay-shaped about the
// realization: a paragraph-scale beat target, sections opened at the arc's phases with
// deterministic headings read off the trajectory's own relations, and composeEssay's hook
// surface (onPhase/onPlan/onSection/onToken/onSectionEnd/onSectionDrop) so a UI walks
// both paths identically. The talker sits at the very end — swap it and the walk is
// unchanged. Returns null when no plan resolves (or every beat comes back empty) — the
// caller falls back to the flat walk, byte-identical when unwired.
//
// The learned-type cue does not steer this register: the grounded walk's voice is the
// cursor register (write/cursor.js), and typed steering stays with the flat path.

import { walkComposition } from '../../write/index.js';
import { surfFold, trajectory } from '../../surfer/index.js';

const GROUNDED_BEATS = 12;               // section count stays single-digit under this
const clampWords = (w) => Math.max(40, Math.min(160, w));
const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// The per-beat shape instruction, paragraph-scale (frame.js speaks in single sentences;
// an essay beat develops). The SITE still comes measured off the field — only the words
// change grain.
const paragraphTarget = (beatWords) => (frame) => {
  const shape = frame.site === 'Ground'
    ? 'open the ground — establish who and what this is about'
    : frame.site === 'Figure'
      ? 'make the move — say what changes here'
      : frame.site === 'Pattern'
        ? 'draw it together — relate this to what has already been said'
        : 'develop the point plainly';
  return `${shape}, in a grounded paragraph of about ${beatWords} words; assert only what the passages carry`;
};

// A phase's deterministic heading: the focus's first relation in that phase — "Grete fed
// Gregor", "Bob trusted Carol". Surface labels only (trajectory speaks labels, never
// ids), and ROLE-AWARE: an obj-role bond puts the focus on the receiving end ("The
// father struck Gregor", never the inverted "Gregor struck the father" — a heading
// asserting the inverse of the source would slip past the witness, which vetoes only
// beat prose).
const phaseHeading = (focus, ph) => {
  const b = (ph.relations || []).find((r) => r.role === 'subj') || (ph.relations || [])[0];
  if (!b) return null;
  const via = String(b.via || '').replace(/-/g, ' ');
  const parts = b.role === 'obj' ? [b.other, via, focus] : [focus, via, b.other];
  return capFirst(parts.filter(Boolean).join(' ').trim());
};

// A section heading read off the beat's own relation when the arc has no phase there
// (trajectory phases are sparse — the focus can sit silent through a segment).
const headingFromView = (view) =>
  capFirst(String(view.relation?.edge || view.relation?.via || 'the reading, continued').replace(/-/g, ' '));

export const composeEssayGrounded = async ({
  doc, topic, talker,
  hooks = {}, signal = null,
  targetWords = 1200, maxBeats = GROUNDED_BEATS,
  anchor = 0, reach = null,
  witnessOpts = null, focus = [],
} = {}) => {
  if (!doc?.log || typeof talker !== 'function') return null;
  hooks.onPhase?.('planning');

  // ARREST — the plan is read off the physics, never authored. The reach is the caller's
  // cost ceiling; the stop cap is raised to the walk's own beat budget (the surfer's
  // default of 5 would starve a composition before it opened).
  let surf;
  try { surf = surfFold(doc, anchor, { maxStops: maxBeats, ...(reach || {}) }); }
  catch { return null; }
  if (!surf?.stops?.length) return null;

  // THE SECTION ARC — the trajectory's phases, headed by their own first relations. One
  // derivation feeds both the onPlan outline and the section opens (one source of truth).
  const walkFocus = surf.focus ?? null;
  const traj = walkFocus ? trajectory(doc, { focus: walkFocus, segments: surf.recCursors || [] }) : null;
  const headings = new Map();
  if (traj) for (const ph of traj.phases || []) {
    const h = phaseHeading(walkFocus, ph);
    if (h) headings.set(ph.phase, h);
  }
  const beatWords = clampWords(Math.round(targetWords / Math.max(1, maxBeats)));
  const title = capFirst(String(topic || '').trim()) || 'The reading';
  hooks.onPlan?.({ title, outline: headings.size ? [...headings.values()] : [title], beats: surf.stops.length });
  hooks.onPhase?.('writing');

  const sections = [];
  let sec = null;                        // the open section: { heading, phase, role, text, beats }
  let words = countWords(title);

  // Close the open section — but a section the talker never filled is DROPPED, not kept:
  // an empty heading is not a section, and a walk whose every beat came back empty must
  // read as a failed walk (null below), never as "Done — 4 words across 2 sections".
  const closeSec = () => {
    if (!sec) return;
    if (sec.text.trim()) {
      const w = countWords(sec.text);
      words += w + countWords(sec.heading);
      sections.push({ heading: sec.heading, text: sec.text, role: sec.role, words: w });
      hooks.onSectionEnd?.({ heading: sec.heading, index: sections.length - 1, role: sec.role,
        text: sec.text, words: w, total: words });
    } else {
      hooks.onSectionDrop?.({ heading: sec.heading, role: sec.role, reason: 'empty' });
    }
    sec = null;
  };

  // The renderer — the ONLY model-shaped thing in the loop, and it owns the section
  // surface: a beat whose phase differs from the open section closes it and opens the
  // next (sections are phases), then the talker streams the beat into it.
  const render = async (view) => {
    const phase = view.arc ? view.arc.phase : 0;
    if (!sec || sec.phase !== phase) {
      closeSec();
      sec = {
        heading: headings.get(phase) || headingFromView(view), phase,
        role: sections.length === 0 ? 'open' : 'develop', text: '', beats: 0,
      };
      hooks.onSection?.({ heading: sec.heading, index: sections.length, role: sec.role, words });
    }
    if (sec.beats > 0) hooks.onToken?.(' ', sec.heading);   // the beat joiner, streamed too
    const raw = await talker(view.input, {
      maxTokens: view.budget, signal,
      onToken: (piece) => hooks.onToken?.(piece, sec.heading),
    });
    const text = String(raw || '').trim();
    if (text) { sec.text += (sec.beats ? ' ' : '') + text; sec.beats += 1; }
    return { output: text, text };
  };

  const walk = await walkComposition({
    doc, surf, renderer: render, focus,
    budget: tokensFor(beatWords), targetOf: paragraphTarget(beatWords),
    witnessOpts, signal, onBeat: hooks.onBeat || null,
  });
  if (!walk) return null;
  closeSec();
  if (!sections.length) return null;     // every beat came back empty — a failed walk, the caller falls back
  sections[sections.length - 1].role = 'land';
  hooks.onPhase?.('done');

  // The honest numbers: claims kept vs retracted across the witnessed beats (the walk's
  // own cite-or-hedge), and the source spans the beats actually stood on.
  let keptClaims = 0, retracted = 0;
  const spanIdxs = new Set();
  for (const b of walk.beats) {
    if (b.witness) { keptClaims += (b.witness.kept || []).length; retracted += (b.witness.retractions || []).length; }
    for (const s of b.sources) spanIdxs.add(s);
  }
  const text = `# ${title}\n\n` + sections.map((s) => `## ${s.heading}\n\n${s.text}`).join('\n\n');
  return {
    title, sections, text,
    words: countWords(text),
    targetWords,
    aborted: !!walk.aborted || !!signal?.aborted,
    grounded: true,
    sourceCount: spanIdxs.size,
    sourceSpans: [...spanIdxs],
    boundFraction: (keptClaims + retracted) > 0
      ? Math.round((keptClaims / (keptClaims + retracted)) * 100) / 100
      : null,
    beats: walk.beats, arc: walk.arc, retractions: walk.retractions, flags: walk.flags,
  };
};

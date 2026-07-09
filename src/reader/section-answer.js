// sectionAnswer — mechanically impose section headings on a flat prose answer, by watching
// the ENTITY FIELD shift across its sentences. This is the same move detectStructure (app.dc.js)
// makes on a read document — a field-shift boundary detector with a mechanically-derived label —
// applied here to the answer the machine just wrote (and re-reads via reflectAnswer). The point of
// the metacognition-steers-the-shape change is that the talker writes grounded prose it is good at
// and never formats; the machine that re-reads the answer imposes the structure. Headings become an
// OUTPUT of the reading, not an instruction to the writer — so even a small model that will not emit
// "##" gets a sectioned answer.
//
// v1 is PLACEHOLDER-FIRST: labels are drawn from the segment's dominant NEW entity (cleaned,
// title-cased), preferring a discourse `lead` term when one lands in the segment. The Born-salient
// figure per segment (metacognition.meaningfulness) is the documented upgrade path for better labels;
// v1 uses entity frequency × novelty, which is honest and needs no eigenmap.

import { parseText } from '../perceiver/parse/pipeline.js';
import { meaningfulness } from '../surfer/metacognition.js';
import { structuralActivations } from '../surfer/structure-basis.js';

const STOP = new Set('the a an of to in on for and or but with without into from by as at it its this that these those they them he she his her him you your we our i me my is are was were be been being do does did has have had not no so then than also more most such which who whom whose what when where why how also using used use their there here also could would should can may might will while when also across through more than one first also over about into out up down off away back also many much few some any all both each other another same different new old great good better best'.split(' '));

// content tokens of a string — lowercased words ≥4 chars that aren't stopwords.
const contentToks = (s) => (String(s || '').toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []).filter((t) => !STOP.has(t));

const titleCase = (s) => String(s || '').trim().replace(/\s+/g, ' ')
  .split(' ').slice(0, 5)
  .map((w) => w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w).join(' ');

// A label is only worth showing if it reads like a content phrase, not a stray token.
const labelOk = (s) => { const t = String(s || '').trim(); return t.length >= 3 && /[A-Za-z]/.test(t) && !STOP.has(t.toLowerCase()); };

// sectionAnswer(answer, {leads}) → { sectioned, sections:[{heading, level, sentences:[...] }], activations }
export const sectionAnswer = (answer, { leads = [], minPerSection = 2, minSections = 2, dissim = 0.55 } = {}) => {
  const text = String(answer || '').trim();
  const doc = parseText(text, { docId: 'answer', totalRead: true });
  const sents = doc.sentences || [];
  const N = sents.length;
  const single = () => ({ sectioned: false, sections: [{ heading: null, level: 0, sentences: sents.slice() }] });

  // Too short to section — one idea, a tight paragraph (the emergent ideal for a pointed answer).
  if (N < minPerSection * minSections) return single();

  // Meaningfulness gate: only section content that actually coheres into a reading (not a smear).
  const { activations } = structuralActivations(doc);
  const meaning = meaningfulness(activations);

  // 1) entity set per sentence, from the log's INS/CON/SIG events.
  const events = doc.log && doc.log.snapshot ? doc.log.snapshot() : [];
  const perSent = sents.map(() => new Set());
  for (const e of events) {
    if (e.sentIdx == null || e.sentIdx < 0 || e.sentIdx >= N) continue;
    for (const id of [e.id, e.src, e.tgt].filter(Boolean)) perSent[e.sentIdx].add(id);
  }

  // 2) boundary strength at each seam: 1 − Jaccard between the windows either side. The field
  //    shifting and staying shifted across a small window is a topic boundary (detectStructure's
  //    fallback math, windowed for short answers).
  const W = Math.max(1, Math.round(N / 5));
  const win = (lo, hi) => { const s = new Set(); for (let k = Math.max(0, lo); k < Math.min(N, hi); k++) for (const e of perSent[k]) s.add(e); return s; };
  const seams = [];
  for (let i = 1; i < N; i++) {
    const L = win(i - W, i), R = win(i, i + W);
    if (L.size < 1 || R.size < 1) continue;
    let x = 0; for (const e of L) if (R.has(e)) x++;
    const d = 1 - x / Math.sqrt(L.size * R.size);
    if (d >= dissim) seams.push({ i, d });
  }
  seams.sort((a, b) => b.d - a.d);

  // 3) choose boundaries: strongest first, keep min gap so no section is shorter than minPerSection.
  const bounds = [];
  const ok = (i) => (i >= minPerSection) && (N - i >= minPerSection) && bounds.every((b) => Math.abs(b - i) >= minPerSection);
  for (const s of seams) { if (ok(s.i)) bounds.push(s.i); }
  bounds.sort((a, b) => a - b);
  if (!bounds.length) return single();

  // 4) build segments and label each. The FIRST segment is the direct lead — no heading. Each
  //    later segment gets a label from its dominant NEW entity (novel to that segment), preferring
  //    a discourse `lead` term that appears in it.
  const cuts = [0, ...bounds, N];
  const leadOrder = (leads || []).map((l) => String(l).toLowerCase());
  const leadSet = new Set(leadOrder);

  // Global content-term frequency, so a per-segment term can be scored for DISTINCTIVENESS
  // (appears here, not everywhere). The answer's subject recurs in every segment — the entity
  // field named it "Lindbergh"; distinctiveness is what keeps it OUT of the headings.
  const global = new Map();
  const segToks = sents.map((s) => contentToks(s));
  for (const ts of segToks) for (const t of ts) global.set(t, (global.get(t) || 0) + 1);

  const sections = [];
  for (let s = 0; s < cuts.length - 1; s++) {
    const lo = cuts[s], hi = cuts[s + 1];
    const segSents = sents.slice(lo, hi);
    let heading = null;
    if (s > 0) {
      // The heading names what THIS segment is about. Candidate terms = the segment's content
      // tokens. Score: a discourse LEAD wins outright (the metacognition already surfaced it as
      // what must be found out); otherwise the most DISTINCTIVE term — frequent here, rare in the
      // rest of the answer (tf·idf-ish) — so the recurring subject is suppressed and the topic wins.
      const segFreq = new Map();
      for (let k = lo; k < hi; k++) for (const t of segToks[k]) segFreq.set(t, (segFreq.get(t) || 0) + 1);
      let best = null, bestScore = -Infinity, bestLead = false, bestDistinct = 0;
      for (const [t, c] of segFreq) {
        if (!labelOk(t)) continue;
        const rest = (global.get(t) || 0) - c;                 // occurrences outside this segment
        const distinct = c / (1 + rest);                       // high when concentrated here
        const lead = leadSet.has(t);
        const score = (lead ? 100 - leadOrder.indexOf(t) : 0) + distinct + c * 0.01;
        if (score > bestScore) { bestScore = score; best = t; bestLead = lead; bestDistinct = distinct; }
      }
      // Only label when the heading is EARNED: the metacognition already named this term a lead, or
      // it is genuinely concentrated here (distinct ≥ 1.5). A summary/conclusion segment with no
      // distinctive topic (the fame-and-duration tail) gets NO heading — it flows on as prose, which
      // reads far better than a forced "Lindbergh Stayed". Placeholder ≠ junk.
      if (best && (bestLead || bestDistinct >= 1.5)) {
        // Grow to a 1–2 word phrase only from a RARE modifier (global freq ≤ 1) — so "magnetic
        // compass" / "side windows" survive but the recurring subject never gets prepended.
        const m = new RegExp('\\b([a-z][a-z\'-]{3,})\\s+' + best + '\\b', 'i').exec(segSents.join(' '));
        const mod = m && m[1].toLowerCase();
        heading = titleCase(mod && !STOP.has(mod) && (global.get(mod) || 0) <= 1 ? mod + ' ' + best : best);
      }
    }
    sections.push({ heading, level: s === 0 ? 0 : 2, sentences: segSents });
  }

  return { sectioned: sections.some((x) => x.heading), sections, meaning };
};

// renderSectioned(result) → markdown string with "## Heading" before each labelled segment.
export const renderSectioned = (result) => {
  if (!result || !result.sections) return '';
  return result.sections.map((sec) => {
    const body = sec.sentences.map((s) => String(s).trim()).join(' ');
    return sec.heading ? `## ${sec.heading}\n${body}` : body;
  }).join('\n\n');
};

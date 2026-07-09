// fold/deep-reading.js — DEEP READING: the reflection at the place of most interest.
//
// The chat posture is inert until prompted; idle.js already argued that idleness is the
// suppression to justify, not the machine's nature (SPEC §15). idle.js walks the OPEN
// SET (the voids) against freshly ingested exafference. Deep reading is the other half of
// the same continuity: when the model is not otherwise busy, instead of waiting on a void
// to be closed by the world, the reading turns back on the DOCUMENT IT ALREADY HOLDS —
// it surfs to the place of most interest, folds it, and has a reflection about it.
//
// The three pieces already exist; deep reading only composes them, with the epistemics
// and the ontology made exact:
//
//   PLACE OF MOST INTEREST — the SURFER's peak (docs/surfing-the-fold.md). Not a router's
//     choice; the reading measures where its own field is steepest (Bayesian surprise) and
//     steps there. With a live conversation thread the peak is re-weighted by salience
//     (surfer/salience.js, the Born rule) so "most interesting" means most interesting to
//     what is being discussed; idle, with no thread, it is the document's own steepest
//     structure. Either way it is read off the physics, never authored.
//
//   THE FOLD — foldNote at that peak (fold/integral.js): the unit of evidence the reading
//     reads, existence + structure + significance integrated, every line carrying its
//     source index so a citation still binds.
//
//   THE REFLECTION — the reading's own act of EVALUATING that fold against its frame. Model-
//     free by default (write/think.js: "thinking needs no model" — the reflection is the
//     significance read voiced as an inner note); a caller with a model injects a richer
//     voice. Either way the epistemics below are identical.
//
// EPISTEMICS — why this is safe to add to the graph (the firewall, idle.js I2 / SPEC §8):
//   A reflection is REAFFERENCE — the reading's own output, mine, `fromEnactor`. By the §8
//   type law canWitness(prov) === false: it can organize attention and continuity but it
//   CANNOT witness anything as world. It rides the graph at band VOID — held open, an
//   interpretation, never asserted as a firm fact — and `grounded:false`. Only a human's
//   witness act could ever promote it (idle.js's confirm). So the loop can reflect freely
//   without laundering self-talk into record: the firewall is the TYPE, not a flag.
//
// ONTOLOGY — which of the nine operators a reflection IS (core/operators.js):
//   EVA — Relate × Interpretation, "evaluate". A reflection is the reading judging a
//   particular (the folded place) against its established terms — exactly the enacted loop's
//   EVA (significance-loop.md, core/enacted/loop.js), so the reflection carries the same
//   verdict (confirm | strain) and surprise. It is tagged `register:'enacted'` (the reading's
//   OWN act, register.js) so it is never conflated with a depicted perception, and projectGraph
//   deliberately skips EVA ("EVA, REC: live in the rules ledger, not in this projection") —
//   so a reflection can NEVER be mistaken for a depicted edge/fact. It surfaces instead as a
//   first-class eo:Reflection node in the reading substrate (fold/substrate.js), beside the
//   eo:Tension (held EVA) and eo:Reframing (located REC) that already live there.
//
// SELF-TERMINATING (idle.js I3) — the loop reflects only where the place BEATS the reach's
// own band (the significance is real, not the flat between peaks), habituates to places it
// has already read (never re-reflects — the cure for rumination), and quiesces when no fresh
// place beats the band. It never spins; a maxPasses backstop is the hard bound.
//
// This is the deterministic ENGINE — surf and reflect injected, no timers, no DOM — so it is
// testable, and a product surface (the app's idle tick) is pure presentation over this state.
// "Not otherwise busy" is the CALLER's signal (only it knows a turn is not in flight); the
// engine exposes arrive() as the wake-on-idle entry (I4), never a self-poll.

import { fromEnactor, canWitness } from '../core/index.js';
import { foldNote } from './integral.js';

export const RESTING = 'resting';
export const READING = 'reading';
export const REFLECTION_ENACTMENT = 'deep-reading';

// A small mulberry32 PRNG — the same governed noise idle.js uses (I5): a seed steers WHICH
// place the walk starts from, never the content. Re-declared here so fold/ imports nothing
// from write/ (holon discipline).
export const seededRng = (seed = 1) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const round = (x) => Math.round(x * 1e4) / 1e4;

const median = (xs) => {
  const s = (xs || []).filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// buildReflection — the ONE append-only event a deep reading deposits, with the ontology
// and epistemics above made concrete. An EVA (the evaluate operator) at the enacted register
// (the reading's own act), reafferent (canWitness false — the firewall), band void (held
// open), grounded false. The cursor IS the place of most interest, so the reflection grounds
// and replays there like every other event on the log.
export const buildReflection = ({
  cursor, focus = null, particular = null, verdict = null, surprise = null,
  body = '', sources = [], enactment = REFLECTION_ENACTMENT,
} = {}) => {
  const prov = fromEnactor(enactment);                 // reafference — the firewall is the TYPE
  return Object.freeze({
    op: 'EVA',                    // ontology: Relate × Interpretation — the reflection operator
    register: 'enacted',          // the reading's OWN act (register.js) — never a depicted perception
    reader: 'reading',
    reflection: true,             // this EVA is a deep-reading reflection (readReflections keys on it)
    layer: 'reflection',
    cursor, sentIdx: cursor,      // the place of most interest — grounds / replays here
    focus, particular: particular ?? focus,
    verdict, surprise,            // the enacted verdict against the frame (confirm | strain)
    body: String(body ?? ''),
    sources: Object.freeze([...sources]),
    band: 'void',                 // epistemics: held OPEN, an interpretation — never asserted firm
    grounded: false,
    prov, door: 'enactor',        // reafferent — canWitness(prov) === false (§8); reflect.js reads e.door
  });
};

// reflectFold — the MODEL-FREE reflection (write/think.js: thinking needs no model). The
// reading's own significance read AT the place of most interest, phrased as a terse inner
// note and judged against the reach's band. A caller with a model injects `reflect` for a
// richer voicing; the epistemics of what gets stored are identical either way.
const condense = (s) => {
  const t = String(s || '').trim();
  if (t.length <= 160) return t;
  const cut = t.slice(0, 160);
  const stop = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf('; '), cut.lastIndexOf(' — '));
  return (stop > 60 ? cut.slice(0, stop) : cut.replace(/\s+\S*$/, '')) + '…';
};

const reflectFold = (fold, { focus = null, surprise = null, band = null } = {}) => {
  const verdict = (surprise != null && band != null) ? (surprise < band ? 'confirm' : 'strain') : null;
  const sig = fold?.levels?.significance?.summary || null;
  const lead = focus ? `${focus}: ` : '';
  const body = (sig ? `${lead}${sig}` : `${lead}${condense(fold?.text || '')}`).trim();
  return { body, verdict };
};

// The spans the fold reads AROUND the place of most interest — a little behind (the frame the
// place sits inside) and mostly ahead (a reading rides forward), mirroring the surfer's reach.
const spansAround = (doc, peak, { back = 1, ahead = 2 } = {}) => {
  const sents = doc.units || doc.sentences || [];
  const lo = Math.max(0, peak - back);
  const hi = Math.min(sents.length - 1, peak + ahead);
  const out = [];
  for (let i = lo; i <= hi; i++) out.push({ idx: i, text: String(sents[i] ?? '') });
  return out;
};

const bayesAtOf = (field) => {
  const by = new Map((field || []).map((f) => [f.idx, f.bayes]));
  return (c) => by.get(c) ?? 0;
};
const focusAtOf = (field) => {
  const by = new Map((field || []).map((f) => [f.idx, f.focus]));
  return (c) => by.get(c) ?? null;
};

// deepReading — ONE pass. Surf to the place of most interest, fold it, reflect, and (by
// default) append the reflection to the graph.
//   surf      INJECTED — (doc, anchor, opts) => surfFold result ({ stops, peak, focus, field }).
//             Injected, not imported, so the engine is testable and fold/ imports no surfer
//             internals (the caller wires the real surfFold + the live thread).
//   reflect   OPTIONAL — (fold, ctx) => { body, verdict }. Absent → the model-free inner note.
//   thread    OPTIONAL — the activated conversation thread; passed to surf so the peak is
//             salience-weighted toward what is being discussed (surfer/salience.js).
//   anchor    where the surfer is set down (default the document head).
//   visited   a Set of cursors already reflected on — habituation (never re-reflect a place).
//   commit    append the reflection to doc.log (default true — "added to the graph"). false
//             returns the built event without appending (the governed loop peeks first).
// Returns the reflection record, or null when there is nothing fresh worth reflecting on.
export const deepReading = (doc, {
  surf, reflect = null, thread = null, anchor = 0, visited = null,
  enactment = REFLECTION_ENACTMENT, commit = true,
} = {}) => {
  if (typeof surf !== 'function') throw new Error('deepReading: surf(doc, anchor, opts) must be injected');
  if (!doc || !doc.log) return null;

  const s = surf(doc, anchor, thread ? { thread } : {}) || null;
  if (!s || !Array.isArray(s.stops) || s.stops.length === 0) return null;

  const field = s.field || [];
  const bayesAt = bayesAtOf(field);
  const focusAt = focusAtOf(field);

  // the place of most interest: the steepest UNVISITED stop (habituation — never re-reflect
  // a place already read; the cure for rumination, think.js). Nothing fresh → quiesce.
  const seen = visited instanceof Set ? visited : new Set(visited || []);
  const candidates = s.stops.filter((c) => !seen.has(c));
  if (!candidates.length) return null;
  let peak = candidates[0];
  for (const c of candidates) if (bayesAt(c) > bayesAt(peak)) peak = c;

  const band = median(field.map((f) => f.bayes));
  const surprise = bayesAt(peak);
  const focus = focusAt(peak) ?? s.focus ?? null;

  // fold the region at the place of most interest — the unit of evidence the reflection reads.
  const spans = spansAround(doc, peak);
  const fold = foldNote(spans, { doc, cursor: peak, surf: s });
  const sources = (fold.sources && fold.sources.length) ? fold.sources : spans.map((x) => x.idx);

  // reflect about it — an injected model voice, or the model-free inner note.
  const r = reflect
    ? reflect(fold, { doc, cursor: peak, focus, surprise, band, surf: s })
    : reflectFold(fold, { focus, surprise, band });
  const body = (r && r.body) || '';
  if (!body) return null;                              // nothing to say → no empty reflection

  const event = buildReflection({
    cursor: peak, focus, particular: focus, verdict: r?.verdict ?? null,
    surprise: round(surprise), body, sources, enactment,
  });
  const appended = commit ? doc.log.append(event) : null;

  return Object.freeze({
    peak, focus, band: round(band), surprise: round(surprise), verdict: r?.verdict ?? null,
    fold, body, sources: Object.freeze([...sources]),
    event: appended || event,
    committed: !!appended,
    canWitness: canWitness((appended || event).prov),   // false — the firewall, surfaced
  });
};

// createDeepReader — the governed idle loop over a document's places of interest. The
// deep-reading sibling of createIdleLoop: reafferent, firewalled, self-terminating, woken
// by the caller's "not busy" signal (arrive), never a self-poll.
export const createDeepReader = ({
  doc, surf, reflect = null, thread = null,
  medianBand = 0, rng = seededRng(1), enactment = REFLECTION_ENACTMENT, maxPasses = 32,
} = {}) => {
  if (!doc || !doc.log) throw new Error('createDeepReader: a doc with a log is required');
  if (typeof surf !== 'function') throw new Error('createDeepReader: surf must be injected');

  let state = RESTING;
  const visited = new Set();      // places already reflected on — habituation (the rumination cure)
  const reflections = [];
  const trail = [];

  // one governed pass at `anchor`. Peeks (commit:false), applies the median-band governor,
  // and only THEN commits — so a below-band place leaves no reflection on the log.
  const step = (anchor = 0) => {
    const r = deepReading(doc, { surf, reflect, thread, anchor, visited, enactment, commit: false });
    if (!r) return { reflection: null, quiesce: true };     // nothing fresh → rest
    visited.add(r.peak);
    // I3 — the median-band governor: reflect only where the place beats the reach's own band
    // AND any caller floor (the significance is real, not the flat). Below → nothing worth
    // saying (re-narrating the settled record would be rumination) → quiesce.
    const worth = r.surprise > Math.max(medianBand, r.band);
    let reflection = null;
    if (worth) {
      const event = doc.log.append(r.event);               // commit — added to the graph
      reflection = Object.freeze({ ...r, event, committed: true });
      reflections.push(reflection);
    }
    trail.push(Object.freeze({ peak: r.peak, surprise: r.surprise, band: r.band, worth }));
    return { reflection, quiesce: !worth };
  };

  // arrive — WAKE ON IDLE (I4): the caller signals the model is not otherwise busy, and the
  // reader runs governed passes until it quiesces (I3). The anchor rides forward from the
  // place just read, so the walk covers the document rather than circling the head.
  const arrive = ({ anchor = 0 } = {}) => {
    state = READING;
    const before = reflections.length;
    const last = () => (reflections.length ? reflections[reflections.length - 1].peak : anchor);
    const nSent = (doc.units || doc.sentences || []).length || 1;
    let passes = 0, a = anchor;
    while (state === READING && passes < maxPasses) {
      passes++;
      const { quiesce } = step(a);
      if (quiesce) { state = RESTING; break; }
      a = Math.min(nSent - 1, last() + 1);                  // the surf rides forward
    }
    if (passes >= maxPasses) state = RESTING;               // never spin
    return { state, passes, reflections: reflections.slice(before), quiesced: state === RESTING };
  };

  return {
    get state() { return state; },
    get reflections() { return reflections.slice(); },
    get trail() { return trail.slice(); },
    step, arrive,
    // I2, surfaced as a predicate: a reflection can NEVER ground itself — its reafferent type bars it.
    canGround: (r) => canWitness(r?.event?.prov ?? null),
    isResting: () => state === RESTING,
  };
};

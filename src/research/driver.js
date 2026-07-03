// research/driver.js — the grounded research driver (docs/deep-research-log.md).
//
// Wires the machinery that already exists into ONE run that only appends
// ResearchEvents; the report is projectReport(log) afterward. The disciplines,
// unchanged:
//
//   retrieval/relevance  the bind measurement, not a model judgment — a span is
//                        relevant iff it binds to the frame subject above the
//                        null (surfer/answerable.js fieldVerdict)
//   extraction           selection — you cannot hallucinate a fact you quote by
//                        reference (the span address is the fact)
//   importance           the enacted significance loop: causal calibration
//                        (core/enacted calibrateReader), confirm/strain, leaky
//                        strain, REC on accumulation — importance is earned
//   corroboration        proposition equivalence, mechanical (an injected
//                        embedder rides perceiver/proposition-equivalence.js;
//                        offline, a transparent term-overlap fallback)
//   asking               fires on the measured conditions only: VOID, fork,
//                        REC, depth, and the corpus preliminary
//   the model            confined to ONE phrasing call per section, fed
//                        verbatim excerpts only, and bind-checked: every
//                        summary sentence must bind to a source span above the
//                        null or it is greyed as glue
//
// Everything is injectable (search, pin fetch, model, ask, clock) and the run
// is offline-safe: no model → a spans-only report; no fetch → local pins; an
// off-topic corpus → a measured VOID, never a false-matched report (the Bieber
// non-regression, tests/research-log.test.js).

import {
  openResearch, pinSource, readSpan, extractProposition, evaTest, conEdge,
  recFrame, voidAbsence, askUser, answerAsk, promoteProposition, phraseSection,
} from './events.js';
import { projectReport } from './project.js';
import { pinPayload, locateSpan } from '../archive/pin.js';
import { admitWebSource } from '../ingest/websource.js';
import { fieldVerdict, ANSWERABLE_ALPHA } from '../surfer/answerable.js';
import { researchTerms, profileOf, curiosityOf, foldInto } from '../turn/research.js';
import { calibrateReader } from '../core/enacted/loop.js';
import { OPERATORS } from '../core/operators.js';
import { terrainOf, stanceOf } from '../core/cube.js';
import { MAX_FANOUT, MAX_DEPTH } from '../frame/constants.js';

// ── The lexical operator reading (the addressing fallback) ──────────────────
// The cube address of a reported change, read from surface cues. An injected
// classifier (opts.addressOf — e.g. the phasepost centroid reader when a model
// is live) takes precedence; this fallback is transparent and deterministic so
// the coverage grid is never a model judgment either. Grain defaults to Figure
// (a specific thing changed); terrain/stance follow from the operator's own
// domain/mode so the fallback address is always on the Object diagonal.
const OP_CUES = [
  ['REC', /\b(renam\w+|reclassif\w+|redefin\w+|refram\w+|restructur\w+|became known as|rebrand\w+)\b/i],
  ['NUL', /\b(withdr\w+|withheld|remov\w+|cancel\w+|denied|refus\w+|declin\w+|never disclosed|undisclosed|suppress\w+|redact\w+)\b/i],
  ['SYN', /\b(merg\w+|integrat\w+|consolidat\w+|combin\w+|unif\w+)\b/i],
  ['SEG', /\b(split|divid\w+|separat\w+|partition\w+|jurisdiction\w*|carve\w*)\b/i],
  ['CON', /\b(contract\w*|agreement\w*|signed|partner\w+|awarded|deal\b|memorandum)\b/i],
  ['INS', /\b(launch\w+|creat\w+|found\w+|establish\w+|deploy\w+|built|introduc\w+|open\w+)\b/i],
  ['EVA', /\b(rul\w+|judg\w+|found that|conclud\w+|critici[sz]\w+|assess\w+|audit\w+|overr[au]n\w*|fail\w+|violat\w+)\b/i],
  ['SIG', /\b(according to|attribut\w+|report\w+ by|cited|stated by)\b/i],
];
export const addressOfSentence = (text) => {
  let op = 'DEF';
  for (const [id, re] of OP_CUES) if (re.test(text)) { op = id; break; }
  const grain = 'Figure';
  return {
    op, grain,
    terrain: terrainOf(OPERATORS[op].domain, grain),
    stance: stanceOf(OPERATORS[op].mode, grain),
  };
};

// ── Offline proposition equivalence (the corroboration fallback) ────────────
// Two spans assert the same proposition when their term sets overlap above
// threshold; the same proposition under opposite polarity is a contradiction.
// The injected-embedder path (perceiver/proposition-equivalence.js) replaces
// this wholesale when a vector reader is live; the shape of the con events is
// identical either way.
const NEG = /\b(not|no|never|denied|denies|refused|refuses|without|didn't|doesn't|isn't|wasn't|weren't)\b/i;
const polarityOf = (text) => (NEG.test(text) ? '-' : '+');
export const termSimilarity = (aTerms, bTerms) => {
  const A = new Set(aTerms), B = new Set(bTerms);
  if (!A.size || !B.size) return { sim: 0, shared: 0 };
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return { sim: shared / Math.min(A.size, B.size), shared };
};

const SIM_THRESHOLD = 0.6;
const SIM_MIN_SHARED = 3;

// ── The run ──────────────────────────────────────────────────────────────────
//
// runGroundedResearch(question, opts) → { log, report }
//
//   sources        [{ url?, title?, text }] — the pinned corpus (pasted or fetched)
//   search         async (query) => [{ url?, title?, text }] — optional, widens the corpus
//   subQuestions   [string] — sub-frames to push under the root (the frame tree)
//   model          { phrase: async (messages) => string } — the ONE checked call per section
//   ask            async (askEvent) => string|null — the human in the loop; null leaves it open
//   fetch, now     for archive pinning (offline default: local pins)
//   alpha          the hallucination budget (ANSWERABLE_ALPHA) — larger asks less
//   maxSpansPerSource / maxPerSection — extraction and promotion caps, logged, not silent
//   onEvent        (event, log) => void — the live view's feed
export const runGroundedResearch = async (question, opts = {}) => {
  const {
    sources = [], search = null, subQuestions = [],
    model = null, ask = null, fetch: netFetch = null, now = null, save = true,
    alpha = ANSWERABLE_ALPHA, addressOf = addressOfSentence,
    maxSpansPerSource = 6, maxPerSection = 12,
    onEvent = null,
    // The LIVE-surface seam: pass an existing log to APPEND this run to it — the
    // surface is a projection of the whole log, so further research via chat
    // keeps populating the same report (never a dead artifact). `rootId`
    // namespaces this run's frames; pin/prop/ask counters continue from the
    // log so ids never collide across runs.
    log = [],
    rootId = log.some((e) => e.kind === 'open') ? `r${log.filter((e) => e.kind === 'open' && e.parentId == null).length}` : 'root',
  } = opts;

  let t = log.length ? Math.max(...log.map((e) => e.t ?? 0)) + 1 : 0;
  const emit = (e) => { log.push(e); if (onEvent) { try { onEvent(e, log); } catch { /* view errors never stop the run */ } } return e; };
  const tick = () => t++;
  let askN = log.filter((e) => e.kind === 'ask').length;
  let pinN = log.filter((e) => e.kind === 'pin').length;
  let propN = log.filter((e) => e.kind === 'extract').length;

  const q = String(question || '').trim();
  const subject = researchTerms(q);

  // The root frame of THIS run. Sub-questions push child frames under it (the
  // frame stack); the depth guard is the shared runaway guard, reused unchanged.
  emit(openResearch({ id: rootId, question: q, subject, scope: { alpha }, depth: 0, t: tick() }));
  const kids = subQuestions.slice(0, MAX_FANOUT).map((sq, i) => {
    const id = `${rootId}.${i}`;
    emit(openResearch({ id, parentId: rootId, question: String(sq), subject: researchTerms(sq), depth: 1, t: tick() }));
    return { id, question: String(sq) };
  });
  if (subQuestions.length > MAX_FANOUT) {
    const a = askUser({
      id: `ask:${askN++}`, frameId: rootId, trigger: 'depth',
      text: `The plan spawned ${subQuestions.length} threads; the budget is ${MAX_FANOUT}. Which to pursue?`,
      options: subQuestions.map(String), t: tick(),
    });
    emit(a);
    const reply = ask ? await safeAsk(ask, a) : null;
    if (reply != null) emit(answerAsk({ askId: a.id, reply, t: tick() }));
  }
  const frames = [{ id: rootId, question: q }, ...kids].filter((f) => f.question);

  // Preliminary — the corpus must be a specified cell-region, not a vague string.
  let corpus = [...sources];
  if (!corpus.length && search) {
    try { corpus = (await search(q)) || []; } catch { corpus = []; }
  }
  if (!corpus.length) {
    const a = askUser({
      id: `ask:${askN++}`, frameId: rootId, trigger: 'corpus',
      text: 'No pinned corpus and no search — which sources, what dates?', t: tick(),
    });
    emit(a);
    const reply = ask ? await safeAsk(ask, a) : null;
    if (reply != null) emit(answerAsk({ askId: a.id, reply, t: tick() }));
    emit(voidAbsence({ frameId: rootId, terrain: 'Entity-gap', receipt: 'no sources pinned', t: tick() }));
    return { log, report: projectReport(log) };
  }

  // Pin every source BEFORE it is read — the provenance anchor. The pin
  // degrades to a local record offline; the content hash never degrades. A
  // source already pinned in this log (same content hash — a follow-up ask
  // over the same corpus) reuses its pin: one snapshot, many reads.
  const priorPins = new Map(log.filter((e) => e.kind === 'pin').map((e) => [e.contentHash, e.id]));
  const pinned = [];
  for (const src of corpus) {
    const text = String(src.text || '');
    if (!text.trim()) continue;
    const payload = await pinPayload({ url: src.url ?? null, title: src.title ?? null, text, fetch: netFetch, save, now });
    let pinId = priorPins.get(payload.contentHash);
    if (!pinId) {
      pinId = `pin:${pinN++}`;
      emit(pinSource({ id: pinId, ...payload, t: tick() }));
      priorPins.set(payload.contentHash, pinId);
    }
    const { doc } = admitWebSource({ url: src.url || `pinned:${pinId}`, text });
    pinned.push({ pinId, text, doc, title: src.title ?? null });
  }

  // ── Per-frame: bind, VOID-gate, extract, the significance loop ────────────
  for (const frame of frames) {
    const fq = frame.question;
    const fTerms = researchTerms(fq);

    // The bind measurement per source: score each sentence by its overlap with
    // the frame subject; the spans that clear the strong gate are the reads.
    let anyBind = false;
    const extracts = []; // { pinId, sentence, idx, score }
    for (const p of pinned) {
      const sentences = p.doc.sentences || [];
      const scored = sentences.map((s, idx) => {
        const toks = p.doc.tokensBySentence?.[idx];
        let overlap = 0;
        for (const term of fTerms) if (toks?.has(term)) overlap++;
        return { idx, sentence: s, overlap, score: fTerms.length ? overlap / fTerms.length : 0 };
      });
      const spans = scored.filter((x) => x.overlap > 0).map((x) => ({ idx: x.idx, score: x.score }));
      const verdict = fieldVerdict(p.doc, fq, spans, { alpha });
      if (verdict.void) {
        // This source is silent on the frame — a read that measured nothing is
        // still a measurement, but nothing here may be extracted.
        continue;
      }
      anyBind = true;
      const strong = scored.filter((x) => x.overlap >= 2 || x.score >= 0.5)
        .sort((a, b) => b.overlap - a.overlap).slice(0, maxSpansPerSource);
      for (const hit of strong) {
        const span = locateSpan(p.text, hit.sentence);
        emit(readSpan({
          frameId: frame.id, pinId: p.pinId, span: { ...span, sentence: hit.idx },
          bind: { score: round3(hit.score), overlap: hit.overlap, pass: true }, t: tick(),
        }));
        extracts.push({ pinId: p.pinId, sentence: hit.sentence, idx: hit.idx, span, score: hit.score });
      }
    }

    // The VOID gate, turned into a question rather than a flat "does not say".
    if (!anyBind || !extracts.length) {
      const named = (fq.match(/\b[A-Z][A-Za-z'’-]{2,}\b/g) || []).filter((w) => !fTerms.includes(w.toLowerCase()));
      const inCorpus = pinned.some((p) => p.doc.sentences?.some((s, i) => fTerms.some((term) => p.doc.tokensBySentence?.[i]?.has(term))));
      const terrain = !inCorpus && subject.length ? 'elsewhere' : 'never-set';
      emit(voidAbsence({
        frameId: frame.id, terrain,
        receipt: `scanned ${pinned.reduce((n, p) => n + (p.doc.sentences?.length || 0), 0)} sentences across ${pinned.length} pinned source${pinned.length === 1 ? '' : 's'}`,
        term: terrain === 'elsewhere' ? (named[0] ?? fTerms[0] ?? null) : null, t: tick(),
      }));
      const a = askUser({
        id: `ask:${askN++}`, frameId: frame.id, trigger: 'void',
        text: `The pinned set is silent on “${fq}” — widen the corpus, supply a source, or record the absence?`, t: tick(),
      });
      emit(a);
      const reply = ask ? await safeAsk(ask, a) : null;
      if (reply != null) emit(answerAsk({ askId: a.id, reply, t: tick() }));
      continue;
    }

    // Extraction is selection: each strong span becomes a grounded proposition
    // at its cube address. The span address IS the fact.
    const frameProps = [];
    for (const ex of extracts) {
      const id = `prop:${propN++}`;
      const terms = researchTerms(ex.sentence);
      emit(extractProposition({
        id, frameId: frame.id, pinId: ex.pinId, span: { ...ex.span, sentence: ex.idx },
        terms, address: addressOf(ex.sentence), t: tick(),
      }));
      frameProps.push({ id, terms, sentence: ex.sentence, pinId: ex.pinId });
    }

    // The enacted significance loop over the extracts, in arrival order, with
    // the causal discipline: the band that judges an extract is fit from the
    // surprises seen strictly before it (calibrateReader over the past only),
    // so a fact is important because it broke the frame AS IT STOOD when the
    // fact arrived. Strain leaks per arrival; a cluster of anomaly breaks the
    // frame (REC), and the spans that forced it are the reframings.
    let prior = profileOf(fq);
    const seen = [];
    let strain = 0;
    const LEAK = 0.9;
    let sinceRec = [];
    const axisStrain = new Map();
    for (const pr of frameProps) {
      const arrival = profileOf(pr.sentence);
      const cur = curiosityOf(prior, arrival);
      const s = cur.bits;
      const cal = calibrateReader(seen, { layers: ['proposition'], defaults: { proposition: 1.5 }, defaultBand: 0.25 });
      const band = cal.confirmBand;
      const threshold = cal.thresholds.proposition;
      const verdict = s < band ? 'confirm' : 'strain';
      const delta = Math.max(0, s - band);
      strain = strain * LEAK + delta;
      emit(evaTest({
        propId: pr.id, frameId: frame.id, verdict,
        surprise: s, strainDelta: delta, strain, band, threshold, t: tick(),
      }));
      if (verdict === 'strain') {
        sinceRec.push(pr.id);
        for (const [term, w] of Object.entries(cur.by || {})) {
          if (w > 0) axisStrain.set(term, (axisStrain.get(term) || 0) + w);
        }
      }
      if (strain >= threshold && sinceRec.length) {
        const axis = [...axisStrain.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 3);
        emit(recFrame({
          frameId: frame.id, forcedBy: [...sinceRec], strainSum: strain,
          from: fTerms.slice(0, 3), to: axis.length ? axis : pr.terms.slice(0, 3),
          trigger: 'accumulation', t: tick(),
        }));
        const a = askUser({
          id: `ask:${askN++}`, frameId: frame.id, trigger: 'rec',
          text: `The frame just restructured around ${axis.join(', ') || 'new terms'} — the topic got reconceived. Continue on the new frame?`, t: tick(),
        });
        emit(a);
        const reply = ask ? await safeAsk(ask, a) : null;
        if (reply != null) emit(answerAsk({ askId: a.id, reply, t: tick() }));
        strain = 0; sinceRec = []; axisStrain.clear();
      }
      seen.push(s);
      prior = foldInto(prior, arrival);
    }

    // Corroboration / contradiction — proposition equivalence across DISTINCT
    // pins (a source cannot corroborate itself). A contradiction neither side
    // of which is corroborated is a fork the loop cannot settle: hand it over.
    const corroborated = new Set();
    const forks = [];
    for (let i = 0; i < frameProps.length; i++) {
      for (let j = i + 1; j < frameProps.length; j++) {
        const a = frameProps[i], b = frameProps[j];
        if (a.pinId === b.pinId) continue;
        const { sim, shared } = termSimilarity(a.terms, b.terms);
        if (sim < SIM_THRESHOLD || shared < SIM_MIN_SHARED) continue;
        const rel = polarityOf(a.sentence) === polarityOf(b.sentence) ? 'corroborate' : 'contradict';
        emit(conEdge({ relation: rel, a: a.id, b: b.id, sim, t: tick() }));
        if (rel === 'corroborate') { corroborated.add(a.id); corroborated.add(b.id); }
        else forks.push([a, b]);
      }
    }
    for (const [a, b] of forks) {
      if (corroborated.has(a.id) || corroborated.has(b.id)) continue; // corroboration broke the tie
      const ev = askUser({
        id: `ask:${askN++}`, frameId: frame.id, trigger: 'fork',
        text: `Two sources pull in opposite directions with no corroboration breaking the tie:\n(a) “${a.sentence}”\n(b) “${b.sentence}”`, t: tick(),
      });
      emit(ev);
      const reply = ask ? await safeAsk(ask, ev) : null;
      if (reply != null) emit(answerAsk({ askId: ev.id, reply, t: tick() }));
    }

    // Promote — the propositions enter the report at this section. The cap is
    // logged by the count itself (promoted vs. extracted), never silent.
    for (const pr of frameProps.slice(0, maxPerSection)) {
      emit(promoteProposition({ propId: pr.id, frameId: frame.id, t: tick() }));
    }

    // The model, confined to checked phrasing: ONE call for this section, fed
    // verbatim excerpts only — never operator codes, never cube vocabulary (the
    // anti-bleed talker discipline). Every summary sentence binds back to a
    // span above the null or it is greyed as glue. No model → no summary; the
    // section stands on its spans (never worse than today).
    if (model?.phrase && frameProps.length) {
      const messages = [
        { role: 'system', content: 'Summarize ONLY from the numbered excerpts. Do not add facts, names, numbers, or dates that are not in them. Plain prose, 2-5 sentences.' },
        { role: 'user', content: `Question: ${fq}\n\nExcerpts:\n${frameProps.map((p, i) => `${i + 1}. ${p.sentence}`).join('\n')}` },
      ];
      let out = '';
      try { out = String(await model.phrase(messages) || ''); } catch { out = ''; }
      if (out.trim()) {
        const sentences = splitSentences(out).map((sTxt) => {
          const sTerms = researchTerms(sTxt);
          let best = null, bestShared = 0;
          for (const p of frameProps) {
            const { shared } = termSimilarity(sTerms, p.terms);
            if (shared > bestShared) { bestShared = shared; best = p; }
          }
          const bound = bestShared >= 2;
          return { text: sTxt, boundTo: bound ? best.id : null, glue: !bound };
        });
        // The prompt and the raw output ride in the event — the audit of the
        // run's one generative step, exportable with the rest of the surf.
        emit(phraseSection({
          frameId: frame.id, sentences, dropped: 0,
          model: model.name ?? 'model', prompt: messages, raw: out, t: tick(),
        }));
      }
    }
  }

  return { log, report: projectReport(log) };
};

const safeAsk = async (ask, ev) => { try { return await ask(ev); } catch { return null; } };
const splitSentences = (text) => String(text || '')
  .replace(/\s+/g, ' ')
  .match(/[^.!?]+[.!?]+(?:["'”’)\]]+)?|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
const round3 = (x) => Math.round(x * 1000) / 1000;

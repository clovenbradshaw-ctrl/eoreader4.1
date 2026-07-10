// EO: CON·INS·SIG(Field → Link,Entity, Binding,Making) — LLM SVO bond reader
// svo-llm.js — an LLM-backed subject·verb·object reader for the eoreader4 engine.
//
// The core pipeline (pipeline.js → parseRelations) reads SVO with the regex
// extractor: `reader:"svo-regex", confidence:0.6`. It is fast and synchronous, but
// it only bonds entities it can reach with surface rules — it misses long-range
// objects, paraphrased subjects, and pronoun-resolved arguments.
//
// This module is a SECOND reader on the same text. It witnesses the same sentences
// with a language model, returns S·V·O triples (with polarity / modality / speech
// channels), and FOLDS them into the very same append-only log as additional INS +
// CON/SIG events stamped `reader:"svo-llm", confidence:0.9`. The projection then
// re-reads the log unchanged — the LLM never rewrites a fact, it only appends its
// reading, exactly as a later human pass would. Provenance rides on every event so
// the UI can tell a model-found bond from a regex-found one and weigh it.
//
// The model is reached through the prototype host's window.claude.complete; pass it
// in as `claude` so this stays dependency-free and testable.

const SVO_LLM_READER = "svo-llm";
const SVO_LLM_CONFIDENCE = 0.9;

const ARTICLES = new Set(["the", "a", "an", "this", "that", "these", "those", "his", "her", "its", "their", "our", "my", "your"]);

const slug = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d'"().,;:!?]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Strip a leading determiner so "the Saltmarsh Foundation" keys the same node the
// regex admission gave "Saltmarsh Foundation".
const normLabel = (s) => {
  let w = slug(s).split(" ");
  while (w.length > 1 && ARTICLES.has(w[0])) w = w.slice(1);
  return w.join(" ");
};

const cleanLabel = (s) =>
  String(s || "")
    .replace(/^[\s"'\u2018\u2019\u201c\u201d]+|[\s"'\u2018\u2019\u201c\u201d.,;:]+$/g, "")
    .replace(/^(?:the|a|an|this|that|these|those)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

// ── proposition embedding → grain band (Ground · Figure · Pattern) ───────────
// The engine addresses every act on a grain. A bond's grain is NOT fixed by its
// operator — the same CON reads as a Field (Ground), a Link (Figure), or a Network
// (Pattern) depending on WHAT it bonds. We resolve it the way the reader does: take
// the proposition, REMOVE THE AMBIGUOUS PART OF SPEECH — the verb, whose own grain is
// undecidable in isolation — and embed only the residue (its two arguments). That
// embedding is then tested against three band prototypes and assigned to the nearest.
//
//   Ground  — a field / mass / atmosphere with no individual in it (abstract, mass,
//             undetermined nouns: "restoration", "the climate", "triage").
//   Figure  — a single existent or the bond between two of them (proper names, the
//             definite singular: "Saltmarsh Foundation", "Vela 2023").
//   Pattern — a kind / class / network read across instances (bare plurals and
//             universals: "corals", "all reefs", "studies").
//
// No model download, no network — a deterministic structural embedding, so it runs on
// every bond (regex-read or model-read) the instant the log grows.
const GRAIN_STOP = new Set("the a an of to in on at for and or but with by from as is are was were be been being this that these those it its their his her our your they we you i he she him them us me not".split(" "));
const GRAIN_DIMS = ["proper", "plural", "universal", "definite", "indefinite", "mass", "numeric"];
const GRAIN_BANDS = {
  Ground: [0.0, 0.0, 0.0, 0.2, 0.1, 1.0, 0.1],
  Figure: [1.0, 0.0, 0.0, 0.6, 0.4, 0.0, 0.2],
  Pattern: [0.1, 1.0, 0.9, 0.1, 0.1, 0.3, 0.0],
};

// embed one argument (a noun phrase) as a 7-dim grammatical-character vector.
const featureVec = (label) => {
  const text = String(label || "").trim();
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const content = words.filter((w) => !GRAIN_STOP.has(w.toLowerCase()) && /[a-z]/i.test(w));
  const n = content.length || 1;
  const properN = content.filter((w) => /^[A-Z][a-z'’-]+/.test(w)).length;
  const proper = properN / n;
  const pluralN = content.filter((w) => /[a-rt-z]s$/i.test(w) && !/(ss|us|is|ous)$/i.test(w) && !/^[A-Z]/.test(w)).length;
  const plural = Math.min(1, pluralN / n);
  const universal = /\b(all|every|each|most|many|several|some|any|both)\b/i.test(lower) ? 1 : 0;
  const definite = /^the\b/i.test(lower) ? 1 : 0;
  const indefinite = /^(a|an)\b/i.test(lower) ? 1 : 0;
  const numeric = /\d/.test(text) ? 1 : 0;
  const mass = proper === 0 && plural === 0 && !definite && !indefinite && !universal && !numeric ? 1 : 0;
  return [proper, plural, universal, definite, indefinite, mass, numeric];
};

const addVec = (a, b) => a.map((x, i) => x + b[i]);
const scaleVec = (a, k) => a.map((x) => x * k);
const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

// embedProposition: the residue embedding after the verb (ambiguous POS) is removed —
// purely the two arguments. Returns the 7-dim vector.
export const embedProposition = ({ subject, object } = {}) => {
  const v = scaleVec(addVec(featureVec(subject), featureVec(object)), 0.5);
  return v;
};

// grainOfBond: embed proposition (verb dropped), test against the three bands, assign
// the nearest. Returns { grain, scores:{Ground,Figure,Pattern}, vec }.
export const grainOfBond = ({ subject, object } = {}) => {
  const vec = embedProposition({ subject, object });
  const scores = {};
  let best = "Figure", bestScore = -Infinity;
  for (const band of Object.keys(GRAIN_BANDS)) {
    const sc = cosine(vec, GRAIN_BANDS[band]);
    scores[band] = Math.round(sc * 1000) / 1000;
    if (sc > bestScore + 1e-9) { bestScore = sc; best = band; }
  }
  if (bestScore <= 1e-6) best = "Figure"; // a nameless residue defaults to the inspector
  return { grain: best, scores, vec };
};

// ── sentence selection ──────────────────────────────────────────────────────
// The LLM call is rate-limited and capped at 1024 output tokens, so we do not feed
// it chrome (page furniture) or trivially short lines. We hand it the substantive
// sentences in reading order, batched.
const isSubstantive = (s) => {
  const t = String(s || "").trim();
  if (t.length < 24) return false; // too short to carry an S-V-O
  if (!/[a-z]/i.test(t)) return false; // no letters — a number/separator line
  if (!/\s/.test(t)) return false; // a single token
  return true;
};

const selectIndices = (sentences, maxSentences) => {
  const out = [];
  for (let i = 0; i < sentences.length; i++) {
    if (isSubstantive(sentences[i])) out.push(i);
    if (out.length >= maxSentences) break;
  }
  return out;
};

const batchize = (indices, size) => {
  const out = [];
  for (let i = 0; i < indices.length; i += size) out.push(indices.slice(i, i + size));
  return out;
};

// ── prompt ──────────────────────────────────────────────────────────────────
const promptFor = (sentences, batch) => {
  const lines = batch.map((i) => `${i}. ${String(sentences[i]).slice(0, 320)}`).join("\n");
  return (
    "You extract relations for a knowledge graph from prose. Below are numbered sentences. " +
    "For each, list the factual subject\u2013verb\u2013object relations it states.\n\n" +
    "Rules:\n" +
    "- subject and object must be concrete entities: a person, organization, place, work, or a specific noun phrase. " +
    "Resolve pronouns (he/she/it/they/this) to the named entity they refer to, using the surrounding sentences.\n" +
    "- verb: the base relation as a short lowercase verb or verb phrase (e.g. \"fund\", \"publish\", \"dispute\", \"is director of\").\n" +
    "- A sentence may yield 0, 1, or several relations. Skip a sentence with no clear subject\u2013verb\u2013object.\n" +
    "- neg=true when the relation is negated (\"did not own\", \"never funded\").\n" +
    "- irr=true when it is hypothetical, future, or modal (\"would build\", \"may join\", \"plans to\").\n" +
    "- spk=true when the verb is speech/attribution (said, reported, claimed, announced, denied).\n" +
    "- Keep subject and object short \u2014 just the entity name, no leading article.\n\n" +
    "Return ONLY a JSON array, no prose, no code fences:\n" +
    '[{"i":<sentence number>,"s":"<subject>","v":"<verb>","o":"<object>","neg":false,"irr":false,"spk":false}]\n\n' +
    "Sentences:\n" +
    lines
  );
};

const parseJSONArray = (raw) => {
  if (!raw) return [];
  let s = String(raw).trim();
  // tolerate ```json fences and any prose around the array
  s = s.replace(/```json/gi, "```").replace(/```/g, "");
  const a = s.indexOf("[");
  const b = s.lastIndexOf("]");
  if (a < 0 || b < a) return [];
  try {
    const v = JSON.parse(s.slice(a, b + 1));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const tripleFromRow = (row, maxIdx) => {
  if (!row || typeof row !== "object") return null;
  const i = Number(row.i);
  const s = cleanLabel(row.s);
  const v = String(row.v || "").toLowerCase().replace(/\s+/g, " ").trim();
  const o = cleanLabel(row.o);
  if (!Number.isInteger(i) || i < 0 || i > maxIdx) return null;
  if (!s || !o || !v) return null;
  if (s.length < 2 || o.length < 2 || v.length < 2) return null;
  if (normLabel(s) === normLabel(o)) return null; // a self-loop is no bond
  return {
    sentIdx: i,
    subject: s,
    verb: v,
    object: o,
    speech: !!row.spk,
    polarity: row.neg ? "negative" : undefined,
    modality: row.irr ? "irrealis" : undefined,
    confidence: SVO_LLM_CONFIDENCE,
  };
};

// ── the reader ──────────────────────────────────────────────────────────────
// extractSVO(sentences, { claude, batchSize, maxSentences, onProgress }) → triples[]
// `claude` is window.claude (uses .complete). Calls run sequentially to respect the
// per-user rate limit; onProgress({done,total,added}) fires per batch.
export const extractSVO = async (sentences, opts = {}) => {
  const claude = opts.claude || (typeof window !== "undefined" ? window.claude : null);
  if (!claude || typeof claude.complete !== "function") {
    throw new Error("svo-llm: window.claude.complete is unavailable in this environment");
  }
  const batchSize = opts.batchSize || 8;
  const maxSentences = opts.maxSentences || 56;
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : () => {};
  const indices = selectIndices(sentences, maxSentences);
  const batches = batchize(indices, batchSize);
  const maxIdx = sentences.length - 1;
  const triples = [];
  for (let b = 0; b < batches.length; b++) {
    if (opts.isCancelled && opts.isCancelled()) break;
    let raw = "";
    try {
      raw = await claude.complete(promptFor(sentences, batches[b]));
    } catch (e) {
      onProgress({ done: b + 1, total: batches.length, added: 0, error: String(e) });
      continue;
    }
    const rows = parseJSONArray(raw);
    let added = 0;
    for (const r of rows) {
      const t = tripleFromRow(r, maxIdx);
      if (t) {
        triples.push(t);
        added++;
      }
    }
    onProgress({ done: b + 1, total: batches.length, added });
  }
  return triples;
};

// ── the fold ────────────────────────────────────────────────────────────────
// foldSVO({ doc, triples }) appends the model's reading onto doc.log as INS + CON/SIG
// events, reusing the regex admission's id for any entity it already named so the two
// readers' bonds land on the SAME node. Returns { edges, entities, sentences:Set }.
export const foldSVO = ({ doc, triples }) => {
  if (!doc || !doc.log) throw new Error("svo-llm.foldSVO: a parsed doc with a log is required");
  const log = doc.log;
  const admission = doc.admission;

  // normalized-label → id, seeded from everything the regex reader admitted, so the
  // LLM's "Saltmarsh Foundation" reuses node S rather than minting a twin.
  const byNorm = new Map();
  if (admission && admission.admitted) {
    for (const [label, id] of admission.admitted) byNorm.set(normLabel(label), id);
  }
  const minted = new Map(); // norm → llm id (entities the regex never named)

  const idFor = (label, sentIdx) => {
    const key = normLabel(label);
    if (!key) return null;
    if (byNorm.has(key)) return byNorm.get(key);
    if (minted.has(key)) return minted.get(key);
    const id = "llm:" + key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    minted.set(key, id);
    byNorm.set(key, id);
    log.append({ op: "INS", id, label: cleanLabel(label), sentIdx, reader: SVO_LLM_READER });
    return id;
  };

  const seen = new Set(); // dedupe identical (op,src,tgt,via) bonds the model repeats
  let edges = 0;
  const touched = new Set();

  for (const t of triples) {
    const src = idFor(t.subject, t.sentIdx);
    const tgt = idFor(t.object, t.sentIdx);
    if (!src || !tgt || src === tgt) continue;
    const op = t.speech ? "SIG" : "CON";
    const k = `${op}|${src}|${tgt}|${t.verb}`;
    if (seen.has(k)) continue;
    seen.add(k);

    // the argument-span cut that witnessed S/V/O — a SEG, inert in projection, kept
    // for the record exactly as argumentSpanSeg() stamps the regex reader's cut.
    const seg = log.append({
      op: "SEG",
      kind: "argspan",
      reader: SVO_LLM_READER,
      confidence: t.confidence,
      sentIdx: t.sentIdx,
      depicts: op,
      subject: { text: t.subject },
      verb: { text: t.verb },
      object: { text: t.object },
    });

    log.append({
      op,
      src,
      tgt,
      via: t.verb,
      sentIdx: t.sentIdx,
      reader: SVO_LLM_READER,
      confidence: t.confidence,
      argspan: seg.seq,
      grain: grainOfBond({ subject: t.subject, object: t.object }).grain,
      ...(t.polarity ? { polarity: t.polarity } : {}),
      ...(t.modality ? { modality: t.modality } : {}),
    });
    edges++;
    touched.add(t.sentIdx);
  }

  return { edges, entities: minted.size, sentences: touched };
};

export const SVO_LLM = { reader: SVO_LLM_READER, confidence: SVO_LLM_CONFIDENCE, extractSVO, foldSVO, grainOfBond, embedProposition, GRAIN_BANDS };
export default SVO_LLM;

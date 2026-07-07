import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/pipeline.js';
import { retrieveLexical } from '../src/retrieve/lexical.js';
import { retrieveHybrid, fuseConcordance, pickRetrievalEmbedder, selectExcerpts } from '../src/retrieve/hybrid.js';
import { retrieveStructural, retrieveNetwork, queryTouchesDoc } from '../src/retrieve/structural.js';
import { isReferenceChrome, dropReferenceChrome } from '../src/retrieve/chrome.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import { ingestText } from '../src/organs/in/text.js';

const withEmbeddings = (doc) => {
  let p = null;
  doc.sentenceEmbeddings = async (e) => {
    if (p) return p;
    p = Promise.all(doc.sentences.map(s => e.embed(s)));
    return p;
  };
  return doc;
};

test('retrieveLexical ranks by token overlap', () => {
  const doc = parseText(
    'Alice loves apples. Bob hates broccoli. Charlie eats cake.',
    { docId: 'd1' }
  );
  const r = retrieveLexical(doc, 'apples', 5);
  assert.equal(r[0].idx, 0);
});

test('retrieveLexical returns empty on no overlap', () => {
  const doc = parseText('Alice loves apples.', { docId: 'd1' });
  const r = retrieveLexical(doc, 'zebras', 5);
  assert.equal(r.length, 0);
});

test('retrieveHybrid merges lexical and semantic, fusing by concordance', async () => {
  const doc = withEmbeddings(parseText(
    'Alice loves apples. Bob hates broccoli.', { docId: 'd1' }
  ));
  const embedder = createHashEmbedder();
  const r = await retrieveHybrid(doc, 'apples', embedder, 5);
  assert.ok(r.length > 0);
  // sentence 0 should be top-ranked (it contains 'apples')
  assert.equal(r[0].idx, 0);
  // the channels each span drew on are reported, so the fusion is auditable
  assert.ok(r[0].kind === 'lex+sem' || r[0].kind === 'lex');
});

test('fuseConcordance rewards agreement — two weak channels beat one strong channel alone', () => {
  // The property max-pool could not express: concordant evidence compounds.
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
  assert.ok(fuseConcordance(0.5, 0.5) > 0.5, 'two agreeing weak readers exceed either alone');
  assert.ok(fuseConcordance(0.5, 0.5) > fuseConcordance(0.6, 0), 'weak agreement can beat a lone stronger reader');
  // A lone strong channel is preserved; a lone weak one stays weak.
  near(fuseConcordance(0.9, 0), 0.9);
  near(fuseConcordance(0.3, 0), 0.3);
  // Bounded; a negative cosine is no-evidence, never anti-evidence (clamped to 0).
  near(fuseConcordance(1, 0.42), 1);
  near(fuseConcordance(0.4, -0.8), 0.4);
});

test('retrieveLexical respects k', () => {
  const doc = parseText(
    'Alice ran. Bob ran. Charlie ran. Dana ran. Eve ran.',
    { docId: 'd1' }
  );
  const r = retrieveLexical(doc, 'ran', 3);
  assert.equal(r.length, 3);
});

// Fuzzy: a term the document never spells exactly is rescued onto the nearest token
// it DOES spell ("greta"→"grete"), so a near-miss no longer sinks the whole turn.
test('retrieveLexical fuzzy-matches a near-spelling the document never writes', () => {
  const doc = parseText('His sister Grete brought milk. Grete set the food down.', { docId: 'd1' });
  const exact = retrieveLexical(doc, 'grete', 5);
  const fuzzy = retrieveLexical(doc, 'greta', 5);   // 'greta' appears nowhere
  assert.ok(fuzzy.length > 0, 'the near-spelling still retrieves');
  assert.deepEqual(fuzzy.map(s => s.idx), exact.map(s => s.idx), 'it lands on the Grete lines');
  assert.ok(fuzzy[0].score < exact[0].score, 'a fuzzy hit scores below the exact one');
});

// Exactness is never diluted: a real word matches only itself, and a term with no
// near neighbour retrieves nothing (no phantom hits).
test('retrieveLexical keeps an exact term exact and still abstains on a far term', () => {
  const doc = parseText('Alice loves apples. Bob hates broccoli.', { docId: 'd1' });
  assert.equal(retrieveLexical(doc, 'apples', 5)[0].score, 1, 'exact stays full-weight');
  assert.equal(retrieveLexical(doc, 'zebras', 5).length, 0, 'no near neighbour → empty');
});

// ── The meaning organ on the retrieval path ──────────────────────────────────
// The audit showed recall@6 = 3/12: the "semantic" channel ran on the hash organ,
// which measures spelling, so a paraphrased question (no shared surface words) sank.
// These lock in the fix — retrieval reads MEANING when a meaning organ is live, and
// falls back to the hash organ (never blocking on the download) when it is not.

// Cache the doc's vectors PER ORGAN, mirroring the real ingest fix: two embedders on
// one doc must not contaminate each other's space.
const withPerOrganEmbeddings = (doc) => {
  const cache = new Map();
  doc.sentenceEmbeddings = async (e) => {
    const key = e?.id || 'default';
    if (!cache.has(key)) cache.set(key, Promise.all(doc.sentences.map(s => e.embed(s))));
    return cache.get(key);
  };
  return doc;
};

// A fake MEANING organ: surface tokens load shared CONCEPT axes, so paraphrases with
// no shared spelling still land near each other — exactly what the hash organ cannot
// do. 'job' and 'salesman'/'travelling' load the same axis.
const CONCEPT_AXIS = {
  job: 0, work: 0, occupation: 0, profession: 0, salesman: 0, travelling: 0, sells: 0,
  apple: 1, apples: 1, fruit: 1, loves: 1,
};
const meaningEmbedder = (warm = true) => ({
  id: 'fake-meaning', measuresMeaning: true, isWarm: () => warm,
  async warm() {},
  async embed(text) {
    const v = new Float32Array(3);
    for (const t of String(text).toLowerCase().split(/[^a-z]+/)) {
      if (t && t in CONCEPT_AXIS) v[CONCEPT_AXIS[t]] += 1;
    }
    const n = Math.hypot(v[0], v[1], v[2]) || 1;
    return new Float32Array([v[0] / n, v[1] / n, v[2] / n]);
  },
});

test('pickRetrievalEmbedder reads MEANING when the organ is live, else the hash fallback', () => {
  const hash     = { id: 'hash-embed', measuresMeaning: false, isWarm: () => true };
  const miniCold = { id: 'minilm', measuresMeaning: true, isWarm: () => false };
  const miniWarm = { id: 'minilm', measuresMeaning: true, isWarm: () => true };

  assert.equal(pickRetrievalEmbedder({ embedder: hash }), hash, 'no meaning organ → hash');
  assert.equal(pickRetrievalEmbedder({ embedder: hash, geometricEmbedder: miniCold }), hash,
    'cold meaning organ → still hash (never block on the download)');
  assert.equal(pickRetrievalEmbedder({ embedder: hash, geometricEmbedder: miniWarm }), miniWarm,
    'live meaning organ → read meaning');
  assert.equal(
    pickRetrievalEmbedder({ embedder: hash, geometricEmbedder: { measuresMeaning: false, isWarm: () => true } }),
    hash, 'a non-meaning organ is never preferred over the fallback');
});

test('retrieveHybrid reaches a PARAPHRASE with a meaning organ that the hash organ misses', async () => {
  const text  = 'Gregor woke transformed. Samsa was a travelling salesman. Alice loves apples.';
  const query = "What is Gregor's job?";   // shares 'gregor' with s0, NOTHING with the salesman line
  const goldOf = (doc) => doc.sentences.findIndex(s => /salesman/.test(s));

  // Hash organ: lexical-in-disguise. The query's only surface contact is 'gregor'
  // (sentence 0), so the salesman line — the real answer — is NOT the top span.
  const hashed  = withPerOrganEmbeddings(parseText(text, { docId: 'd' }));
  const hashTop = (await retrieveHybrid(hashed, query, createHashEmbedder(), 6))[0];
  assert.notEqual(hashTop.idx, goldOf(hashed), 'hash retrieval misses the paraphrased answer');

  // Meaning organ live: 'job' ~ 'salesman'/'travelling' on a shared axis, so the
  // salesman line rises to the top even with zero shared spelling.
  const meant   = withPerOrganEmbeddings(parseText(text, { docId: 'd' }));
  const meanTop = (await retrieveHybrid(meant, query, meaningEmbedder(true), 6))[0];
  assert.equal(meanTop.idx, goldOf(meant), 'meaning retrieval reaches the paraphrased answer');
});

test('ingestText caches sentence embeddings PER ORGAN — the upgrade is not masked by a stale space', async () => {
  const doc = await ingestText('Samsa was a travelling salesman. Alice loves apples.', { docId: 'd' });
  const vHash = await doc.sentenceEmbeddings(createHashEmbedder());   // first caller: 64-dim hash space
  const vMean = await doc.sentenceEmbeddings(meaningEmbedder(true));  // second caller: must be freshly computed
  assert.equal(vHash[0].length, 64, 'hash organ → 64-dim hash space');
  assert.equal(vMean[0].length, 3,  'meaning organ → its own space, not the cached hash vectors');
});

// ── Trimming the verbatim shown to the talker ────────────────────────────────
// The audit dumped ~10 spans into the prompt for a vague follow-up; the model wove
// them all into a baggy answer. selectExcerpts keeps the relevant few — the fold has
// already read every span into the notes, so nothing is lost from the impression.

test('selectExcerpts keeps the relevant few and drops the weak / surfed tail', () => {
  const spans = [
    { idx: 1, score: 1.0,  text: 'a' },
    { idx: 2, score: 0.9,  text: 'b' },
    { idx: 3, score: 0.2,  text: 'c' },
    { idx: 4, score: 0.05, text: 'd' },
    { idx: 5, score: 0,    text: 'surfed', via: 'surf' },
  ];
  const kept = selectExcerpts(spans).map(s => s.idx);
  assert.ok(kept.includes(1) && kept.includes(2), 'the strong spans are kept');
  assert.ok(!kept.includes(4) && !kept.includes(5), 'the weak and significance-only (surfed) spans are dropped');
  assert.ok(kept.length <= 5, 'respects the cap');
});

test('selectExcerpts always keeps at least the strongest span', () => {
  assert.deepEqual(selectExcerpts([{ idx: 7, score: 0.03, text: 'weak' }]).map(s => s.idx), [7]);
  assert.deepEqual(selectExcerpts([]), []);
});

// ── Structural retrieval for whole-document meta-queries ──────────────────────
// The audit's t1: "summarize" makes no lexical contact with the page, so lexical
// retrieval fuzzy-matched the meta-word onto arbitrary fragments and the talker
// confabulated. A whole-document meta-query reads the document's SKELETON instead —
// opening, headings, an even spread — and a targeted whole-doc question stays lexical.

const WIKI = `# EO Wiki
EO is a framework for transformation. It models change with nine operators.
## Protection
Protection is one principle. It fails sometimes.
## Operators
The nine operators define what transformations are possible.
Each operator names a kind of change.
## Closing
That is intended.`;

test('queryTouchesDoc is false for a meta-query, true for a question naming a doc term', () => {
  const doc = parseText(WIKI, { docId: 'eo.md' });
  assert.equal(queryTouchesDoc(doc, 'summarize'), false, 'a pure meta-word touches nothing');
  assert.equal(queryTouchesDoc(doc, 'what is this about'), false, 'question + task words touch nothing');
  assert.equal(queryTouchesDoc(doc, 'what are the operators'), true, '"operators" is on the page');
  assert.equal(queryTouchesDoc(doc, 'tell me about protection'), true, '"protection" is on the page');
});

// The audit's t3: "summarize the full document" rode the lexical path and confabulated
// because the incidental SCOPE word "full" happened to be in the doc's vocabulary, so
// queryTouchesDoc returned true and the structural skeleton was skipped. A scope word
// (full / whole / rest / part / …) is about HOW MUCH of the page, never its subject — it
// must not by itself make a meta-query touch the document.
test('a scope word ("full", "whole", "the rest") does not make a meta-query touch the doc', () => {
  const FULL = `# EO Wiki
EO is a framework. The full system models change across the whole space.
## Operators
That is the rest of it.`;
  const doc = parseText(FULL, { docId: 'eo.md' });
  assert.equal(queryTouchesDoc(doc, 'summarize the full document'), false, '"full" is scope, not subject');
  assert.equal(queryTouchesDoc(doc, 'summarize the whole thing'), false, '"whole" is scope, not subject');
  assert.equal(queryTouchesDoc(doc, 'what about the rest'), false, '"rest" is scope, not subject');
  // A real subject term beside the scope word still keeps the lexical path.
  assert.equal(queryTouchesDoc(doc, 'tell me about the full operators'), true, '"operators" is on the page');
});

test('retrieveStructural reads the opening, headings, and a spread — never empty on a real doc', () => {
  const doc = parseText(WIKI, { docId: 'eo.md' });
  const spans = retrieveStructural(doc, 6);
  assert.ok(spans.length > 0, 'a structural read is never empty on a non-empty doc');
  // The opening leads — it takes the frame's primacy slot and survives selectExcerpts.
  assert.equal(spans[0].idx, 0, 'the opening is the strongest structural span');
  assert.ok(spans.every(s => s.score > 0), 'structural spans carry a real score, not 0 (they must clear the floor)');
  assert.ok(spans.every(s => s.via === 'structural'), 'tagged as a structural read for the audit');
  // The shown few include real content, not disconnected fragments.
  const kept = selectExcerpts(spans);
  assert.ok(kept.some(s => /EO is a framework/.test(s.text)), 'the talker is shown what the document is');
});

test('retrieveStructural skips site/furniture units and blanks', () => {
  const doc = parseText('Real opening sentence here. Boilerplate footer line.', { docId: 'd' });
  // DEF the second unit as a site (furniture), as read/site.js would.
  doc.log.append({ op: 'DEF', id: 'unit:1', key: 'role', value: 'site', sentIdx: 1 });
  const spans = retrieveStructural(doc, 8);
  assert.ok(!spans.some(s => s.idx === 1), 'a DEF-site unit is never offered as structural material');
});

// retrieveNetwork — the Network terrain (Structure × Pattern, a LIST task). Returns the
// units that INTRODUCE the document's figures (the members of the entity graph), framed by
// the opening — a different read from the structural skeleton's even spread.
test('retrieveNetwork returns the figure-introducing units, the opening leading', () => {
  const STORY = 'Gregor Samsa woke transformed into an insect. His sister Grete cared for him. ' +
                'The morning was cold. The evening was quiet. The night was long. Carol arrived at last.';
  const doc = parseText(STORY, { docId: 'story' });
  const net = retrieveNetwork(doc, 12);
  assert.ok(net.length > 0, 'a network read is never empty when the doc has figures');
  assert.equal(net[0].idx, 0, 'the opening frames the list');
  assert.ok(net.every(s => s.via === 'network'), 'tagged as a network read for the audit');
  // The figure-bearing units (where Gregor/Grete/Carol enter) are selected; the figureless
  // weather lines (cold/quiet/long morning–night) are not pulled in as members.
  const idxs = new Set(net.map(s => s.idx));
  assert.ok(idxs.has(0), 'the unit introducing Gregor is a member');
  assert.ok(idxs.has(1), 'the unit introducing Grete is a member');
});

test('retrieveNetwork degrades to the structural skeleton when the doc has no figures', () => {
  const doc = parseText('the morning was cold. the evening was quiet. the night was long.', { docId: 'd' });
  const net = retrieveNetwork(doc, 6);
  assert.ok(net.length > 0, 'never empty — falls back to the skeleton');
  // with no figures, it is the structural read (tagged structural by the fallback)
  assert.ok(net.every(s => s.via === 'structural'), 'a figureless doc falls back to the structural skeleton');
});

// ── isReferenceChrome: drop reference / navigation apparatus, keep answer content ────────────
// A web page extracted into "sentences" carries its reference list, external-links section,
// archive footers and bare nav titles alongside its prose. Handed to the talker these are noise;
// bound as citations they point the reader at apparatus, not a passage that witnesses the claim.

test('isReferenceChrome flags reference / navigation apparatus (from the real dolphin audits)', () => {
  const chrome = [
    '↑ Wickert, Janaína Carrion; von Eye, Sophie Maillard; Oliveira, Larissa Rosa (2016).',
    'Archived from the original on September 27, 2013.',
    'CMS - Convention on the Conservation of Migratory Species of Wild Animals.',   // the bare nav title a fabricated answer cited
    'External links Definitions from Wiktionary Media from Commons Taxa from Wikispecies.',
    '"Dolphins save surfer from becoming shark’s bait".',                       // a whole-line quoted reference title
    '"Cooperative Dolphins of Laguna: Data on Nature of Signal (video and detailed description)".',
    '(Oxford science publications) Oxford University Press, 1982, 433 pp.',
  ];
  for (const c of chrome) assert.equal(isReferenceChrome(c), true, `chrome: ${c.slice(0, 40)}`);
});

test('isReferenceChrome keeps real article prose — even short sentences with a dash', () => {
  const prose = [
    'Dolphins are highly social animals living in complex "fission-fusion" societies.',
    'Dolphins engage in acts of aggression towards each other.',
    'Membership in pods is not rigid; interchange is common.',
    'The common bottlenose dolphin is listed in Appendix II to the Convention on the Conservation of Migratory Species of Wild Animals.', // dash-free real claim
  ];
  for (const p of prose) assert.equal(isReferenceChrome(p), false, `prose: ${p.slice(0, 40)}`);
});

test('dropReferenceChrome removes only the apparatus, preserving span order', () => {
  const spans = [
    { text: 'Dolphins are highly social animals living in pods.', score: 0.9 },
    { text: 'Archived from the original on May 14, 2008.', score: 0.8 },
    { text: 'Dolphins communicate with whistle-like sounds.', score: 0.7 },
  ];
  const kept = dropReferenceChrome(spans);
  assert.deepEqual(kept.map((s) => s.text), [
    'Dolphins are highly social animals living in pods.',
    'Dolphins communicate with whistle-like sounds.',
  ]);
});

test('selectExcerpts drops chrome before trimming — the talker is shown content, not a title fragment', () => {
  // The transcript-2 shape: one bare nav title outscoring the one real passage. Without the filter
  // the title would be shown (and cited); with it, only the real passage rides.
  const spans = [
    { text: 'CMS - Convention on the Conservation of Migratory Species of Wild Animals.', score: 0.9, idx: 0 },
    { text: 'The common bottlenose dolphin is listed in Appendix II, having an unfavorable conservation status.', score: 0.6, idx: 1 },
  ];
  const kept = selectExcerpts(spans);
  assert.ok(kept.every((s) => !isReferenceChrome(s.text)), 'no chrome survives selection');
  assert.equal(kept.length, 1, 'only the real passage remains');
  assert.equal(kept[0].idx, 1);
});

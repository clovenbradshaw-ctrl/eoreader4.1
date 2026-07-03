import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseText } from '../src/perceiver/parse/index.js';
import { enactedReadingTo } from '../src/enact/index.js';
import { projectGraph } from '../src/core/index.js';
import { factCheck } from '../src/factcheck/index.js';
import { resolveRetrievalQuery } from '../src/converse/focus.js';
import { retrieveHybrid } from '../src/retrieve/index.js';
import { runTurn } from '../src/turn/pipeline.js';
import { createAuditLog } from '../src/audit/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import '../src/model/echo.js';
import { createModel } from '../src/model/interface.js';

// THE METAMORPHOSIS BATTERY — Test 7, the decisive CONTROLS (docs/metamorphosis-battery.md §7).
//
// "When the structure is destroyed, the engine's quantities must collapse, or they were never
// reading structure." §7 is foundational: it needs no gold marks. SHUFFLE proves the engine
// depends on sentence ORDER (not on which sentences are merely present); LULL proves it goes
// dark where there is no structure. Shuffles are seeded, so these are deterministic.

const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const shuffle = (arr, rnd) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// The enacted loop's released strain over a whole reading: the REC count and the total
// strain released at restructurings — the quantities §7 says must depend on structure.
const strainOf = (doc) => {
  const S = (doc.units || doc.sentences || []).length;
  const r = enactedReadingTo(doc, S - 1);
  return { recs: r.stats.proposition?.recs || 0, total: (r.recs || []).reduce((s, x) => s + (x.strainSum || 0), 0) };
};

test('battery §7 — LULL control: the engine goes DARK on structureless text', () => {
  // One figure, repeated, no development: there is nothing to restructure on.
  const lull = parseText(Array.from({ length: 24 }, () => 'Gregor lay still in the dim quiet room.').join(' '), { docId: 'lull' });
  const { recs, total } = strainOf(lull);
  assert.equal(recs, 0, 'no frame breaks where nothing changes');
  assert.ok(total < 0.01, `strain stays ~0 in the flat, got ${total}`);
});

test('battery §7 — SHUFFLE control: the engine DEPENDS on sentence order (not marginal statistics)', () => {
  // The decisive discipline: ordered ≠ shuffled. If scrambling the sentences left the
  // engine's quantities unchanged, it would be reading WHICH sentences are present, not HOW
  // they are arranged — marginal statistics, not structure.
  //
  // Mechanism (measured): the cheap γ-mass reader's strain tracks LOCAL figure-coherence —
  // shuffling destroys coherence between adjacent sentences and RAISES strain. So order
  // matters (this control passes), but the battery's "rise-to-crisis" claim (test 1) tracks
  // narrative TENSION, which this reader does not see; that awaits the meaning reader. When
  // it lands and ordered strain peaks AT the crises, this test's direction will flip — the
  // regression marker for that fix.
  const docO = parseText(readFileSync('data/metamorphosis.txt', 'utf8'), { docId: 'o' });
  const sents = docO.sentences || docO.units;
  const ordered = strainOf(docO);

  const K = 30;
  let sum = 0;
  for (let k = 0; k < K; k++) sum += strainOf(parseText(shuffle(sents, mulberry32(1000 + k)).join(' '), { docId: `s${k}` })).total;
  const shuffledMean = sum / K;

  const rel = Math.abs(shuffledMean - ordered.total) / ordered.total;
  assert.ok(rel > 0.1,
    `ordered (${ordered.total.toFixed(2)}) and shuffled-mean (${shuffledMean.toFixed(2)}) must differ — the engine reads order, not marginals (rel=${rel.toFixed(2)})`);
});

// ─────────────────────────────────────────────────────────────────────────────
// GOLD MARK ZERO — the conversational battery (docs/subjective-frame.md).
//
// The audit run (`who is gregor's sister?` → `prove it` → `huh?` → `prove what you are
// saying about her life circumstances`) failed gold mark zero: the talker assigned the
// opening transformation to the FATHER, twice, and the engine let it ship — the prompt
// leaked recognition, the demonstrative never resolved before retrieval, and the reading
// held no transformation edge for the veto to contradict against. These pin the four
// testable claims of gold mark zero. The talker's actual prose needs a live LLM, so the
// claims that turn on it are tested through the MACHINERY that catches the failure.

const META = readFileSync('data/metamorphosis.txt', 'utf8');   // Gregor transforms (s0); Grete is the sister
const echo = async () => { const m = createModel('echo'); await m.load(); return m; };
const ground = (doc) => { doc.sentenceEmbeddings = async (e) => Promise.all((doc.sentences || doc.units).map(s => e.embed(s))); return doc; };

test('gold mark 0a — orientation carries NO recognition: a content turn never sees the title or author', async () => {
  const doc = ground(parseText(META, { docId: 'pg5200.txt' }));
  doc.metadata = { title: 'The Metamorphosis', author: 'Franz Kafka' };   // the front-matter bait
  const audit = createAuditLog();
  await runTurn({ question: 'what happens to Gregor?', doc, model: await echo(),
                  embedder: createHashEmbedder(), auditLog: audit });
  const prompt = audit.turns[0].prompt;
  assert.match(prompt, /What it was: pg5200\.txt/, 'orientation is the filename — the reader who set a file down');
  assert.doesNotMatch(prompt, /Metamorphosis/, 'the famous title never enters the content prompt');
  assert.doesNotMatch(prompt, /Kafka/, 'nor the author — recognition is the leak under test');
});

test('gold mark 0b — "prove it" retrieves sister-evidence, not the literal token', async () => {
  const doc = ground(parseText(META, { docId: 'pg5200.txt' }));
  const history = [{ role: 'user', content: "who is gregor's sister?" }, { role: 'assistant', content: '(answer)' }];
  const resolved = resolveRetrievalQuery('prove it', history);
  assert.match(resolved, /sister/, 'the demonstrative resolves to the prior turn’s topic before retrieval');
  const spans = await retrieveHybrid(doc, resolved, createHashEmbedder(), 5);
  const top = spans.map(s => s.text).join(' · ');
  assert.match(top, /Grete|sister/i, 'the top results are about the sister');
  assert.doesNotMatch(spans[0].text, /transformed in his bed/i, 'NOT the opening transformation line by literal overlap');
});

test('gold mark 0c — the §5 veto marks the FATHER-transformation CONTRADICTED (depends on §4)', async () => {
  // The reading holds the transformation as GREGOR's (active voice so the parser extracts the
  // edge; Kafka's resultative is the §4 extraction seam). A talker that assigns it to a
  // different undergoer is contradicted — the audit's missing number (contradicted:0 → 1).
  const doc = parseText('Gregor Samsa woke. Gregor Samsa transformed into a vermin. Hermann Samsa stood by.',
    { docId: 'pg5200.txt', referents: true });
  const graph = projectGraph(doc.log, {});
  const fc = await factCheck({ prose: 'Hermann Samsa transformed into a vermin.', doc, graph, changeOfState: true });
  assert.equal(fc.counts.contradicted, 1, 'Gregor, not the father, transforms — the wrong attribution is contradicted');
  assert.ok(fc.refuse, 'a REFUSING contradiction — the §5 gate engages and regenerates rather than shipping it');
  // And the flag-off path is byte-identical: nothing to contradict against, as the audit found.
  const off = await factCheck({ prose: 'Hermann Samsa transformed into a vermin.', doc, graph, changeOfState: false });
  assert.equal(off.counts.contradicted, 0);
});

test('gold mark 0d — an unbound talker turn cannot become the next turn’s premise (§7)', async () => {
  // The propagation the audit shows: t1’s unbound father-claim was t4’s premise. A reply that
  // did not bind is tagged, and the converse fold drops it — it cannot ground a follow-up.
  const { foldConversation } = await import('../src/converse/index.js');
  const f = foldConversation([
    { role: 'user', content: 'who underwent the transformation?' },
    { role: 'assistant', content: 'The father was transformed into an insect.', unbound: true },
    { role: 'user', content: 'prove what you are saying about him' },
  ]);
  assert.doesNotMatch([...f.pastTurns, f.notes, f.lastReply].join('\n'), /father was transformed/i,
    'the unbound claim never enters the ground the next turn reads');
});

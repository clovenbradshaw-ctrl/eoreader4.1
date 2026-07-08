// walk-e2e — long-form generation end to end, on the metal.
//
// Drives the walk (src/longgen/walk.js) with a REAL generative talker — the same
// SmolLM2-360M-Instruct (q8, cpu) the mechanics battery runs — over a real
// document, self-read weld ON (the default). Not a unit test and not a probe:
// this is the loop the reader app runs, exercised headless, so "long-form
// generation goes" is a demonstrated fact with a transcript, not a claim.
//
// What to read in the output:
//   - the paragraphs: one per beat, each a continuation of the last, each citing
//     the spans that ground it;
//   - the trace: accept / splice / salvage / weld / nul per beat — the floor and
//     the weld doing their work on real (not echo) output;
//   - the progress fold: how much of the design the fold could actually fill.
//
// Usage: NODE_EXTRA_CA_CERTS=... node eoreader4-eval/walk-e2e.drive.mjs [--full] [--chat]
//   default reads data/metamorphosis.txt (fast); --full reads pg5200.txt.
//   The talker is the BASE completion model (the continuation frame's matching
//   organ); --chat runs the instruct model through its chat template instead —
//   the comparison run that shows the assistant register dying at the floor.

import { readFileSync } from 'node:fs';
import { createCpuLlm, createCpuCompleter, setupDoc } from './mechanics/harness.mjs';
import { walk } from '../src/longgen/index.js';
import { tok } from '../src/perceiver/parse/index.js';

const ROOT = new URL('../', import.meta.url);
const readText = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');

const stripGutenberg = (t) => {
  const start = t.indexOf('*** START');
  const end = t.indexOf('*** END');
  let body = t;
  if (start >= 0) body = body.slice(body.indexOf('\n', start) + 1);
  if (end >= 0) body = body.slice(0, body.indexOf('*** END'));
  return body.trim();
};

const FULL = process.argv.includes('--full');
const SOURCE = FULL
  ? { id: 'metamorphosis-full', text: stripGutenberg(readText('pg5200.txt')) }
  : { id: 'metamorphosis-excerpt', text: readText('data/metamorphosis.txt') };

const QUESTION = 'How does Gregor\'s transformation unsettle his work and his family?';
const DEMAND = 4;

// The fold: the document's own sentences, ranked lexically against the question —
// the same shape the reader's groundNotes hands the walk (ranked evidence spans),
// built here without the app. Sentences that share content words with the question
// score by idf-flavoured overlap; figure-bearing sentences get the mention tilt.
const foldFor = (doc, question, { width = 24 } = {}) => {
  const qTok = new Set(tok(question));
  const mentioned = new Set();
  for (const [, idxs] of (doc.mentions || new Map())) for (const i of idxs) mentioned.add(i);
  const spans = doc.sentences.map((text, idx) => {
    const sTok = new Set(tok(text));
    let hit = 0;
    for (const t of qTok) if (sTok.has(t)) hit += 1;
    const overlap = qTok.size ? hit / qTok.size : 0;
    const score = overlap + (mentioned.has(idx) ? 0.35 : 0);
    return { idx, text, score };
  });
  const kept = spans
    .filter(s => s.score > 0 && s.text.trim().length >= 24)
    .sort((a, b) => b.score - a.score)
    .slice(0, width);
  // Rank-preserving normalization onto the walk's own scale: the strongest spans
  // clear the load-bearing floor (0.6) and seed tight grounded topic sentences,
  // the tail stays connective — the shape groundNotes hands the real walk.
  const max = kept[0]?.score || 1;
  return kept.map(s => ({ ...s, score: 0.4 + 0.6 * (s.score / max) }));
};

const run = async () => {
  const t0 = Date.now();
  process.stderr.write(`source: ${SOURCE.id}\n`);
  const doc = setupDoc(SOURCE.text, SOURCE.id);
  const fold = foldFor(doc, QUESTION);
  process.stderr.write(`fold: ${fold.length} spans (of ${doc.sentences.length} sentences)\n`);

  const model = process.argv.includes('--chat') ? await createCpuLlm() : await createCpuCompleter();

  const res = await walk({
    fold,
    design: { demand: DEMAND, question: QUESTION },
    model,
    question: QUESTION,
    doc,                       // sharpens the weld's witness signal (coref intact)
    onParagraph: (rec, i) => process.stderr.write(`  ¶${i + 1} [${rec.action}] cited ${rec.sources.length}\n`),
  });

  console.log(`\nWALK E2E — ${SOURCE.id}   question: ${QUESTION}`);
  console.log(`demand ${DEMAND} → wrote ${res.paragraphs.length}   complete: ${res.progress.complete}\n`);
  res.paragraphs.forEach((p, i) => {
    console.log(`¶${i + 1}  (${p.action}, bound ${p.boundFraction}, cites s${p.sources.join(' s')})`);
    console.log(p.text + '\n');
  });
  console.log('TRACE');
  for (const t of res.trace) console.log(' ', JSON.stringify(t));
  console.log(`\nwall: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
};

run().catch((e) => { console.error(e); process.exit(1); });

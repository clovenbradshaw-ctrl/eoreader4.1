// essay-e2e — the ESSAY ORGAN end to end, on the metal.
//
// Drives src/essay/runEssay with the SAME real CPU talker the mechanics battery
// runs (SmolLM2-360M-Instruct, q8, cpu) over a multi-facet dolphin corpus — the
// exact wiring the reader's _essayReply builds: a spine of facet intents, a
// per-section `retrieve` that ranks the corpus by intent, the subject pool as the
// bind floor, one grounded prose pass per section. Not a unit test: this is the
// long-form path the reader runs, exercised headless, so "the organ produces a
// sectioned, grounded essay with a real model" is a transcript, not a claim.
//
// Usage: NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node eoreader4-eval/essay-e2e.drive.mjs

import { createCpuLlm, setupDoc } from './mechanics/harness.mjs';
import { runEssay, EKIND } from '../src/essay/index.js';
import { tok } from '../src/perceiver/parse/index.js';

// A realistic multi-facet corpus — the kind of reading the research walk folds in
// for "dolphins": evolution, anatomy/senses, behavior/communication, conservation.
const CORPUS = `
Dolphins are marine mammals that evolved from land-dwelling ancestors roughly fifty million years ago.
The earliest ancestors of dolphins were small four-legged animals that gradually adapted to life in the water.
Fossil evidence indicates that dolphins share a common ancestor with the hippopotamus.
Over millions of years the hind limbs of these ancestors shrank while the forelimbs became flippers.
This transition from land to sea is one of the best documented cases of evolution in the mammal record.

A dolphin's body is streamlined and fusiform, which reduces drag as it swims.
Dolphins breathe air through a blowhole on the top of the head rather than through the mouth.
Beneath the skin a thick layer of blubber insulates the dolphin and stores energy.
Dolphins have conical teeth that are suited to grasping fast-moving fish and squid.
The eyes of a dolphin are adapted for seeing both in water and, briefly, in air.

Dolphins navigate and hunt using echolocation, emitting clicks and listening for the returning echoes.
A dolphin produces sound in nasal air sacs and focuses it through a fatty organ in the forehead called the melon.
Bottlenose dolphins use signature whistles that function much like individual names within a pod.
Dolphins live in social groups called pods, and cooperation within a pod is common during hunting.
Some dolphins have been observed teaching their young to use marine sponges as tools while foraging.
Play behavior, such as riding the bow waves of boats, is frequently seen among many dolphin species.

Several dolphin species are threatened by entanglement in commercial fishing nets, known as bycatch.
The Yangtze river dolphin was declared functionally extinct after decades of habitat loss and pollution.
Underwater noise from shipping and sonar can interfere with the echolocation that dolphins depend on.
Conservation programs aim to protect dolphins by regulating fisheries and establishing marine reserves.
Because dolphins are long-lived and slow to reproduce, their populations recover only gradually from decline.
`.trim();

const SUBJECT = new Set(['dolphin', 'dolphins']);

const SPINE = {
  thesis: 'dolphins',
  sections: [
    { id: 'sec:0', intent: 'the evolution and origins of dolphins from land ancestors' },
    { id: 'sec:1', intent: 'dolphin anatomy body and physical adaptations' },
    { id: 'sec:2', intent: 'dolphin echolocation behavior communication and social pods' },
    { id: 'sec:3', intent: 'dolphin conservation threats and protection' },
  ],
};

// The reader's _walkFallbackPool, in miniature: every corpus sentence that NAMES the
// subject, as the shared bind floor.
const poolFrom = (doc) => doc.sentences
  .map((text, idx) => ({ idx, text }))
  .filter((s) => tok(s.text).some((w) => SUBJECT.has(w)));

// The reader's per-section retrieve: rank the corpus by term overlap with the intent.
const retrieveFor = (doc) => async (section) => {
  const want = new Set(tok(section.intent));
  return doc.sentences
    .map((text, idx) => {
      let hit = 0;
      for (const w of new Set(tok(text))) if (want.has(w)) hit++;
      return { idx, text, score: hit };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .slice(0, 10);
};

// Dedicated section-heading prompting (mirrors the reader's _essaySectionTitle): title the section
// from its own prose, fall back to the derived heading on any malformed / over-long return.
const sectionTitle = async (model, prose, fallback) => {
  try {
    const messages = [
      { role: 'system', content: 'You name a section of an essay. Output ONLY the title — 2 to 5 words, Title Case, no quotation marks, no trailing punctuation, no preamble, no explanation.' },
      { role: 'user', content: 'Give a short section heading for this passage:\n\n' + String(prose).slice(0, 700) },
    ];
    const raw = await model.phrase(messages, { maxTokens: 16, temperature: 0.3 });
    let t = String(raw || '').split('\n').map((x) => x.trim()).filter(Boolean)[0] || '';
    t = t.replace(/^(?:title|heading|section(?:\s+title)?)\s*[:\-–]\s*/i, '').replace(/^[\s"'“”*#>\-]+|[\s"'“”*.:;,!?]+$/g, '').trim();
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 7 || /[.!?].*\S/.test(t)) return fallback;
    if (/\b(?:here|sure|certainly|okay|section|heading|title|passage|response|answer|following|essay|paragraph)\b/i.test(t)) return fallback;
    return t;
  } catch { return fallback; }
};

const headingFor = (intent) => {
  let s = String(intent).replace(/^the\s+/i, '').replace(/\s+(?:of|from)\s+dolphins?.*$/i, '');
  s = s.replace(/\bdolphins?\b/ig, '').replace(/\s+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : intent;
};

const run = async () => {
  process.stderr.write('loading model + doc…\n');
  const model = await createCpuLlm({ onProgress: (m) => process.stderr.write('  ' + m + '\n') });
  const doc = setupDoc(CORPUS, 'dolphins');
  const pool = poolFrom(doc);
  process.stderr.write(`corpus: ${doc.sentences.length} sentences · subject pool: ${pool.length} spans\n`);

  const streamed = [];
  const t0 = Date.now();
  const { report, essay, done } = await runEssay({
    spine: SPINE, spans: pool, retrieve: retrieveFor(doc), model,
    // Facets are the structure (matches the reader). retrieve already scoped each section's spans by
    // relevance, so relax the organ's internal LEXICAL off-intent veto (fitFloor/thesisFloor) and the
    // thin-merge — otherwise a facet whose intent words don't lexically overlap its own spans is dropped.
    knobs: { sectionCeiling: 200, supplyWidth: 12, maxInserts: 0, splitFloor: 2, fitFloor: 0, thesisFloor: 0, thin: 1, gate: { advanceFloor: 0 } },
    onEvent: (e) => {
      if (e.kind === EKIND.ENTER) process.stderr.write(`  → section ${e.sectionId} decoding…\n`);
      if (e.kind === EKIND.ACCEPT) { streamed.push(e.sectionId); process.stderr.write(`  ✓ section ${e.sectionId} accepted (${(e.prose || '').length} chars)\n`); }
      if (e.kind === EKIND.VETO) process.stderr.write(`      · veto ${e.sectionId}: ${e.reason}  «${String(e.claim || '').slice(0, 50)}»\n`);
      if (e.kind === EKIND.FINDING) process.stderr.write(`  ✗ finding ${e.sectionId}: ${e.finding || e.kind2 || JSON.stringify(e.detail || {})}\n`);
      if (e.kind === EKIND.SPANS) process.stderr.write(`      · ${e.sectionId} lit ${(e.spanIds || []).length} spans\n`);
    },
  });

  const accepted = (report.order || []).map((id) => (report.sections || []).find((s) => s.id === id && s.state === 'accepted')).filter(Boolean);
  const untag = (t) => String(t || '').replace(/\s*\[s(?:\d+|L[\d.]+)\]/g, '');

  console.log('\n' + '='.repeat(78));
  console.log('ASSEMBLED ESSAY  (subject: dolphins)   done=' + done + '   ' + Math.round((Date.now() - t0) / 1000) + 's');
  console.log('='.repeat(78) + '\n');
  console.log('# Dolphins\n');
  for (const s of accepted) {
    const derived = headingFor(SPINE.sections.find((x) => x.id === s.id)?.intent || s.intent);
    const title = await sectionTitle(model, untag(s.prose || ''), derived);
    console.log('## ' + title + '\n');
    console.log(untag(s.prose || '') + '\n');
  }

  console.log('='.repeat(78));
  console.log('DIAGNOSTICS');
  console.log('  sections planned : ' + SPINE.sections.length);
  console.log('  sections accepted: ' + accepted.length + '  (' + accepted.map((s) => s.id).join(', ') + ')');
  console.log('  total prose chars: ' + accepted.reduce((n, s) => n + untag(s.prose || '').length, 0));
  console.log('  commitments bound: ' + (report.ledger || []).length + '  (every one cites ≥1 span: ' + (report.ledger || []).every((c) => (c.spanRefs || []).length >= 1) + ')');
  console.log('  verify           : ' + JSON.stringify(report.verify || {}));
  console.log('='.repeat(78));
};

run().catch((e) => { console.error('FAILED:', e && (e.stack || e.message || e)); process.exit(1); });

// weave-demo.mjs — run the nested-loops weave against a LOCAL model (no CDN, no browser).
//
//   node tools/weave/weave-demo.mjs
//
// The local model under test is the MEANING embedder that gates cross-connections: MiniLM
// (Xenova/paraphrase-multilingual-MiniLM-L12-v2, q8, cpu), wired exactly as the mechanics battery
// wires it (eoreader4-eval/mechanics/harness.mjs). measuresMeaning:true is the firewall — only a
// real meaning-cosine lets an echo be asserted; the unit tests fake it with a one-hot embedder, so
// this run is where the actual model draws the Born-rule line.
//
// It exercises the whole nest over a tiny TWO-document corpus:
//   loop 1  deep reading   → eo:Reflection      (per document, at the places of most interest)
//   loop 2  metacognition  → eo:MetaReflection   (the reflection ABOUT the reflections)
//   connect cross-corpus   → eo:Connection       (echoes the local model hears across the corpus)
// plus a deterministic PARAPHRASE PROBE that shows the local embedder connecting a real paraphrase
// while holding a near-topic distractor — the discrimination the one-hot stub cannot make.
//
// Every product of every loop is reafference held at band void; the demo asserts the firewall.

import { parseText } from '../../src/perceiver/parse/index.js';
import { surfFold } from '../../src/surfer/index.js';
import { canWitness } from '../../src/core/index.js';
import {
  createDeepReader, createMetaReader, connect, analogize, buildReflection,
  buildSubstrate, readReflections, readMetaReflections, readConnections,
} from '../../src/fold/index.js';
import { createMiniLM } from '../../eoreader4-eval/mechanics/harness.mjs';

const log = (...a) => console.log(...a);
const rule = (s) => log('\n' + s + '\n' + '─'.repeat(s.length));

// Two documents, different surface worlds, the SAME relational shape: a smaller party that a larger
// one depended on stops being useful and is driven out. Echo (same proposition) is content-level, so
// these mostly won't echo across — that gap is exactly what the analogy layer is for. The demo is
// honest about whichever way the local model calls it.
const DOC_A =
  'Gregor woke transformed and could no longer work. The family had lived on his wages. ' +
  'They gathered at his door but would not enter the room. Grete brought him scraps, then less. ' +
  'His father drove him back with a stick when he crept out. The lodgers threatened to leave over him. ' +
  'Grete declared the creature was no longer her brother. In the morning the charwoman found him dead.';

const DOC_B =
  'The old stallion had pulled the plough for twenty years and fed the farm. ' +
  'When his legs failed he could pull nothing and ate his ration for no return. ' +
  'The farmhands who had leaned on his labour now grumbled at his stall. ' +
  'The farmer drove him from the warm barn into the cold yard with a switch. ' +
  'They agreed the beast was no longer of any use to them. By dawn the knacker had taken him.';

const main = async () => {
  rule('WEAVE · local-model run (MiniLM meaning organ, q8, cpu)');
  const embedder = await createMiniLM({ onProgress: (m) => process.stderr.write(`  · ${m}\n`) });
  log(`embedder: ${embedder.model} · measuresMeaning=${embedder.measuresMeaning}`);

  const docA = parseText(DOC_A, { docId: 'metamorphosis', genderCoref: true });
  const docB = parseText(DOC_B, { docId: 'old-horse', genderCoref: true });

  // ── loop 1 — deep reading over each document (model-free inner note) ───────────────
  rule('LOOP 1 · deep reading (eo:Reflection)');
  for (const [name, doc] of [['metamorphosis', docA], ['old-horse', docB]]) {
    const { reflections, quiesced } = createDeepReader({ doc, surf: surfFold }).arrive({ anchor: 0 });
    log(`\n[${name}] ${reflections.length} reflection(s), quiesced=${quiesced}`);
    for (const r of reflections) log(`  · s${r.peak} (${r.verdict}, surprise ${r.surprise}) — ${r.body}`);
  }

  // ── loop 2 — metacognition over each reading's own reflections ────────────────────
  rule('LOOP 2 · metacognition (eo:MetaReflection)');
  for (const [name, doc] of [['metamorphosis', docA], ['old-horse', docB]]) {
    const { metaReflections, quiesced } = createMetaReader({ doc }).arrive();
    log(`\n[${name}] ${metaReflections.length} meta-reflection(s), quiesced=${quiesced}`);
    for (const m of metaReflections) log(`  · [${m.pattern}] ${m.body}`);
  }

  // ── cross-connections — the local model listens for echoes across the two documents ─
  rule('CROSS-CONNECTIONS · echo across the corpus (eo:Connection)');
  const woven = await connect([docA, docB], { embedder, alpha: 0.05 });
  log(`\nembedder live: ${woven.live} · ${woven.items} reflections compared`);
  if (!woven.connections.length) log('  (no cross-document echo cleared the Born-rule null — content differs; this is the analogy layer’s job, not echo’s)');
  for (const c of woven.connections) {
    const cross = c.aDoc !== c.bDoc ? `  ⟂ CROSS-CORPUS (${c.aDoc} ↔ ${c.bDoc})` : '  (same doc)';
    log(`  · [${c.kind}] sim ${c.sameness} > null ${c.boundary}${cross}\n      ${c.body}`);
  }

  // ── paraphrase probe — the local embedder connects a real paraphrase, holds a distractor ─
  rule('PARAPHRASE PROBE · the local model draws the Born-rule line');
  const probe = parseText('A short neutral text so the log exists.', { docId: 'probe' });
  const seed = [
    { cursor: 0, focus: 'grete', verdict: 'strain', body: 'the sister decides he is no longer her brother' },
    { cursor: 1, focus: 'grete', verdict: 'strain', body: 'she resolves the creature has stopped being kin to her' },   // paraphrase of s0
    { cursor: 2, focus: 'apple', verdict: 'confirm', body: 'the father throws an apple that lodges in his back' },       // near-topic distractor
    { cursor: 3, focus: 'clerk', verdict: 'confirm', body: 'the chief clerk demands an explanation at the door' },       // unrelated
  ];
  for (const s of seed) probe.log.append(buildReflection(s));

  // loop 2 fires here: the two Grete reflections share a focus and only ever strained, so
  // metacognition surfaces both a recurring-focus and a standing-strain note — deterministic,
  // model-free (the local model is spent on the meaning cosine below, not on this).
  const probeMeta = createMetaReader({ doc: probe }).arrive();
  log(`\nmetacognition on the seeded reflections: ${probeMeta.metaReflections.length} note(s)`);
  for (const m of probeMeta.metaReflections) log(`  · [${m.pattern}] ${m.body}`);

  const probed = await connect(probe, { embedder, alpha: 0.05 });
  log(`\n${seed.length} seeded reflections · embedder live: ${probed.live}`);
  for (const c of probed.connections) log(`  · echo s${c.aCursor}↔s${c.bCursor}  sim ${c.sameness} > null ${c.boundary}`);
  const gotParaphrase = probed.connections.some((c) => (c.aCursor === 0 && c.bCursor === 1) || (c.aCursor === 1 && c.bCursor === 0));
  const heldDistractors = !probed.connections.some((c) => [2, 3].includes(c.aCursor) || [2, 3].includes(c.bCursor));
  log(`  paraphrase (s0↔s1) connected: ${gotParaphrase ? 'YES ✓' : 'no'} · distractors held apart: ${heldDistractors ? 'YES ✓' : 'no'}`);

  // ── analogy — structure-mapping: SAME relational shape, DIFFERENT surface entities ─
  rule('ANALOGY · structure-mapping across the corpus (eo:Connection kind:analogy)');
  log('two documents with isomorphic relation graphs and NO shared words —');
  log('  A: Acme employs Bob. Acme partners Corp. Corp employs Dana. Bob trusts Dana.');
  log('  B: Umbra hires Kane. Umbra allies Vortex. Vortex hires Lee. Kane trusts Lee.');
  const bizA = parseText('Acme employs Bob. Acme partners Corp. Corp employs Dana. Bob trusts Dana.', { docId: 'biz' });
  const crimeB = parseText('Umbra hires Kane. Umbra allies Vortex. Vortex hires Lee. Kane trusts Lee.', { docId: 'crime' });
  const flatC = parseText('Sky is blue. Grass is green.', { docId: 'flat' });
  const ana = analogize([bizA, crimeB, flatC], { commit: false });
  log(`\n${ana.connections.length} analogy correspondence(s) (the flat doc contributes none — no shared role):`);
  for (const c of ana.connections) log(`  · ${c.a} ↔ ${c.b}  (sim ${c.sameness}, ${c.aDoc}↔${c.bDoc}) — ${c.body.replace(/^.*?— /, '')}`);
  const gotMap = new Map(ana.connections.map((c) => [c.a, c.b]));
  const mappedRight = gotMap.get('Acme') === 'Umbra' && gotMap.get('Dana') === 'Lee';
  log(`  topology recovered (Acme↔Umbra, Dana↔Lee): ${mappedRight ? 'YES ✓' : 'no'} · surface ignored, structure mapped`);

  // ── the firewall — every deposited act is reafference, held void ──────────────────
  rule('FIREWALL · every deposited act cannot witness');
  let checked = 0, breached = 0;
  for (const doc of [docA, docB, probe]) {
    for (const e of [...readReflections(doc), ...readMetaReflections(doc), ...readConnections(doc)]) {
      checked++;
      if (canWitness(e.prov) !== false || e.band !== 'void') breached++;
    }
  }
  for (const c of ana.connections) {   // analogy connections (uncommitted) ride the same firewall
    checked++;
    if (canWitness(c.prov) !== false || c.band !== 'void') breached++;
  }
  const sub = buildSubstrate({
    structure: { relations: [], defs: [] },
    reflections: readReflections(docA),
    metaReflections: readMetaReflections(docA),
    connections: readConnections(docA),
  });
  log(`  ${checked} acts checked · ${breached} breaches — ${breached === 0 ? 'FIREWALL HOLDS ✓' : 'FIREWALL BREACHED ✗'}`);
  log(`  substrate[metamorphosis]: ${sub.reflections.length} eo:Reflection · ${sub.metaReflections.length} eo:MetaReflection (all band=void, witness=reafferent)`);

  const ok = breached === 0 && probed.live && gotParaphrase && heldDistractors && mappedRight;
  log(`\n${ok ? '✓ local-model weave run OK' : '✗ something is off — see above'}`);
  process.exit(ok ? 0 : 1);
};

main().catch((e) => { console.error(e); process.exit(1); });

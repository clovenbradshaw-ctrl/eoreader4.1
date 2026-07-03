// essay-real-model — the full generation pipeline on a REAL small model and a REAL
// meaning embedder, not echo + hash. This is the last swap named in
// docs/generation-by-field-reading.md: the two stubbed organs replaced with the
// components the mechanics harness already stands up —
//   • renderer: SmolLM2-360M-Instruct (CPU, transformers.js) — it can actually invent,
//   • embedder: MiniLM (the meaning organ, measuresMeaning:true) — so the field read's
//     atmosphere/paradigm turns are SEMANTIC, not lexical.
// Everything else (self-register, the field read, decision-as-relaxation, holonic
// confinement, the audit export) is the merged pipeline, unchanged.
//
//   prereq:  npm install         (installs @huggingface/transformers, a devDependency)
//   run:     node eoreader4-eval/essay-real-model.mjs
//            first run downloads the two q8 models (~a few hundred MB) to the HF cache.
//   verify:  node eoreader4-eval/essay-real-model.mjs --mock
//            runs the SAME pipeline against real-model-SHAPED mock organs (async phrase
//            returning real sentences, async embed returning semantic vectors) — no
//            transformers, no download. Proves the adapter + the audit export end to end.
//
// It writes essay-real-model.audit.json and prints the prose + the self-diagnosis, so a
// real run can be exported and checked the same way the echo run is.
//
// NOTE: in the standard agent environment the REAL run does not complete — onnxruntime-node's
// post-install downloads its native binary from github releases and the egress policy returns
// 403. The wiring is correct (verified via --mock); run the real path where that fetch is
// allowed and the two q8 models can reach the HF cache.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { runContinuation, exportAudit } from '../src/longgen/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOCK = process.argv.includes('--mock');

// Real-model-SHAPED mock organs — the SAME interface as mechanics/harness.mjs's
// createCpuLlm / createMiniLM, so the pipeline cannot tell the difference. The mock talker
// renders the one handed span into a plain sentence (real prose shape, not a verbatim echo);
// the mock embedder returns a topic-keyed semantic vector so the field read finds real turns.
const createMockLlm = async () => ({
  id: 'mock-llm', kind: 'local', isLoaded: () => true, async load() {},
  async phrase(messages) {
    const user = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const at = user.indexOf('What I found reading it:');
    const span = at >= 0 ? user.slice(at + 24).split('\n').map((s) => s.trim()).filter(Boolean)[0] : '';
    // a plain realiser: lead with a connective, restate the span as a sentence.
    const lead = /weigh|against/i.test(user) ? 'Set against that, ' : /drawing together|closing/i.test(user) ? 'Taken together, ' : /recasting|really turns/i.test(user) ? 'Seen again, ' : '';
    return `${lead}${String(span || 'the point').replace(/\s+/g, ' ').trim()}`;
  },
});
const TOPIC = (t) => /small|fluent|slot|fill|wrong/i.test(t) ? 0 : /planner|ground|span|floor|bind/i.test(t) ? 1 : 2;
const createMockMini = async () => ({
  id: 'mock-mini', measuresMeaning: true, organ: 'mock', isWarm: () => true, async warm() {},
  async embed(text) { const v = new Float32Array(8); v[TOPIC(text)] = 1; return v; },
});

// The ground — what a reading surfaced, as ranked spans. Three topics so the field has a
// genuine turn to find: the small model / the planner's answer / the closure across messages.
const GROUND = [
  { idx: 0, score: 0.95, text: 'A small language model is fluent far past the limit of what it actually knows.' },
  { idx: 1, score: 0.90, text: 'Handed an open slot, the model fills it, because filling slots is the only thing it was trained to do.' },
  { idx: 2, score: 0.85, text: 'The filled slot is grammatical and confident, and its confidence when wrong is indistinguishable from its confidence when right.' },
  { idx: 3, score: 0.80, text: 'A separate planner makes every structural decision before the model is ever called.' },
  { idx: 4, score: 0.75, text: 'The planner grounds each claim on a span of the source it can point at.' },
  { idx: 5, score: 0.70, text: 'A floor checks the rendered sentence against its span and truncates whatever failed to bind.' },
  { idx: 6, score: 0.65, text: 'When the source runs out, the planner switches what it reads from the document to its own output so far.' },
  { idx: 7, score: 0.60, text: 'It reads its own sentences with the floor verdict attached, so it never mistakes its guess for the world.' },
];

const log = (...a) => console.log(...a);

const main = async () => {
  let model, mini;
  if (MOCK) {
    log('essay-real-model --mock — the pipeline on real-model-SHAPED organs (no transformers)\n');
    model = await createMockLlm();
    mini = await createMockMini();
  } else {
    log('essay-real-model — the pipeline on SmolLM2 + MiniLM (first run downloads the models)\n');
    // Dynamic import so this file LOADS without transformers; the real organs are only
    // pulled when actually running the real path.
    const { createCpuLlm, createMiniLM } = await import('./mechanics/harness.mjs');
    model = await createCpuLlm({ onProgress: (m) => log(`  · ${m}`) });
    mini = await createMiniLM({ onProgress: (m) => log(`  · ${m}`) });
  }
  await model.load();
  const embed = (t) => mini.embed(t);

  const config = {
    arc: true, temperature: 0, maxSteps: 40,
    selfRegister: true, fieldRead: true, embed, dynamics: true, confine: true,
  };
  log('\ngenerating (decision as relaxation; the field read is now SEMANTIC via MiniLM)…');
  const res = await runContinuation({ ground: GROUND, model, ...config });

  log(`\n── moves ──\n  ${res.units.map((u) => u.move).join(' · ')}   [stop: ${res.stop}]`);
  log('\n── prose (real SmolLM2 render, one proposition per atom) ──');
  res.units.forEach((u, i) => log(`  ${i + 1}. [${u.move}] ${u.text}`));

  // The audit export — the same artifact, now over real prose. `embed` is stripped (a
  // function is not serialisable) by exportAudit's config projection.
  const audit = exportAudit(res, { config: { ...config, embed: true }, label: MOCK ? 'mock-shaped-organs' : 'real-model-smollm2-minilm' });
  const path = join(HERE, MOCK ? 'essay-real-model.mock.audit.json' : 'essay-real-model.audit.json');
  writeFileSync(path, JSON.stringify(audit, null, 1));
  log(`\n── audit ──\n  exported → eoreader4-eval/essay-real-model.audit.json`);
  log(`  self-diagnosis : ${audit.checks.verdict}`);
  for (const [k, v] of Object.entries(audit.checks)) {
    if (v && typeof v === 'object' && 'ok' in v) log(`    ${v.ok ? '✓' : '✗'} ${k}`);
  }
};

main().catch((e) => { console.error(e); process.exitCode = 1; });

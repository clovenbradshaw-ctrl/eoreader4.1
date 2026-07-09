// monologue-audit.mjs — IS THE INNER MONOLOGUE HELPING? The battery over the audit instrument.
//
//   node eoreader4-eval/monologue-audit.mjs                 # model-free, built-in samples
//   node eoreader4-eval/monologue-audit.mjs a.txt b.md      # audit your own documents
//   node eoreader4-eval/monologue-audit.mjs --json          # emit the audit objects as JSONL
//   node eoreader4-eval/monologue-audit.mjs --voiced        # add a MODEL-voiced arm (needs
//                                                           # @huggingface/transformers; downloads
//                                                           # Qwen2.5-0.5B once) and compare
//
// The default run is MODEL-FREE — no weights, no network, runnable anywhere — because the
// engine it audits is (fold/deep-reading.js: "thinking needs no model"). It runs the deep reader
// over each document and reports, per doc, whether the monologue is HELPING, RUMINATING, ECHOING,
// IDLE, or UNSAFE, with the dimensions behind the verdict (docs/monologue-audit.md).
//
// The `--voiced` arm is the honest comparison the gen battery (docs/deep-reading-gen-battery-
// 2026-07.md) motivates: the model-free monologue tends to ECHO (it names the bond at each peak
// rather than interpreting it); a capable reflect voice should move the verdict toward HELPING.
// Same documents, same surf, only the reflection voice varies — so any verdict change is the
// voice. (Async model → sync engine via the gen battery's two-phase lift: pre-voice each peak,
// then inject a synchronous cursor lookup.)

import { readFile } from 'node:fs/promises';
import { auditMonologue, reportAudit } from '../src/fold/index.js';
import { surfFold } from '../src/surfer/index.js';
import { parseText } from '../src/perceiver/parse/index.js';

const args = process.argv.slice(2);
const VOICED = args.includes('--voiced');
const JSON_OUT = args.includes('--json');
const files = args.filter((a) => !a.startsWith('--'));

// ── the built-in samples — one per corner of the verdict space, so a bare run exercises the
// whole instrument. `expect` is a documented expectation, not an assertion (the tests assert).
const SAMPLES = [
  {
    name: 'developing', expect: 'reflects at distinct, interesting places (a clean read)',
    text:
      'Gregor woke to find himself changed. His body was hard and armored. ' +
      'The family gathered at the door and would not enter. Grete brought him food but looked away. ' +
      'The chief clerk arrived and demanded an explanation. Gregor could not make himself understood. ' +
      'His father drove him back with a stick. The apple lodged in his back and festered. ' +
      'Grete decided the creature was no longer her brother. In the morning the charwoman found him dead.',
  },
  {
    name: 'restatement-loop', expect: 'a pure loop — no surprise peaks, so it should stay quiet (IDLE)',
    text: Array(6).fill('The system processes the data and the data is processed by the system efficiently.').join(' '),
  },
  {
    // The surf's Bayesian surprise spikes on a row of never-seen proper nouns, so a citation tail
    // is where "most interesting" wrongly lands (deep-reading.js's apparatus guard exists for
    // exactly this). Same prose as `developing`, now with a References section bolted on: the
    // audit should show the monologue reflected on the SAME prose places (§3/§5/§8) and deposited
    // ZERO reflections on the citation lines — the tail changed nothing.
    name: 'reference-tail', expect: 'the apparatus filter keeps the monologue OFF the citation cruft',
    text:
      'Gregor woke to find himself changed. His body was hard and armored. ' +
      'The family gathered at the door and would not enter. Grete brought him food but looked away. ' +
      'The chief clerk arrived and demanded an explanation. Gregor could not make himself understood. ' +
      'His father drove him back with a stick. The apple lodged in his back and festered. ' +
      'Grete decided the creature was no longer her brother. In the morning the charwoman found him dead. ' +
      'References. ' +
      '↑ Smith, J. (1950). Kafka Studies. Princeton University Press. ISBN 0-000-00000-0. ' +
      '↑ Doe, A. (1961). doi: 10.1000/abcd. Retrieved 2020-01-01, archived from the original. ' +
      '↑ Roe, K. (1972). The Metamorphosis Reconsidered. Cambridge University Press. ISBN 1-111-11111-1.',
  },
];

const loadFile = async (path) => {
  try {
    const text = await readFile(path, 'utf8');
    return { name: path.replace(/^.*\//, ''), expect: 'your document', text };
  } catch (e) {
    console.error(`skipping ${path}: ${e.message}`);   // one bad path must not abort the rest
    return null;
  }
};

// ── the optional model-voiced reflect. Lazy: only imported under --voiced, so the default run
// has no dependency. Two-phase (the gen battery's async→sync lift): pre-voice each peak the
// model-free reader visits, then hand back a synchronous reflect that looks the body up by cursor.
async function buildVoicedReflect() {
  let transformers;
  try { transformers = await import('@huggingface/transformers'); }
  catch { console.error('--voiced needs @huggingface/transformers: npm i @huggingface/transformers'); process.exit(2); }
  const { pipeline, env } = transformers;
  env.allowLocalModels = false;
  const { createDeepReader, significanceReflectMessages, reflectionInput, cleanReflection, REFLECT_DECODE } = await import('../src/fold/index.js');
  const ID = process.env.REFLECT_MODEL || 'onnx-community/Qwen2.5-0.5B-Instruct';
  console.error(`loading ${ID} (CPU, q4) …`);
  const pipe = await pipeline('text-generation', ID, { device: 'cpu', dtype: 'q4' });
  const gen = async (messages, maxTok) => { const out = await pipe(messages, { max_new_tokens: maxTok, do_sample: false }); const m = out[0].generated_text; return String(Array.isArray(m) ? (m[m.length - 1]?.content || '') : m).trim(); };
  // return a factory: given a doc, pre-voice its peaks and yield the sync reflect. It must WALK
  // THE WHOLE DOC exactly as auditMonologue does — a single arrive({anchor:0}) quiesces at the
  // first below-band place, covering only a prefix, so deeper peaks would get empty voiced bodies
  // and the audited voiced arm would silently under-cover the document.
  return async (source) => {
    const peaks = new Map();
    const reader = createDeepReader({ doc: source, surf: surfFold });
    const n = (source.units || source.sentences || []).length || 1;
    let anchor = 0, guard = 0;
    const cap = Math.max(8, n);
    while (anchor < n - 1 && guard++ < cap) {
      const before = reader.reflections.length;
      const fresh = reader.arrive({ anchor }).reflections || [];
      for (const r of fresh) {
        const input = reflectionInput(r.fold, { doc: source, cursor: r.peak, focus: r.focus, surprise: r.surprise, band: r.band });
        const raw = await gen(significanceReflectMessages(input), REFLECT_DECODE.maxTokens);
        peaks.set(r.peak, cleanReflection(raw, { against: [input.frame, input.arrival] }));
      }
      if (fresh.length) anchor = Math.min(n - 1, fresh[fresh.length - 1].peak + 1);
      else if (reader.reflections.length === before) anchor += 8;
    }
    return (fold, ctx) => ({ body: peaks.get(ctx.cursor) || '' });
  };
}

// ── run ───────────────────────────────────────────────────────────────────────
const docs = files.length ? (await Promise.all(files.map(loadFile))).filter(Boolean) : SAMPLES;
if (!docs.length) { console.error('no readable documents to audit'); process.exit(1); }
const voicedFactory = VOICED ? await buildVoicedReflect() : null;

const rows = [];
for (const s of docs) {
  const free = auditMonologue(parseText(s.text, { docId: s.name, genderCoref: true }), { surf: surfFold });
  const row = { name: s.name, arm: 'free', audit: free };
  rows.push(row);
  if (!JSON_OUT) {
    console.log('\n' + '─'.repeat(72));
    console.log(`${s.name}  ·  ${s.expect}`);
    console.log(reportAudit(free, { title: `${s.name} · model-free monologue` }));
  }
  if (VOICED) {
    // parse the source EXACTLY as the audited doc is parsed (genderCoref on) — otherwise coref
    // differs, the Bayesian surf peaks diverge, and the pre-voiced peak map misses the audited
    // reader's cursors, emptying the voiced arm for a reason that is not the voice.
    const source = parseText(s.text, { docId: `src-${s.name}`, genderCoref: true });
    const reflect = await voicedFactory(source);
    const voiced = auditMonologue(parseText(s.text, { docId: s.name, genderCoref: true }), { surf: surfFold, reflect });
    rows.push({ name: s.name, arm: 'voiced', audit: voiced });
    if (!JSON_OUT) console.log('\n' + reportAudit(voiced, { title: `${s.name} · MODEL-voiced monologue` }));
  }
}

if (JSON_OUT) {
  for (const r of rows) console.log(JSON.stringify({ doc: r.name, arm: r.arm, ...r.audit }));
} else {
  // the summary table — one line per (doc, arm): the verdict at a glance.
  console.log('\n' + '═'.repeat(72));
  console.log('SUMMARY');
  const cols = ['doc', 'arm', 'verdict', 'score', 'distinct', 'novel', 'yield', 'reflns', 'firewall'];
  const w = [18, 7, 11, 6, 8, 6, 6, 6, 8];
  const fmt = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join(' ');
  console.log(fmt(cols));
  for (const r of rows) {
    const a = r.audit;
    console.log(fmt([
      r.name.slice(0, 17), r.arm, a.verdict, a.score,
      a.distinctness, a.novelty, a.yield == null ? '—' : a.yield, a.reflected,
      a.firewall.intact ? 'intact' : 'BREACH',
    ]));
  }
  // the firewall line — the safety claim, restated over the whole battery.
  const anyBreach = rows.some((r) => !r.audit.firewall.intact);
  const facts = rows.reduce((s, r) => s + r.audit.firewall.factsAdded, 0);
  console.log('\n' + `firewall over ${rows.length} runs: ${anyBreach ? 'BREACHED' : 'INTACT'} — ${facts} facts added to any record (must be 0).`);
}

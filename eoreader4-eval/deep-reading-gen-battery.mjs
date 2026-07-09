// Deep-reading generation battery — does reflecting at the source's surprise peaks BEFORE
// writing improve the prose? Three arms, same CPU model (Qwen2.5-0.5B), greedy, same sources:
//   baseline  walk with no deepRead
//   free      walk + deepRead, model-FREE reflection (the deterministic inner note)
//   voiced    walk + deepRead, MODEL-voiced reflection (the model reads the surprise peak and
//             writes what is significant there — the async lift: reflections pre-computed at
//             the source's peaks, then injected synchronously into the sync deepReading path)
// Independent quality battery (NOT the flow/Significance metric that any of this optimizes):
//   maxPair       worst repeated-paragraph pair   ↓ better (churn)
//   distinctTri   distinct trigrams / total       ↑ better
//   meanBound     grounded fraction of shipped     ↑ better (anti-fabrication)
//   chars         length (does reflecting starve or bloat)
import { pipeline, env } from '@huggingface/transformers';
import { walk } from '../src/longgen/index.js';
import { createDeepReader, significanceReflectMessages, reflectionInput, cleanReflection, REFLECT_DECODE } from '../src/fold/index.js';
import { surfFold } from '../src/surfer/index.js';
import { parseText } from '../src/perceiver/parse/index.js';

env.allowLocalModels = false;
// Optional bigger reflect voice: REFLECT_MODEL=onnx-community/Qwen2.5-1.5B-Instruct node …
// (the reflection is the hard, small task; the writer can stay smaller.) Defaults to one model.
const GEN_ID = 'onnx-community/Qwen2.5-0.5B-Instruct';
const REFLECT_ID = process.env.REFLECT_MODEL || GEN_ID;
const pipe = await pipeline('text-generation', GEN_ID, { device: 'cpu', dtype: 'q4' });
const rpipe = REFLECT_ID === GEN_ID ? pipe : await pipeline('text-generation', REFLECT_ID, { device: 'cpu', dtype: 'q4' });
const runPipe = (p) => async (messages, maxTok) => { const out = await p(messages, { max_new_tokens: maxTok, do_sample: false }); const m = out[0].generated_text; return String(Array.isArray(m) ? (m[m.length - 1]?.content || '') : m).trim(); };
const gen = runPipe(pipe);
const rgen = runPipe(rpipe);
const model = { name: 'qwen', async phrase(messages, opts = {}) { return gen(messages, Math.min(opts.maxTokens || 160, 200)); } };

const TOPICS = {
  dolphins: ['Dolphins are highly intelligent marine mammals found in oceans worldwide.', 'They use echolocation, emitting clicks and listening for the returning echoes to navigate.', 'Bottlenose dolphins live in social groups called pods that cooperate when hunting.', 'Some populations use marine sponges as tools to protect their snouts while foraging.', 'Dolphins communicate with signature whistles that function like individual names.', 'They are voluntary breathers and must surface regularly to take in air.', 'Calves stay with their mothers for several years, learning to hunt and socialise.', 'Human activities such as bycatch and noise pollution threaten many dolphin populations.'],
  volcanoes: ['A volcano is a rupture in a planet’s crust that lets molten rock escape to the surface.', 'Most volcanoes form at the boundaries between tectonic plates.', 'Magma that reaches the surface is called lava, and it cools into new rock.', 'Explosive eruptions are driven by dissolved gases expanding as pressure drops.', 'Shield volcanoes have gentle slopes built from fluid basaltic lava flows.', 'Stratovolcanoes are steep cones built from alternating ash and lava.', 'Volcanic ash can travel for thousands of kilometres and disrupt air travel.', 'The Ring of Fire around the Pacific hosts the majority of active volcanoes.'],
};

const refoldFrom = (spans) => async ({ seen }) => spans.map((text, i) => ({ idx: i, score: 0.9 - i * 0.02, text })).filter((s) => !seen.has(String(s.idx))).slice(0, 3);

// Pre-compute a model-voiced reflection at each surprise peak of the source, then hand back a
// SYNCHRONOUS reflect that looks the body up by cursor — the async lift into the sync engine.
async function voicedReflect(source) {
  const peaks = new Map();
  const reader = createDeepReader({ doc: source, surf: surfFold });
  for (const r of (reader.arrive({ anchor: 0 }).reflections || [])) {
    // hand the reflect the DEF→EVA decomposition (frame vs arrival, branched on verdict), and
    // reject a restatement of either span — inject only a genuine reaction.
    const input = reflectionInput(r.fold, { doc: source, cursor: r.peak, focus: r.focus, surprise: r.surprise, band: r.band });
    const raw = await rgen(significanceReflectMessages(input), REFLECT_DECODE.maxTokens);
    peaks.set(r.peak, cleanReflection(raw, { against: [input.frame, input.arrival] }));
  }
  return (fold, ctx) => ({ body: peaks.get(ctx.cursor) || '' });
}

const STOP = new Set('the a an and or but of to in on at for with as is are was were be been it its this that they them their we you by from into about which what'.split(' '));
const content = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
const tri = (a) => { const g = new Set(); for (let i = 0; i + 3 <= a.length; i++) g.add(a.slice(i, i + 3).join(' ')); return g; };
const jac = (a, b) => { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); };
const metrics = (res) => {
  const P = res.paragraphs;
  const cw = content(P.map((p) => p.text).join(' ')); const allTri = []; for (let i = 0; i + 3 <= cw.length; i++) allTri.push(cw.slice(i, i + 3).join(' '));
  const ptri = P.map((p) => tri(content(p.text)));
  let maxPair = 0; for (let i = 0; i < ptri.length; i++) for (let j = i + 1; j < ptri.length; j++) maxPair = Math.max(maxPair, jac(ptri[i], ptri[j]));
  const lenW = P.reduce((s, p) => s + p.text.length, 0) || 1;
  const meanBound = P.reduce((s, p) => s + (p.boundFraction || 0) * p.text.length, 0) / lenW;
  return { paras: P.length, chars: P.reduce((s, p) => s + p.text.length, 0), distinctTri: +(allTri.length ? new Set(allTri).size / allTri.length : 1).toFixed(3), maxPair: +maxPair.toFixed(3), meanBound: +meanBound.toFixed(3) };
};

const rows = [];
for (const [topic, spans] of Object.entries(TOPICS)) {
  const source = parseText(spans.join(' '), { docId: `src-${topic}` });
  const base = await walk({ fold: [], design: { demand: 3, question: topic }, model, refold: refoldFrom(spans), groundLater: true });
  const free = await walk({ fold: [], design: { demand: 3, question: topic }, model, refold: refoldFrom(spans), groundLater: true, deepRead: { source: parseText(spans.join(' ')), surf: surfFold } });
  const rv = await voicedReflect(source);
  const voiced = await walk({ fold: [], design: { demand: 3, question: topic }, model, refold: refoldFrom(spans), groundLater: true, deepRead: { source: parseText(spans.join(' ')), surf: surfFold, reflect: rv } });
  rows.push({ topic, arm: 'baseline', ...metrics(base) });
  rows.push({ topic, arm: 'free', ...metrics(free) });
  rows.push({ topic, arm: 'voiced', ...metrics(voiced) });
  console.error(`${topic}: done`);
}
const hdr = ['topic', 'arm', 'paras', 'chars', 'maxPair', 'distinctTri', 'meanBound'];
console.log(hdr.join('\t'));
for (const r of rows) console.log(hdr.map((h) => r[h]).join('\t'));
const agg = (arm, k) => { let s = 0, n = 0; for (const t of Object.keys(TOPICS)) { const b = rows.find((r) => r.topic === t && r.arm === 'baseline'), a = rows.find((r) => r.topic === t && r.arm === arm); if (b && a) { s += a[k] - b[k]; n++; } } return n ? s / n : NaN; };
for (const arm of ['free', 'voiced']) {
  console.log(`\nMEAN Δ (${arm} − baseline):`);
  console.log(`  maxPair     ${agg(arm, 'maxPair').toFixed(3)}  (↓ better)`);
  console.log(`  distinctTri ${agg(arm, 'distinctTri').toFixed(3)}  (↑ better)`);
  console.log(`  meanBound   ${agg(arm, 'meanBound').toFixed(3)}  (↑ better)`);
  console.log(`  chars       ${agg(arm, 'chars').toFixed(0)}`);
}

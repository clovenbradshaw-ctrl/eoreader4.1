// flow-shaping-ab.mjs — does conditioning generation on the flow prior actually
// produce BETTER long-form prose? The honest A/B.
//
//   node eoreader4-eval/flow-shaping-ab.mjs
//
// Needs @huggingface/transformers installed (npm i @huggingface/transformers) and
// downloads onnx-community/Qwen2.5-0.5B-Instruct (~0.5B, CPU/q4) once. Same model,
// same sources, GREEDY decoding, so the ONLY difference between the two arms is whether
// the arc-demanded move (flowShape) is injected into each beat's prompt — any output
// difference is causally the directive.
//
// METRICS are INDEPENDENT of the flow prior on purpose (scoring by the flow metric the
// shaping optimizes would be circular — reported as `arcAdh`, secondary):
//   interPara   consecutive-paragraph trigram Jaccard   ↓ better (the refrain signal)
//   maxPair     worst repeated-paragraph pair            ↓ better
//   distinctTri distinct trigrams / total               ↑ better (but rewards novelty,
//               so a hallucinated tangent inflates it — read alongside a human check)
//
// RESULT (2026-07-09, 8 topics): NEGATIVE. Shaping did not improve the prose and modestly
// harmed it — mean Δ maxPair +0.38, distinctTri −0.11; only arcAdh (circular) improved.
// Mechanism: on a small instruct model the SYN/REC directives ("draw the threads
// together", "carry forward") induce RESTATEMENT — the model summarises prior content
// instead of advancing (honeybees: two near-identical bulleted "breakdown" paragraphs,
// maxPair 1.0). See docs/flow-shaping-ab-2026-07.md. Caveats: one small model, one lever,
// one directive wording — evidence against the lever as wired, not proof the idea can't work.
import { pipeline, env } from '@huggingface/transformers';
import { walk } from '../src/longgen/index.js';
import { loadPrior, trajectoryFromDoc, scoreTrajectory } from '../src/flow/index.js';
import { parseText } from '../src/perceiver/parse/index.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
env.allowLocalModels = false;
const parse = (t) => parseText(String(t || ''), { coordSubjects: true });
const prior = loadPrior(readFileSync(join(root, 'data/flow-priors/mixed-en-pooled.json'), 'utf8'));

const pipe = await pipeline('text-generation', 'onnx-community/Qwen2.5-0.5B-Instruct', { device: 'cpu', dtype: 'q4' });
const model = {
  name: 'qwen2.5-0.5b',
  async phrase(messages, opts = {}) {
    const out = await pipe(messages, { max_new_tokens: Math.min(opts.maxTokens || 160, 200), do_sample: false });
    const m = out[0].generated_text;
    return String(Array.isArray(m) ? (m[m.length - 1]?.content || '') : m).trim();
  },
};

const TOPICS = {
  dolphins: ['Dolphins are highly intelligent marine mammals found in oceans worldwide.', 'They use echolocation, emitting clicks and listening for the returning echoes to navigate.', 'Bottlenose dolphins live in social groups called pods that cooperate when hunting.', 'Some populations use marine sponges as tools to protect their snouts while foraging.', 'Dolphins communicate with signature whistles that function like individual names.', 'They are voluntary breathers and must surface regularly to take in air.', 'Calves stay with their mothers for several years, learning to hunt and socialise.', 'Human activities such as bycatch and noise pollution threaten many dolphin populations.', 'Dolphins sleep by resting one half of the brain at a time, staying partly alert.'],
  volcanoes: ['A volcano is a rupture in a planet’s crust that lets molten rock escape to the surface.', 'Most volcanoes form at the boundaries between tectonic plates.', 'Magma that reaches the surface is called lava, and it cools into new rock.', 'Explosive eruptions are driven by dissolved gases expanding as pressure drops.', 'Shield volcanoes have gentle slopes built from fluid basaltic lava flows.', 'Stratovolcanoes are steep cones built from alternating ash and lava.', 'Volcanic ash can travel for thousands of kilometres and disrupt air travel.', 'The Ring of Fire around the Pacific hosts the majority of active volcanoes.', 'Volcanic soils are often highly fertile, drawing dense farming to their slopes.'],
  aqueducts: ['Roman aqueducts carried water from distant springs into cities using gravity alone.', 'Engineers surveyed a steady downhill gradient across many kilometres of terrain.', 'Where valleys interrupted the line, water crossed on tall arched bridges.', 'Most of an aqueduct’s length ran underground to protect the flow from fouling.', 'The water fed public fountains, baths, and the homes of wealthy citizens.', 'Settling tanks along the route let sediment drop out before the water arrived.', 'Lead and terracotta pipes distributed the water once it reached the city.', 'Maintenance crews called for regular clearing of mineral deposits from the channels.', 'The system let Roman cities grow far larger than local water could support.'],
  photosynthesis: ['Photosynthesis is the process by which plants convert light energy into chemical energy.', 'Chlorophyll in the leaves absorbs sunlight, mostly in the red and blue wavelengths.', 'Water drawn up from the roots is split to release oxygen as a by-product.', 'Carbon dioxide enters the leaf through tiny pores called stomata.', 'The captured energy is stored in sugar molecules the plant uses to grow.', 'The reactions take place inside cell structures called chloroplasts.', 'Photosynthesis underpins nearly every food chain on the planet.', 'The oxygen released over billions of years reshaped the Earth’s atmosphere.', 'Rates of photosynthesis rise with light and warmth up to a limit.'],
  printing_press: ['The printing press used movable metal type to reproduce text quickly and cheaply.', 'Johannes Gutenberg introduced the technology to Europe in the fifteenth century.', 'Before printing, books were copied by hand, making them rare and costly.', 'A single press could produce thousands of identical pages in a day.', 'Cheap books spread literacy far beyond the clergy and the wealthy.', 'The press accelerated the Reformation by circulating pamphlets widely.', 'Standardised printed texts helped fix spelling and stabilise languages.', 'Printers became early centres of news, scholarship, and commerce.', 'The flood of printed matter forced new ideas about authorship and copyright.'],
  coral_reefs: ['Coral reefs are built by tiny animals called polyps that secrete limestone skeletons.', 'The polyps host symbiotic algae that provide them with food through photosynthesis.', 'Reefs shelter roughly a quarter of all marine species despite their small area.', 'Warm, clear, shallow water suits the algae the corals depend on.', 'When stressed by heat, corals expel their algae and turn white, a process called bleaching.', 'Reefs protect coastlines by absorbing the energy of incoming waves.', 'Many coastal communities depend on reef fisheries for food and income.', 'Ocean acidification makes it harder for corals to build their skeletons.', 'Damaged reefs can recover if the stress eases and larvae resettle.'],
  glaciers: ['A glacier is a large mass of ice that forms where snow accumulates faster than it melts.', 'Under its own weight the packed snow recrystallises into dense glacial ice.', 'Gravity makes the ice flow slowly downhill like a very stiff river.', 'As they move, glaciers grind the bedrock and carve broad U-shaped valleys.', 'Rock debris carried by the ice is dumped in ridges called moraines.', 'Meltwater from glaciers feeds rivers that millions of people rely on.', 'Most of the world’s fresh water is locked up in glacial and polar ice.', 'Warming temperatures are causing many glaciers to retreat and thin.', 'Shrinking glaciers raise sea levels and disrupt seasonal water supplies.'],
  honeybees: ['Honeybees live in colonies of tens of thousands centred on a single queen.', 'Worker bees gather nectar and pollen from flowers to feed the hive.', 'A foraging bee signals the direction of food with a waggle dance.', 'The colony converts nectar into honey and stores it in wax combs.', 'By moving pollen between flowers, bees fertilise many food crops.', 'The queen lays the eggs while workers tend the young and build the comb.', 'Bees regulate the hive’s temperature by fanning their wings together.', 'Disease, pesticides, and habitat loss have driven worrying colony declines.', 'Because so many crops depend on them, bee losses threaten food supplies.'],
};

const refoldFrom = (spans) => async ({ seen }) => spans.map((text, i) => ({ idx: i, score: 0.9 - i * 0.02, text })).filter((s) => !seen.has(String(s.idx))).slice(0, 3);
const runArm = (spans, question, flowShape) => walk({ fold: [], design: { demand: 4, question }, model, refold: refoldFrom(spans), groundLater: true, flow: { prior, parse, perSentences: 8 }, flowShape });

// ── independent metrics (see header) ──
const STOP = new Set('the a an and or but of to in on at for with as is are was were be been being it its this that these those they them their he she his her we you i by from into over under about which who whom whose what when where how than then so such also can could may might will would has have had do does did not no more most some any each other one two'.split(' '));
const content = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
const tri = (arr) => { const g = new Set(); for (let i = 0; i + 3 <= arr.length; i++) g.add(arr.slice(i, i + 3).join(' ')); return g; };
const jac = (a, b) => { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); };
const metrics = (answer) => {
  const paras = answer.split(/\n\n+/).map((p) => p.trim()).filter((p) => p.length > 40);
  const cw = content(answer); const allTri = []; for (let i = 0; i + 3 <= cw.length; i++) allTri.push(cw.slice(i, i + 3).join(' '));
  const ptri = paras.map((p) => tri(content(p)));
  let inter = 0, pairs = 0; for (let i = 1; i < ptri.length; i++) { inter += jac(ptri[i], ptri[i - 1]); pairs++; }
  let maxPair = 0; for (let i = 0; i < ptri.length; i++) for (let j = i + 1; j < ptri.length; j++) maxPair = Math.max(maxPair, jac(ptri[i], ptri[j]));
  let arcAdh = null; try { const { steps, pos } = trajectoryFromDoc(parseText(answer), { segment: 'sections' }); if (steps.length >= 2) arcAdh = +scoreTrajectory(prior, steps, pos).meanArcAdherence.toFixed(2); } catch { /* short piece */ }
  return { paras: paras.length, distinctTri: +(allTri.length ? new Set(allTri).size / allTri.length : 1).toFixed(3), interPara: +(pairs ? inter / pairs : 0).toFixed(3), maxPair: +maxPair.toFixed(3), arcAdh };
};

const rows = [];
for (const [topic, spans] of Object.entries(TOPICS)) {
  const off = await runArm(spans, topic, false); const on = await runArm(spans, topic, true);
  rows.push({ topic, arm: 'unshaped', ...metrics(off.answer) });
  rows.push({ topic, arm: 'shaped', ...metrics(on.answer), wants: (on.flow?.wantSeq || []).join(',') });
  console.error(`${topic}: done`);
}
const hdr = ['topic', 'arm', 'paras', 'distinctTri', 'interPara', 'maxPair', 'arcAdh', 'wants'];
console.log(hdr.join('\t'));
for (const r of rows) console.log(hdr.map((h) => r[h] ?? '').join('\t'));
const agg = (k) => { let s = 0, n = 0; for (const t of Object.keys(TOPICS)) { const u = rows.find((r) => r.topic === t && r.arm === 'unshaped'), sh = rows.find((r) => r.topic === t && r.arm === 'shaped'); if (u[k] != null && sh[k] != null) { s += sh[k] - u[k]; n++; } } return n ? s / n : NaN; };
console.log(`\nMEAN Δ (shaped − unshaped) over ${Object.keys(TOPICS).length} topics:`);
console.log(`  distinctTri ${agg('distinctTri').toFixed(3)}  (↑ better)`);
console.log(`  interPara   ${agg('interPara').toFixed(3)}  (↓ better)`);
console.log(`  maxPair     ${agg('maxPair').toFixed(3)}  (↓ better)`);
console.log(`  arcAdh      ${agg('arcAdh').toFixed(2)}   (↓ better — CIRCULAR, the shaping target)`);

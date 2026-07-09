// grounding-enforcement-ab.mjs — does ENFORCING the grounding floor (splice the
// ungrounded tail / hold NUL) beat the reader's WRITE-FIRST policy (ship the whole
// draft, label grounding downstream)? The dolphin failure was fabrication shipped under
// `ground-later` at boundFraction 0.071; this tests the lever that targets it.
//
//   node eoreader4-eval/grounding-enforcement-ab.mjs
//
// Same CPU model (Qwen2.5-0.5B, greedy), same sources, `demand=4`. The only difference
// between arms is the grounding policy — both paths already exist in walk.js:
//   ship-whole  groundLater:true  — the reader default: keep the draft, regen once if it
//                                    grounds below BOUND_FLOOR, then ship it whole.
//   enforce     groundLater:false — the birth gate: splice off the ungrounded tail
//                                    (evaSplice), salvage to the bound prefix, hold NUL
//                                    if nothing binds; the self-read weld also runs.
//
// NOTE: the full 8-topic run exceeds ~10 min on CPU (the enforce arm's extra
// regen/salvage model calls multiply the generation cost). Run a subset (trim TOPICS)
// or raise the timeout. Result pending a completed run.
//
// METRICS:
//   meanBound      Σ boundFraction·len / Σ len   ↑ better — how grounded the shipped prose is
//   ungroundedChar Σ len·(1−boundFraction)       ↓ better — ungrounded (fabrication-class) text shipped
//   chars, paras   richness                       — does enforcement STARVE the output?
//   heldBeats      trace NUL count                — beats enforcement refused to ship
//   maxPair        worst repeated-paragraph pair  ↓ better — repetition
import { pipeline, env } from '@huggingface/transformers';
import { walk } from '../src/longgen/index.js';
import { parseText } from '../src/perceiver/parse/index.js';

env.allowLocalModels = false;
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
const runArm = (spans, question, groundLater) => walk({ fold: [], design: { demand: 4, question }, model, refold: refoldFrom(spans), groundLater });

const STOP = new Set('the a an and or but of to in on at for with as is are was were be been being it its this that these those they them their he she his her we you i by from into over under about which who whom whose what when where how than then so such also can could may might will would has have had do does did not no more most some any each other one two'.split(' '));
const content = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
const tri = (arr) => { const g = new Set(); for (let i = 0; i + 3 <= arr.length; i++) g.add(arr.slice(i, i + 3).join(' ')); return g; };
const jac = (a, b) => { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); };
const metrics = (res) => {
  const P = res.paragraphs;
  const chars = P.reduce((s, p) => s + p.text.length, 0);
  const lenW = P.reduce((s, p) => s + p.text.length, 0) || 1;
  const meanBound = P.reduce((s, p) => s + (p.boundFraction || 0) * p.text.length, 0) / lenW;
  const ungroundedChar = Math.round(P.reduce((s, p) => s + p.text.length * (1 - (p.boundFraction || 0)), 0));
  const held = (res.trace || []).filter((t) => t.kind === 'nul').length;
  const ptri = P.map((p) => tri(content(p.text)));
  let maxPair = 0; for (let i = 0; i < ptri.length; i++) for (let j = i + 1; j < ptri.length; j++) maxPair = Math.max(maxPair, jac(ptri[i], ptri[j]));
  return { paras: P.length, chars, meanBound: +meanBound.toFixed(3), ungroundedChar, held, maxPair: +maxPair.toFixed(3) };
};

const rows = [];
for (const [topic, spans] of Object.entries(TOPICS)) {
  const shipWhole = await runArm(spans, topic, true);
  const enforce = await runArm(spans, topic, false);
  rows.push({ topic, arm: 'ship-whole', ...metrics(shipWhole) });
  rows.push({ topic, arm: 'enforce', ...metrics(enforce) });
  console.error(`${topic}: done`);
}
const hdr = ['topic', 'arm', 'paras', 'chars', 'meanBound', 'ungroundedChar', 'held', 'maxPair'];
console.log(hdr.join('\t'));
for (const r of rows) console.log(hdr.map((h) => r[h]).join('\t'));
const agg = (k) => { let s = 0, n = 0; for (const t of Object.keys(TOPICS)) { const u = rows.find((r) => r.topic === t && r.arm === 'ship-whole'), e = rows.find((r) => r.topic === t && r.arm === 'enforce'); if (u[k] != null && e[k] != null) { s += e[k] - u[k]; n++; } } return n ? s / n : NaN; };
console.log(`\nMEAN Δ (enforce − ship-whole) over ${Object.keys(TOPICS).length} topics:`);
console.log(`  meanBound      ${agg('meanBound').toFixed(3)}  (↑ better — grounding)`);
console.log(`  ungroundedChar ${agg('ungroundedChar').toFixed(0)}  (↓ better — fabrication-class text)`);
console.log(`  chars          ${agg('chars').toFixed(0)}  (richness — negative = enforcement ships less)`);
console.log(`  held           ${agg('held').toFixed(2)}  (beats enforcement refused)`);
console.log(`  maxPair        ${agg('maxPair').toFixed(3)}  (↓ better — repetition)`);

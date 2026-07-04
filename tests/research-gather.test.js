import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runGroundedResearch, resolveDepth, holonicFacets, SIZE_PRESETS, STRATEGIES } from '../src/research/driver.js';
import { formatChatReply } from '../src/research/session.js';

// The gather-to-target loop (the user's ask: "research on dolphins should
// require a LOT of content — set a desired size and gather enough to get
// there", shaped by breadth / depth / diagonal). Offline: a fake `search`
// stands in for the web so the whole loop is deterministic and modelless.

// A tiny "web": a keyword-indexed set of dolphin pages. The fake search returns
// every page whose keywords intersect the query, minus a couple so different
// queries surface different pages (breadth has somewhere to go).
const WEB = [
  { url: 'https://w/dolphin', title: 'Dolphin', keys: ['dolphin', 'overview', 'what', 'definition'],
    text: 'Dolphins are aquatic mammals within the infraorder Cetacea. Dolphins range in size from the small Maui dolphin to the large orca. Dolphins are widespread across marine environments.' },
  { url: 'https://w/history', title: 'Evolution of dolphins', keys: ['history', 'origin', 'evolution', 'founded'],
    text: 'Dolphins evolved from land mammals about fifty million years ago. The ancestors of dolphins gradually adapted to aquatic life. Fossil evidence traces the origin of dolphins to the Eocene.' },
  { url: 'https://w/diet', title: 'Dolphin diet', keys: ['diet', 'examples', 'how', 'works', 'feeding'],
    text: 'Dolphins feed largely on fish and squid. Dolphins use conical teeth to capture fast-moving prey. Some large dolphins prey upon seals and other dolphins.' },
  { url: 'https://w/behaviour', title: 'Dolphin behaviour', keys: ['behaviour', 'impact', 'social', 'types'],
    text: 'Dolphins are highly social and live in groups called pods. Dolphins communicate with clicks and whistles. Dolphins are known for their intelligence and play.' },
  { url: 'https://w/criticism', title: 'Dolphins in captivity', keys: ['criticism', 'controversy', 'captivity', 'assessment'],
    text: 'Critics argue that keeping dolphins in captivity harms their welfare. Studies found that captive dolphins show signs of stress. Conservationists criticize dolphin hunts.' },
  { url: 'https://w/threats', title: 'Threats to dolphins', keys: ['recent', 'developments', 'threats', 'conservation'],
    text: 'Dolphins face threats from bycatch and pollution. Recent conservation efforts aim to protect dolphin populations. Climate change affects dolphin habitats.' },
  { url: 'https://w/species', title: 'Dolphin species', keys: ['types', 'classification', 'species', 'differences'],
    text: 'There are around forty species of dolphins. Dolphin species differ in size and habitat. Dolphins are widespread across marine environments. The orca is the largest member of the dolphin family.' },
  { url: 'https://w/anatomy', title: 'Dolphin anatomy', keys: ['anatomy', 'relationships', 'connections', 'body'],
    text: 'Dolphins have streamlined bodies built for speed. The dolphin blowhole is used for breathing. Dolphins have a thick layer of blubber for insulation.' },
];

const fakeSearch = async (query, { k = 4 } = {}) => {
  const terms = String(query).toLowerCase().split(/\s+/);
  const hits = WEB
    .map((p) => ({ p, score: p.keys.filter((key) => terms.includes(key)).length }))
    .filter((x) => x.score > 0 || terms.includes('dolphins') || terms.includes('dolphin'))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => ({ url: x.p.url, title: x.p.title, text: x.p.text }));
  // Always include the base page for a bare query so the seed round is non-empty.
  return hits.length ? hits : [{ url: WEB[0].url, title: WEB[0].title, text: WEB[0].text }];
};

test('resolveDepth maps size × strategy → a source & per-source target; no size → null (gather off)', () => {
  assert.equal(resolveDepth({}), null, 'no size and no target → no active gather');
  const deepBreadth = resolveDepth({ size: 'deep', strategy: 'breadth' });
  const deepDepth = resolveDepth({ size: 'deep', strategy: 'depth' });
  assert.ok(deepBreadth.targetSources > deepDepth.targetSources, 'breadth aims wider than depth');
  assert.ok(deepDepth.perSource > deepBreadth.perSource, 'depth mines each source harder');
  assert.equal(resolveDepth({ size: 'brief' }).follow, 'holonic', 'holonic (the default shape) walks the topic as a holarchy of cube kinds');
  assert.equal(resolveDepth({ targetSources: 4 }).targetSources, 4, 'an explicit target wins');
});

test('a size preset turns one page into a survey: the gather loop pins many sources', async () => {
  const { report } = await runGroundedResearch('dolphins', {
    size: 'deep', strategy: 'breadth', search: fakeSearch,
  });
  assert.ok(report.pins.length >= 5, `gathered a survey, not a sketch (got ${report.pins.length} sources)`);
  assert.ok(report.propositions.length >= 8, 'many grounded spans across the gathered corpus');
});

test('with many sources, corroboration is finally possible (it is structurally dead on one)', async () => {
  const { report } = await runGroundedResearch('dolphins', {
    size: 'deep', strategy: 'breadth', search: fakeSearch,
  });
  const distinctPins = new Set(report.propositions.map((p) => p.pinId));
  assert.ok(distinctPins.size >= 3, 'facts come from several distinct pins');
  const corroborated = report.propositions.some((p) => p.corroboratedBy.length);
  assert.ok(corroborated, 'a claim echoed across two pins corroborates — impossible with one source');
});

test('breadth gathers more distinct sources than depth for the same size', async () => {
  const breadth = await runGroundedResearch('dolphins', { size: 'standard', strategy: 'breadth', search: fakeSearch });
  const depth = await runGroundedResearch('dolphins', { size: 'standard', strategy: 'depth', search: fakeSearch });
  assert.ok(breadth.report.pins.length >= depth.report.pins.length,
    `breadth (${breadth.report.pins.length}) should be at least as wide as depth (${depth.report.pins.length})`);
});

test('no search injected → the corpus is exactly what was handed in (gather is inert)', async () => {
  const sources = [{ url: 'https://x', title: 'X', text: 'Dolphins are aquatic mammals. Dolphins eat fish.' }];
  const { report } = await runGroundedResearch('dolphins', { size: 'deep', strategy: 'breadth', sources });
  assert.equal(report.pins.length, 1, 'no search means no widening — the seed corpus stands alone');
});

// ── Holonic decomposition: the subject as a holarchy of sub-frames ──────────

// A web whose facet pages carry facet-specific search keys (a real engine
// separates "dolphins" from "origins of dolphins"), so each sub-holon can find
// and own its own sources.
const FACET_WEB = [
  { url: 'https://f/overview', title: 'Dolphin', keys: ['dolphins', 'dolphin', 'overview'],
    text: 'Dolphins are aquatic mammals within the infraorder Cetacea. Dolphins are widespread across marine environments. Dolphins are carnivorous predators.' },
  { url: 'https://f/history', title: 'Evolution', keys: ['origins', 'history'],
    text: 'Dolphins evolved from land mammals about fifty million years ago. The earliest dolphins appear in the fossil record. These dolphins share ancestry with whales.' },
  { url: 'https://f/how', title: 'Echolocation', keys: ['how', 'works'],
    text: 'Dolphins use echolocation to navigate. These dolphins emit clicks and read returning echoes. Dolphins hunt cooperatively.' },
  { url: 'https://f/crit', title: 'Captivity', keys: ['criticism', 'controversy'],
    text: 'Critics argue keeping dolphins in captivity harms welfare. Captive dolphins show signs of stress. Many dolphins die young in captivity.' },
  { url: 'https://f/impact', title: 'Significance', keys: ['impact', 'significance'],
    text: 'Dolphins are keystone predators shaping ecosystems. Dolphins carry cultural significance. Dolphins support tourism economies.' },
];
const facetSearch = async (query, { k = 4 } = {}) => {
  const t = String(query).toLowerCase().split(/\s+/);
  return FACET_WEB.map((p) => ({ p, s: p.keys.filter((key) => t.includes(key)).length }))
    .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, k)
    .map((x) => ({ url: x.p.url, title: x.p.title, text: x.p.text }));
};

test('holonicFacets breaks a subject into natural sub-questions, trimmed to the facet budget', () => {
  const f = holonicFacets('dolphins', 4);
  assert.equal(f.length, 4);
  assert.ok(f.every((q) => /dolphins/.test(q)), 'each facet names the subject');
  assert.match(f[0], /origins|history/, 'the first facet is the origin/history sub-holon');
  assert.match(holonicFacets('research dolphins')[0], /^origins and history of dolphins/, 'the research verb is stripped from the subject');
  // A task noun that leaked past subject extraction must not ride into every heading
  // as "…of dolphins essay" (the dolphins audit).
  assert.match(holonicFacets('dolphins essay')[0], /^origins and history of dolphins$/, 'a trailing task noun is stripped from the subject');
  assert.match(holonicFacets('climate report')[0], /of climate$/, 'a trailing "report" is stripped too');
  assert.match(holonicFacets('essay')[0], /of essay$/, 'a bare task noun as the whole subject survives');
});

test('holonic auto-decomposes into sub-frames, each reading the sources IT gathered', async () => {
  const { report } = await runGroundedResearch('dolphins', { size: 'deep', strategy: 'holonic', search: facetSearch });
  const children = report.sections.filter((s) => s.parentId);
  assert.ok(children.length >= 4, 'the subject decomposed into several sub-holons');
  const populated = children.filter((s) => s.propositions.length);
  assert.ok(populated.length >= 3, 'at least three sub-holons found their own material');
  // Each populated facet reads pins the root did not — it went and found its own.
  const rootPins = new Set(report.sections.find((s) => !s.parentId).propositions.map((p) => p.pinId));
  const facetPins = new Set(populated.flatMap((s) => s.propositions.map((p) => p.pinId)));
  assert.ok([...facetPins].some((p) => !rootPins.has(p)), 'a sub-holon stands on a source of its own');
});

test('offline holonic (no search) opens the sub-frames but never crashes', async () => {
  const sources = [{ url: 'https://x', title: 'X', text: 'Dolphins are aquatic mammals. Dolphins eat fish and squid.' }];
  const { report } = await runGroundedResearch('dolphins', { size: 'standard', strategy: 'holonic', sources });
  assert.ok(report.sections.length >= 2, 'the facets still structure the read');
  assert.ok(report.propositions.length >= 1, 'the root still grounds on the seed corpus');
});

test('the gathered survey renders an honest, multi-source chat reply', async () => {
  const { report, log } = await runGroundedResearch('dolphins', { size: 'standard', strategy: 'holonic', search: fakeSearch });
  const rootId = log.find((e) => e.kind === 'open').id;
  const reply = formatChatReply(report, rootId);
  assert.match(reply, /\d+ sources/, 'the footer reports a multi-source gather, not "1 source"');
  assert.doesNotMatch(reply, /comes from \*\*one source\*\*/, 'the single-source caveat is absent when many were gathered');
});

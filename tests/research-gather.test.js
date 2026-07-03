import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runGroundedResearch, resolveDepth, SIZE_PRESETS, STRATEGIES } from '../src/research/driver.js';
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
  assert.equal(resolveDepth({ size: 'brief' }).follow, 'coverage', 'diagonal (the default shape) walks by cube coverage');
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

test('the gathered survey renders an honest, multi-source chat reply', async () => {
  const { report, log } = await runGroundedResearch('dolphins', { size: 'standard', strategy: 'diagonal', search: fakeSearch });
  const rootId = log.find((e) => e.kind === 'open').id;
  const reply = formatChatReply(report, rootId);
  assert.match(reply, /\d+ sources/, 'the footer reports a multi-source gather, not "1 source"');
  assert.doesNotMatch(reply, /comes from \*\*one source\*\*/, 'the single-source caveat is absent when many were gathered');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  planQueries, modelPlanner, runDeepResearch, deepResearchReport,
  runTurnWithDeepResearch, deepResearchAnnouncement,
} from '../src/turn/deep-research.js';
import { admitWebSource } from '../src/ingest/websource.js';

// Deep research (docs/deep-research.md): the single curiosity walk (research.js), widened into a
// PLAN (multiple prompt generation) and deepened into a REPORT (provenance of every hop). It reuses
// the one surprise verbatim — curiosity is still D_KL(page ‖ what-we-know), leashed by saliency to
// the original question. All offline: a fake `search` and a fake `plan`.

const webDoc = (text, web = {}) => ({ ...admitWebSource({ url: web.url || 'https://w/x', text }).doc, web: { url: web.url || 'https://w/x', ...web } });

// ── Multiple prompt generation: planQueries ──────────────────────────────────

test('planQueries always keeps the concise query as facet 0, then the planner angles', async () => {
  const plan = async () => ['quantum computing hardware', 'quantum computing applications'];
  const facets = await planQueries('quantum computing', { plan, max: 4 });
  assert.equal(facets[0], 'quantum computing', 'the concise query is the anchor facet');
  assert.ok(facets.includes('quantum computing hardware'));
  assert.equal(facets.length, 3);
});

test('planQueries with no planner returns the seed alone (the walk fans out by surprise)', async () => {
  assert.deepEqual(await planQueries('quantum computing'), ['quantum computing']);
});

test('planQueries dedupes a facet that just restates the seed, and caps at max', async () => {
  const plan = async () => ['quantum computing', 'qubits', 'decoherence', 'error correction', 'topological qubits'];
  const facets = await planQueries('quantum computing', { plan, max: 4 });
  assert.equal(facets.length, 4, 'capped at max');
  assert.equal(facets.filter(f => f === 'quantum computing').length, 1, 'no duplicate of the seed');
});

test('planQueries survives a planner that throws — the seed still stands', async () => {
  const plan = async () => { throw new Error('model down'); };
  assert.deepEqual(await planQueries('topic', { plan }), ['topic']);
});

test('planQueries drops paragraph-length junk from the planner', async () => {
  const plan = async () => ['ok angle', 'x'.repeat(200)];
  const facets = await planQueries('seed', { plan });
  assert.ok(facets.includes('ok angle'));
  assert.ok(!facets.some(f => f.length > 160), 'the over-long line was dropped');
});

test('modelPlanner parses a numbered model list into bare queries; degrades to [] with no model', async () => {
  const model = { phrase: async () => '1. solar power cost\n2. solar power storage\n- solar power policy' };
  const out = await modelPlanner(model)('solar power', { max: 4 });
  assert.deepEqual(out, ['solar power cost', 'solar power storage', 'solar power policy']);
  assert.deepEqual(await modelPlanner(null)('x'), [], 'no model → no angles');
});

test('modelPlanner is discourse-aware: the planner prompt carries the conversation subject and open question', async () => {
  // The fan-out of research angles must be written against the discourse, not the seed alone.
  // Capture what the planner model sees when a conversation established an open topic.
  let seen = '';
  const model = { phrase: async (messages) => { seen = messages.map(m => m.content).join('\n'); return 'a\nb\nc'; } };
  const history = [{ role: 'user', content: 'How does photosynthesis convert sunlight?' }];
  await modelPlanner(model, { history, question: 'research this thoroughly' })('photosynthesis', { max: 4 });
  assert.match(seen, /Discourse state:/);         // the discourse frame was handed to the planner
  assert.match(seen, /photosynthesis/i);          // carrying the conversation's open subject
});

test('modelPlanner with no history plans from the seed alone (no discourse frame)', async () => {
  let seen = '';
  const model = { phrase: async (messages) => { seen = messages.map(m => m.content).join('\n'); return 'a\nb'; } };
  await modelPlanner(model)('solar power', { max: 3 });
  assert.ok(!/Discourse state:/.test(seen), 'no history → no discourse frame, just the topic');
});

// ── The multi-branch walk: opens from many facets, shares one prior + one leash ──

test('it opens the search from EVERY facet (multiple prompts), all grounded', async () => {
  const queries = [];
  const pages = {
    'climate policy': 'Climate policy covers carbon pricing and emissions.',
    'climate policy carbon tax': 'A carbon tax prices emissions across the economy, economy, economy.',
    'climate policy renewable subsidies': 'Renewable subsidies fund solar and wind deployment, deployment, deployment.',
  };
  const plan = async () => ['climate policy carbon tax', 'climate policy renewable subsidies'];
  const search = async (q) => { queries.push(q.toLowerCase()); const t = pages[q.toLowerCase()]; return t ? [{ doc: webDoc(t) }] : []; };

  const out = await runDeepResearch('climate policy', { search, plan, maxHops: 8, curiosityFloor: 0.02, k: 1 });
  assert.equal(out.facets.length, 3, 'seed + two planned angles');
  for (const f of ['climate policy', 'climate policy carbon tax', 'climate policy renewable subsidies'])
    assert.ok(queries.includes(f), `the facet "${f}" was searched`);
  assert.ok(out.sources.length >= 3, 'every facet contributed a grounded source');
});

test('one shared prior: a page whose content is already known is low-curiosity on a later facet', async () => {
  // Both facets fetch a page with the SAME content words (distinct URLs, so both are real fetches).
  // Because the two branches share ONE γ-decayed prior, the SECOND sighting moves belief far less —
  // the walk does not re-learn across branches. (With independent per-facet priors both would be
  // equally surprising; the drop is the shared state doing its job.)
  const text = 'The X-Files revival features Coogler and Carter and Duchovny.';
  const docs = { 'x-files': webDoc(text, { url: 'https://a' }), 'x-files cast': webDoc(text, { url: 'https://b' }) };
  const plan = async () => ['x-files cast'];
  const search = async (q) => { const d = docs[q.toLowerCase()]; return d ? [{ doc: d }] : []; };
  const out = await runDeepResearch('x-files', { search, plan, maxHops: 4, curiosityFloor: 0.02, k: 1 });
  const a = out.hops.find(h => h.query.toLowerCase() === 'x-files');
  const b = out.hops.find(h => h.query.toLowerCase() === 'x-files cast');
  assert.ok(a && b, 'both facets ran');
  assert.ok(b.curiosity < a.curiosity, `the repeat moved belief less than the first sight (${b.curiosity} < ${a.curiosity})`);
});

test('a page fetched once is never fetched again, even across facets and leads', async () => {
  const queries = [];
  const plan = async () => ['topic detail', 'topic'];   // a planned facet that restates the seed
  const search = async (q) => { queries.push(q.toLowerCase()); return [{ doc: webDoc('Topic figures Alpha Beta Gamma detail coverage') }]; };
  await runDeepResearch('topic', { search, plan, maxHops: 6, curiosityFloor: 0.01, k: 1 });
  assert.equal(new Set(queries).size, queries.length, 'no query was issued twice');
});

test('THE LEASH: a discovered thread that strays off the question is dropped and can stop the walk', async () => {
  const pages = {
    'x-files revival': 'The X-Files revival will be directed by Coogler, Coogler, Coogler.',
    'x-files revival coogler': 'Coogler, the X-Files revival director, once made Wakanda, Wakanda, Wakanda.',
    'x-files revival wakanda': 'Wakanda is a fictional African nation in Marvel comics, vibranium and the Panther.',
  };
  const search = async (q) => { const t = pages[q.toLowerCase()]; return t ? [{ doc: webDoc(t) }] : []; };
  const out = await runDeepResearch('X-Files revival', { search, maxHops: 8, salienceRatio: 0.5, strayPatience: 1, k: 1 });
  const strayed = out.hops.find(h => h.reason === 'strayed');
  assert.ok(strayed && /wakanda/i.test(strayed.query), 'the off-topic Wakanda thread strayed');
  assert.ok(out.docs.every(d => !/vibranium/.test(d.text || '')), 'the strayed page never reached the ground');
});

test('THE ARCHIVE: a strayed reading is parsed but not stored as a source — filed in the archive, leased by content', async () => {
  const pages = {
    'x-files revival': 'The X-Files revival will be directed by Coogler, Coogler, Coogler.',
    'x-files revival coogler': 'Coogler, the X-Files revival director, once made Wakanda, Wakanda, Wakanda.',
    'x-files revival wakanda': 'Wakanda is a fictional African nation in Marvel comics, vibranium and the Panther, at great length '.repeat(20),
  };
  const search = async (q) => { const t = pages[q.toLowerCase()]; return t ? [{ doc: webDoc(t, { url: `https://x/${q.replace(/\s+/g, '-')}` }) }] : []; };
  const out = await runDeepResearch('X-Files revival', {
    search, maxHops: 8, salienceRatio: 0.5, strayPatience: 1, k: 1,
    clock: () => 1_000, shredTtlOpts: { msPerChar: 2, min: 100, max: 1e12 },
  });
  assert.ok(out.archive.length >= 1, 'the strayed reading landed in the archive, not the void');
  const b = out.archive.find(e => /wakanda/i.test(e.text));
  assert.ok(b, 'the off-topic Wakanda reading is stored with its parsed text');
  assert.equal(b.reason, 'strayed');
  assert.ok(out.sources.every(s => s.url !== b.url), 'the archived reading never appears in the sources');
  assert.equal(b.archivedAt, 1_000, 'stamped by the injected clock');
  assert.equal(b.shredAt, 1_000 + b.ttlMs, 'leased to go to the shredder after a content-scaled duration');
  assert.ok(b.ttlMs >= b.chars * 2 - 1 && b.chars > 100, 'the lease scales with how much content was processed');
});

test('the report surfaces the archive distinct from the sources, and counts it in stats', async () => {
  const pages = {
    'x-files revival': 'The X-Files revival will be directed by Coogler, Coogler, Coogler.',
    'x-files revival coogler': 'Coogler, the X-Files revival director, once made Wakanda, Wakanda, Wakanda.',
    'x-files revival wakanda': 'Wakanda is a fictional African nation in Marvel comics, vibranium and the Panther.',
  };
  const search = async (q) => { const t = pages[q.toLowerCase()]; return t ? [{ doc: webDoc(t, { url: `https://x/${q.replace(/\s+/g, '-')}` }) }] : []; };
  const walk = await runDeepResearch('X-Files revival', { search, maxHops: 8, salienceRatio: 0.5, strayPatience: 1, k: 1, clock: () => 0 });
  const report = deepResearchReport(walk, { query: 'X-Files revival', turn: { answer: 'ok' } });
  assert.equal(report.archive.length, walk.archive.length, 'the report carries the archive');
  assert.equal(report.stats.archived, walk.archive.length, 'and counts it');
  assert.ok(report.stats.archived >= 1 && report.sources.length < walk.hops.length, 'archived readings are stored, not counted as sources');
});

test('maxHops is the hard backstop across all branches', async () => {
  let n = 0;
  const plan = async () => ['topic a', 'topic b'];
  const search = async () => { n += 1; return [{ doc: webDoc(`topic update new figure entity${n} entity${n} entity${n}`) }]; };
  const out = await runDeepResearch('topic', { search, plan, maxHops: 5, curiosityFloor: 0.01, k: 1 });
  assert.equal(out.hops.length, 5, 'stopped at exactly maxHops despite endlessly surprising pages');
});

test('a facet is trusted as ground but a drifting facet does not spawn deeper leads', async () => {
  // facet 0 (the seed) is on topic; the planned facet is pure off-topic noise. It still grounds
  // (the user chose it), but it must NOT open deeper leads down an already-strayed thread.
  const pages = {
    'apollo program': 'The Apollo program landed astronauts on the Moon, Moon, Moon.',
    'unrelated cooking recipes': 'Cooking recipes for pasta, bread, soup, salad, dessert, sauce, stew.',
  };
  const plan = async () => ['unrelated cooking recipes'];
  const search = async (q) => { const t = pages[q.toLowerCase()]; return t ? [{ doc: webDoc(t) }] : []; };
  const out = await runDeepResearch('apollo program', { search, plan, maxHops: 8, salienceRatio: 0.4, curiosityFloor: 0.02, k: 1 });
  const drift = out.hops.find(h => /cooking/.test(h.query));
  assert.ok(drift && drift.kept, 'the chosen facet still grounds (it is the plan)');
  assert.deepEqual(drift.leads, [], 'but it opens no deeper thread — it has strayed');
});

test('a failed search degrades to no docs, no throw', async () => {
  const search = async () => { throw new Error('network down'); };
  const out = await runDeepResearch('topic', { search, maxHops: 3 });
  assert.deepEqual(out.docs, []);
  assert.ok(out.hops.length >= 1 && out.hops.every(h => !h.kept));
});

// ── Provenance: every source carries the thread that found it ─────────────────

test('every source records which facet, query, and depth surfaced it, with its surprise + saliency', async () => {
  const pages = {
    'mrna vaccines': 'mRNA vaccines instruct cells to make a spike protein, protein, protein.',
    'mrna vaccines spike': 'The spike protein from the mRNA vaccine trains immunity, immunity, immunity.',
  };
  const search = async (q) => { const t = pages[q.toLowerCase()]; return t ? [{ doc: webDoc(t, { title: q, url: `https://x/${q.replace(/\s+/g, '-')}` }) }] : []; };
  const out = await runDeepResearch('mRNA vaccines', { search, maxHops: 4, curiosityFloor: 0.02, k: 1 });
  assert.ok(out.sources.length >= 1);
  for (const s of out.sources) {
    assert.ok(typeof s.n === 'number' && s.facet && s.query, 'each source is numbered and carries its thread');
    assert.ok(typeof s.curiosity === 'number' && typeof s.salience === 'number', 'and the surprise/saliency that admitted it');
    assert.ok('depth' in s, 'and the hop depth');
  }
  const deep = out.sources.find(s => s.depth >= 1);
  if (deep) assert.match(deep.query, /spike/i, 'a depth-1 source came from a discovered lead');
});

// ── The report: overview + facets + grouped sources + hop tree + stats ────────

test('deepResearchReport assembles the overview, the facets, grouped sources, the tree, and stats', async () => {
  const pages = {
    'fusion energy': 'Fusion energy fuses hydrogen into helium releasing energy, energy, energy.',
    'fusion energy tokamak': 'A tokamak confines plasma with magnets to sustain fusion, fusion, fusion.',
  };
  const plan = async () => ['fusion energy tokamak'];
  const search = async (q) => { const t = pages[q.toLowerCase()]; return t ? [{ doc: webDoc(t, { title: q }) }] : []; };
  const walk = await runDeepResearch('fusion energy', { search, plan, maxHops: 6, curiosityFloor: 0.02, k: 1 });
  const report = deepResearchReport(walk, { query: 'fusion energy', turn: { answer: 'Fusion fuses light nuclei. [s1]' } });

  assert.equal(report.query, 'fusion energy');
  assert.match(report.overview, /Fusion fuses/);
  assert.deepEqual(report.facets, ['fusion energy', 'fusion energy tokamak']);
  assert.equal(report.byFacet.length, 2, 'sources grouped by the facet that found them');
  assert.ok(report.stats.sources >= 2 && report.stats.kept >= 2);
  assert.ok(report.stats.facets === 2 && report.tree.length >= 2);
  assert.ok(report.stats.bits >= 0 && report.stats.maxDepth >= 0);
});

// ── The orchestrator: gather deep, fold, synthesize one grounded pass ─────────

test('runTurnWithDeepResearch folds every kept page into the turn scope and rides a report back', async () => {
  const pages = {
    'crispr': 'CRISPR is a gene-editing tool using Cas9 to cut DNA.',
    'crispr cas9': 'Cas9, guided by RNA, makes a precise cut for CRISPR editing.',
  };
  const plan = async () => ['crispr cas9'];
  const search = async (q) => { const t = pages[q.toLowerCase()]; return t ? [{ doc: webDoc(t, { title: q }) }] : []; };
  const calls = [];
  const runTurnImpl = async (args) => { calls.push(args); return { answer: 'CRISPR edits genes with Cas9.', route: 'grounded', sources: [0] }; };

  const out = await runTurnWithDeepResearch(
    { question: 'crispr', docs: [] },
    { search, plan, runTurnImpl, maxHops: 4, curiosityFloor: 0.02, k: 1 });

  assert.equal(out.answer, 'CRISPR edits genes with Cas9.');
  assert.ok(calls[0].docs.length >= 1, 'the gathered pages joined the grounding scope');
  assert.equal(calls[0].groundGraph, true, 'the meaning graph of the gather is fed to the talker');
  assert.equal(out.deepResearch.query, 'crispr');
  assert.ok(out.deepResearch.facets.includes('crispr cas9'));
  assert.ok(out.deepResearch.stats.sources >= 1, 'the report carries the provenance');
});

test('runTurnWithDeepResearch with no gather just runs the turn (no scope change)', async () => {
  const search = async () => [];
  const calls = [];
  const runTurnImpl = async (args) => { calls.push(args); return { answer: 'from memory', route: 'chat' }; };
  const out = await runTurnWithDeepResearch({ question: 'q', docs: [] }, { search, runTurnImpl, maxHops: 3 });
  assert.equal(out.answer, 'from memory');
  assert.equal(out.deepResearch.stats.sources, 0);
  assert.equal(calls[0].groundGraph, undefined, 'an empty gather does not touch the turn args');
});

// ── The announcement ──────────────────────────────────────────────────────────

test('deepResearchAnnouncement names the subject, the angles, and the depth budget', () => {
  const line = deepResearchAnnouncement('quantum computing', ['quantum computing', 'quantum computing hardware'], { maxHops: 14 });
  assert.match(line, /research/i);                 // names the decision: I'm going to research this
  assert.match(line, /quantum computing/);
  assert.match(line, /angles/);
  assert.match(line, /14 hops/);
  assert.equal(deepResearchAnnouncement('   '), null);
});

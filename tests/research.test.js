import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  researchTerms, profileOf, curiosityOf, foldInto, leadsFrom, plausibleLead, nextQuery,
  runCuriousResearch, runTurnWithResearch, researchAnnouncement,
} from '../src/turn/research.js';
import { admitWebSource } from '../src/ingest/websource.js';

// Curiosity-guided research (docs/curiosity-research.md): multi-hop web research steered by the
// engine's ONE surprise (core/surprise.js). Curiosity is D_KL(page ‖ what-we-know); the search
// follows the most surprising thread, up to a max number of hops, and STOPS when surprise dries
// up — it does not shotgun a fan-out of tangential queries. All offline: a fake `search`.

const webDoc = (text, web = {}) => ({ ...admitWebSource({ url: web.url || 'https://w/x', text }).doc, web: { url: 'https://w/x', ...web } });

// ── The curiosity metric IS the surprise core, pointed at the web ─────────────

test('researchTerms keeps topic words, drops function words', () => {
  const t = researchTerms('The X-Files revival is being made by Ryan Coogler in 2026.');
  assert.ok(t.includes('revival') && t.includes('coogler') && t.includes('ryan'));
  assert.ok(!t.includes('the') && !t.includes('by') && !t.includes('is') && !t.includes('2026'));
});

test('a page that only restates the prior is LOW curiosity; a page with a new figure is HIGH', () => {
  const prior = profileOf('The X-Files revival is a television series. The revival is a series.');
  const restate = curiosityOf(prior, profileOf('The X-Files revival is a series, a revival series.'));
  const novel   = curiosityOf(prior, profileOf('Ryan Coogler will direct the revival, said producer Carter.'));
  assert.ok(novel.bits > restate.bits, `a new figure surprises more than a restatement (${novel.bits} vs ${restate.bits})`);
  // and the surprise NAMES what was new — those are the leads
  assert.ok(novel.by.coogler > 0 || novel.by.carter > 0, 'the new figures carry the KL contribution');
});

test('curiosityOf is the shared surprise core — an empty prior opens at zero (no name-snow)', () => {
  const { bits } = curiosityOf(new Map(), profileOf('anything at all here'));
  assert.equal(bits, 0, 'the first arrival has no prior to diverge from — the honest opening');
});

test('foldInto γ-decays incumbents and deposits the arrival (the running knowledge state)', () => {
  const prior = new Map([['a', 10], ['b', 4]]);
  const next = foldInto(prior, new Map([['b', 1], ['c', 2]]), 0.5);
  assert.equal(next.get('a'), 5, 'a decayed by γ=0.5');
  assert.equal(next.get('b'), 4 * 0.5 + 1, 'b decayed then took its deposit');
  assert.equal(next.get('c'), 2, 'the newcomer deposits at full mass');
  assert.equal(prior.get('a'), 10, 'the input prior is untouched');
});

test('leadsFrom ranks by belief moved and drops already-seen leads', () => {
  const leads = leadsFrom({ coogler: 0.4, carter: 0.1, revival: 0.9 }, { seen: new Set(['revival']), max: 2 });
  assert.deepEqual(leads.map(l => l.term), ['coogler', 'carter'], 'heaviest first, seen "revival" dropped');
});

// ── OCR / artifact resistance: surprise ranks junk first, the walk must not chase it ──

test('plausibleLead rejects OCR / markup artifacts but keeps real words and names', () => {
  // real content passes
  for (const t of ['coogler', 'wakanda', 'revival', 'vibranium', 'covid19', "o'brien"])
    assert.ok(plausibleLead(t), `${t} should be a plausible lead`);
  // OCR / scanning artifacts are rejected
  for (const t of ['rn1', '0f', 'c0mpany', 'l1ne', 'v0te', 'thc', 'rn', 'vvv', 'sssss', 'strngth'])
    assert.ok(!plausibleLead(t), `${t} should be rejected as an artifact`);
});

test('a maximally-surprising OCR token never becomes a lead, even ranked first by KL', () => {
  // bayesBy would put the never-seen artifact "c0mpany" at the very top (maximal novelty); the real
  // term "coogler" sits below it. The artifact must still be filtered out, not chased.
  const leads = leadsFrom({ 'c0mpany': 0.9, 'rn1': 0.8, 'coogler': 0.3 }, { max: 4 });
  assert.deepEqual(leads.map(l => l.term), ['coogler'], 'only the real word survives, despite ranking last');
});

test('an on-topic page sprinkled with OCR junk still grounds, but the junk is not chased', async () => {
  const queries = [];
  const search = async (q) => {
    queries.push(q.toLowerCase());
    if (q.toLowerCase() === 'x-files revival')
      // a real page about the revival, but the scan introduced garbage tokens (high surprise!)
      return [{ doc: webDoc('The X-Files revival, directed by Coogler, rn1 vvss c0mpany 0f the network.') }];
    return [{ doc: webDoc('X-Files revival Coogler network coverage of the revival.') }];
  };
  const out = await runCuriousResearch('X-Files revival', { search, maxHops: 3, curiosityFloor: 0.02, k: 1 });
  assert.ok(out.docs.length >= 1, 'the on-topic page (with its few artifacts) still grounds the answer');
  assert.ok(!queries.some(q => /rn1|vvss|c0mpany|0f/.test(q)), 'no OCR artifact was ever searched');
  assert.ok(out.hops.every(h => (h.leads || []).every(t => plausibleLead(t))), 'every chased lead is a real word');
});

test('a mostly-garbage page strays on saliency — junk can never become the answer ground', async () => {
  const search = async (q) => q.toLowerCase() === 'x-files revival'
    ? [{ doc: webDoc('The X-Files revival is a series.') }]                                   // seed: on topic
    : [{ doc: webDoc('rn1 vvss c0mpany 0f l1ne thc qx zw scanned garbage artifact noise') }]; // a junk page
  const out = await runCuriousResearch('X-Files revival', { search, maxHops: 4, salienceRatio: 0.34, strayPatience: 1, k: 1 });
  assert.ok(out.docs.every(d => !/garbage|vvss/.test(d.text || '')), 'the garbage page never reached the ground');
});

test('nextQuery keeps the thread coherent — the lead rides WITH the anchor, never bare', () => {
  assert.equal(nextQuery('X-Files revival', { term: 'coogler' }), 'X-Files revival coogler');
  assert.equal(nextQuery('X-Files revival', { term: 'revival' }), 'X-Files revival', 'no duplication when the anchor already has it');
});

// ── The loop: best-first over curiosity, leashed by saliency to the question ──

test('the walk follows the surprising thread across MANY hops while it stays on topic', async () => {
  // Every page is on-topic (each shares the question's terms) AND opens a fresh surprising figure.
  // The leash never trips, so the walk keeps digging hop after hop — multiple hops, not just one.
  const pages = {
    'x-files revival': 'The X-Files revival will be directed by Coogler, Coogler, Coogler.',
    'x-files revival coogler': 'Coogler, the X-Files revival director, signed a deal, deal, deal with the network.',
    'x-files revival deal': 'The X-Files revival deal puts the network, network, network behind a reboot.',
    'x-files revival network': 'The network backing the X-Files revival also greenlit a spinoff, spinoff, spinoff.',
  };
  const queries = [];
  const search = async (q) => { queries.push(q); const t = pages[q.toLowerCase()]; return t ? [{ doc: webDoc(t) }] : []; };

  const out = await runCuriousResearch('X-Files revival', { search, maxHops: 6, curiosityFloor: 0.02, k: 1 });
  assert.ok(out.hops.length >= 3, `it took several hops, not one (took ${out.hops.length})`);
  assert.ok(queries.some(q => /coogler/i.test(q)), 'it chased the surprising figure Coogler');
  assert.ok(out.hops.filter(h => h.kept).length >= 3, 'each on-topic hop joined the ground');
  assert.ok(out.hops.every(h => h.salience != null), 'every hop records its saliency to the question');
});

test('THE LEASH: it stops when a thread strays too far from the question (saliency floor)', async () => {
  // The seed is about the X-Files revival; the "coogler" thread is still about it; but the deeper
  // "wakanda" page is pure Marvel lore with NO overlap with the question — off the leash. The walk
  // must drop it as STRAYED and stop, rather than wander into ever-more-tangential pages.
  const pages = {
    'x-files revival': 'The X-Files revival will be directed by Coogler, Coogler, Coogler.',
    'x-files revival coogler': 'Coogler, the X-Files revival director, once made Wakanda, Wakanda, Wakanda.',
    'x-files revival wakanda': 'Wakanda is a fictional African nation in Marvel comics, home to vibranium and the Panther.',
  };
  const search = async (q) => { const t = pages[q.toLowerCase()]; return t ? [{ doc: webDoc(t) }] : []; };

  const out = await runCuriousResearch('X-Files revival', { search, maxHops: 8, salienceRatio: 0.5, strayPatience: 1, k: 1 });
  assert.ok(out.hops.length < 8, `stopped early on straying, not at the cap (took ${out.hops.length} hops)`);
  const strayed = out.hops.find(h => h.reason === 'strayed');
  assert.ok(strayed, 'a hop was flagged as having strayed off the question');
  assert.ok(/wakanda/i.test(strayed.query), 'and it was the off-topic Wakanda thread that strayed');
  assert.ok(out.docs.every(d => !/vibranium/.test(d.text || '')), 'the off-topic page never reached the answer ground');
});

test('THE ARCHIVE: a strayed reading is parsed but filed (not grounded, not lost), leased by content', async () => {
  // Same walk as the leash test — but the strayed Wakanda reading is not thrown away: it is filed in
  // the archive, absent from the ground, with its parsed text kept and a lease set by content processed.
  const pages = {
    'x-files revival': 'The X-Files revival will be directed by Coogler, Coogler, Coogler.',
    'x-files revival coogler': 'Coogler, the X-Files revival director, once made Wakanda, Wakanda, Wakanda.',
    'x-files revival wakanda': 'Wakanda is a fictional African nation in Marvel comics, home to vibranium and the Panther.',
  };
  const search = async (q) => { const t = pages[q.toLowerCase()]; return t ? [{ doc: webDoc(t) }] : []; };
  const out = await runCuriousResearch('X-Files revival', {
    search, maxHops: 8, salienceRatio: 0.5, strayPatience: 1, k: 1, clock: () => 500, shredTtlOpts: { msPerChar: 3, min: 100, max: 1e12 },
  });
  assert.ok(out.archive.length >= 1, 'the strayed reading landed in the archive');
  const b = out.archive.find(e => /vibranium/.test(e.text));
  assert.ok(b, 'the off-topic reading is stored with its parsed text — a circle-back can re-use it');
  assert.equal(b.reason, 'strayed');
  assert.ok(out.docs.every(d => !/vibranium/.test(d.text || '')), 'yet it never reached the ground');
  assert.equal(b.shredAt, 500 + b.ttlMs, 'leased to go to the shredder after a content-scaled duration, stamped by the clock');
});

test('maxHops is the hard backstop — even endlessly on-topic+surprising pages cannot run away', async () => {
  // Each page repeats the anchor (always salient) and adds one fresh figure (always surprising), so
  // only the ceiling can stop it. The leash being satisfied must not let it exceed maxHops.
  let n = 0;
  const search = async () => { n += 1; return [{ doc: webDoc(`X-Files revival update: new figure entity${n} entity${n} entity${n}`) }]; };
  const out = await runCuriousResearch('X-Files revival', { search, maxHops: 3, curiosityFloor: 0.01, k: 1 });
  assert.equal(out.hops.length, 3, 'stopped at exactly maxHops');
});

test('an on-topic restatement is kept as ground but spawns no new leads (exhausted, not strayed)', async () => {
  // A page right on the question that says nothing new: relevant, so it grounds; unsurprising, so it
  // opens no thread. It is NOT a stray — saliency is high — so it does not push the walk toward stopping.
  const search = async (q) => [{ doc: webDoc('The X-Files revival is the X-Files revival, a revival of the X-Files.') }];
  const out = await runCuriousResearch('X-Files revival', { search, maxHops: 4, curiosityFloor: 0.5, salienceRatio: 0.3, k: 1 });
  assert.equal(out.hops[0].kept, true, 'the on-topic seed page is kept as ground');
  assert.ok(out.hops.every(h => h.reason !== 'strayed'), 'nothing strayed — it stayed on the question');
});

test('the seed is always kept as ground and calibrates the leash baseline', async () => {
  const search = async () => [{ doc: webDoc('a plain X-Files revival page') }];
  const out = await runCuriousResearch('X-Files revival', { search, maxHops: 1, curiosityFloor: 5, k: 1 });
  assert.equal(out.hops[0].kept, true, 'the seed hop is the ground and the saliency yardstick — kept regardless of floor');
  assert.equal(out.docs.length, 1);
});

test('a failed/empty search degrades to no docs, no throw', async () => {
  const search = async () => { throw new Error('network down'); };
  const out = await runCuriousResearch('topic', { search, maxHops: 3 });
  assert.deepEqual(out.docs, []);
  assert.equal(out.hops.length, 1, 'one hop attempted, recorded as empty');
  assert.equal(out.hops[0].kept, false);
  assert.equal(out.hops[0].reason, 'empty');
});

test('a never-repeats-query guarantee: the same lead is never fetched twice', async () => {
  const queries = [];
  const search = async (q) => { queries.push(q.toLowerCase()); return [{ doc: webDoc('Coogler Coogler Wakanda Carter revival figures') }]; };
  await runCuriousResearch('X-Files revival', { search, maxHops: 5, curiosityFloor: 0.01, k: 1 });
  assert.equal(new Set(queries).size, queries.length, 'no query was issued twice');
});

// ── The orchestrator: gather, fold into scope, answer in one grounded pass ────

test('runTurnWithResearch folds the kept pages into the turn scope and rides a trace back', async () => {
  const pages = {
    'who directs the x-files revival': 'The X-Files revival will be directed by Ryan Coogler.',
    'who directs the x-files revival coogler': 'Coogler, the Wakanda director, replaces Carter on the revival.',
  };
  const search = async (q) => { const t = pages[q.toLowerCase()]; return t ? [{ doc: webDoc(t, { title: q }) }] : []; };
  const calls = [];
  const runTurnImpl = async (args) => { calls.push(args); return { answer: 'Ryan Coogler.', route: 'grounded', sources: [0] }; };

  const out = await runTurnWithResearch(
    { question: 'who directs the x-files revival', docs: [] },
    { search, runTurnImpl, maxHops: 2, curiosityFloor: 0.05, k: 1 });

  assert.equal(out.answer, 'Ryan Coogler.');
  assert.ok(calls[0].docs.length >= 1, 'the gathered web pages joined the grounding scope');
  assert.equal(calls[0].groundGraph, true, 'the meaning graph of the gather is fed to the talker');
  assert.ok(out.research.results >= 1 && out.research.kept >= 1, 'the research trace reports what was kept');
  assert.equal(out.research.seed, 'who directs the x-files revival');
});

test('runTurnWithResearch with no gather just runs the turn (no scope change)', async () => {
  const search = async () => [];
  const calls = [];
  const runTurnImpl = async (args) => { calls.push(args); return { answer: 'from memory', route: 'chat' }; };
  const out = await runTurnWithResearch({ question: 'q', docs: [] }, { search, runTurnImpl, maxHops: 3 });
  assert.equal(out.answer, 'from memory');
  assert.equal(out.research.results, 0);
  assert.equal(calls[0].groundGraph, undefined, 'an empty gather does not touch the turn args');
});

test('researchAnnouncement is a first-person, pre-walk beat naming the decision, the search query, and the hop budget', () => {
  const line = researchAnnouncement('X-Files revival', { maxHops: 4 });
  assert.match(line, /research/i);                 // names the decision: I'm going to research this
  assert.match(line, /searching for/i);            // "here's what I'm searching for" — names the query
  assert.match(line, /follow what surprises me/);
  assert.match(line, /4 hops/);
  assert.match(line, /X-Files revival/);           // the actual (LLM-formulated) seed query
  assert.equal(researchAnnouncement('   '), null);
});

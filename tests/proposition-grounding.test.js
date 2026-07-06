import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// PROPOSITION-FIRST grounding: the chat answer is grounded on the reading's EOT propositions ABOUT
// the question (coupled through the graph's merged referents), ranked by INDEPENDENT-ORIGIN
// corroboration — not on keyword-matched sentences or centrality-ranked graph edges. These tests
// pin the pure selection/ranking pieces (`groundPropositions`, `_rankPropositions`,
// `_independentOrigins`, `_nearDup`) with a fake graph + master, in BOTH shipped copies. The live
// prompt/citation wiring is exercised by the headless chat harness.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Extract a method's source by balanced-paren (param list) then balanced-brace (body) matching —
// handles destructuring defaults like `{budget=1600}={}` that a naive first-`{` scan would truncate.
const methodOf = (src, name) => {
  const at = src.indexOf(`\n  ${name}(`);
  assert.ok(at >= 0, `method ${name} not found`);
  const nameStart = at + 3;                       // skip '\n  '
  let i = at + 3 + name.length;                   // at the '('
  let pd = 0;
  for (; i < src.length; i++) { const c = src[i]; if (c === '(') pd++; else if (c === ')') { if (--pd === 0) { i++; break; } } }
  while (i < src.length && src[i] !== '{') i++;    // to the body '{'
  let bd = 0;
  for (; i < src.length; i++) { const c = src[i]; if (c === '{') bd++; else if (c === '}') { if (--bd === 0) { i++; break; } } }
  return src.slice(nameStart, i);
};

// A fake folded world: labelled entities + directed edges with per-edge source sentences.
const worldHarness = (src, world) => {
  const body = ['groundPropositions', '_rankPropositions', '_independentOrigins', '_nearDup', 'eotRel', 'junkRel', '_repOf', '_groundCue', '_chainBetween', '_bfsPath', '_chainCoversQuestion']
    .map((m) => methodOf(src, m)).join('\n');
  const Cls = new Function(`return class H {
    norm(s){ return String(s||'').replace(/\\s+/g,' ').trim(); }
    _clipPassage(s){ return String(s||''); }
    _proseOk(){ return true; }
    isURLish(){ return false; }
    showable(){ return true; }
    labelOf(id){ return this.__labels[id] || String(id); }
    edgeTriple(e){ return { v:e.via, neg:false, conf:0.7, irr:!!e.irr, eot:(this.labelOf(e.from)+' -> '+this.labelOf(e.to)+' : '+e.via) }; }
    ${body}
  }`)();
  const h = new Cls();
  h.MAX_PASSAGE = 600;
  h.STOP = new Set(['the','a','an','to','in','of','and','is','are','on']);
  // Default world: dolphins. `world` overrides labels/edges/sentences/sentenceSource for other cases.
  h.__labels = (world && world.labels) || { d:'dolphin', ec:'echolocation', sh:'shipping', ox:'oxygen', f:'Further' };
  h.graph = {
    representative: (x) => x,
    entities: new Map(Object.keys(h.__labels).map((id) => [id, { id }])),
    edges: (world && world.edges) || [
      { from:'d', to:'ec', via:'uses',    sentIdx:0 },   // on-question, source A
      { from:'d', to:'ec', via:'uses',    sentIdx:1 },   // same claim, source B → corroborated
      { from:'sh', to:'ox', via:'reading', sentIdx:2 },  // OFF-question (no referent) → excluded
      { from:'f', to:'ox', via:'reading', sentIdx:3 },   // the export's "Further -> Oxygen" noise → excluded
      { from:'d', to:'sh', via:'the',     sentIdx:4 },   // junk relation (STOP) → excluded
    ],
  };
  h.master = {
    sentences: (world && world.sentences) || [
      'Dolphins use echolocation to navigate.',
      'The river dolphin relies on echolocation in murky water.',
      'Shipping tonnage rose in 2016.',
      'Further reading on oxygen.',
      'Dolphins and shipping.',
    ],
    sentenceSource: (world && world.sentenceSource) || ['A', 'B', 'A', 'A', 'A'],
  };
  return h;
};

for (const page of ['src/reader/app.dc.js', 'index.html']) {
  const src = readFileSync(join(root, page), 'utf8');

  test(`${page}: grounding selects on-question propositions and drops centrality/off-question noise`, () => {
    const h = worldHarness(src);
    const pg = h.groundPropositions('dolphin echolocation', []);
    assert.ok(pg, 'a question about read referents grounds on propositions');
    // Only the dolphin→echolocation claim survives; shipping/oxygen/"Further" and the junk relation are gone.
    assert.equal(pg.evidence.length, 1, 'exactly one on-question proposition group');
    assert.match(pg.evidence[0].eot, /dolphin/i);
    assert.match(pg.evidence[0].eot, /echolocation/i);
    assert.ok(!pg.evidence.some((e) => /shipping|oxygen|Further/i.test(e.eot || '')), 'no off-question noise cited');
    // The prompt carries the proposition's verbatim witness SENTENCE (natural language), not an arrow.
    assert.ok(pg.promptSpans.length >= 1);
    assert.match(pg.promptSpans[0].text, /echolocation/i);
    assert.ok(!pg.promptSpans.some((s) => /->/.test(s.text)), 'prompt spans are sentences, not A -> B arrows');
  });

  test(`${page}: corroboration — the same claim from two sources counts as two independent origins`, () => {
    const h = worldHarness(src);
    const pg = h.groundPropositions('dolphin echolocation', []);
    assert.equal(pg.evidence[0].origins, 2, 'two distinct sources → corroborated (origins 2)');
  });

  test(`${page}: a question naming no read referent grounds on no proposition (falls back)`, () => {
    const h = worldHarness(src);
    assert.equal(h.groundPropositions('weather forecast tomorrow', []), null);
  });

  test(`${page}: _independentOrigins folds same-source and near-duplicate witnesses`, () => {
    const h = worldHarness(src);
    assert.equal(h._independentOrigins([{ source:'A', text:'x y z' }, { source:'A', text:'p q r' }]), 1, 'same source counts once');
    assert.equal(h._independentOrigins([{ source:'A', text:'x y z' }, { source:'B', text:'p q r' }]), 2, 'two sources count twice');
    assert.equal(h._independentOrigins([
      { source:'A', text:'dolphins use echolocation to navigate' },
      { source:'B', text:'dolphins use echolocation to navigate' },
    ]), 1, 'syndicated near-duplicate text collapses across sources');
  });

  test(`${page}: _nearDup is Jaccard-thresholded, guarded on empties`, () => {
    const h = worldHarness(src);
    assert.equal(h._nearDup('a b c d', 'a b c d'), true);
    assert.equal(h._nearDup('a b c d', 'x y z w'), false);
    assert.equal(h._nearDup('', 'a b'), false);
  });

  test(`${page}: the selector buys COMBINATION — a connector beats a disconnected, better-corroborated spoke`, () => {
    const h = worldHarness(src);
    // The two dolphin edges are well-corroborated (3 sources), so they lead and pull echolocation +
    // navigation into the active set. The connector (echolocation→navigation, single source) then links
    // two already-active nodes and is chosen AHEAD of a disconnected 2-source spoke — combination wins
    // over corroboration once the neighbourhood is present. (On the very first pick, corroboration still
    // leads: you load the best-attested fact about the referent, then build the connected web around it.)
    const three = (t) => [{ source:'A', text:t+' a', sentIdx:0 }, { source:'B', text:t+' b', sentIdx:1 }, { source:'C', text:t+' c', sentIdx:2 }];
    const groups = [
      { key:'a', eot:'dolphin -> echolocation : uses',      rf:'d',  rt:'ec',  base:'uses',    conf:0.6, witnesses:three('dolphins use echolocation') },
      { key:'b', eot:'dolphin -> navigation : aids',        rf:'d',  rt:'nav', base:'aids',    conf:0.6, witnesses:three('dolphins navigate') },
      { key:'c', eot:'echolocation -> navigation : enables',rf:'ec', rt:'nav', base:'enables', conf:0.6, witnesses:[{ source:'A', text:'echolocation enables navigation', sentIdx:3 }] },
      { key:'e', eot:'dolphin -> quirk : notes',            rf:'d',  rt:'qq',  base:'notes',   conf:0.6, witnesses:[{ source:'A', text:'a quirk', sentIdx:4 }, { source:'B', text:'a quirk again', sentIdx:5 }] },
    ];
    const r = h._rankPropositions(groups, new Set(['d']), { budget: 1600 });
    const order = r.evidence.map((x) => x.eot);
    const iConnector = order.indexOf('echolocation -> navigation : enables');
    const iSpoke = order.indexOf('dolphin -> quirk : notes');
    assert.ok(iConnector >= 0 && iSpoke >= 0);
    assert.ok(iConnector < iSpoke, `the connector (1 source) beats the disconnected 2-source spoke once its neighbourhood is active (got ${order.join(' | ')})`);
  });

  test(`${page}: relevance — an on-question proposition outranks a better-corroborated off-question one`, () => {
    // The dolphins-sociality failure: a broad anchor ("dolphin") makes EVERY dolphin-fact eligible, so
    // the prompt window used to fill with the best-corroborated/best-connected facts about the anchor
    // (teeth, sleep, size) rather than what the ask was ABOUT. The fold must do that thinking — surface
    // the on-question spans — so the small model gets enough to speak coherently for the turn.
    const h = worldHarness(src);
    const groups = [
      { key:'soc',   eot:'dolphin -> pods : form',  rf:'d', rt:'pods', base:'form', conf:0.7,
        witnesses:[{ source:'A', text:'Dolphins are highly social animals that form fluid pods.', sentIdx:0 }] },
      { key:'teeth', eot:'dolphin -> teeth : have',  rf:'d', rt:'th',   base:'have', conf:0.7,
        witnesses:[{ source:'A', text:'Dolphins have conical teeth.', sentIdx:1 },
                   { source:'B', text:'Dolphins use conical teeth to hunt.', sentIdx:2 }] },
    ];
    // With NO question words the ranker is unchanged: the 2-source teeth claim leads by corroboration.
    const plain = h._rankPropositions(groups, new Set(['d']), { budget: 1600 });
    assert.match(plain.promptSpans[0].text, /teeth/i, 'no qwords → corroboration still leads (backward compatible)');
    // With the question's words, the on-topic proposition is pulled ahead of the corroborated spoke —
    // "social" is rare across the candidates (high IDF) while the anchor "dolphins" is universal (near-zero).
    const ranked = h._rankPropositions(groups, new Set(['d']), { budget: 1600, qwords: ['social', 'behavior', 'dolphins'] });
    assert.match(ranked.promptSpans[0].text, /social/i, 'qwords → the on-question proposition leads the prompt');
    const iSoc = ranked.promptSpans.findIndex((s) => /social/i.test(s.text));
    const iTeeth = ranked.promptSpans.findIndex((s) => /teeth/i.test(s.text));
    assert.ok(iSoc >= 0 && iTeeth >= 0 && iSoc < iTeeth, 'relevance outranks corroboration for the prompt window');
    // The prompt-span SCORE is the selection rank, so orderSpansForFrame keeps the on-question span in the window.
    assert.ok(ranked.promptSpans[iSoc].score > ranked.promptSpans[iTeeth].score, 'the on-question span scores above the corroborated spoke in the frame ordering');
    // The universal anchor alone must NOT create relevance: a bare "dolphins" ask leaves corroboration in charge.
    const anchorOnly = h._rankPropositions(groups, new Set(['d']), { budget: 1600, qwords: ['dolphins'] });
    assert.match(anchorOnly.promptSpans[0].text, /teeth/i, 'the anchor word is in every witness (near-zero IDF) → it does not reorder');
  });

  test(`${page}: opposite-polarity claims on the same point are surfaced as a FORK (both sides ride)`, () => {
    const h = worldHarness(src);
    const groups = [
      { key:'p', eot:'working memory : capacity slots',     rf:'wm', rt:'slots', base:'capacity', neg:false, conf:0.6, witnesses:[{ source:'A', text:'working memory has about four slots', sentIdx:0 }] },
      { key:'n', eot:'working memory : not-capacity slots', rf:'wm', rt:'slots', base:'capacity', neg:true,  conf:0.6, witnesses:[{ source:'B', text:'working memory does not have fixed slots', sentIdx:1 }] },
    ];
    const r = h._rankPropositions(groups, new Set(['wm']), { budget: 1600 });
    assert.equal(r.forks.length, 1, 'same endpoints + base relation + opposite polarity = one fork');
    assert.ok(r.evidence.every((e) => e.fork), 'both forked propositions are tagged');
    assert.equal(r.promptSpans.length, 2, 'both sides of the debate reach the prompt');
    // The disagreement cue fires for a forked turn and is empty otherwise.
    assert.match(h._groundCue({ forks: r.forks }), /disagree/i);
    assert.equal(h._groundCue({ forks: [] }), '');
  });

  test(`${page}: the prompt is token-budgeted while the citation evidence stays full`, () => {
    const h = worldHarness(src);
    const groups = [
      { key:'k1', eot:'A -> B : r', rf:'a', rt:'b', base:'r', conf:0.6, witnesses:[{ source:'A', text:'a fairly long single source claim here about things', sentIdx:0 }] },
      { key:'k2', eot:'C -> D : s', rf:'c', rt:'d', base:'s', conf:0.6, witnesses:[{ source:'A', text:'another lengthy claim from a second place entirely', sentIdx:1 }, { source:'B', text:'and again from a third', sentIdx:2 }] },
    ];
    const big = h._rankPropositions(groups, new Set(['a', 'c']), { budget: 1600 });
    assert.equal(big.evidence.length, 2, 'evidence keeps every proposition');
    const tiny = h._rankPropositions(groups, new Set(['a', 'c']), { budget: 1 });
    assert.ok(tiny.promptSpans.length >= 1, 'at least the top proposition always rides the prompt');
    assert.ok(tiny.promptSpans.length <= tiny.evidence.length, 'the prompt is a bounded subset of the evidence');
    assert.equal(tiny.evidence.length, 2, 'the citation evidence is never truncated by the prompt budget');
  });

  test(`${page}: _bfsPath returns the shortest ordered path, or null when unreachable`, () => {
    const h = worldHarness(src);
    const adj = new Map([
      ['a', [{ to:'b', edge:{ sentIdx:0 } }]],
      ['b', [{ to:'c', edge:{ sentIdx:1 } }, { to:'a', edge:{ sentIdx:0 } }]],
      ['c', [{ to:'b', edge:{ sentIdx:1 } }]],
    ]);
    const p = h._bfsPath(adj, 'a', 'c', 5);
    assert.ok(p && p.length === 2, 'a→b→c is a length-2 path');
    assert.deepEqual(p.map((s) => s.edge.sentIdx), [0, 1], 'edges are in path order');
    assert.equal(h._bfsPath(adj, 'a', 'z', 5), null, 'an unreachable target is null');
    assert.equal(h._bfsPath(new Map([['a', [{ to:'b', edge:{} }]]]), 'a', 'b', 0), null, 'maxLen 0 finds nothing');
  });

  test(`${page}: CHAIN MODE — two referents joined by a multi-hop path ground as an ordered chain`, () => {
    const h = worldHarness(src, {
      labels: { wm:'working memory', gw:'global workspace', con:'consciousness' },
      edges: [
        { from:'wm', to:'gw',  via:'resembles', sentIdx:0 },
        { from:'gw', to:'con', via:'produces',  sentIdx:1 },
      ],
      sentences: ['Working memory resembles the global workspace.', 'The global workspace produces consciousness.'],
      sentenceSource: ['A', 'A'],
    });
    const pg = h.groundPropositions('how does working memory relate to consciousness', []);
    assert.ok(pg && pg.chain, 'a multi-hop connection between two referents grounds as a CHAIN, not a set');
    assert.equal(pg.promptSpans.length, 2, 'both links of the chain ride the prompt');
    // The witness sentences are in PATH order (workspace resemblance → consciousness production).
    assert.match(pg.promptSpans[0].text, /global workspace/i);
    assert.match(pg.promptSpans[1].text, /consciousness/i);
    // The cue tells the model to reason step by step along the chain.
    assert.match(h._groundCue({ chain: true }), /step by step/i);
  });

  test(`${page}: a directly-connected pair is NOT a chain (falls to the set selection)`, () => {
    const h = worldHarness(src);
    const pg = h.groundPropositions('dolphin echolocation', []);   // d↔ec is a direct edge
    assert.ok(pg, 'still grounds');
    assert.ok(!pg.chain, 'a 1-hop link is a proposition, not a chain');
  });
}

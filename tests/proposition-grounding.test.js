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
const worldHarness = (src) => {
  const body = ['groundPropositions', '_rankPropositions', '_independentOrigins', '_nearDup', 'eotRel', 'junkRel', '_repOf']
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
  h.__labels = { d:'dolphin', ec:'echolocation', sh:'shipping', ox:'oxygen', f:'Further' };
  h.graph = {
    representative: (x) => x,
    entities: new Map(Object.keys(h.__labels).map((id) => [id, { id }])),
    edges: [
      { from:'d', to:'ec', via:'uses',    sentIdx:0 },   // on-question, source A
      { from:'d', to:'ec', via:'uses',    sentIdx:1 },   // same claim, source B → corroborated
      { from:'sh', to:'ox', via:'reading', sentIdx:2 },  // OFF-question (no referent) → excluded
      { from:'f', to:'ox', via:'reading', sentIdx:3 },   // the export's "Further -> Oxygen" noise → excluded
      { from:'d', to:'sh', via:'the',     sentIdx:4 },   // junk relation (STOP) → excluded
    ],
  };
  h.master = {
    sentences: [
      'Dolphins use echolocation to navigate.',
      'The river dolphin relies on echolocation in murky water.',
      'Shipping tonnage rose in 2016.',
      'Further reading on oxygen.',
      'Dolphins and shipping.',
    ],
    sentenceSource: ['A', 'B', 'A', 'A', 'A'],
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

  test(`${page}: _rankPropositions ranks by corroboration and budgets the prompt (evidence stays full)`, () => {
    const h = worldHarness(src);
    const groups = [
      { key:'k1', eot:'A -> B : r', conf:0.6, onRef:1, witnesses:[{ source:'A', text:'single source claim here' }] },
      { key:'k2', eot:'C -> D : s', conf:0.6, onRef:1, witnesses:[{ source:'A', text:'two source claim alpha' }, { source:'B', text:'two source claim beta gamma' }] },
    ];
    const big = h._rankPropositions(groups, { budget: 1600 });
    assert.equal(big.evidence[0].origins, 2, 'the 2-origin proposition ranks first');
    assert.equal(big.evidence.length, 2, 'evidence keeps every proposition');
    // A tiny budget still yields the top proposition, and never more prompt spans than evidence.
    const tiny = h._rankPropositions(groups, { budget: 1 });
    assert.ok(tiny.promptSpans.length >= 1, 'at least the top proposition always rides the prompt');
    assert.ok(tiny.promptSpans.length <= tiny.evidence.length, 'prompt is a bounded subset of the evidence');
    assert.equal(tiny.evidence.length, 2, 'the citation evidence is never truncated by the prompt budget');
  });
}

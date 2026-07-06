import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// THE NAMESAKE DISAMBIGUATION (the ravens-vs-crows audit). A comparison query ("ravens vs crows")
// must not let a page about only ONE side, in the WRONG sense (Carleton Ravens football), freeze the
// walk's topic frame — nor let the EOT chain grounding bind the answer to a football chain whose
// witnesses carry only the shared word "ravens". Two pure guards close that, pinned here in BOTH
// shipped copies (src and the built index.html):
//   _anchorGroups        — split a comparison subject into its distinct sides (the seed gate's input)
//   _chainCoversQuestion — a chain must carry the question's DISCRIMINATING words, not just one shared one

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const methodOf = (src, name) => {
  const at = src.indexOf(`\n  ${name}(`);
  assert.ok(at >= 0, `method ${name} not found`);
  const nameStart = at + 3;
  let i = at + 3 + name.length;
  let pd = 0;
  for (; i < src.length; i++) { const c = src[i]; if (c === '(') pd++; else if (c === ')') { if (--pd === 0) { i++; break; } } }
  while (i < src.length && src[i] !== '{') i++;
  let bd = 0;
  for (; i < src.length; i++) { const c = src[i]; if (c === '{') bd++; else if (c === '}') { if (--bd === 0) { i++; break; } } }
  return src.slice(nameStart, i);
};

const harness = (src) => {
  const body = ['_researchTerms', '_anchorGroups', '_chainCoversQuestion'].map((m) => methodOf(src, m)).join('\n');
  const Cls = new Function(`return class H { ${body} }`)();
  const h = new Cls();
  // The app STOP set (constructor) — function words only; the content terms survive.
  h.STOP = new Set(('the a an of to in on at for and or but with by from as is are was were be been being this that these those it its their his her our your they we you i he she him them us me year years some most many few what who whom which when where how why than then so if not no nor only also just very more less new over under into out up down off above below vs versus').split(' '));
  return h;
};

// The two football passages the ravens-vs-crows chain actually returned, and a real corvid passage.
const FOOTBALL = [
  'They ended the season in a tie for second place with the Royal Military College, and won the first Panda game in 1955.',
  'Predictions from NFL executives to local radio personalities pointed to a Ravens victory.',
];
const BIRD = [
  'Ravens are larger than crows, with a heavier bill and a wedge-shaped tail.',
  'Both crows and ravens belong to the Corvidae family and are known for intelligence.',
];

for (const page of ['src/reader/app.dc.js', 'index.html']) {
  const src = readFileSync(join(root, page), 'utf8');

  test(`${page}: _anchorGroups splits a comparison into its distinct sides`, () => {
    const h = harness(src);
    const g = h._anchorGroups('ravens vs crows');
    assert.equal(g.length, 2, '"ravens vs crows" is two sides');
    assert.ok(g[0].has('raven') && !g[0].has('crow'), 'first side is the ravens');
    assert.ok(g[1].has('crow') && !g[1].has('raven'), 'second side is the crows');
  });

  test(`${page}: _anchorGroups leaves a SINGLE subject as one group (seed gate unchanged)`, () => {
    const h = harness(src);
    assert.equal(h._anchorGroups('freshwater dolphins').length, 1, 'no comparison marker → one group');
    // "and"/"or" never split — a single entity's own name carries them.
    assert.equal(h._anchorGroups('War and Peace').length, 1, '"and" does not split a name');
    assert.equal(h._anchorGroups('crimes against humanity').length, 1, '"against" does not split');
  });

  test(`${page}: _anchorGroups also splits "versus" and "compared to/with"`, () => {
    const h = harness(src);
    assert.equal(h._anchorGroups('Bitcoin compared to Ethereum').length, 2);
    assert.equal(h._anchorGroups('cats versus dogs').length, 2);
  });

  test(`${page}: a football chain over "ravens vs crows" FAILS the on-question floor`, () => {
    const h = harness(src);
    // qwords as groundPropositions builds them: content words of the query.
    const qwords = ['research', 'ravens', 'crows'];
    assert.equal(h._chainCoversQuestion(FOOTBALL, qwords), false,
      'the football witnesses carry only "ravens" — one discriminating word, below the floor');
  });

  test(`${page}: a genuine corvid chain covering both sides PASSES the floor`, () => {
    const h = harness(src);
    assert.equal(h._chainCoversQuestion(BIRD, ['research', 'ravens', 'crows']), true,
      'the corvid witnesses carry both "ravens" and "crows"');
  });

  test(`${page}: a query with too few content-words is never over-gated`, () => {
    const h = harness(src);
    assert.equal(h._chainCoversQuestion(FOOTBALL, ['dolphins']), true,
      'one content-word can\'t discriminate — the chain is not demoted');
  });
}

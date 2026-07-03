import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// REGRESSION: the chat research walk saved IRRELEVANT sources. The first page a walk kept
// calibrated the whole relevance leash (saliency baseline + frozen topic frame + figure
// neighborhood) and was trusted unconditionally — so when Wikipedia's search ranked
// "Whale (film)" above "Dolphin" for a dolphins question, the film page was SAVED as a
// source, became the yardstick of "on topic", and genuinely relevant pages were tossed for
// not matching the film.
//
// These tests pin the fix, which is judged on the PHYSICS, not the words: after readURL
// folds a page, the page exists as FIGURES (graph entities) with mention mass. The seed
// gate (_aboutAnchor → _anchorFigureRank) asks whether the anchor's figures are PRINCIPAL
// in the page's own fold — real mass, top-rank — or a bit part; the namesake leash couples
// later pages through the graph's merged identities, not word stems. Term mass survives
// only as the degraded channel for a structureless fold. Pinned in BOTH shipped copies.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Extract a method's full source from the app class body by balanced-brace matching.
const methodOf = (src, name) => {
  const at = src.indexOf(`\n  ${name}(`);
  assert.ok(at >= 0, `method ${name} not found`);
  let i = src.indexOf('{', at);
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) break;
  }
  return src.slice(at + 1, i + 1);
};

// A minimal harness exposing the walk's relevance helpers with the app's own STOP set.
// Graph/master and the label helpers are stubbed per test — instance properties shadow
// the extracted prototype methods where needed.
const harnessOf = (src) => {
  const stopLine = src.match(/this\.STOP=new Set\('([^']+)'\.split\(' '\)\);/);
  assert.ok(stopLine, 'STOP set not found');
  const body = ['_researchTerms', '_titleTerms', '_titleAnchorScore', '_repOf', '_anchorFigures',
    '_pageFigures', '_properFigure', '_anchorFigureRank', '_aboutAnchor', '_profile']
    .map((m) => methodOf(src, m)).join('\n');
  const Cls = new Function(`return class H { constructor(){ this.STOP = new Set('${stopLine[1]}'.split(' ')); this.graph=null; this.master=null; } ${body} }`)();
  return new Cls();
};

const stem = (w) => w.replace(/ies$/, 'y').replace(/(ches|shes|sses|xes)$/, (m) => m.slice(0, -2)).replace(/s$/, '');

// A fake folded world: labelled figures, and per-URL mention events.
//   figuresByUrl: { url: { figureId: mentionMass } }
const world = (h, labels, figuresByUrl) => {
  h.graph = { entities: new Map(Object.keys(labels).map((id) => [id, {}])), representative: (x) => x };
  h.labelOf = (id) => labels[id] || String(id);
  h.isURLish = () => false;
  h.isGenericName = (w) => new Set(['january', 'company', 'national']).has(w);
  const sentences = [], sentenceSource = [], events = [];
  for (const [url, figs] of Object.entries(figuresByUrl)) {
    for (const [id, mass] of Object.entries(figs)) {
      for (let k = 0; k < mass; k++) {
        sentences.push('s'); sentenceSource.push(url);
        events.push({ sentIdx: sentences.length - 1, id });
      }
    }
  }
  h.master = { sentences, sentenceSource, events };
};

for (const page of ['src/reader/app.dc.js', 'index.html']) {
  const src = readFileSync(join(root, page), 'utf8');

  test(`${page}: the walk gates the calibrating page on the graph and couples later pages by figure`, () => {
    // The seed gate exists and fires before the topic frame is frozen…
    assert.match(src, /_anchorFigureRank\s*\(/, `${page} is missing the figure-rank seed gate`);
    assert.match(src, /can’t anchor the research/, `${page} no longer sets aside an off-subject calibrating page`);
    // …the namesake leash couples through graph figures, not word stems…
    assert.match(src, /shares no figures with it/, `${page} is missing the figure-coupling namesake leash`);
    // …and uncalibrated candidates are read title-match first, not in raw search order.
    assert.match(src, /_titleAnchorScore\s*\(/, `${page} is missing the title-first candidate ranking`);
  });

  test(`${page}: the seed gate reads the fold — a principal figure passes, a bit part is set aside`, () => {
    const h = harnessOf(src);
    const anchorStems = new Set(h._researchTerms('dolphins smallest kind').map(stem));
    world(h, { d: 'Dolphin', w: 'Whale', f: 'Film', k: 'Kalchev', p: 'Partsalev', c: 'Captain', s: 'Species' }, {
      // "Whale (film)": the dolphin is a walk-on (2 mentions) far down a cast of five.
      'https://en.wikipedia.org/wiki/Whale_(film)': { w: 9, f: 8, k: 6, p: 5, c: 4, d: 2 },
      // The Dolphin article: the dolphin figure IS the page.
      'https://en.wikipedia.org/wiki/Dolphin': { d: 14, s: 5, w: 3 },
    });
    assert.equal(h._aboutAnchor('https://en.wikipedia.org/wiki/Whale_(film)', anchorStems, new Map()), false,
      'a page that folds the anchor as a bit part must not calibrate the walk');
    assert.equal(h._aboutAnchor('https://en.wikipedia.org/wiki/Dolphin', anchorStems, new Map()), true,
      'a page that folds the anchor as a principal figure calibrates');
    // The rank read is honest: the anchor is figure #1 on its own article.
    const r = h._anchorFigureRank('https://en.wikipedia.org/wiki/Dolphin', anchorStems);
    assert.equal(r.rank, 1);
    assert.ok(r.born > 0.5, `expected dominant Born weight, got ${r.born}`);
    // No contentful anchor → nothing to judge against → the gate stands aside.
    assert.equal(h._aboutAnchor('https://en.wikipedia.org/wiki/Whale_(film)', new Set(), new Map()), true);
  });

  test(`${page}: a structureless fold falls back to the term channel`, () => {
    const h = harnessOf(src);
    const anchorStems = new Set(h._researchTerms('dolphins smallest kind').map(stem));
    world(h, { d: 'Dolphin' }, {});   // graph up, but nothing folded for these URLs
    // A film-plot profile where the anchor is a passing mention → set aside.
    const film = h._profile(('whale film fishing captain boat crew catch sea storm harbor village ').repeat(12)
      + 'the captain mistakes a dolphin for a whale and the dolphin escapes');
    assert.equal(h._aboutAnchor('https://example.org/film', anchorStems, film), false);
    // An article that keeps saying "dolphin" → passes on term dominance.
    const genus = h._profile(('dolphin species smallest hector maui coastal waters dolphin dolphins ').repeat(8));
    assert.equal(h._aboutAnchor('https://example.org/genus', anchorStems, genus), true);
  });

  test(`${page}: _titleAnchorScore ranks the subject's article above a namesake film (fetch order only)`, () => {
    const h = harnessOf(src);
    const anchorStems = new Set(['dolphin', 'smallest', 'kind']);
    const dolphin = h._titleAnchorScore('https://en.wikipedia.org/wiki/Dolphin', anchorStems);
    assert.ok(dolphin > h._titleAnchorScore('https://en.wikipedia.org/wiki/Whale_(film)', anchorStems));
    assert.ok(dolphin > h._titleAnchorScore('https://en.wikipedia.org/wiki/Israel', anchorStems));
  });

  test(`${page}: _properFigure keeps identifying names and drops generic filler`, () => {
    const h = harnessOf(src);
    world(h, { k: 'Kalchev', j: 'January', x: 'the' }, {});
    assert.equal(h._properFigure('k'), true, 'a proper name is an identifying figure');
    assert.equal(h._properFigure('j'), false, 'calendar filler never identifies a subject');
    assert.equal(h._properFigure('x'), false, 'an uncapitalized label is not a referent');
  });
}

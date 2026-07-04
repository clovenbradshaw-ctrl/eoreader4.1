import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// The walk's SEMANTIC recall floor: when a real meaning organ (MiniLM, measuresMeaning) is warm, a
// page the WORD-leash would drop for low term-overlap is reprieved if it is still on the INTENT in
// embedding space ("cetacean echolocation" for "dolphin sounds"). Semantic can only RESCUE, never
// toss — precision stays with the figure gate — and it self-calibrates against the seed page's own
// intent-similarity. These tests pin the pure pieces (cosine, the reprieve decision, the aboutness
// digest, the best-effort page similarity) with a FAKE embedder — the MiniLM path itself needs the
// browser. Pinned in BOTH shipped copies so a rebuild can never drift them.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Extract a method's source by balanced-brace matching. Handles `async` methods.
const methodOf = (src, name) => {
  let at = src.indexOf(`\n  ${name}(`);
  if (at < 0) at = src.indexOf(`\n  async ${name}(`);
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

// A minimal harness exposing the semantic helpers with norm + a per-URL page-text stub.
const harnessOf = (src, pages = {}) => {
  const body = ['_cosine', '_semReprieve', '_pageAboutness', '_semPageSim'].map((m) => methodOf(src, m)).join('\n');
  const Cls = new Function(`return class H {
    norm(s){ return String(s||'').replace(/\\s+/g,' ').trim(); }
    _pageText(url){ return this.__pages[url] || ''; }
    ${body}
  }`)();
  const h = new Cls();
  h.__pages = pages;
  return h;
};

// A tiny normalized vector helper for cosine tests.
const unit = (arr) => { const n = Math.hypot(...arr) || 1; return Float32Array.from(arr.map((x) => x / n)); };

for (const page of ['src/reader/app.dc.js', 'index.html']) {
  const src = readFileSync(join(root, page), 'utf8');

  test(`${page}: the semantic channel is a RESCUE-only recall floor, gated on a warm meaning organ`, () => {
    // The floor exists and is consulted only inside the word-leash toss branch (a rescue, never a toss)…
    assert.match(src, /off the words but on the meaning of/, `${page} is missing the semantic reprieve narration`);
    // …and it is gated on the meaning-organ firewall + warmth, never blocking on a cold model.
    assert.match(src, /measuresMeaning/, `${page} no longer gates the semantic channel on measuresMeaning`);
    assert.match(src, /isWarm\(\)/, `${page} no longer requires the organ to be warm before using it`);
  });

  test(`${page}: _cosine is the dot product of L2-normalised vectors`, () => {
    const h = harnessOf(src);
    const a = unit([1, 2, 3]);
    assert.ok(Math.abs(h._cosine(a, a) - 1) < 1e-6, 'a·a for a unit vector is 1');
    assert.equal(h._cosine(unit([1, 0]), unit([0, 1])), 0, 'orthogonal → 0');
    assert.equal(h._cosine(null, a), 0, 'a missing vector is 0, never a throw');
    assert.equal(h._cosine(a, unit([1, 2])), 0, 'a length mismatch is 0, never a throw');
  });

  test(`${page}: _semReprieve keeps on-meaning pages and drops noise (absolute + relative floors)`, () => {
    const h = harnessOf(src);
    // On meaning relative to a solid seed, above the absolute floor → reprieve.
    assert.equal(h._semReprieve(0.50, 0.60), true, '0.50 vs seed 0.60 is on-meaning');
    // Below the absolute floor, even if it clears the ratio → no reprieve (a weak seed can't lower the bar to noise).
    assert.equal(h._semReprieve(0.30, 0.35), false, '0.30 is below the absolute floor');
    // Well below the seed's own similarity → no reprieve (genuine drift).
    assert.equal(h._semReprieve(0.50, 0.90), false, '0.50 is far below a strong seed (0.72·0.90=0.648)');
    // Degenerate inputs never rescue.
    assert.equal(h._semReprieve(null, 0.6), false);
    assert.equal(h._semReprieve(0.6, 0), false);
    assert.equal(h._semReprieve(0.6, null), false);
  });

  test(`${page}: _pageAboutness is a bounded title+lead digest, not the whole page`, () => {
    const long = 'x'.repeat(5000);
    const h = harnessOf(src, { 'u1': long });
    const about = h._pageAboutness('u1', 'River dolphin');
    assert.ok(about.startsWith('River dolphin.'), 'leads with the title');
    assert.ok(about.length <= 600, `digest is capped, got ${about.length}`);
  });

  test(`${page}: _semPageSim embeds aboutness and dots it with intent — best-effort, null never rescues`, async () => {
    // A fake embedder: "dolphin" texts embed near [1,0], "shipping" texts near [0,1].
    const emb = { embed: async (t) => (/dolphin|cetacean|echolocation/i.test(t) ? unit([1, 0.15]) : unit([0.15, 1])) };
    const intent = unit([1, 0.15]);   // the intent vector for "freshwater dolphins"
    const h = harnessOf(src, {
      'on':  'Cetacean echolocation lets river dolphins navigate silty water.',
      'off': 'Container shipping tonnage through the passage rose in 2016.',
    });
    const onSim  = await h._semPageSim(emb, 'on',  'River dolphin', intent);
    const offSim = await h._semPageSim(emb, 'off', 'Northwest Passage', intent);
    assert.ok(onSim > offSim, `on-meaning page scores higher (${onSim} > ${offSim})`);
    assert.ok(onSim > 0.9, `a vocab-mismatch but on-meaning page still scores high (${onSim})`);
    // A throwing embedder → null (the word-leash toss then stands; semantic only ever helps).
    const boom = { embed: async () => { throw new Error('cold'); } };
    assert.equal(await h._semPageSim(boom, 'on', 'x', intent), null);
    // Missing embedder / intent → null, never a throw.
    assert.equal(await h._semPageSim(null, 'on', 'x', intent), null);
    assert.equal(await h._semPageSim(emb, 'on', 'x', null), null);
  });
}

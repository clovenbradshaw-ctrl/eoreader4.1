// Build the packaged English irregular-verb seed from UniMorph — the comprehensive,
// language-agnostic morphology dataset (lemma · form · features). We keep the PRODUCTIVE
// rules in write/morph.js and bake only the IRREGULARS here: a verb whose UniMorph past
// differs from what our regular rule would produce. So the seed is comprehensive (every
// irregular UniMorph knows) yet small (the rules cover the rest), and it is DERIVED from a
// standard dataset, not hand-typed.
//
//   node scripts/build-morphology.mjs
//
// Writes src/core/conventions/english-verbs.js. Run offline-safe: the generated module is
// committed, so the runtime never fetches.

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL_ = process.argv[2] || 'https://raw.githubusercontent.com/unimorph/eng/master/eng';

// the SAME regular rule write/morph.js applies (kept in sync; small enough to mirror here).
const regularPast = (b) => {
  if (b.endsWith('e')) return b + 'd';
  if (/[^aeiou]y$/.test(b)) return b.slice(0, -1) + 'ied';
  if (b.length <= 4 && /[^aeiou][aeiou][^aeiouwxyv]$/.test(b)) return b + b.slice(-1) + 'ed';
  return b + 'ed';
};

console.error(`fetching UniMorph English: ${URL_}`);
const res = await fetch(URL_);
if (!res.ok) { console.error(`fetch failed: ${res.status}`); process.exit(1); }
const text = await res.text();

// collect V;PST forms per lemma (single-token, lowercase, alphabetic).
const byLemma = new Map();
let rows = 0;
for (const line of text.split('\n')) {
  const [lemma, form, feats] = line.split('\t');
  if (!lemma || !form || !feats) continue;
  if (feats !== 'V;PST') continue;                       // simple past only (not the participle)
  if (!/^[a-z]+$/.test(lemma) || !/^[a-z]+$/.test(form)) continue;
  rows++;
  (byLemma.get(lemma) || byLemma.set(lemma, new Set()).get(lemma)).add(form);
}

// keep a lemma only when it has a past the RULES cannot derive. Prefer the irregular form
// over a dialectal regular variant (UniMorph lists both "ran" and "runned" for run — keep
// "ran"), so a real irregular is never dropped just because a regular variant also exists.
const irregular = {};
for (const [lemma, forms] of byLemma) {
  const reg = regularPast(lemma);
  const nonReg = [...forms].filter((f) => f !== reg && f !== lemma + 'ed');
  if (!nonReg.length) continue;                          // every form is the regular one → the rule handles it
  irregular[lemma] = nonReg.sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
}
// UniMorph is auto-generated from Wiktionary and has gaps — it drops the V;PST of a handful
// of very common verbs (run, ring, stick…). A small curated corrections overlay fills those
// holes; UniMorph wins wherever it HAS the verb, so this only patches genuine gaps. The
// standard "dataset + corrections" pattern, not a re-hand-typing of the lexicon.
const GAP_FILL = {
  run: 'ran', ring: 'rang', stick: 'stuck', sneak: 'snuck', spit: 'spat', sting: 'stung',
  shine: 'shone', speed: 'sped', tread: 'trod', slay: 'slew', forsake: 'forsook',
};
const merged = { ...GAP_FILL, ...irregular };
const sorted = Object.fromEntries(Object.keys(merged).sort().map((k) => [k, merged[k]]));
console.error(`V;PST rows ${rows} · distinct lemmas ${byLemma.size} · irregular kept ${Object.keys(sorted).length}`);

const body = `// Packaged English verb morphology — the irregular base→past map, DERIVED from UniMorph
// (scripts/build-morphology.mjs), the comprehensive language-agnostic morphology dataset.
// The realizer's regular rules (write/morph.js) handle the productive cases (-ed, doubling,
// y→ied); this is the closed irregular set they cannot derive — the same kind of curated
// lexical convention as the seed speech/relation/preposition lists. Regenerate, do not
// hand-edit: node scripts/build-morphology.mjs

export const SEED_IRREGULAR_PAST = Object.freeze(${JSON.stringify(sorted, null, 2)});

// the past FORMS themselves — so the realizer leaves an already-past verb ("woke / saw")
// untouched. Derived from the map's values.
export const SEED_PAST_FORMS = Object.freeze(new Set(Object.values(SEED_IRREGULAR_PAST)));
`;

await writeFile(join(ROOT, 'src/core/conventions/english-verbs.js'), body);
console.error('wrote src/core/conventions/english-verbs.js');

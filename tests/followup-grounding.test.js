import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// FOLLOW-UP SUBJECT CARRY (pre-semantic). A thin/anaphoric follow-up ("do they have society?")
// names no subject of its own — the topic lives in the THREAD, not the string — so grounding on
// the bare tokens retrieves whatever generic words ("have", "like") match: off-topic noise (the
// dolphins follow-up that pulled folklore + Wicca). `_groundingQuery` folds the thread's carried
// subject into the RETRIEVAL query (only) for such a turn; a self-contained ask is left untouched.
// These tests pin the pure query-shaping in BOTH shipped copies.

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
  const body = ['_groundingQuery', '_carriedSubject', '_namedSubjects'].map((m) => methodOf(src, m)).join('\n');
  const Cls = new Function(`return class H {
    norm(s){ return String(s||'').replace(/\\s+/g,' ').trim(); }
    ${body}
  }`)();
  const h = new Cls();
  // The real app STOP set (app.dc.js constructor) — anaphora/determiners/quantifiers.
  h.STOP = new Set(('the a an of to in on at for and or but with by from as is are was were be been being this that these those it its their his her our your they we you i he she him them us me year years some most many few what who whom which when where how why than then so if not no nor only also just very more less new over under into out up down off above below').split(' '));
  return h;
};

for (const page of ['src/reader/app.dc.js', 'index.html']) {
  const src = readFileSync(join(root, page), 'utf8');

  const Q0 = 'teach me about the sociality of dolphins';
  const Q1 = 'can you explain more? like do they have socieity?';   // the audit's follow-up (typo intact)

  test(`${page}: a self-contained first turn retrieves on its own words (no carry)`, () => {
    const h = harness(src);
    assert.equal(h._groundingQuery(Q0, [], null), Q0, 'names its own subject, no anaphor → untouched');
  });

  test(`${page}: an anaphoric thin follow-up inherits the thread subject into the retrieval query`, () => {
    const h = harness(src);
    const prev = [{ role: 'user', text: Q0 }, { role: 'user', text: Q1 }];
    const gq = h._groundingQuery(Q1, prev, null);
    assert.notEqual(gq, Q1, 'the thin follow-up is enriched');
    assert.ok(gq.startsWith(Q1), 'the original question is preserved verbatim (the carry is appended)');
    assert.match(gq, /dolphins/i, 'the thread subject "dolphins" is carried in — so retrieval can find dolphin propositions');
    assert.match(gq, /sociality/i, 'the thread subject "sociality" is carried in');
    assert.match(gq, /socieity/i, 'the user\'s own (misspelled) word is not dropped');
  });

  test(`${page}: the carried subject excludes the current question and generic ask-verbs`, () => {
    const h = harness(src);
    const prev = [{ role: 'user', text: Q0 }, { role: 'user', text: Q1 }];
    const carried = h._carriedSubject(prev, null, Q1);
    assert.ok(carried.includes('dolphins') && carried.includes('sociality'), 'the prior turn\'s topic is carried');
    // "socieity"/"like"/"have" come only from the CURRENT question, which is excluded from the carry.
    assert.ok(!carried.includes('socieity'), 'the current question is excluded from its own carried subject');
    assert.ok(!carried.includes('explain'), 'the generic ask-verb "explain" is filtered by _subjStop');
  });

  test(`${page}: a topic-shift follow-up that names its own subject is not polluted by the old one`, () => {
    const h = harness(src);
    const prev = [{ role: 'user', text: Q0 }];
    const gq = h._groundingQuery('what about whales?', prev, null);
    assert.equal(gq, 'what about whales?', 'names "whales" and is not anaphoric → retrieve on its own subject, no dolphin carry');
  });

  test(`${page}: the fold's focus subject is carried when present`, () => {
    const h = harness(src);
    const gq = h._groundingQuery('do they have one?', [], { focus: { subject: 'dolphin sociality' } });
    assert.match(gq, /dolphin/i, 'an anaphoric turn with no prior user text still inherits the fold focus');
  });
}

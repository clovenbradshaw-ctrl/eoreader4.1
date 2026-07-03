import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  parseGutendex, pickTextFormat, stripGutenbergBoilerplate, gutenbergIdOf,
  gutendexSearchUrl, gutenbergTextUrl, fetchGutenbergBook,
} from '../src/ingest/gutenberg.js';
import { createWebClient, searchAndAdmit } from '../src/ingest/webfetch.js';

// Project Gutenberg as a research source (docs/web-search.md "The library sources"): search the
// catalog through Gutendex, and under fetchPages pull each hit's ENTIRE plain-text book —
// boilerplate stripped, front matter kept — admitted with web-source/1 provenance. All offline:
// a fake fetch routes the proxied URLs to canned bodies.

const fakeFetch = (routes) => async (proxiedUrl) => {
  const inner = new URL(proxiedUrl).searchParams.get('url') || '';
  const body = routes[inner];
  return { ok: body != null, status: body != null ? 200 : 404, text: async () => body ?? '' };
};

const GUTENDEX = JSON.stringify({ count: 1, results: [{
  id: 5200, title: 'Metamorphosis',
  authors: [{ name: 'Kafka, Franz', birth_year: 1883, death_year: 1924 }],
  summaries: ['"Metamorphosis" by Franz Kafka is a novella about Gregor Samsa.'],
  subjects: ['Psychological fiction', 'Metamorphosis -- Fiction'],
  formats: {
    'application/epub+zip': 'https://www.gutenberg.org/ebooks/5200.epub3.images',
    'text/plain; charset=us-ascii': 'https://www.gutenberg.org/files/5200/5200-0.zip',
    'text/plain; charset=utf-8': 'https://www.gutenberg.org/ebooks/5200.txt.utf-8',
  },
} ] });

const BOOK =
`The Project Gutenberg eBook of Metamorphosis

This eBook is for the use of anyone anywhere in the United States and
most other parts of the world at no cost.

Title: Metamorphosis

Author: Franz Kafka

Translator: David Wyllie

Language: English

*** START OF THE PROJECT GUTENBERG EBOOK METAMORPHOSIS ***

One morning, when Gregor Samsa woke from troubled dreams, he found
himself transformed in his bed into a horrible vermin.

Grete played the violin beautifully.

*** END OF THE PROJECT GUTENBERG EBOOK METAMORPHOSIS ***

Section 1. General Terms of Use and Redistributing Project
Gutenberg-tm electronic works. Donations are gratefully accepted.`;

test('pickTextFormat prefers utf-8 text/plain and never a .zip', () => {
  const j = JSON.parse(GUTENDEX);
  assert.equal(pickTextFormat(j.results[0].formats), 'https://www.gutenberg.org/ebooks/5200.txt.utf-8');
  assert.equal(pickTextFormat({ 'text/plain': 'https://x.org/1.zip' }), null);  // zip arrives as mojibake
  assert.equal(pickTextFormat({}), null);
});

test('parseGutendex turns catalog hits into search items with the book page and text URL', () => {
  const items = parseGutendex(GUTENDEX, 3);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Metamorphosis — Kafka, Franz');
  assert.equal(items[0].url, 'https://www.gutenberg.org/ebooks/5200');
  assert.equal(items[0].textUrl, 'https://www.gutenberg.org/ebooks/5200.txt.utf-8');
  assert.equal(items[0].source, 'gutenberg');
  assert.match(items[0].text, /novella about Gregor Samsa/);   // the catalog summary is the snippet
});

test('stripGutenbergBoilerplate keeps the front matter and the book, drops the license around them', () => {
  const s = stripGutenbergBoilerplate(BOOK);
  assert.match(s, /^Title: Metamorphosis/m);                    // the labeled fields survive the cut
  assert.match(s, /^Author: Franz Kafka/m);                     // (parse/metadata.js reads exactly this shape)
  assert.match(s, /One morning, when Gregor Samsa woke/);
  assert.match(s, /Grete played the violin/);
  assert.ok(!/use of anyone anywhere/.test(s), 'header license text dropped');
  assert.ok(!/General Terms of Use/.test(s), 'footer license dropped');
  assert.ok(!/\*\*\* START OF/.test(s), 'markers dropped');
});

test('stripGutenbergBoilerplate on the real checked-in book (pg5200.txt)', () => {
  const raw = readFileSync(fileURLToPath(new URL('../pg5200.txt', import.meta.url)), 'utf8');
  const s = stripGutenbergBoilerplate(raw);
  assert.match(s, /^Title: Metamorphosis/m);
  assert.match(s, /One morning, when Gregor Samsa woke from troubled dreams/);
  assert.ok(!/START OF THE PROJECT GUTENBERG/.test(s));
  assert.ok(!/subscribe to our email newsletter/.test(s), 'the real footer is gone');
});

test('a text with no PG markers passes through unchanged — the stripper never eats a plain document', () => {
  const plain = 'Title: Notes\n\nJust a normal document.\nNothing to strip.';
  assert.equal(stripGutenbergBoilerplate(plain), plain);
});

test('gutenbergIdOf reads an ebook number from a number, #ref, or any gutenberg.org URL shape', () => {
  assert.equal(gutenbergIdOf(1342), 1342);
  assert.equal(gutenbergIdOf('#5200'), 5200);
  assert.equal(gutenbergIdOf('https://www.gutenberg.org/ebooks/5200'), 5200);
  assert.equal(gutenbergIdOf('https://www.gutenberg.org/cache/epub/5200/pg5200.txt'), 5200);
  assert.equal(gutenbergIdOf('not a book'), null);
});

test('gutenberg search → admit under fetchPages reads the ENTIRE book, not the catalog snippet', async () => {
  const client = createWebClient({
    proxy: 'https://p.example/feed',
    fetchImpl: fakeFetch({
      [gutendexSearchUrl('metamorphosis kafka')]: GUTENDEX,
      'https://www.gutenberg.org/ebooks/5200.txt.utf-8': BOOK,
    }),
  });
  const admitted = await searchAndAdmit('metamorphosis kafka', { client, kind: 'gutenberg', k: 2, fetchPages: true });
  assert.equal(admitted.length, 1);
  const { doc, record } = admitted[0];
  assert.equal(doc.sourceKind, 'web-source');
  assert.equal(doc.web.url, 'https://www.gutenberg.org/ebooks/5200');
  assert.match(doc.text, /Gregor Samsa woke from troubled dreams/, 'the book body was admitted');
  assert.match(doc.text, /Grete played the violin/, 'read past the opening — the whole book is in');
  assert.ok(!/General Terms of Use/.test(doc.text), 'license boilerplate never enters the reading');
  assert.match(record.engine, /gutenberg/);
});

test('without fetchPages the catalog summary is admitted as a light source (no book pulled)', async () => {
  const client = createWebClient({
    proxy: 'https://p.example/feed',
    fetchImpl: fakeFetch({ [gutendexSearchUrl('metamorphosis kafka')]: GUTENDEX }),
  });
  const admitted = await searchAndAdmit('metamorphosis kafka', { client, kind: 'gutenberg', k: 2 });
  assert.match(admitted[0].doc.text, /novella about Gregor Samsa/);
  assert.ok(!/troubled dreams/.test(admitted[0].doc.text));
});

test('fetchGutenbergBook reads one whole book by id or URL — the deliberate "read this book" path', async () => {
  const client = createWebClient({
    proxy: 'https://p.example/feed',
    fetchImpl: fakeFetch({ [gutenbergTextUrl(5200)]: BOOK }),
  });
  const admitted = await fetchGutenbergBook('https://www.gutenberg.org/ebooks/5200', { client });
  assert.equal(admitted.record.url, 'https://www.gutenberg.org/ebooks/5200');
  assert.equal(admitted.record.title, 'Metamorphosis');            // read off the front matter
  assert.match(admitted.doc.text, /troubled dreams/);
  assert.match(admitted.record.engine, /gutenberg/);
  assert.equal(await fetchGutenbergBook('not a book', { client }), null);
});

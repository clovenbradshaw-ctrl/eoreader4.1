import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  WIKIMEDIA_PROJECTS, WIKIMEDIA_SOURCES, WIKIMEDIA_FULLTEXT,
  mediaWikiExtract, renderWikidataEntity, wikidataSearchUrl, wikidataEntitiesUrl,
} from '../src/ingest/wikimedia.js';
import { createWebClient, searchAndAdmit } from '../src/ingest/webfetch.js';

// The Wikimedia reference shelf (docs/web-search.md "The library sources"): every sister
// project as a search kind on the same MediaWiki API shape, plus Wikidata rendered as legible
// claim lines. All offline behind a fake fetch.

const fakeFetch = (routes) => async (proxiedUrl) => {
  const inner = new URL(proxiedUrl).searchParams.get('url') || '';
  const body = routes[inner];
  return { ok: body != null, status: body != null ? 200 : 404, text: async () => body ?? '' };
};

test('the shelf covers every Wikimedia reference project, and each has a full-text hook', () => {
  const projects = Object.keys(WIKIMEDIA_PROJECTS).sort();
  assert.deepEqual(projects, [
    'commons', 'wikibooks', 'wikinews', 'wikiquote', 'wikisource',
    'wikispecies', 'wikiversity', 'wikivoyage', 'wiktionary',
  ]);
  for (const kind of [...projects, 'wikidata']) {
    assert.equal(typeof WIKIMEDIA_SOURCES[kind], 'function', `${kind} searches`);
    assert.equal(typeof WIKIMEDIA_FULLTEXT[kind], 'function', `${kind} reads full text`);
  }
});

const QUOTE_SEARCH = JSON.stringify({ query: { search: [
  { title: 'Franz Kafka', snippet: 'A <span class="searchmatch">book</span> must be the axe for the frozen sea within us.' },
] } });
const QUOTE_EXTRACT = JSON.stringify({ query: { pages: { '1': {
  title: 'Franz Kafka',
  extract: 'A book must be the axe for the frozen sea within us.\nI am a cage, in search of a bird.',
} } } });

test('a sister project searches and reads through its own host (wikiquote)', async () => {
  const searchUrl = 'https://en.wikiquote.org/w/api.php?action=query&list=search&srsearch=kafka&format=json&srlimit=2';
  const extractUrl = 'https://en.wikiquote.org/w/api.php?format=json&action=query&prop=extracts&explaintext=1&exsectionformat=plain&redirects=1&titles=Franz%20Kafka';
  const client = createWebClient({
    proxy: 'https://p.example/feed',
    fetchImpl: fakeFetch({ [searchUrl]: QUOTE_SEARCH, [extractUrl]: QUOTE_EXTRACT }),
  });
  const admitted = await searchAndAdmit('kafka', { client, kind: 'wikiquote', k: 2, fetchPages: true });
  assert.equal(admitted.length, 1);
  assert.equal(admitted[0].doc.web.url, 'https://en.wikiquote.org/wiki/Franz_Kafka');
  assert.match(admitted[0].doc.text, /cage, in search of a bird/, 'the WHOLE page extract was read, not the snippet');
  assert.match(admitted[0].record.engine, /wikiquote/);
});

test('mediaWikiExtract returns "" on any failure so the caller keeps the snippet', async () => {
  const client = createWebClient({ proxy: 'https://p.example/feed', fetchImpl: fakeFetch({}) });
  assert.equal(await mediaWikiExtract(client, 'en.wikisource.org', 'Nope'), '');
  assert.equal(await mediaWikiExtract(client, 'en.wikisource.org', ''), '');
});

const WD_SEARCH = JSON.stringify({ search: [
  { id: 'Q42', label: 'Douglas Adams', description: 'English author and humourist',
    concepturi: 'http://www.wikidata.org/entity/Q42' },
] });
const WD_ENTITY = JSON.stringify({ entities: { Q42: {
  labels: { en: { value: 'Douglas Adams' } },
  descriptions: { en: { value: 'English author and humourist' } },
  aliases: { en: [{ value: 'Douglas Noel Adams' }] },
  claims: {
    P31:  [{ rank: 'normal', mainsnak: { datavalue: { type: 'wikibase-entityid', value: { id: 'Q5' } } } }],
    P569: [{ rank: 'normal', mainsnak: { datavalue: { type: 'time', value: { time: '+1952-03-11T00:00:00Z' } } } }],
    P800: [{ rank: 'deprecated', mainsnak: { datavalue: { type: 'string', value: 'dropped' } } }],
  },
} } });
const WD_LABELS = JSON.stringify({ entities: {
  P31: { labels: { en: { value: 'instance of' } } },
  P569: { labels: { en: { value: 'date of birth' } } },
  Q5: { labels: { en: { value: 'human' } } },
} });

test('wikidata search → admit renders the entity as legible claim lines (ids resolved to labels)', async () => {
  const client = createWebClient({
    proxy: 'https://p.example/feed',
    fetchImpl: fakeFetch({
      [wikidataSearchUrl('douglas adams', 3)]: WD_SEARCH,
      [wikidataEntitiesUrl(['Q42'])]: WD_ENTITY,
      [wikidataEntitiesUrl(['P31', 'Q5', 'P569'], 'labels')]: WD_LABELS,
    }),
  });
  const admitted = await searchAndAdmit('douglas adams', { client, kind: 'wikidata', k: 3, fetchPages: true });
  assert.equal(admitted.length, 1);
  const text = admitted[0].doc.text;
  assert.match(text, /Douglas Adams: English author and humourist/);
  assert.match(text, /Also known as: Douglas Noel Adams/);
  assert.match(text, /instance of: human/, 'P31/Q5 resolved to words the parser can read');
  assert.match(text, /date of birth: 1952-03-11/);
  assert.ok(!/dropped/.test(text), 'a deprecated statement never enters the reading');
  assert.equal(admitted[0].doc.web.url, 'http://www.wikidata.org/entity/Q42');
});

test('renderWikidataEntity survives a failed label batch — ids stay bare rather than throwing', async () => {
  const client = createWebClient({
    proxy: 'https://p.example/feed',
    fetchImpl: fakeFetch({ [wikidataEntitiesUrl(['Q42'])]: WD_ENTITY }),   // no label route
  });
  const text = await renderWikidataEntity(client, 'Q42');
  assert.match(text, /P31: Q5/);   // unresolved but present — best-effort, never a throw
});

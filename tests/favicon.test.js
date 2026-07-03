import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// The favicon <link> tags have twice been silently dropped from index.html's
// <head> when a PR regenerated that section (c5c0a91, then again later), each
// time leaving the shipped pages with no favicon. This test makes the favicon
// permanent: any PR that drops an icon link or asset fails CI before merging.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Every page we ship to the browser must carry the full icon set. 4.1 ships only the
// reader (index.html), its embedded templates panel (templates.html), and the conformance
// harness (conformance.html); the standalone demo pages stayed in 4.0.
const HTML_PAGES = [
  'index.html',
  'templates.html',
  'conformance.html',
];

// The link tags each page must declare, matched tolerant of attribute order
// and whitespace so reformatting the <head> doesn't trip the guard.
const REQUIRED_LINKS = [
  { name: 'favicon.ico', re: /<link\b[^>]*rel=["']icon["'][^>]*href=["']favicon\.ico["']/i },
  { name: 'favicon.svg', re: /<link\b[^>]*href=["']favicon\.svg["']/i },
  { name: 'apple-touch-icon.png', re: /<link\b[^>]*rel=["']apple-touch-icon["'][^>]*href=["']apple-touch-icon\.png["']/i },
];

// The asset files the links point at.
const ASSETS = ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png'];

test('favicon asset files exist at the repo root', () => {
  for (const asset of ASSETS) {
    assert.ok(existsSync(join(root, asset)), `missing favicon asset: ${asset}`);
  }
});

for (const page of HTML_PAGES) {
  test(`${page} declares the full favicon link set`, () => {
    const html = readFileSync(join(root, page), 'utf8');
    for (const { name, re } of REQUIRED_LINKS) {
      assert.match(html, re, `${page} is missing the ${name} <link> tag`);
    }
  });
}

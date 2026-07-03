import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toMdast, applyEvaPatch, pdfPlan, receiptCard, rasterize, assertStatic } from '../src/organs/out/publish/index.js';
import { ingestWebpage } from '../src/organs/in/index.js';

// The archival publish family: a span-addressable doc → a self-verifying artifact.
// Each is pure and produces a deterministic spec; the renderer is injected.

const DOC = ingestWebpage({ title: 'Deadlines',
  markdown: '# When to register\n\nRegister by Oct 5.\n\n- Bring ID\n- Check precinct' });

test('Markdown: a doc becomes an mdast tree; consecutive list-items fold into one list', () => {
  const tree = toMdast(DOC);
  assert.equal(tree.type, 'root');
  assert.deepEqual(tree.children.map(c => c.type), ['heading', 'heading', 'paragraph', 'list']);
  assert.equal(tree.children[3].children.length, 2);
});

test('Markdown: a reader EVA edit is a node-level patch, keyed by span ref, not a text diff', () => {
  const tree = toMdast(DOC);
  const ref = DOC.spans.find(s => s.text.includes('Oct 5')).id;
  const { tree: patched, applied } = applyEvaPatch(tree, { ref, text: 'Register by October 12.' });
  assert.equal(applied, true);
  assert.equal(patched.children.find(c => c.type === 'paragraph').children[0].value, 'Register by October 12.');
  // A stale ref does not silently mutate anything.
  assert.equal(applyEvaPatch(tree, { ref: 'no-such-node', text: 'x' }).applied, false);
});

test('PDF: the plan embeds the source WARC, EVA chain and passage anchors', () => {
  const plan = pdfPlan(DOC, { warc: { sourceId: 'web:abc', body: 'WARC/1.0' }, evaChain: [{ op: 'INS' }], author: 'Clerk' });
  assert.equal(plan.blocks.length, DOC.spans.length);
  assert.equal(plan.xmp.custom['eo:sourceWarc'], 'web:abc');
  assert.deepEqual(plan.attachments.map(a => a.name), ['source.warc', 'eva-chain.json']);
  assert.ok(plan.blocks[0].anchor.ref);
});

test('Card: a receipt card is a pure Satori element tree that surfaces its font requirement', () => {
  const card = receiptCard({ text: 'The hearing is March 3.', source: 'city.gov', hash: 'fnv:abcdef0123456789', verdict: 'confirmed' });
  assert.equal(card.element.type, 'div');
  assert.deepEqual(card.requires.formats, ['png', 'jpeg']);
  assert.ok(card.requires.fonts.length >= 1);
});

test('Raster: the resvg seam refuses non-deterministic SVG and a missing renderer', async () => {
  assert.throws(() => assertStatic('<svg><script>x()</script></svg>'), /static subset/);
  assert.throws(() => assertStatic('<svg><animate/></svg>'), /static subset/);
  assert.equal(assertStatic('<svg><rect/></svg>'), true);
  await assert.rejects(() => rasterize('<svg/>', {}), /inject a resvg-wasm/);
});

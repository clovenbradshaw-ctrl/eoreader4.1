import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestPdf, ingestOcr, ingestDocling, ingestWebpage, ingestTable, readWarc, ingestWarc } from '../src/organs/in/index.js';
import { readingAt } from '../src/perceiver/index.js';

// The layout-bearing adapters share one span-assembler: every unit records its
// char-range into the reconstructed text plus its page/bbox, so a claim can point at a
// passage a reader can find. These pin that contract across the family.

test('PDF: text-item geometry becomes lines with page, bbox, and char-range spans', () => {
  const doc = ingestPdf({ name: 'notice.pdf', pages: [{ pageNumber: 1, width: 612, height: 792, items: [
    { str: 'PUBLIC', transform: [12, 0, 0, 12, 72, 700], width: 40, height: 12 },
    { str: 'NOTICE', transform: [12, 0, 0, 12, 116, 700], width: 44, height: 12 },   // same baseline → one line
    { str: 'Hearing on March 3.', transform: [10, 0, 0, 10, 72, 680], width: 120, height: 10 },
  ] }] });
  assert.equal(doc.modality, 'pdf');
  assert.equal(doc.spans.length, 2);
  assert.equal(doc.spans[0].text, 'PUBLIC NOTICE');
  assert.equal(doc.spans[0].page, 1);
  assert.deepEqual(doc.spans[0].bbox, [72, 80, 88, 12]);   // y flipped to top-left origin
  // The char range addresses the passage inside the reconstructed text.
  assert.equal(doc.text.slice(doc.spans[0].charStart, doc.spans[0].charEnd), 'PUBLIC NOTICE');
  assert.equal(doc.spanAt(3).text, 'PUBLIC NOTICE');
});

test('PDF: not flattened — a claim can name the passage, and the spine reads it', () => {
  const doc = ingestPdf({ pages: [{ pageNumber: 1, width: 612, height: 792, items: [
    { str: 'Alpha line', transform: [10, 0, 0, 10, 72, 700], width: 60, height: 10 },
    { str: 'Beta line', transform: [10, 0, 0, 10, 72, 680], width: 60, height: 10 },
  ] }] });
  assert.notEqual(doc.spans[0].bbox, null);
  assert.ok(typeof readingAt(doc, 1).surprise === 'number');
});

test('OCR: Tesseract word boxes become span-addressable lines, keeping confidence', () => {
  const doc = ingestOcr({ lines: [{ text: 'Docket 22-CV-101', bbox: { x0: 10, y0: 20, x1: 210, y1: 44 }, confidence: 91.3 }] });
  assert.equal(doc.modality, 'ocr');
  assert.deepEqual(doc.spans[0].bbox, [10, 20, 200, 24]);
  assert.equal(doc.confidence[0], 91.3);
});

test('Docling: a table becomes one addressable cell per figure', () => {
  const doc = ingestDocling({ blocks: [
    { type: 'title', text: 'Budget 2026', level: 1 },
    { type: 'table', id: 't1', cells: [{ text: 'Dept', row: 0, col: 0 }, { text: '$1.2M', row: 0, col: 1 }] },
  ] });
  assert.equal(doc.modality, 'docling');
  assert.deepEqual(doc.spans.map(s => s.kind), ['heading', 'cell', 'cell']);
  assert.equal(doc.spans[2].ref.col, 1);
});

test('Webpage: Markdown is split into role-bearing blocks; byline lands in metadata', () => {
  const doc = ingestWebpage({ url: 'https://city.gov/vote', title: 'How to Vote', byline: 'City Clerk',
    markdown: '# Deadlines\n\nRegister by Oct 5.\n\n- Bring ID\n- Check your precinct' });
  assert.equal(doc.modality, 'webpage');
  assert.deepEqual(doc.spans.map(s => s.kind), ['title', 'heading', 'paragraph', 'list-item', 'list-item']);
  assert.equal(doc.metadata.author, 'City Clerk');
  assert.equal(doc.metadata.url, 'https://city.gov/vote');
});

test('Table: rows are records, columns are DEF facts; same key is NOT auto-merged', () => {
  const doc = ingestTable({ name: 'donations', columns: ['Donor', 'Amount', 'Date'], keyColumn: 'Donor',
    rows: [['ACME LLC', '2900', '2026-01-02'], ['ACME LLC', '1000', '2026-02-01']] });
  assert.equal(doc.modality, 'table');
  assert.equal(doc.projectGraph().entities.size, 2);   // two rows, two records — not collapsed
  assert.deepEqual(doc.column('Amount'), ['2900', '1000']);
  assert.equal(doc.rowAt(0).cells.donor, 'ACME LLC');
});

test('WARC: the record is the frozen, hashable, addressable source', () => {
  const src = readWarc([{ warcType: 'response', targetURI: 'https://city.gov/vote', date: '2026-06-01', contentType: 'text/html', text: '<html>x</html>' }]);
  assert.equal(src.length, 1);
  assert.match(src[0].sourceId, /^web:/);
  assert.ok(Object.isFrozen(src[0]));
  const doc = ingestWarc(src[0], { markdown: '# Vote\n\nArchived copy.' });
  assert.equal(doc.modality, 'warc');
  assert.equal(doc.provenance.sourceId, src[0].sourceId);
});

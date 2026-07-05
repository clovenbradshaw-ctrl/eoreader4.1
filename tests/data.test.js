import { test } from 'node:test';
import assert from 'node:assert/strict';

import { answerTable, isTableQuery } from '../src/data/query.js';

// Chat over a CSV computes, it does not read: "how many contracts?" is a count,
// "what do they total?" is a sum — every figure computed via answer/math.js and
// traced to the cells (the metro-contracts-2025 mockup).

const TABLE = {
  columns: ['Vendor', 'Department', 'Amount', 'Method', 'Audit Finding'],
  rows: [
    ['Apex Paving', 'Public Works', '$2.40M', 'Sole-source', 'Sole-source waiver never justified'],
    ['Civic Data Co.', 'Technology', '$0.78M', 'Open RFP', 'Clean'],
    ['Harbor Logistics', 'Transit', '$5.10M', 'No-bid', 'Scope expanded 3x after award'],
    ['GreenLeaf Grounds', 'Parks', '$0.31M', 'Open RFP', 'Clean'],
    ['Meridian Health', 'Human Svcs', '$1.90M', 'Sole-source', 'Deliverables 6 months late'],
    ['Bluebird Transit', 'Transit', '$0.64M', 'Open RFP', 'Clean'],
    ['Stonewall Security', 'Police', '$1.20M', 'No-bid', 'Under review'],
    ['Northstar IT', 'Technology', '$2.05M', 'Open RFP', 'Clean'],
  ],
};

test('count: "how many contracts are there?" counts the rows', () => {
  const a = answerTable('how many contracts are there?', TABLE, { rowNoun: 'contracts' });
  assert.equal(a.kind, 'count');
  assert.equal(a.record.result, 8);
  assert.match(a.text, /8 contracts/);
});

test('sum: "what do they total?" sums the Amount column via math.js', () => {
  const a = answerTable('what do the amounts total?', TABLE, { rowNoun: 'contracts' });
  assert.equal(a.kind, 'sum');
  assert.equal(a.column, 'Amount');
  // 2.40+0.78+5.10+0.31+1.90+0.64+1.20+2.05 = 14.38
  assert.ok(Math.abs(a.record.result - 14.38) < 1e-6);
  assert.equal(a.record.resultText, '14.38', 'the displayed figure is clean');
  assert.equal(a.record.engine, 'math.js');
  assert.ok(a.record.steps.length >= 1, 'the computation record spells out the additions');
  assert.equal(a.record.cells.length, 8, 'every operand traces to a cell');
});

test('average: "average amount" divides the sum by the count', () => {
  const a = answerTable('what is the average amount?', TABLE);
  assert.equal(a.kind, 'mean');
  assert.ok(Math.abs(a.record.result - 14.38 / 8) < 1e-9);
});

test('max: "highest amount" finds the largest cell and its row', () => {
  const a = answerTable('which contract has the highest amount?', TABLE);
  assert.equal(a.kind, 'max');
  assert.equal(a.record.result, 5.1);
  assert.match(a.text, /row 3/);
});

test('filter-count: "how many are sole-source?" counts matching rows', () => {
  const a = answerTable('how many are sole-source?', TABLE, { rowNoun: 'contracts' });
  assert.equal(a.kind, 'count');
  assert.equal(a.record.result, 2, 'Apex Paving and Meridian Health');
});

test('a non-quantitative question returns null (falls through to grounded chat)', () => {
  assert.equal(answerTable('who is the vendor for the police contract?', TABLE), null);
  assert.equal(isTableQuery('tell me a story', TABLE), false);
  assert.equal(isTableQuery('how many contracts are there?', TABLE), true);
});

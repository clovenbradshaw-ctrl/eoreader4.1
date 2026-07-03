import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractExpression, isMathQuery, evalExpression, evaluateMath,
  answerMathSync, formatNumber, answerMathAsync,
} from '../src/answer/index.js';

// ── the gate ────────────────────────────────────────────────────────────────
test('extractExpression strips polite/imperative wrappers down to the bare expression', () => {
  assert.equal(extractExpression('what is 2 + 2?'), '2 + 2');
  assert.equal(extractExpression("what's 3*4"), '3*4');
  assert.equal(extractExpression('calculate (1+2)^3'), '(1+2)^3');
  assert.equal(extractExpression('evaluate sqrt(16)'), 'sqrt(16)');
  assert.equal(extractExpression('how much is 10 / 4'), '10 / 4');
  assert.equal(extractExpression('  7 % 3 = '), '7 % 3');
});

test('the gate rejects anything that is not a pure math expression', () => {
  assert.equal(extractExpression('what are the 2 widgets?'), null);   // real words
  assert.equal(extractExpression('when was this written?'), null);    // no number
  assert.equal(extractExpression('42'), null);                        // bare number, no operation
  assert.equal(extractExpression('pi'), null);                        // lone constant, no operation
  assert.equal(extractExpression('log of the chapter'), null);        // unknown words
  assert.equal(extractExpression("2'nd place"), null);                // stray punctuation
  assert.equal(extractExpression(''), null);
  assert.equal(isMathQuery('2 + 2'), true);
  assert.equal(isMathQuery('hello there'), false);
});

// ── the offline evaluator ─────────────────────────────────────────────────────
test('evalExpression computes arithmetic with correct precedence and associativity', () => {
  assert.equal(evalExpression('2 + 2'), 4);
  assert.equal(evalExpression('2 + 3 * 4'), 14);
  assert.equal(evalExpression('(2 + 3) * 4'), 20);
  assert.equal(evalExpression('2 ^ 3 ^ 2'), 512);        // right-associative: 2^(3^2)
  assert.equal(evalExpression('-3 ^ 2'), -9);            // unary lower than power: -(3^2)
  assert.equal(evalExpression('2 ^ -3'), 0.125);         // unary exponent
  assert.equal(evalExpression('10 % 3'), 1);
  assert.equal(evalExpression('5!'), 120);
  assert.equal(evalExpression('3 * (4 + 1)!'), 360);
});

test('evalExpression knows functions and constants', () => {
  assert.equal(evalExpression('sqrt(144)'), 12);
  assert.equal(evalExpression('max(3, 7, 2)'), 7);
  assert.equal(evalExpression('min(3, 7, 2)'), 2);
  assert.equal(evalExpression('pow(2, 10)'), 1024);
  assert.equal(evalExpression('abs(-9)'), 9);
  assert.equal(evalExpression('gcd(12, 18)'), 6);
  assert.ok(Math.abs(evalExpression('2 * pi') - 2 * Math.PI) < 1e-9);
});

test('evalExpression returns null on malformed or non-numeric input', () => {
  assert.equal(evalExpression('2 +'), null);
  assert.equal(evalExpression('(2 + 3'), null);
  assert.equal(evalExpression('sqrt(-1)'), null);        // NaN → null
  assert.equal(evalExpression('2 ## 3'), null);
});

// ── formatting ────────────────────────────────────────────────────────────────
test('formatNumber prints integers whole and trims float noise', () => {
  assert.equal(formatNumber(4), '4');
  assert.equal(formatNumber(0.1 + 0.2), '0.3');          // not 0.30000000000000004
  assert.equal(formatNumber(1 / 3), '0.333333333333');
});

// ── the answer shape ──────────────────────────────────────────────────────────
test('answerMathSync returns the mechanical math route, or null', () => {
  assert.deepEqual(answerMathSync('what is 2 + 2?'), {
    route: 'math', text: '2 + 2 = 4', answer: '2 + 2 = 4', sources: [],
  });
  assert.equal(answerMathSync('who is Gregor?'), null);
});

test('answerMathAsync falls back to the built-in evaluator when mathjs is unavailable (Node)', async () => {
  // No network in the test runner → loadMathjs caches null → the built-in evaluator answers.
  const a = await answerMathAsync('calculate sqrt(16) + 1');
  assert.deepEqual(a, { route: 'math', text: 'sqrt(16) + 1 = 5', answer: 'sqrt(16) + 1 = 5', sources: [] });
  assert.equal(await answerMathAsync('tell me a story'), null);
  assert.equal(await evaluateMath('6 * 7'), 42);
});

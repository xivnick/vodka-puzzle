import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateFormula, formulaCompletion260922, hasExactNumbers, isSolvedFormula } from '../src/lib/formula-completion.js';

test('formula evaluator follows precedence and uses exact fractions', () => {
  const result = evaluateFormula(['8', '/', '(', '3', '-', '8', '/', '3', ')']);
  assert.deepEqual(result.value, { n: 24n, d: 1n });
  assert.equal(hasExactNumbers(formulaCompletion260922.numbers, result.used), true);
  assert.equal(isSolvedFormula(formulaCompletion260922, ['8', '/', '(', '3', '-', '8', '/', '3', ')']), true);
  assert.equal(evaluateFormula('3+8*3').value.n, 27n);
});

test('formula validation rejects missing, joined, extra and signed numbers', () => {
  assert.equal(isSolvedFormula(formulaCompletion260922, ['8', '*', '3']), false);
  assert.equal(isSolvedFormula(formulaCompletion260922, '33-8-8'), false);
  assert.equal(isSolvedFormula(formulaCompletion260922, '8/(3-8/3)+3'), false);
  assert.equal(isSolvedFormula(formulaCompletion260922, '-3+3+8+8'), false);
});

test('260922 preview has duplicate number keys and stays outside catalog, saving and rankings', () => {
  const html = fs.readFileSync('dist/test/formula-completion/260922/index.html', 'utf8');
  const catalog = fs.readFileSync('src/data/puzzles.json', 'utf8');
  assert.match(html, /260922 수식완성/);
  assert.match(html, /3, 3, 8, 8/);
  assert.match(html, /data-preview="true"/);
  assert.equal((html.match(/data-number="3"/g) || []).length, 2);
  assert.equal((html.match(/data-number="8"/g) || []).length, 2);
  assert.ok(!html.includes('id="cloudBtns"'));
  assert.ok(!html.includes('id="leaderboard"'));
  assert.ok(!catalog.includes('formula-completion-260922'));
});

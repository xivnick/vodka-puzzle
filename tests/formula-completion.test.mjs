import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateFormula, formulaCompletion260922_01, formulaCompletion260922_02, hasExactNumbers, isSolvedFormula } from '../src/lib/formula-completion.js';

test('formula evaluator follows precedence and uses exact fractions', () => {
  const result = evaluateFormula(['8', '/', '(', '3', '-', '8', '/', '3', ')']);
  assert.deepEqual(result.value, { n: 24n, d: 1n });
  assert.equal(hasExactNumbers(formulaCompletion260922_01.numbers, result.used), true);
  assert.equal(isSolvedFormula(formulaCompletion260922_01, ['8', '/', '(', '3', '-', '8', '/', '3', ')']), true);
  assert.equal(evaluateFormula('3+8*3').value.n, 27n);
});

test('formula validation rejects missing, joined, extra and signed numbers', () => {
  assert.equal(isSolvedFormula(formulaCompletion260922_01, ['8', '*', '3']), false);
  assert.equal(isSolvedFormula(formulaCompletion260922_01, '33-8-8'), false);
  assert.equal(isSolvedFormula(formulaCompletion260922_01, '8/(3-8/3)+3'), false);
  assert.equal(isSolvedFormula(formulaCompletion260922_01, '-3+3+8+8'), false);
});

test('260922 formula previews render their numbers and stay outside catalog, saving and rankings', () => {
  const first = fs.readFileSync('dist/test/formula-completion/260922/index.html', 'utf8');
  const second = fs.readFileSync('dist/test/formula-completion/260922-2/index.html', 'utf8');
  const third = fs.readFileSync('dist/test/formula-completion/260922-3/index.html', 'utf8');
  assert.match(first, /260922 수식완성 1/);
  assert.match(first, /3, 3, 8, 8/);
  assert.equal((first.match(/data-number="3"/g) || []).length, 2);
  assert.equal((first.match(/data-number="8"/g) || []).length, 2);
  assert.match(second, /260922 수식완성 2/);
  assert.match(second, /5, 6, 13, 25/);
  assert.equal(isSolvedFormula(formulaCompletion260922_02, ['5', '*', '13', '-', '(', '6', '+', '25', ')']), true);
  assert.match(third, /260922 수식완성 3/);
  assert.match(third, /15, 21, 35, 35/);
  assert.equal((third.match(/data-number="35"/g) || []).length, 2);
  for (const html of [first, second, third]) {
    assert.match(html, /data-preview="true"/);
    assert.ok(!html.includes('id="cloudBtns"'));
    assert.ok(!html.includes('id="leaderboard"'));
  }
});

test('published formula pages use official IDs with saving and rankings', () => {
  const first = fs.readFileSync('dist/260922_01/index.html', 'utf8');
  const second = fs.readFileSync('dist/260922_02/index.html', 'utf8');
  const third = fs.readFileSync('dist/260922_03/index.html', 'utf8');
  const home = fs.readFileSync('dist/index.html', 'utf8');
  const catalog = fs.readFileSync('src/data/puzzles.json', 'utf8');
  for (const [html, id, title] of [[first, '260922_01', '260922 수식완성 1'], [second, '260922_02', '260922 수식완성 2'], [third, '260922_03', '260922 수식완성 3']]) {
    assert.match(html, new RegExp(title));
    assert.match(html, new RegExp(`data-puzzle-id="${id}"`));
    assert.match(html, /data-preview="false"/);
    assert.ok(html.includes('id="cloudBtns"'));
    assert.ok(html.includes('id="leaderboard"'));
    assert.ok(home.includes(`data-puzzle-id="${id}"`));
    assert.ok(catalog.includes(`"id": "${id}"`));
  }
  assert.ok(home.indexOf('data-puzzle-id="260922_01"') < home.indexOf('data-puzzle-id="260922_02"'));
  assert.ok(home.indexOf('data-puzzle-id="260922_02"') < home.indexOf('data-puzzle-id="260922_03"'));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { givens, groups, operators, conflicts, solved } from '../src/lib/arithmetic-sudoku.js';

test('photo formula layout and fixed first column', () => {
  assert.deepEqual(givens.map(row => row[0]), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(groups[0], [[1, 2], [3], [4, 5]]);
  assert.deepEqual(groups[6], [[1], [2], [3], [4], [5], [6]]);
  assert.deepEqual(operators[7].map(([, symbol]) => symbol), ['+', '=', '=', '×(', '−', ')']);
  assert.equal(groups.length, 9);
  for (const row of groups) assert.deepEqual(row.flat(), Array.from({ length: row.at(-1).at(-1) }, (_, i) => i + 1));
});

test('completed multiplication is checked, incomplete formula is deferred', () => {
  const values = Array(81).fill(0);
  [2, 7, 3, 8, 1].forEach((n, index) => { values[index + 1] = n; });
  assert.equal(conflicts(values).size, 0); // 27 × 3 = 81
  values[5] = 2;
  assert.deepEqual([...conflicts(values)].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  values[5] = 0;
  assert.equal(conflicts(values).size, 0);
});

test('division by a zero parenthesized difference is invalid', () => {
  const values = Array(81).fill(0);
  values[6 * 9 + 4] = 2;
  values[6 * 9 + 5] = 3;
  values[6 * 9 + 6] = 3;
  for (const index of [6 * 9 + 4, 6 * 9 + 5, 6 * 9 + 6]) assert(conflicts(values).has(index));
});

test('preview page has sudoku controls without catalog or save hooks', () => {
  const html = fs.readFileSync('dist/test/arithmetic-sudoku/260928/index.html', 'utf8');
  assert.equal((html.match(/data-cell=/g) || []).length, 81);
  assert.equal((html.match(/data-number=/g) || []).length, 9);
  assert.equal((html.match(/class="number-outline"/g) || []).length, groups.flat().length);
  assert(html.includes('noindex, nofollow'));
  assert(!html.includes('id="cloudBtns"'));
  assert(!html.includes('id="leaderboard"'));
  assert.equal(solved(givens.flat()), false);
  const catalog = JSON.parse(fs.readFileSync('src/data/puzzles.json', 'utf8'));
  assert(!catalog.some(puzzle => puzzle.href.includes('/test/arithmetic-sudoku/')));
  const script = fs.readFileSync('src/scripts/arithmetic-sudoku.js', 'utf8');
  assert(!script.includes('recordCompletion'));
  assert(!script.includes('saveLocalState'));
});

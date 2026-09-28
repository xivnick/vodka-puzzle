import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { givens, groups, operators, conflicts, solved, parseArithmeticSudokuState } from '../src/lib/arithmetic-sudoku.js';

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

test('preview page stays separate from storage and rankings', () => {
  const html = fs.readFileSync('dist/test/arithmetic-sudoku/260928/index.html', 'utf8');
  assert.equal((html.match(/data-cell=/g) || []).length, 81);
  assert.equal((html.match(/data-number=/g) || []).length, 9);
  assert.equal((html.match(/class="number-outline"/g) || []).length, groups.flat().length);
  assert(html.includes('noindex, nofollow'));
  assert(html.includes('data-puzzle-id="test-arithmetic-sudoku-260928"'));
  assert(html.includes('data-preview="true"'));
  assert(!html.includes('id="cloudBtns"'));
  assert(!html.includes('id="leaderboard"'));
  assert.equal(solved(givens.flat()), false);
  const catalog = JSON.parse(fs.readFileSync('src/data/puzzles.json', 'utf8'));
  assert(!catalog.some(puzzle => puzzle.href.includes('/test/arithmetic-sudoku/')));
  const script = fs.readFileSync('src/scripts/arithmetic-sudoku.js', 'utf8');
  assert(script.includes('if (preview || !ready) return;'));
  assert(script.includes('else if (!preview && ready && !completionRecorded)'));
  assert(script.includes('if (!preview) {'));
});

test('released puzzle is listed with its own progress and completion ID', () => {
  const html = fs.readFileSync('dist/260928_02/index.html', 'utf8');
  const home = fs.readFileSync('dist/index.html', 'utf8');
  assert(html.includes('data-puzzle-id="260928_02"'));
  assert(html.includes('data-preview="false"'));
  assert(html.includes('id="cloudBtns"'));
  assert(html.includes('id="leaderboard"'));
  assert(!html.includes('noindex, nofollow'));
  assert(home.includes('/260928_02/'));
});

test('progress accepts matching values and notes but rejects preview or altered clues', () => {
  const puzzleId = '260928_02';
  const saved = {version: 1, puzzleId, values: givens.flat(), notes: Array.from({length: 81}, () => [])};
  saved.values[1] = 4;
  saved.notes[2] = [7, 3, 7];
  assert.deepEqual(parseArithmeticSudokuState(saved, puzzleId).notes[2], [3, 7]);
  assert.equal(parseArithmeticSudokuState({...saved, puzzleId: 'test-arithmetic-sudoku-260928'}, puzzleId), null);
  assert.equal(parseArithmeticSudokuState({...saved, version: 2}, puzzleId), null);
  assert.equal(parseArithmeticSudokuState({...saved, values: []}, puzzleId), null);
  saved.values[0] = 9;
  assert.equal(parseArithmeticSudokuState(saved, puzzleId), null);
});

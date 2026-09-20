import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { equalSumRegionConflicts, equalSumSudoku260921, equalSumSudokuConflicts, parseEqualSumSudokuState, solvedEqualSumSudoku } from '../src/lib/equal-sum-sudoku.js';

const solution = [
  [2, 5, 8, 1, 9, 7, 3, 4, 6],
  [1, 4, 6, 5, 8, 3, 9, 2, 7],
  [7, 9, 3, 4, 6, 2, 8, 5, 1],
  [5, 3, 2, 7, 1, 6, 4, 9, 8],
  [4, 6, 9, 8, 3, 5, 1, 7, 2],
  [8, 7, 1, 2, 4, 9, 5, 6, 3],
  [9, 1, 4, 6, 2, 8, 7, 3, 5],
  [6, 8, 7, 3, 5, 4, 2, 1, 9],
  [3, 2, 5, 9, 7, 1, 6, 8, 4],
].flat();

test('260921 board matches the photo and its nine gray regions', () => {
  const puzzle = equalSumSudoku260921;
  assert.deepEqual(puzzle.regions.map(region => region.length), [5, 3, 4, 5, 3, 3, 5, 4, 3]);
  assert.deepEqual(puzzle.givens.flat().filter(Boolean), [8, 3, 4, 5, 3, 2, 7, 1, 3, 6, 9, 7, 2, 6, 9, 5, 8, 3, 4, 1, 5, 6]);
  assert.equal(new Set(puzzle.regions.flat().map(cell => cell.join(','))).size, 35);
});

test('equal-sum validation accepts a solved board and detects Sudoku and sum errors', () => {
  assert.equal(solvedEqualSumSudoku(equalSumSudoku260921, solution), true);
  assert.equal(equalSumSudokuConflicts(equalSumSudoku260921, solution).size, 0);
  const wrongSum = Array(81).fill(0);
  for (const [index, value] of [[0, 2], [9, 1], [10, 4], [19, 9], [20, 3], [4, 9], [5, 7], [14, 2]]) wrongSum[index] = value;
  assert.ok(equalSumRegionConflicts(equalSumSudoku260921, wrongSum).size > 0);
  const duplicate = [...solution];
  duplicate[0] = duplicate[1];
  assert.ok(equalSumSudokuConflicts(equalSumSudoku260921, duplicate).has(0));
  assert.equal(solvedEqualSumSudoku(equalSumSudoku260921, duplicate), false);
});

test('equal-sum state parser validates identity and restores givens and notes', () => {
  const puzzleId = equalSumSudoku260921.id;
  const saved = { version: 1, puzzleId, values: Array(81).fill(0), notes: Array.from({ length: 81 }, () => []) };
  saved.values[1] = 2;
  saved.notes[0] = [3, 1, 3];
  saved.notes[2] = [1];
  const parsed = parseEqualSumSudokuState(equalSumSudoku260921, saved, puzzleId);
  assert.equal(parsed.values[1], 2);
  assert.equal(parsed.values[2], 8);
  assert.deepEqual(parsed.notes[0], [1, 3]);
  assert.deepEqual(parsed.notes[2], []);
  assert.equal(parseEqualSumSudokuState(equalSumSudoku260921, saved, 'other'), null);
});

test('260921 preview renders all cells and remains outside catalog, saving and rankings', () => {
  const html = fs.readFileSync('dist/test/equal-sum-sudoku/260921/index.html', 'utf8');
  const catalog = fs.readFileSync('src/data/puzzles.json', 'utf8');
  assert.match(html, /260921 같은 합 스도쿠/);
  assert.equal((html.match(/data-cell=/g) || []).length, 81);
  assert.equal((html.match(/class="equal-sum-cell[^\"]*shaded/g) || []).length, 35);
  assert.match(html, /data-preview="true"/);
  assert.ok(!html.includes('id="cloudBtns"'));
  assert.ok(!html.includes('id="leaderboard"'));
  assert.ok(!catalog.includes('260921'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { givens, flowers, conflicts, parseFlowerSudokuState } from '../src/lib/flower-sudoku.js';
import { gradeFlower } from '../scripts/grade-flower-sudoku.mjs';
import { grade as gradeClassic } from '../src/lib/sudoku.js';

test('flower preview places five flowers at the requested box corners and center', () => {
  assert.deepEqual(flowers.flat().flatMap((value, index) => value ? [index] : []),
    [20, 24, 40, 56, 60]);
  assert.equal(givens.flat().filter(Boolean).length, 32);
});

test('flower clues require hidden singles but no locked candidates or pairs', () => {
  const result = gradeFlower(givens.flat());
  assert.equal(result.solved, true);
  assert.ok(result.techniques.hiddenSingle > 0);
  assert.equal(result.techniques.locked, 0);
  assert.equal(result.techniques.pair, 0);
  assert.equal(gradeClassic(givens.flat().join('')).solved, false);
});

test('flower rule catches a diagonal match across box boundaries', () => {
  const values = Array(81).fill(0);
  values[20] = 4; // Flower at row 3, column 3.
  values[30] = 4; // Diagonal neighbor at row 4, column 4.
  assert.deepEqual([...conflicts(values)].sort((a, b) => a - b), [20, 30]);
  values[30] = 5;
  assert.equal(conflicts(values).size, 0);
});

test('official flower puzzle records completion while the preview remains isolated', () => {
  const html = readFileSync('dist/test/flower-sudoku/260928/index.html', 'utf8');
  const official = readFileSync('dist/260928_03/index.html', 'utf8');
  const script = readFileSync('src/scripts/flower-sudoku.js', 'utf8');
  assert.match(html, /data-preview="true"/);
  assert.match(html, /noindex, nofollow/);
  assert.match(html, /260928 란영 스도쿠/);
  assert.equal((html.match(/class="sudoku-cell flower"/g) || []).length, 5);
  assert.match(official, /data-puzzle-id="260928_03" data-preview="false"/);
  assert.match(official, /260928 란영 스도쿠/);
  assert.match(script, /if \(!preview\) \{/);
  assert.match(script, /recordCompletion\(puzzleId, state\(\)\)/);
  assert.match(script, /window\.startLocalPuzzle\(puzzleId, init/);
});

test('saved flower state is tied to this puzzle and preserves fixed clues', () => {
  const puzzleId = '260928_03';
  const values = givens.flat();
  const notes = Array.from({ length: 81 }, () => []);
  notes[0] = [3, 1, 3];
  const parsed = parseFlowerSudokuState({version: 1, puzzleId, values, notes}, puzzleId);
  assert.deepEqual(parsed.notes[0], [1, 3]);
  assert.equal(parseFlowerSudokuState({version: 1, puzzleId: 'preview', values, notes}, puzzleId), null);
  values[6] = 4;
  assert.equal(parseFlowerSudokuState({version: 1, puzzleId, values, notes}, puzzleId), null);
});

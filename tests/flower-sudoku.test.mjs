import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { givens, flowers, conflicts } from '../src/lib/flower-sudoku.js';
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

test('preview page has no completion or cloud save connection', () => {
  const html = readFileSync('dist/test/flower-sudoku/260928/index.html', 'utf8');
  const script = readFileSync('src/scripts/flower-sudoku.js', 'utf8');
  assert.match(html, /data-preview="true"/);
  assert.match(html, /noindex, nofollow/);
  assert.equal((html.match(/class="sudoku-cell flower"/g) || []).length, 5);
  assert.doesNotMatch(script, /recordCompletion|saveLocalState|saveProgressCloud|loadProgressCloud/);
});

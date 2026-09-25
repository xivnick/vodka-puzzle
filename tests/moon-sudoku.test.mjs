import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { givens, conflicts, solved } from '../src/lib/moon-sudoku.js';
import { countSolutions, grade } from '../src/lib/sudoku.js';

test('moon clues have one solution reachable with beginner techniques', () => {
  const input = givens.flat().join('');
  assert.equal(countSolutions(input, 2), 1);
  const result = grade(input);
  assert.equal(result.solved, true);
  assert.equal(result.difficulty, 'easy');
  assert.equal(result.techniques.locked, 0);
  assert.equal(result.techniques.pair, 0);
});

test('moon checks classic rows, columns and three by three boxes', () => {
  for (const pair of [[0, 8], [0, 72], [0, 10]]) {
    const values = Array(81).fill(0);
    pair.forEach(i => { values[i] = 3; });
    assert.deepEqual([...conflicts(values)].sort((a,b) => a-b), pair);
  }
  const unrelated = Array(81).fill(0);
  unrelated[0] = unrelated[15] = 4;
  assert.equal(conflicts(unrelated).size, 0);
});

test('moon completion rejects partial, malformed or conflicting player input', () => {
  assert.equal(solved(Array(81).fill(0)), false);
  assert.equal(solved(Array(81).fill(1)), false);
  assert.equal(solved(Array(81).fill(10)), false);
  assert.equal(solved(Array(80).fill(1)), false);
});

test('moon preview is unlisted and has no saving or leaderboard', () => {
  const html = fs.readFileSync('dist/test/moon-sudoku/260925/index.html', 'utf8');
  assert.equal((html.match(/data-cell=/g) || []).length, 81);
  assert.equal((html.match(/data-number=/g) || []).length, 9);
  assert(html.includes('noindex, nofollow'));
  assert(html.includes('data-preview="true"'));
  assert(!html.includes('id="cloudBtns"') && !html.includes('id="leaderboard"'));
  assert(!fs.readFileSync('src/data/puzzles.json', 'utf8').includes('moon-sudoku'));
  const script = fs.readFileSync('src/scripts/moon-sudoku.js', 'utf8');
  assert(!/recordCompletion|saveLocalState|saveProgressCloud|localStorage/.test(script));
});

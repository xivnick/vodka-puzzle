import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { givens, conflicts, solved } from '../src/lib/quattro-sudoku.js';

test('quattro checks odd and even squares at every position, including box boundaries', () => {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const i = r * 9 + c, square = [i, i + 1, i + 9, i + 10];
    for (const digits of [[1, 3, 5, 7], [2, 4, 6, 8]]) {
      const values = Array(81).fill(0);
      square.forEach((j, k) => { values[j] = digits[k]; });
      assert.deepEqual([...conflicts(values)].sort((a, b) => a - b), square);
      values[i] = 0;
      assert.equal(conflicts(values).size, 0);
      values[i] = digits[0] === 1 ? 2 : 1;
      assert.equal(conflicts(values).size, 0);
    }
  }
});

test('quattro checks classic sudoku duplicates independently of parity', () => {
  for (const pair of [[0, 8], [0, 72], [0, 10]]) {
    const values = Array(81).fill(0);
    pair.forEach(i => { values[i] = 3; });
    assert.deepEqual([...conflicts(values)].sort((a,b) => a-b), pair);
  }
});

test('quattro completion rejects incomplete, invalid and conflicting player input', () => {
  for (const values of [givens.flat(), Array(81).fill(1), Array(81).fill(10), Array(80).fill(1)]) {
    assert.equal(solved(values), false);
  }
});

test('quattro preview renders the photo clues and remains unlisted without storage', () => {
  const html = fs.readFileSync('dist/test/quattro-sudoku/260928/index.html', 'utf8');
  assert.equal((html.match(/data-cell=/g) || []).length, 81);
  assert.equal((html.match(/data-number=/g) || []).length, 9);
  assert.equal(givens.flat().filter(Boolean).length, 26);
  assert(html.includes('noindex, nofollow'));
  assert(!html.includes('id="cloudBtns"'));
  assert(!html.includes('id="leaderboard"'));
  assert(html.includes('260928 콰트로 스도쿠'));
  const catalog = JSON.parse(fs.readFileSync('src/data/puzzles.json', 'utf8'));
  assert(!catalog.some(puzzle => /quattro|260928/.test(JSON.stringify(puzzle))));
  const script = fs.readFileSync('src/scripts/quattro-sudoku.js', 'utf8');
  assert(!/recordCompletion|saveLocalState|saveProgressCloud|localStorage/.test(script));
});

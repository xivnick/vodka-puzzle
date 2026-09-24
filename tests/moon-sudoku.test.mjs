import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { conflicts, solved } from '../src/lib/moon-sudoku.js';

test('moon checks rings, radial sectors and thick-bordered regions', () => {
  for (const pair of [[0, 5], [0, 30], [0, 8]]) {
    const values = Array(36).fill(0);
    pair.forEach(i => { values[i] = 3; });
    assert.deepEqual([...conflicts(values)].sort((a,b) => a-b), pair);
  }
  const unrelated = Array(36).fill(0);
  unrelated[0] = unrelated[15] = 4;
  assert.equal(conflicts(unrelated).size, 0);
});

test('moon completion rejects partial, malformed or conflicting player input', () => {
  assert.equal(solved(Array(36).fill(0)), false);
  assert.equal(solved(Array(36).fill(1)), false);
  assert.equal(solved(Array(36).fill(7)), false);
  assert.equal(solved(Array(35).fill(1)), false);
});

test('moon preview is unlisted and has no saving or leaderboard', () => {
  const html = fs.readFileSync('dist/test/moon-sudoku/260925/index.html', 'utf8');
  assert.equal((html.match(/data-cell=/g) || []).length, 36);
  assert.equal((html.match(/data-number=/g) || []).length, 6);
  assert(html.includes('noindex, nofollow'));
  assert(html.includes('data-preview="true"'));
  assert(!html.includes('id="cloudBtns"') && !html.includes('id="leaderboard"'));
  assert(!fs.readFileSync('src/data/puzzles.json', 'utf8').includes('moon-sudoku'));
  const script = fs.readFileSync('src/scripts/moon-sudoku.js', 'utf8');
  assert(!/recordCompletion|saveLocalState|saveProgressCloud|localStorage/.test(script));
});

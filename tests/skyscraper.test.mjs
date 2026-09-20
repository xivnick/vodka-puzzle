import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { countVisible, parseSkyscraperNotes, parseSkyscraperState, skyscraperClueErrors, skyscraperConflicts, solvedSkyscraper } from '../src/lib/skyscraper.js';

const latin = [
  [1, 2, 3, 4, 5, 6],
  [2, 3, 4, 5, 6, 1],
  [3, 4, 5, 6, 1, 2],
  [4, 5, 6, 1, 2, 3],
  [5, 6, 1, 2, 3, 4],
  [6, 1, 2, 3, 4, 5],
];
const puzzle = {
  givens: latin.map(row => row.map(() => 0)),
  clues: { top: [6, null, null, null, null, 1], right: [1, null, null, null, null, 2], bottom: [1, null, null, null, null, 2], left: [6, null, null, null, null, 1] },
};

test('skyscraper visibility counts buildings hidden behind taller ones', () => {
  assert.equal(countVisible([2, 1, 4, 3, 6, 5]), 3);
  assert.equal(countVisible([6, 5, 4, 3, 2, 1]), 1);
});

test('skyscraper validation detects Latin and outside-clue errors', () => {
  const values = latin.flat();
  assert.equal(skyscraperConflicts(puzzle, values).size, 0);
  assert.equal(skyscraperClueErrors(puzzle, values).size, 0);
  assert.equal(solvedSkyscraper(puzzle, values), true);
  values[1] = 1;
  assert.deepEqual([...skyscraperConflicts(puzzle, values)].sort((a, b) => a - b), [0, 1, 31]);
  assert.equal(solvedSkyscraper(puzzle, values), false);
});

test('skyscraper state parser validates identity and restores givens', () => {
  const withGiven = { ...puzzle, givens: puzzle.givens.map((row, r) => row.map((value, c) => r === 2 && c === 3 ? 1 : value)) };
  const saved = { version: 1, puzzleId: 'sky', values: Array(36).fill(0) };
  assert.equal(parseSkyscraperState(withGiven, saved, 'sky')[15], 1);
  assert.equal(parseSkyscraperState(withGiven, saved, 'other'), null);
});

test('skyscraper notes parser validates candidates and clears occupied cells', () => {
  const saved = { version: 1, puzzleId: 'sky', values: Array(36).fill(0), notes: Array.from({ length: 36 }, () => []) };
  saved.notes[0] = [3, 1, 3];
  assert.deepEqual(parseSkyscraperNotes(puzzle, saved, 'sky')[0], [1, 3]);
  saved.values[0] = 2;
  assert.deepEqual(parseSkyscraperNotes(puzzle, saved, 'sky')[0], []);
  saved.notes[1] = [7];
  assert.equal(parseSkyscraperNotes(puzzle, saved, 'sky'), null);
});

test('260920 photo preview keeps its clues and stays outside saving and rankings', () => {
  const html = fs.readFileSync('dist/test/skyscraper/260920/index.html', 'utf8');
  assert.match(html, /260920 스카이스크레이퍼/);
  assert.match(html, /&quot;top&quot;:\[null,null,3,3,1,3\]/);
  assert.match(html, /&quot;right&quot;:\[null,5,3,3,1,null\]/);
  assert.match(html, /&quot;bottom&quot;:\[null,3,3,3,5,null\]/);
  assert.match(html, /&quot;left&quot;:\[null,null,3,3,3,1\]/);
  assert.match(html, /data-preview="true"/);
  assert.match(html, /data-notes="true"/);
  assert.ok(html.includes('id="skyNotes"'));
  assert.ok(!html.includes('id="cloudBtns"'));
  assert.ok(!html.includes('id="leaderboard"'));
});

test('published 260920 skyscraper uses its official ID with saving and rankings', () => {
  const html = fs.readFileSync('dist/260920_01/index.html', 'utf8');
  const home = fs.readFileSync('dist/index.html', 'utf8');
  const catalog = fs.readFileSync('src/data/puzzles.json', 'utf8');
  assert.match(html, /260920 스카이스크레이퍼/);
  assert.match(html, /data-puzzle-id="260920_01"/);
  assert.match(html, /data-preview="false"/);
  assert.match(html, /data-notes="false"/);
  assert.ok(!html.includes('id="skyNotes"'));
  assert.ok(html.includes('id="cloudBtns"'));
  assert.ok(html.includes('id="leaderboard"'));
  assert.ok(home.includes('data-puzzle-id="260920_01"'));
  assert.ok(catalog.includes('"id": "260920_01"'));
});

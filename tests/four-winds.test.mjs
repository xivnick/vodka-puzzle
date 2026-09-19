import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fourWindsPuzzles, arrowCells, validateArrow, analyzeFourWinds, removeSourceArrows } from '../src/lib/four-winds.js';

test('photo transcription keeps both Four Winds board shapes and clues', () => {
  const [first, second] = fourWindsPuzzles;
  assert.deepEqual(first.cells.map(row => row.length), Array(8).fill(8));
  assert.equal(first.cells.flat().filter(value => value === -1).length, 4);
  assert.deepEqual([first.cells[0][0], first.cells[1][1], first.cells[7][3]], [2, 6, 3]);
  assert.deepEqual(second.cells.map(row => row.length), Array(10).fill(10));
  assert.equal(second.cells.flat().filter(value => value > 0).length, 20);
  assert.deepEqual([second.cells[0][1], second.cells[6][4], second.cells[9][8]], [5, 9, 2]);
});

test('arrows stay straight, start at clues, avoid clues and overlaps, and may exceed clue totals', () => {
  const puzzle = { cells: [[2, 0, 0], [1, 0, 1]] };
  const right = { source: { r: 0, c: 0 }, end: { r: 0, c: 2 } };
  assert.deepEqual(arrowCells(right), [{ r: 0, c: 1 }, { r: 0, c: 2 }]);
  assert.equal(validateArrow(puzzle, right), null);
  assert.match(validateArrow(puzzle, { source: { r: 1, c: 1 }, end: { r: 0, c: 1 } }), /숫자/);
  assert.match(validateArrow(puzzle, { source: { r: 0, c: 0 }, end: { r: 1, c: 1 } }), /가로 또는 세로/);
  assert.match(validateArrow(puzzle, { source: { r: 0, c: 0 }, end: { r: 1, c: 0 } }), /빈 칸/);
  assert.match(validateArrow(puzzle, { source: { r: 1, c: 2 }, end: { r: 0, c: 2 } }, [right]), /이미 다른/);
  const small = { cells: [[0, 0, 0], [0, 1, 0], [0, 0, 0]] };
  const up = { source: { r: 1, c: 1 }, end: { r: 0, c: 1 } };
  const over = { source: { r: 1, c: 1 }, end: { r: 1, c: 2 } };
  assert.equal(validateArrow(small, over, [up]), null);
  assert.equal(analyzeFourWinds(small, [up, over]).totals.get('1:1'), 2);
});

test('completion requires every empty cell and exact clue sums', () => {
  const puzzle = { cells: [[1, 0], [1, 0]] };
  const first = { source: { r: 0, c: 0 }, end: { r: 0, c: 1 } };
  const second = { source: { r: 1, c: 0 }, end: { r: 1, c: 1 } };
  assert.equal(analyzeFourWinds(puzzle, [first]).complete, false);
  assert.equal(analyzeFourWinds(puzzle, [first, second]).complete, true);
});

test('double-press removal keeps arrows from other clues', () => {
  const source = { r: 0, c: 0 };
  const arrows = [
    { source, end: { r: 0, c: 1 } },
    { source, end: { r: 1, c: 0 } },
    { source: { r: 2, c: 2 }, end: { r: 2, c: 1 } },
  ];
  assert.deepEqual(removeSourceArrows(arrows, source), [arrows[2]]);
});

test('Four Winds preview is built without catalog, cloud, or completion recording', () => {
  const catalog = fs.readFileSync('src/data/puzzles.json', 'utf8');
  for (const number of [1, 2]) {
    const html = fs.readFileSync(`dist/test/four-winds/${number}/index.html`, 'utf8');
    assert(html.includes(`사풍(四風) - ${number}`));
    assert(html.includes('숫자 칸에서 화살표를 뻗어 모든 빈 칸을 채우세요'));
    assert(html.includes('data-puzzles=') && !html.includes('fwPicker'));
    assert(html.includes('id="fwStatus" class="sr-only"'));
    assert(!html.includes('id="cloudBtns"') && !html.includes('id="leaderboard"'));
  }
  const script = fs.readFileSync('src/scripts/four-winds.js', 'utf8');
  assert(script.includes("total > value ? '#f4d5d5'") && script.includes("total === value ? '#dcebdc'"));
  assert(script.includes("state === 'exact' ? '#dcebdc'") && script.includes("state === 'exact' ? '#5b8c64'"));
  assert(script.includes("isSelected ? 'rgba(111,155,208,.22)' : clueFill"));
  assert(!script.includes("stroke: '#aab2bb'"));
  assert(!catalog.includes('photo-20260919-1') && !catalog.includes('photo-20260919-2'));
  assert(!script.includes('recordCompletion'));
});

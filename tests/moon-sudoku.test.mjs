import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { givens, solution, moonArea, conflicts, solved } from '../src/lib/moon-sudoku.js';
import { countSolutions, grade } from '../src/lib/sudoku.js';

test('moon clues have one solution with placement deductions below daily medium techniques', () => {
  const input = givens.flat().join('');
  assert.equal(countSolutions(input, 2), 1);
  const result = grade(input);
  assert.equal(result.solved, true);
  assert.equal(result.difficulty, 'easy');
  assert(result.techniques.hiddenSingle >= 14);
  assert(result.techniques.hiddenSingle <= 20);
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
  assert.equal(solved(solution.flat()), true);
  assert.equal(solved(Array(81).fill(0)), false);
  assert.equal(solved(Array(81).fill(1)), false);
  assert.equal(solved(Array(81).fill(10)), false);
  assert.equal(solved(Array(80).fill(1)), false);
});

test('completed moon fills a circular area while leaving the corners clear', () => {
  assert.deepEqual(moonArea.map(row => row.reduce((sum, cell) => sum + cell, 0)), [3, 7, 7, 9, 9, 9, 7, 7, 3]);
  assert.equal(moonArea.flat().reduce((sum, cell) => sum + cell, 0), 61);
});

test('moon preview is unlisted, has no saving, and shows only a mock seasonal ranking', () => {
  const html = fs.readFileSync('dist/test/moon-sudoku/260925/index.html', 'utf8');
  assert.equal((html.match(/data-cell=/g) || []).length, 81);
  assert.equal((html.match(/data-number=/g) || []).length, 9);
  assert(html.includes('noindex, nofollow'));
  assert(html.includes('data-preview="true"'));
  assert(!html.includes('id="cloudBtns"'));
  assert(html.includes('id="leaderboard"'));
  assert(html.includes('토끼 아이콘 랭킹 시안'));
  assert(html.includes('260925 한가위 스도쿠'));
  assert(html.includes('한가위 맞이 스도쿠를 풀어보세요'));
  assert(html.includes('메모하기 버튼이나 M 키로 메모 입력을 켜고 끄세요'));
  assert(!html.includes('방향키로 칸을 이동합니다.'));
  assert(!html.includes('Backspace·Delete·0으로'));
  assert(html.includes('풍성한 한가위 되세요!'));
  assert(!html.includes('테스트 문제 · 진행 상황과 완료 기록은 저장되지 않습니다.'));
  assert.equal((html.match(/class="[^"]*moon-area/g) || []).length, 61);
  assert.equal((html.match(/\/icons\/seasonal\/rabbit\.svg/g) || []).length, 3);
  assert.equal((html.match(/width="18" height="18"/g) || []).length, 3);
  assert(html.indexOf('달토끼') < html.indexOf('/icons/seasonal/rabbit.svg'));
  assert(!fs.readFileSync('src/data/puzzles.json', 'utf8').includes('moon-sudoku'));
  const script = fs.readFileSync('src/scripts/moon-sudoku.js', 'utf8');
  const page = fs.readFileSync('src/pages/test/moon-sudoku/260925/index.astro', 'utf8');
  assert(page.includes('#moonBoard.moon-complete .moon-area { background:#fff4c7; transition:background-color .45s ease; }'));
  assert(!page.includes('#moonBoard .moon-area { transition'));
  assert(script.includes("get('completed') === '1'"));
  assert(script.includes("get('completion-test') === '1'"));
  assert(script.includes('selected = completionTest ? 40 : 0'));
  assert(script.includes('values[selected] = 0'));
  assert(!/recordCompletion|saveLocalState|saveProgressCloud|localStorage/.test(script));
});

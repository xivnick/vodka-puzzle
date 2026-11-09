// Regression checks for the 16 source-image arrows; no puzzle solving is performed.
import assert from 'node:assert/strict';
import { raids, arrowCells, weightedArrowGeometry, weightedArrowStates } from '../src/lib/raid-sudoku.js';

const puzzle = raids[7];
// Independent cell lists in image order: top, left, right, bottom.
const targets = [
  [0], [1,9], [2,10,18], [3,11,19,27],
  [18,28,38,48,58,68,78], [36,46,56,66,76], [54,64,74], [72],
  [8], [26,16,6], [44,34,24,14,4], [62,52,42,32,22,12,2],
  [77,69,61,53], [78,70,62], [79,71], [80],
];
// The sum of artificial 1s on each path, counting each pictured gray cell twice.
const unitSums = [1,2,4,6,7,6,4,2,2,4,6,8,6,3,2,1];
assert.equal(puzzle.arrows.length, targets.length);
puzzle.arrows.forEach(([side, slot], index) => {
  const expected = targets[index];
  assert.deepEqual(arrowCells(side, slot), expected, `wrong cells for arrow ${index}`);
  const {a, b} = weightedArrowGeometry(side, slot);
  const dx = b[0] - a[0], dy = b[1] - a[1];
  assert(Math.abs(Math.abs(dx) - Math.abs(dy)) < 1e-9, `arrow ${index} is not 45 degrees`);
  for (const i of expected) {
    const x = i % 9 + .5, y = Math.floor(i / 9) + .5;
    assert(Math.abs((x - a[0]) * dy - (y - a[1]) * dx) < 1e-9,
      `drawn arrow ${index} misses cell ${i}`);
    assert((x - a[0]) * dx + (y - a[1]) * dy > 0);
  }
  const values = Array(81).fill(0);
  expected.forEach(i => { values[i] = 1; });
  const fixture = {...puzzle, arrows:[[side, slot, unitSums[index]]]};
  assert.equal(weightedArrowStates(fixture, values)[0], 'valid');
  fixture.arrows[0][2]++;
  assert.equal(weightedArrowStates(fixture, values)[0], 'invalid');
  values[expected[0]] = 0;
  assert.equal(weightedArrowStates(fixture, values)[0], 'pending');
});

// The user's top-left reproduction, plus the other three one-cell corner clues.
for (const [cell, value, clue] of [[0,5,0], [72,4,7], [8,8,8], [80,3,15]]) {
  const values = Array(81).fill(0);
  values[cell] = value;
  assert.equal(weightedArrowStates(puzzle, values)[clue], 'valid');
  values[cell] = value + 1;
  assert.equal(weightedArrowStates(puzzle, values)[clue], 'invalid');
  values[cell] = 0;
  assert.equal(weightedArrowStates(puzzle, values)[clue], 'pending');
}
// An incomplete line must still turn red once its weighted sum exceeds its clue.
const partial = Array(81).fill(0);
partial[2] = 9; partial[10] = 5;
assert.equal(weightedArrowStates(puzzle, partial)[2], 'invalid');
console.log('16 drawn diagonals, gray weights, clue feedback, erase and partial overflow checked.');

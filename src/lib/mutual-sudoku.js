import { sudokuConflicts, parseEqualSumSudokuState } from './equal-sum-sudoku.js';

export const mutualSudoku261102 = {
  id: '261102_01',
  title: '261102 상호 지시 스도쿠',
  givens: Array.from({ length: 9 }, () => Array(9).fill(0)),
  clues: {
    top: [[1,6], [2,5], [3,6], [4,9], [6,4], [8,1], [2,5], [4,9], [8,1]],
    right: [null, [4,9], [2,5], [8,1], null, [3,6], [3,6], [2,5], null],
    bottom: [null, [4,9], [6,4], [8,1], null, [2,5], [8,1], [1,6], null],
    left: [[1,6], [2,5], [3,6], [4,9], [6,4], [8,1], [1,6], [3,6], [6,4]],
  },
};

// Every line is ordered from its clue toward the opposite edge.
export function mutualClueChecks(puzzle, values) {
  const size = puzzle.givens.length;
  return Object.entries(puzzle.clues).flatMap(([side, clues]) => clues.flatMap((pair, line) => {
    if (!pair) return [];
    const indices = Array.from({ length: size }, (_, offset) => {
      if (side === 'top') return offset * size + line;
      if (side === 'bottom') return (size - 1 - offset) * size + line;
      if (side === 'left') return line * size + offset;
      return line * size + size - 1 - offset;
    });
    const [x, y] = pair;
    const first = values[indices[y - 1]];
    const second = values[indices[x - 1]];
    return [{ key: `${side}-${line}`, conflict: Boolean(first && second && first !== x && second !== y) }];
  }));
}

export { sudokuConflicts };
export const parseMutualSudokuState = parseEqualSumSudokuState;

export function solvedMutualSudoku(puzzle, values) {
  const size = puzzle.givens.length;
  return values.length === size ** 2
    && values.every(value => Number.isInteger(value) && value >= 1 && value <= size)
    && puzzle.givens.flat().every((given, index) => !given || values[index] === given)
    && sudokuConflicts(puzzle, values).size === 0
    && mutualClueChecks(puzzle, values).every(check => !check.conflict);
}

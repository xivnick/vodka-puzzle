export const equalSumSudoku260921 = {
  id: 'equal-sum-260921',
  title: '260921 같은 합 스도쿠',
  givens: [
    [0, 0, 8, 0, 0, 0, 3, 0, 0],
    [0, 4, 0, 5, 0, 3, 0, 2, 0],
    [7, 0, 0, 0, 0, 0, 0, 0, 1],
    [0, 3, 0, 0, 0, 6, 0, 9, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 7, 0, 2, 0, 0, 0, 6, 0],
    [9, 0, 0, 0, 0, 0, 0, 0, 5],
    [0, 8, 0, 3, 0, 4, 0, 1, 0],
    [0, 0, 5, 0, 0, 0, 6, 0, 0],
  ],
  // Coordinates are one-based [row, column]. Each group is one gray region.
  regions: [
    [[1, 1], [2, 1], [2, 2], [3, 2], [3, 3]],
    [[1, 5], [1, 6], [2, 6]],
    [[1, 8], [1, 9], [2, 8], [2, 9]],
    [[4, 5], [4, 6], [5, 5], [5, 6], [6, 5]],
    [[4, 8], [4, 9], [5, 9]],
    [[5, 1], [6, 1], [6, 2]],
    [[7, 8], [7, 9], [8, 7], [8, 8], [9, 8]],
    [[8, 1], [8, 2], [9, 1], [9, 2]],
    [[8, 4], [9, 4], [9, 5]],
  ],
};

const indexOf = ([row, column], size) => (row - 1) * size + column - 1;

function sudokuUnits(size, boxRows = 3, boxColumns = 3) {
  const rows = Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, column) => row * size + column));
  const columns = Array.from({ length: size }, (_, column) => Array.from({ length: size }, (_, row) => row * size + column));
  const boxes = [];
  for (let top = 0; top < size; top += boxRows) {
    for (let left = 0; left < size; left += boxColumns) {
      boxes.push(Array.from({ length: boxRows * boxColumns }, (_, offset) =>
        (top + Math.floor(offset / boxColumns)) * size + left + offset % boxColumns));
    }
  }
  return [...rows, ...columns, ...boxes];
}

export function equalSumRegionConflicts(puzzle, values) {
  const size = puzzle.givens.length;
  const complete = puzzle.regions
    .map(region => region.map(cell => indexOf(cell, size)))
    .filter(region => region.every(index => values[index]))
    .map(region => ({ region, sum: region.reduce((total, index) => total + values[index], 0) }));
  if (new Set(complete.map(({ sum }) => sum)).size <= 1) return new Set();
  return new Set(complete.flatMap(({ region }) => region));
}

export function equalSumSudokuConflicts(puzzle, values) {
  const size = puzzle.givens.length;
  const conflicts = equalSumRegionConflicts(puzzle, values);
  for (const unit of sudokuUnits(size, puzzle.boxRows || 3, puzzle.boxColumns || 3)) {
    for (const index of unit) {
      if (values[index] && unit.some(other => other !== index && values[other] === values[index])) conflicts.add(index);
    }
  }
  return conflicts;
}

export function solvedEqualSumSudoku(puzzle, values) {
  const size = puzzle.givens.length;
  return values.length === size ** 2
    && values.every(value => Number.isInteger(value) && value >= 1 && value <= size)
    && puzzle.givens.flat().every((given, index) => !given || values[index] === given)
    && equalSumSudokuConflicts(puzzle, values).size === 0;
}

export function parseEqualSumSudokuState(puzzle, saved, puzzleId) {
  const size = puzzle.givens.length;
  if (!saved || saved.version !== 1 || saved.puzzleId !== puzzleId
    || !Array.isArray(saved.values) || saved.values.length !== size ** 2
    || !saved.values.every(value => Number.isInteger(value) && value >= 0 && value <= size)
    || !Array.isArray(saved.notes) || saved.notes.length !== size ** 2
    || !saved.notes.every(note => Array.isArray(note) && note.every(value => Number.isInteger(value) && value >= 1 && value <= size))) return null;
  const givens = puzzle.givens.flat();
  const values = saved.values.map((value, index) => givens[index] || value);
  return {
    values,
    notes: saved.notes.map((note, index) => values[index] ? [] : [...new Set(note)].sort((a, b) => a - b)),
  };
}

export const skyscraper260920 = {
  id: 'skyscraper-260920',
  title: '260920 스카이스크레이퍼',
  givens: [
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 1, 0, 0],
    [0, 0, 3, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
  ],
  clues: {
    top: [null, null, 3, 3, 1, 3],
    right: [null, 5, 3, 3, 1, null],
    bottom: [null, 3, 3, 3, 5, null],
    left: [null, null, 3, 3, 3, 1],
  },
};

export function countVisible(values) {
  let count = 0;
  let highest = 0;
  for (const value of values) {
    if (value > highest) {
      highest = value;
      count += 1;
    }
  }
  return count;
}

function lineFrom(puzzle, values, side, index) {
  const size = puzzle.givens.length;
  if (side === 'top' || side === 'bottom') {
    const column = Array.from({ length: size }, (_, row) => values[row * size + index]);
    return side === 'bottom' ? column.reverse() : column;
  }
  const row = values.slice(index * size, (index + 1) * size);
  return side === 'right' ? row.reverse() : row;
}

export function skyscraperConflicts(puzzle, values) {
  const size = puzzle.givens.length;
  const conflicts = new Set();
  const markDuplicates = indexes => {
    const seen = new Map();
    for (const index of indexes) {
      const value = values[index];
      if (!value) continue;
      if (!seen.has(value)) seen.set(value, [index]);
      else seen.get(value).push(index);
    }
    for (const indexesWithValue of seen.values()) {
      if (indexesWithValue.length > 1) indexesWithValue.forEach(index => conflicts.add(index));
    }
  };
  for (let row = 0; row < size; row += 1) markDuplicates(Array.from({ length: size }, (_, column) => row * size + column));
  for (let column = 0; column < size; column += 1) markDuplicates(Array.from({ length: size }, (_, row) => row * size + column));
  return conflicts;
}

export function skyscraperClueErrors(puzzle, values) {
  const errors = new Set();
  for (const side of ['top', 'right', 'bottom', 'left']) {
    puzzle.clues[side].forEach((clue, index) => {
      if (clue == null) return;
      const line = lineFrom(puzzle, values, side, index);
      const firstBlank = line.indexOf(0);
      const visiblePrefix = countVisible(firstBlank < 0 ? line : line.slice(0, firstBlank));
      if (visiblePrefix > clue || (firstBlank < 0 && visiblePrefix !== clue)) errors.add(`${side}-${index}`);
    });
  }
  return errors;
}

export function solvedSkyscraper(puzzle, values) {
  const size = puzzle.givens.length;
  if (!Array.isArray(values) || values.length !== size ** 2) return false;
  if (!values.every(value => Number.isInteger(value) && value >= 1 && value <= size)) return false;
  if (puzzle.givens.flat().some((given, index) => given && values[index] !== given)) return false;
  return skyscraperConflicts(puzzle, values).size === 0 && skyscraperClueErrors(puzzle, values).size === 0;
}

export function parseSkyscraperState(puzzle, saved, puzzleId) {
  const size = puzzle.givens.length;
  if (!saved || saved.version !== 1 || saved.puzzleId !== puzzleId || !Array.isArray(saved.values) || saved.values.length !== size ** 2) return null;
  if (!saved.values.every(value => Number.isInteger(value) && value >= 0 && value <= size)) return null;
  return saved.values.map((value, index) => puzzle.givens.flat()[index] || value);
}

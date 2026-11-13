export const slovakSums261113 = {
  size: 8,
  digits: [1, 2, 3, 4],
  // Zero-based positions, transcribed from the supplied image.
  clues: [
    { row: 0, column: 3, sum: 3 }, { row: 0, column: 4, sum: 7 },
    { row: 1, column: 1, count: 2 }, { row: 1, column: 6, count: 2 },
    { row: 2, column: 2, sum: 6, count: 2 }, { row: 2, column: 5, sum: 5, count: 2 },
    { row: 3, column: 0, sum: 5 }, { row: 3, column: 7, sum: 4 },
    { row: 4, column: 0, sum: 5 }, { row: 4, column: 7, sum: 6 },
    { row: 5, column: 2, sum: 3, count: 2 }, { row: 5, column: 5, sum: 6, count: 2 },
    { row: 6, column: 1, count: 2 }, { row: 6, column: 6, count: 2 },
    { row: 7, column: 3, sum: 4 }, { row: 7, column: 4, sum: 6 },
  ],
};

export function parseSlovakSumsState(puzzle, saved, puzzleId) {
  if (saved?.version !== 1 || saved.puzzleId !== puzzleId || !Array.isArray(saved.values) || saved.values.length !== puzzle.size ** 2) return null;
  const blocked = new Set(puzzle.clues.map(clue => clue.row * puzzle.size + clue.column));
  if (!saved.values.every((value, index) => (value === 0 || puzzle.digits.includes(value)) && (!blocked.has(index) || value === 0))) return null;
  if (saved.notes !== undefined && (!Array.isArray(saved.notes) || saved.notes.length !== saved.values.length ||
    !saved.notes.every(note => Array.isArray(note) && note.every(value => puzzle.digits.includes(value))))) return null;
  return {
    values: [...saved.values],
    notes: saved.values.map((value, index) => value || blocked.has(index) ? [] : [...new Set(saved.notes?.[index] || [])].sort((a, b) => a - b)),
  };
}

// Inspect only the player's entries; no solution search or stored answer.
export function inspectSlovakSums(puzzle, values) {
  const { size, digits, clues } = puzzle;
  const conflicts = new Set(), clueErrors = new Set();
  if (!parseSlovakSumsState(puzzle, { version: 1, puzzleId: '', values }, '')) return { complete: false, conflicts, clueErrors };
  let linesComplete = true;
  const checkLine = indexes => {
    for (const digit of digits) {
      const occurrences = indexes.filter(index => values[index] === digit);
      if (occurrences.length !== 1) linesComplete = false;
      if (occurrences.length > 1) occurrences.forEach(index => conflicts.add(index));
    }
  };
  for (let line = 0; line < size; line += 1) {
    checkLine(Array.from({ length: size }, (_, column) => line * size + column));
    checkLine(Array.from({ length: size }, (_, row) => row * size + line));
  }
  let cluesComplete = true;
  for (const clue of clues) {
    const neighbors = [[clue.row - 1, clue.column], [clue.row + 1, clue.column], [clue.row, clue.column - 1], [clue.row, clue.column + 1]]
      .filter(([row, column]) => row >= 0 && row < size && column >= 0 && column < size)
      .map(([row, column]) => values[row * size + column]);
    const sum = neighbors.reduce((total, value) => total + value, 0);
    const count = neighbors.filter(Boolean).length;
    const sumMatches = clue.sum == null || sum === clue.sum;
    const countMatches = clue.count == null || count === clue.count;
    if (!sumMatches || !countMatches) cluesComplete = false;
    if ((clue.sum != null && sum > clue.sum) || (clue.count != null && count > clue.count) ||
      (clue.count != null && count === clue.count && !sumMatches) || (linesComplete && (!sumMatches || !countMatches))) {
      clueErrors.add(clue.row * size + clue.column);
    }
  }
  return { complete: linesComplete && cluesComplete, conflicts, clueErrors };
}

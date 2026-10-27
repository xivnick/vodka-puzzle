export const mathPath261028 = {
  size: 6,
  // Image coordinates, in row order. Each pair forms one outlined region.
  regions: [
    { cells: [0, 6], target: 31 }, { cells: [1, 2] }, { cells: [3, 4] },
    { cells: [8, 9] }, { cells: [10, 11], target: 45 }, { cells: [12, 13] },
    { cells: [14, 20], target: 3 }, { cells: [15, 16], target: 4, operation: '÷' },
    { cells: [17, 23] }, { cells: [18, 24] }, { cells: [22, 28] },
    { cells: [25, 26] }, { cells: [27, 33] }, { cells: [30, 31], target: 39 },
    { cells: [34, 35], target: 31 },
  ],
};
export const playableCells = puzzle => puzzle.regions.flatMap(region => region.cells).sort((a, b) => a - b);

export function matchesArithmetic(numbers, target, operation) {
  const sorted = [...numbers].sort((a, b) => b - a);
  const [first, ...rest] = sorted;
  return (operation ? [operation] : ['+', '−', '×', '÷']).some(op => {
    if (op === '+') return sorted.reduce((a, b) => a + b, 0) === target;
    if (op === '−') return rest.reduce((a, b) => a - b, first) === target;
    if (op === '×') return sorted.reduce((a, b) => a * b, 1) === target;
    // Compare by multiplication so division never depends on floating-point rounding.
    if (op === '÷') return first === target * rest.reduce((a, b) => a * b, 1);
    return false;
  });
}

// Inspect entered values only. No solution search or future-placement inference.
export function inspectMathPath(puzzle, values) {
  const cells = playableCells(puzzle), count = cells.length, positions = new Map(), conflicts = new Set();
  cells.forEach(index => {
    const value = values[index];
    if (!value) return;
    if (!Number.isInteger(value) || value < 1 || value > count) conflicts.add(index);
    if (!positions.has(value)) positions.set(value, []);
    positions.get(value).push(index);
  });
  positions.forEach(indices => { if (indices.length > 1) indices.forEach(index => conflicts.add(index)); });
  positions.forEach((indices, value) => {
    const next = positions.get(value + 1);
    if (indices.length !== 1 || next?.length !== 1) return;
    const a = indices[0], b = next[0];
    if (Math.max(Math.abs(Math.floor(a / puzzle.size) - Math.floor(b / puzzle.size)), Math.abs(a % puzzle.size - b % puzzle.size)) !== 1) {
      conflicts.add(a); conflicts.add(b);
    }
  });
  puzzle.regions.forEach(region => {
    if (region.target === undefined || !region.cells.every(index => values[index] > 0)) return;
    if (!matchesArithmetic(region.cells.map(index => values[index]), region.target, region.operation)) region.cells.forEach(index => conflicts.add(index));
  });
  return { conflicts, complete: values.length === puzzle.size ** 2 && positions.size === count && cells.every(index => values[index] > 0) && !conflicts.size };
}

export function parseMathPathState(puzzle, saved, puzzleId) {
  const cells = new Set(playableCells(puzzle)), count = cells.size, size = puzzle.size ** 2;
  const valid = value => Number.isInteger(value) && value >= 0 && value <= count;
  if (saved?.version !== 1 || saved.puzzleId !== puzzleId || !Array.isArray(saved.values) || saved.values.length !== size || !saved.values.every((value, index) => valid(value) && (cells.has(index) || value === 0))) return null;
  const notes = saved.notes ?? Array.from({ length: size }, () => []);
  if (!Array.isArray(notes) || notes.length !== size || !notes.every((row, index) => Array.isArray(row) && (cells.has(index) || !row.length) && row.every(value => valid(value) && value > 0))) return null;
  return { values: [...saved.values], notes: notes.map((row, index) => saved.values[index] ? [] : [...new Set(row)]) };
}

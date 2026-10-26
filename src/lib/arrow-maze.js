export const arrowMaze261026 = {
  size: 4,
  // Row order, matching the supplied image. The circle is the endpoint.
  directions: [null, [1, 1], [0, 1], [1, -1], [-1, 1], [-1, 1], [1, 1], [1, 0], [-1, 0], [1, 1], [0, -1], [0, -1], [-1, 0], [-1, 1], [0, -1], [0, -1]],
  givens: { 0: 16 },
};

export function pointsTo(puzzle, from, to) {
  const direction = puzzle.directions[from];
  if (!direction || from === to) return false;
  const dr = Math.floor(to / puzzle.size) - Math.floor(from / puzzle.size);
  const dc = to % puzzle.size - from % puzzle.size;
  return Math.sign(dr) === direction[0] && Math.sign(dc) === direction[1]
    && (!direction[0] || !direction[1] || Math.abs(dr) === Math.abs(dc));
}

// Check the submitted numbers only; do not search for a solution.
export function inspectArrowMaze(puzzle, values) {
  const count = puzzle.size ** 2, positions = new Map(), conflicts = new Set();
  values.forEach((value, index) => {
    if (!value) return;
    if (!Number.isInteger(value) || value < 1 || value > count) conflicts.add(index);
    if (!positions.has(value)) positions.set(value, []);
    positions.get(value).push(index);
  });
  positions.forEach(indices => { if (indices.length > 1) indices.forEach(index => conflicts.add(index)); });
  Object.entries(puzzle.givens).forEach(([index, value]) => { if (values[index] !== value) conflicts.add(Number(index)); });
  values.forEach((value, index) => {
    if (!value || !puzzle.directions[index]) return;
    const targets = positions.get(value + 1);
    // Only compare an entered pair. Empty cells and future placements are not errors.
    // Duplicate targets already have their own rule error; their position is ambiguous.
    if (positions.get(value).length === 1 && targets?.length === 1 && !pointsTo(puzzle, index, targets[0])) conflicts.add(index);
  });
  return { conflicts, complete: values.length === count && positions.size === count && !conflicts.size && values.every(value => value > 0) };
}

export function parseArrowMazeState(puzzle, saved, puzzleId) {
  const count = puzzle.size ** 2;
  const valid = value => Number.isInteger(value) && value >= 0 && value <= count;
  if (saved?.version !== 1 || saved.puzzleId !== puzzleId || !Array.isArray(saved.values) || saved.values.length !== count || !saved.values.every(valid)) return null;
  if (Object.entries(puzzle.givens).some(([index, value]) => saved.values[index] !== value)) return null;
  const notes = saved.notes ?? Array.from({ length: count }, () => []);
  if (!Array.isArray(notes) || notes.length !== count || !notes.every(row => Array.isArray(row) && row.every(value => valid(value) && value > 0))) return null;
  return { values: [...saved.values], notes: notes.map((row, index) => puzzle.givens[index] || saved.values[index] ? [] : [...new Set(row)]) };
}

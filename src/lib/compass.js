export const compass261021 = {
  rows: 8,
  cols: 8,
  clues: [
    { row: 1, col: 1, label: 'A', west: 0, south: 1 },
    { row: 1, col: 4, label: 'B', north: 2, west: 0, east: 1 },
    { row: 2, col: 2, label: 'C', east: 1, south: 5 },
    { row: 2, col: 6, label: 'D', west: 2, south: 3 },
    { row: 3, col: 3, label: 'E', north: 5, west: 1 },
    { row: 4, col: 4, label: 'F', north: 5, west: 3 },
    { row: 5, col: 1, label: 'G', west: 1, east: 0, south: 3 },
    { row: 5, col: 5, label: 'H', east: 3, south: 5 },
    { row: 6, col: 3, label: 'J', north: 2, east: 1 },
    { row: 6, col: 6, label: 'K', north: 2, west: 0 },
  ],
};

export function edgeKey(a, b) {
  return `${Math.min(a, b)}:${Math.max(a, b)}`;
}

export function parseCompassState(puzzle, state, puzzleId) {
  if (!state || state.version !== 1 || state.puzzleId !== puzzleId ||
      !Array.isArray(state.lines)) return null;
  const valid = new Set();
  for (let r = 0; r < puzzle.rows; r++) for (let c = 0; c < puzzle.cols; c++) {
    const i = r * puzzle.cols + c;
    if (c + 1 < puzzle.cols) valid.add(edgeKey(i, i + 1));
    if (r + 1 < puzzle.rows) valid.add(edgeKey(i, i + puzzle.cols));
  }
  const lines = new Set(state.lines);
  if (lines.size !== state.lines.length || [...lines].some(key => !valid.has(key))) return null;
  // Older saves may contain X notes; preserve their lines and discard the notes.
  return { lines };
}

// Only check the regions drawn by the player; no solution search is performed.
export function validateCompass(puzzle, lines) {
  const { rows, cols, clues } = puzzle;
  const regionOf = Array(rows * cols).fill(-1), regions = [];
  for (let start = 0; start < regionOf.length; start++) {
    if (regionOf[start] !== -1) continue;
    const id = regions.length, cells = [], pending = [start];
    regionOf[start] = id;
    while (pending.length) {
      const i = pending.pop(), r = Math.floor(i / cols), c = i % cols;
      cells.push(i);
      const neighbors = [r > 0 ? i - cols : null, r + 1 < rows ? i + cols : null,
        c > 0 ? i - 1 : null, c + 1 < cols ? i + 1 : null];
      for (const next of neighbors) {
        if (next === null || regionOf[next] !== -1 || lines.has(edgeKey(i, next))) continue;
        regionOf[next] = id;
        pending.push(next);
      }
    }
    const regionClues = clues.filter(clue => cells.includes(clue.row * cols + clue.col));
    const clue = regionClues.length === 1 ? regionClues[0] : null;
    const counts = clue ? {
      north: cells.filter(i => Math.floor(i / cols) < clue.row).length,
      south: cells.filter(i => Math.floor(i / cols) > clue.row).length,
      west: cells.filter(i => i % cols < clue.col).length,
      east: cells.filter(i => i % cols > clue.col).length,
    } : null;
    const directions = ['north', 'south', 'west', 'east'];
    const valid = !!clue && directions.every(direction => clue[direction] == null || counts[direction] === clue[direction]);
    // Too few cells cannot be repaired by adding boundaries to this region.
    const invalid = regionClues.length === 0 || !!clue && directions.some(direction => clue[direction] != null && counts[direction] < clue[direction]);
    regions.push({ cells, clues: regionClues, counts, valid, feedback: valid ? 'valid' : invalid ? 'invalid' : 'pending' });
  }
  return { regions, regionOf, complete: regions.every(region => region.valid) };
}

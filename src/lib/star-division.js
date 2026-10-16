export const starDivision261016 = {
  rows: 9,
  cols: 9,
  clues: [
    '*.*.*2*.*',
    '4*1*.*.*7',
    '*.*.*.*.*',
    '5*.*.*.*5',
    '*.*1*.*.*',
    '6*.*.*.*6',
    '*.*.*.*.*',
    '7*5*.*.*4',
    '*.*.*.*.*',
  ],
};

export function edgeKey(a, b) {
  return `${Math.min(a, b)}:${Math.max(a, b)}`;
}

export function parseStarDivisionState(puzzle, state, puzzleId) {
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

// Regions are the connected components left by the player's boundary lines.
export function validateStarDivision(puzzle, lines) {
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
    const stars = cells.filter(i => clues[Math.floor(i / cols)][i % cols] === '*').length;
    const numbers = cells.map(i => clues[Math.floor(i / cols)][i % cols]).filter(c => /[1-9]/.test(c)).map(Number);
    regions.push({ cells, stars, numbers, square: false });
  }
  for (let r = 0; r + 1 < rows; r++) for (let c = 0; c + 1 < cols; c++) {
    const i = r * cols + c, id = regionOf[i];
    if ([i + 1, i + cols, i + cols + 1].every(j => regionOf[j] === id)) regions[id].square = true;
  }
  for (const region of regions) {
    region.valid = region.stars > 0 && !region.square && region.numbers.every(n => n === region.stars);
    // Different numbers must end up in different regions; repeated numbers may share one.
    const requiredStars = [...new Set(region.numbers)].reduce((sum, n) => sum + n, 0);
    // These failures cannot be repaired by adding boundaries within this region.
    // A single-star region cannot be split further without making a starless region.
    const impossibleBySplitting = region.stars === 0 || region.stars < requiredStars
      || region.stars === 1 && region.square;
    region.feedback = region.valid ? 'valid' : impossibleBySplitting ? 'invalid' : 'pending';
  }
  return { regions, regionOf, complete: regions.every(region => region.valid) };
}

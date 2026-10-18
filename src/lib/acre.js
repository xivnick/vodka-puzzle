export const acre261018 = {
  rows: 9, cols: 9,
  regions: [
    'ABBBCCCCC',
    'ABBBCCDDD',
    'ABBBCCDDD',
    'AAAEEEDDD',
    'AAAEFEGGG',
    'HHHEEEGGG',
    'HHHIIJJJG',
    'HHHIIJJJG',
    'IIIIIJJJG',
  ],
  clues: [{ cell: 1, count: 6 }, { cell: 15, count: 8 }, { cell: 30, count: 0 },
    { cell: 45, count: 2 }, { cell: 59, count: 5 }],
};

export function parseAcreState(puzzle, state, puzzleId) {
  if (state?.version !== 1 || state.puzzleId !== puzzleId ||
      !Array.isArray(state.values) || state.values.length !== puzzle.rows * puzzle.cols ||
      !state.values.every(value => [0, 1, 2].includes(value))) return null;
  return { values: [...state.values] };
}

export function validateAcre(puzzle, values) {
  const { rows, cols, regions, clues } = puzzle;
  const bad = new Set();
  let valid = true;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      if (r + 3 * dr >= rows || c + 3 * dc >= cols) continue;
      const line = Array.from({ length: 4 }, (_, k) => (r + k * dr) * cols + c + k * dc);
      if (line.every(i => values[i] === 1) || line.every(i => values[i] !== 1)) {
        valid = false;
        if (line.every(i => values[i] === 1) || line.every(i => values[i] === 2)) line.forEach(i => bad.add(i));
      }
    }
  }
  for (const { cell, count } of clues) {
    const region = regions[Math.floor(cell / cols)][cell % cols];
    const cells = values.map((_, i) => i).filter(i => regions[Math.floor(i / cols)][i % cols] === region);
    const shaded = cells.filter(i => values[i] === 1).length;
    if (shaded !== count) valid = false;
    if (shaded > count || cells.every(i => values[i] !== 0) && shaded !== count) cells.forEach(i => bad.add(i));
  }
  const start = values.indexOf(1), reached = new Set();
  if (start !== -1) {
    const pending = [start];
    reached.add(start);
    while (pending.length) {
      const i = pending.pop(), r = Math.floor(i / cols), c = i % cols;
      for (const next of [r > 0 ? i - cols : -1, r < rows - 1 ? i + cols : -1,
        c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1]) {
        if (next < 0 || values[next] !== 1 || reached.has(next)) continue;
        reached.add(next); pending.push(next);
      }
    }
  }
  return { bad, complete: valid && reached.size > 0 && reached.size === values.filter(v => v === 1).length };
}

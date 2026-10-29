export const candles261029 = {
  rows: 8, cols: 8,
  clues: [
    [1, 10], [3, 8], [5, 9], [15, 10], [16, 6],
    [27, 2], [28, 0], [31, 8], [32, 9], [35, 2], [36, 4],
    [47, 8], [48, 9], [58, 9], [60, 11], [62, 9],
  ].map(([cell, count]) => ({ cell, count })),
};

export function parseCandlesState(puzzle, state, puzzleId) {
  if (state?.version !== 1 || state.puzzleId !== puzzleId ||
      !Array.isArray(state.values) || state.values.length !== puzzle.rows * puzzle.cols ||
      !state.values.every(value => [0, 1, 2].includes(value)) ||
      puzzle.clues.some(({cell}) => state.values[cell] !== 0)) return null;
  return { values: [...state.values] };
}

export function validateCandles(puzzle, values) {
  const { rows, cols, clues } = puzzle;
  const clueCells = new Set(clues.map(({cell}) => cell));
  const candle = i => !clueCells.has(i) && values[i] === 1;
  function neighbors(i, diagonal = false) {
    const r = Math.floor(i / cols), c = i % cols, result = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc || !diagonal && Math.abs(dr) + Math.abs(dc) !== 1) continue;
      if (r + dr >= 0 && r + dr < rows && c + dc >= 0 && c + dc < cols) result.push((r + dr) * cols + c + dc);
    }
    return result;
  }
  const bad = new Set();
  const weights = values.map((_, i) => candle(i) ? 4 - neighbors(i).filter(candle).length : 0);
  weights.forEach((weight, i) => { if (candle(i) && weight === 0) bad.add(i); });
  let valid = bad.size === 0;
  const sums = clues.map(({cell, count}) => {
    const adjacent = neighbors(cell, true);
    const sum = adjacent.reduce((total, i) => total + weights[i], 0);
    if (sum !== count) {
      valid = false;
      // Adding a candle can lower adjacent values. Flag a sum only once all
      // cells that can affect it have explicitly been filled or marked empty.
      const dependencies = new Set(adjacent);
      adjacent.filter(candle).forEach(i => neighbors(i).forEach(j => dependencies.add(j)));
      if ([...dependencies].every(i => clueCells.has(i) || values[i] !== 0)) bad.add(cell);
    }
    return sum;
  });
  return { bad, weights, sums, complete: valid };
}

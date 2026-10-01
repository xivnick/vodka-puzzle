// Unlisted, position-revealed demo. Bombs are a single Sudoku symbol;
// their nine half-integer values are used once across the entire board.
export const bombs = [7, 12, 20, 32, 44, 46, 54, 69, 76];
export const givens = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 8, 1, 0, 4, 0, 0, 0, 3],
  [4, 0, 0, 0, 0, 0, 0, 1, 8],
  [5, 1, 7, 4, 0, 0, 0, 2, 0],
  [0, 6, 0, 0, 5, 1, 0, 4, 0],
  [0, 0, 0, 0, 0, 0, 5, 0, 0],
  [0, 0, 5, 3, 6, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [1, 2, 0, 0, 0, 0, 6, 0, 4],
];
export const bombValues = Array.from({ length: 9 }, (_, n) => n + 0.5);
export const boardSignature = `${givens.flat().join(',')}|${bombs.join(',')}`;
const bombSet = new Set(bombs);
const fixed = givens.flat();
const units = [
  ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, b) => Array.from({ length: 9 }, (_, n) =>
    (Math.floor(b / 3) * 3 + Math.floor(n / 3)) * 9 + (b % 3) * 3 + n % 3)),
];
export const isBomb = index => bombSet.has(index);
export const validValue = (value, index) => isBomb(index)
  ? bombValues.includes(value)
  : Number.isInteger(value) && value >= 1 && value <= 8;

export function conflicts(values) {
  const bad = new Set();
  values.forEach((n, i) => {
    if (n && !validValue(n, i) || fixed[i] && n !== fixed[i]) bad.add(i);
  });
  for (const unit of units) {
    for (const i of unit) {
      if (!isBomb(i) && values[i] && unit.some(j =>
        j !== i && !isBomb(j) && values[j] === values[i])) bad.add(i);
    }
  }
  for (const i of bombs) {
    const value = values[i], col = i % 9;
    if (value && bombs.some(j => j !== i && values[j] === value)) bad.add(i);
    if (col > 0 && value && values[i - 1] && values[i - 1] >= value) {
      bad.add(i); bad.add(i - 1);
    }
    if (col < 8 && value && values[i + 1] && values[i + 1] <= value) {
      bad.add(i); bad.add(i + 1);
    }
    // Even with an empty bomb, reversed neighbors cannot satisfy L < bomb < R.
    if (col > 0 && col < 8 && values[i - 1] && values[i + 1]
      && values[i - 1] >= values[i + 1]) {
      bad.add(i - 1); bad.add(i); bad.add(i + 1);
    }
    if (value && (col > 0 && value === 0.5 || col < 8 && value === 8.5)) bad.add(i);
  }
  return bad;
}

export function solved(values) {
  return values.length === 81 && values.every(validValue) && conflicts(values).size === 0;
}

export function parseBombSudokuState(saved, puzzleId) {
  if (!saved || saved.version !== 1 || saved.puzzleId !== puzzleId
    || saved.boardSignature !== boardSignature
    || !Array.isArray(saved.values) || saved.values.length !== 81
    || !saved.values.every((value, index) => value === 0 || validValue(value, index))
    || !Array.isArray(saved.notes) || saved.notes.length !== 81
    || !saved.notes.every((note, index) => Array.isArray(note)
      && note.every(value => validValue(value, index)))) return null;
  if (saved.values.some((value, index) => fixed[index] && value !== fixed[index])) return null;
  return {
    values: [...saved.values],
    notes: saved.notes.map((note, index) => saved.values[index]
      ? []
      : [...new Set(note)].sort((a, b) => a - b)),
  };
}

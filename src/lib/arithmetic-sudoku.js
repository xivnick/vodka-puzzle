// Photo transcription for 260928: the first column is fixed, and each outlined
// group is one decimal number read from left to right.
export const givens = Array.from({ length: 9 }, (_, row) =>
  [row + 1, 0, 0, 0, 0, 0, 0, 0, 0]);

// Column numbers are zero based. Each row contains its displayed number groups.
export const groups = [
  [[1, 2], [3], [4, 5]],
  [[1], [2], [3], [4], [5, 6]],
  [[1], [2, 3], [4, 5, 6]],
  [[1], [2], [3, 4], [5], [6]],
  [[1, 2], [3], [4]],
  [[1], [2], [3]],
  [[1], [2], [3], [4], [5], [6]],
  [[1], [2, 3], [4, 5], [6], [7], [8]],
  [[1], [2], [3], [4], [5], [6], [7]],
];

// Boundary after a zero-based column, with the operator printed there.
export const operators = [
  [[2, '×'], [3, '=']],
  [[1, '+'], [2, '+'], [3, '+'], [4, '=']],
  [[1, '×'], [3, '=']],
  [[1, '+'], [2, '='], [4, '='], [5, '×']],
  [[2, '−'], [3, '=']],
  [[1, '−'], [2, '=']],
  [[1, '='], [2, '/'], [3, '='], [4, '/('], [5, '−'], [6, ')']],
  [[1, '+'], [3, '='], [5, '='], [6, '×('], [7, '−'], [8, ')']],
  [[1, '+'], [2, '='], [3, '+'], [4, '='], [5, '='], [6, '+']],
];

const units = [
  ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, b) => Array.from({ length: 9 }, (_, n) =>
    (Math.floor(b / 3) * 3 + Math.floor(n / 3)) * 9 + (b % 3) * 3 + n % 3)),
];

function groupValue(values, row, group) {
  const digits = groups[row][group].map(col => values[row * 9 + col]);
  return digits.every(digit => Number.isInteger(digit) && digit >= 1 && digit <= 9)
    ? Number(digits.join('')) : null;
}

// Each side returns an exact integer fraction. A side is checked as soon as all
// of its digits are entered; an incomplete side does not mark a guess as wrong.
function sides(values, row) {
  const g = groups[row].map((_, index) => groupValue(values, row, index));
  const side = (indices, numerator, denominator = () => 1) => {
    if (indices.some(index => g[index] === null)) return null;
    const n = numerator(g), d = denominator(g);
    return d === 0 ? { invalid: true, indices } : { n, d, indices };
  };
  switch (row) {
    case 0: return [side([0, 1], a => a[0] * a[1]), side([2], a => a[2])];
    case 1: return [side([0, 1, 2, 3], a => a[0] + a[1] + a[2] + a[3]), side([4], a => a[4])];
    case 2: return [side([0, 1], a => a[0] * a[1]), side([2], a => a[2])];
    case 3: return [side([0, 1], a => a[0] + a[1]), side([2], a => a[2]), side([3, 4], a => a[3] * a[4])];
    case 4: return [side([0, 1], a => a[0] - a[1]), side([2], a => a[2])];
    case 5: return [side([0, 1], a => a[0] - a[1]), side([2], a => a[2])];
    case 6: return [side([0], a => a[0]), side([1, 2], a => a[1], a => a[2]),
      side([3, 4, 5], a => a[3], a => a[4] - a[5])];
    case 7: return [side([0, 1], a => a[0] + a[1]), side([2], a => a[2]),
      side([3, 4, 5], a => a[3] * (a[4] - a[5]))];
    case 8: return [side([0, 1], a => a[0] + a[1]), side([2, 3], a => a[2] + a[3]),
      side([4], a => a[4]), side([5, 6], a => a[5] + a[6])];
  }
}

export function conflicts(values) {
  const bad = new Set();
  for (const unit of units) {
    for (const i of unit) {
      if (values[i] && unit.some(j => j !== i && values[j] === values[i])) bad.add(i);
    }
  }
  for (let row = 0; row < 9; row++) {
    const rowSides = sides(values, row);
    const populated = rowSides.filter(Boolean);
    const invalid = populated.some(side => side.invalid);
    const mismatch = populated.length > 1 && populated.some(side =>
      !side.invalid && !populated[0].invalid && side.n * populated[0].d !== populated[0].n * side.d);
    if (invalid || mismatch) {
      const affected = invalid ? populated.filter(side => side.invalid) : populated;
      for (const part of affected) for (const group of part.indices)
        for (const col of groups[row][group]) bad.add(row * 9 + col);
    }
  }
  return bad;
}

export function solved(values) {
  return values.length === 81 && values.every((value, index) =>
    Number.isInteger(value) && value >= 1 && value <= 9 && (!givens[Math.floor(index / 9)][index % 9] ||
      givens[Math.floor(index / 9)][index % 9] === value)) && conflicts(values).size === 0;
}

export function parseArithmeticSudokuState(saved, puzzleId) {
  if (!saved || saved.version !== 1 || saved.puzzleId !== puzzleId
    || !Array.isArray(saved.values) || saved.values.length !== 81
    || !saved.values.every(value => Number.isInteger(value) && value >= 0 && value <= 9)
    || !Array.isArray(saved.notes) || saved.notes.length !== 81
    || !saved.notes.every(note => Array.isArray(note)
      && note.every(value => Number.isInteger(value) && value >= 1 && value <= 9))) return null;
  const fixed = givens.flat();
  if (saved.values.some((value, index) => fixed[index] && value !== fixed[index])) return null;
  const values = [...saved.values];
  return {
    values,
    notes: saved.notes.map((note, index) => values[index]
      ? []
      : [...new Set(note)].sort((a, b) => a - b)),
  };
}

// Classic 9×9 sudoku; the fixed clues trace a circle.
export const givens = [
  [0, 0, 0, 7, 4, 1, 0, 0, 0],
  [0, 1, 7, 6, 0, 8, 9, 2, 0],
  [0, 6, 4, 0, 0, 0, 1, 8, 0],
  [9, 3, 0, 0, 0, 0, 0, 1, 8],
  [7, 4, 0, 0, 0, 0, 0, 9, 5],
  [1, 8, 0, 0, 0, 0, 0, 7, 6],
  [0, 5, 8, 0, 0, 0, 6, 3, 0],
  [0, 9, 1, 3, 0, 4, 7, 5, 0],
  [0, 0, 0, 5, 9, 6, 0, 0, 0],
];
const fixed = givens.flat();

export const units = [
  ...Array.from({length: 9}, (_, r) => Array.from({length: 9}, (_, c) => r * 9 + c)),
  ...Array.from({length: 9}, (_, c) => Array.from({length: 9}, (_, r) => r * 9 + c)),
  ...Array.from({length: 9}, (_, b) => Array.from({length: 9}, (_, n) =>
    (Math.floor(b / 3) * 3 + Math.floor(n / 3)) * 9 + (b % 3) * 3 + n % 3)),
];

export function conflicts(values) {
  const bad = new Set();
  for (const unit of units) {
    for (const i of unit) {
      if (values[i] && unit.some(j => j !== i && values[j] === values[i])) bad.add(i);
    }
  }
  return bad;
}

export function solved(values) {
  return values.length === 81 && values.every((n, i) =>
    Number.isInteger(n) && n >= 1 && n <= 9 && (!fixed[i] || fixed[i] === n)
  ) && conflicts(values).size === 0;
}

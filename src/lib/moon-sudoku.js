// Classic 9×9 sudoku; the fixed clues trace a circle.
export const givens = [
  [0, 0, 0, 2, 4, 1, 0, 0, 0],
  [0, 8, 6, 9, 0, 3, 2, 4, 0],
  [0, 2, 4, 0, 0, 0, 9, 1, 0],
  [6, 1, 0, 0, 0, 0, 0, 7, 4],
  [8, 4, 0, 0, 0, 0, 0, 9, 2],
  [2, 3, 0, 0, 0, 0, 0, 8, 6],
  [0, 6, 2, 0, 0, 0, 8, 3, 0],
  [0, 5, 8, 3, 0, 7, 6, 2, 0],
  [0, 0, 0, 6, 2, 8, 0, 0, 0],
];

export const solution = [
  [5, 9, 3, 2, 4, 1, 7, 6, 8],
  [1, 8, 6, 9, 7, 3, 2, 4, 5],
  [7, 2, 4, 8, 6, 5, 9, 1, 3],
  [6, 1, 9, 5, 8, 2, 3, 7, 4],
  [8, 4, 5, 7, 3, 6, 1, 9, 2],
  [2, 3, 7, 4, 1, 9, 5, 8, 6],
  [9, 6, 2, 1, 5, 4, 8, 3, 7],
  [4, 5, 8, 3, 9, 7, 6, 2, 1],
  [3, 7, 1, 6, 2, 8, 4, 5, 9],
];

// Cells filled with moonlight after completion; corners remain outside the circle.
export const moonArea = [
  [0, 0, 0, 1, 1, 1, 0, 0, 0],
  [0, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 1, 1, 1, 1, 1, 1, 1, 0],
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
  [0, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 0, 1, 1, 1, 0, 0, 0],
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

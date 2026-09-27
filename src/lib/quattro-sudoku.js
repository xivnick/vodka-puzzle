// Photo transcription for the 260928 preview. No solution is stored or searched.
export const givens = [
  [0, 0, 3, 9, 0, 5, 7, 0, 0],
  [1, 0, 0, 0, 0, 0, 0, 0, 9],
  [0, 0, 4, 2, 0, 6, 8, 0, 0],
  [0, 5, 0, 0, 0, 0, 0, 1, 0],
  [9, 0, 0, 0, 4, 0, 0, 0, 5],
  [0, 0, 8, 0, 2, 0, 6, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 3, 0, 1, 0, 9, 0, 7, 0],
  [2, 8, 0, 0, 0, 0, 0, 5, 3],
];
const fixed = givens.flat();
const units = [
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
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const i = r * 9 + c;
      const square = [i, i + 1, i + 9, i + 10];
      if (square.every(j => Number.isInteger(values[j]) && values[j] >= 1 && values[j] <= 9)
        && square.every(j => values[j] % 2 === values[i] % 2)) {
        square.forEach(j => bad.add(j));
      }
    }
  }
  return bad;
}

export function solved(values) {
  return values.length === 81 && values.every((n, i) =>
    Number.isInteger(n) && n >= 1 && n <= 9 && (!fixed[i] || fixed[i] === n)
  ) && conflicts(values).size === 0;
}

// Preview clues. Rows and columns are zero-indexed in the data.
export const givens = [
  [0, 0, 0, 0, 0, 0, 3, 0, 1],
  [0, 6, 0, 8, 0, 9, 2, 0, 0],
  [0, 5, 0, 0, 3, 0, 0, 9, 8],
  [6, 0, 0, 0, 4, 0, 0, 3, 5],
  [0, 0, 4, 5, 0, 3, 8, 0, 0],
  [5, 3, 0, 0, 8, 0, 0, 0, 9],
  [2, 1, 0, 0, 6, 0, 0, 4, 0],
  [0, 0, 9, 2, 0, 1, 0, 8, 0],
  [3, 0, 6, 0, 0, 0, 0, 0, 0],
];

// Upper-left and upper-right boxes: lower inner corners;
// center box: center; lower boxes: upper inner corners.
export const flowers = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 1, 0, 0, 0, 1, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 1, 0, 0, 0, 1, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
];

const fixed = givens.flat();
const flowerIndices = flowers.flat().flatMap((value, index) => value ? [index] : []);
const units = [
  ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, b) => Array.from({ length: 9 }, (_, n) =>
    (Math.floor(b / 3) * 3 + Math.floor(n / 3)) * 9 + (b % 3) * 3 + n % 3)),
];

export function conflicts(values) {
  const bad = new Set();
  for (const unit of units) {
    for (const i of unit) {
      if (values[i] && unit.some(j => j !== i && values[j] === values[i])) bad.add(i);
    }
  }
  for (const i of flowerIndices) {
    const row = Math.floor(i / 9), col = i % 9;
    if (!values[i]) continue;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const r = row + dr, c = col + dc;
      if (r < 0 || r >= 9 || c < 0 || c >= 9) continue;
      const j = r * 9 + c;
      if (values[i] === values[j]) { bad.add(i); bad.add(j); }
    }
  }
  return bad;
}

export function solved(values) {
  return values.length === 81 && values.every((n, i) =>
    Number.isInteger(n) && n >= 1 && n <= 9 && (!fixed[i] || fixed[i] === n)
  ) && conflicts(values).size === 0;
}

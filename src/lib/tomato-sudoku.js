// First playtest draft. Coordinates are zero-indexed; no answer is stored.
export const givens = [
  [0,0,4,0,7,0,0,1,0],
  [6,0,0,1,9,0,0,0,8],
  [0,9,0,3,0,0,0,6,0],
  [8,0,9,0,6,0,4,0,0],
  [0,2,6,8,0,0,0,9,0],
  [0,0,3,0,2,0,0,0,6],
  [9,0,0,0,3,0,2,0,0],
  [0,8,0,4,0,0,0,0,0],
  [0,4,0,2,0,0,0,7,9],
];
export const tomatoes = [1, 8, 14, 28, 35, 45, 50, 56, 70, 77];
export const tomatoDigits = [1, 2, 3, 3, 3, 4, 5, 5, 6, 7];
export const tomatoQuota = { 1: 1, 2: 1, 3: 3, 4: 1, 5: 2, 6: 1, 7: 1 };
export const boardSignature = JSON.stringify([givens, tomatoes, tomatoDigits]);

const fixed = givens.flat();
const tomatoIndices = tomatoes;
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
  for (let n = 1; n <= 9; n++) {
    const matching = tomatoIndices.filter(i => values[i] === n);
    if (matching.length > (tomatoQuota[n] || 0)) matching.forEach(i => bad.add(i));
  }
  return bad;
}

export function solved(values) {
  return values.length === 81 && values.every((n, i) =>
    Number.isInteger(n) && n >= 1 && n <= 9 && (!fixed[i] || fixed[i] === n)
  ) && conflicts(values).size === 0;
}

export function parseTomatoSudokuState(saved, puzzleId) {
  if (!saved || saved.version !== 1 || saved.puzzleId !== puzzleId || saved.boardSignature !== boardSignature
    || !Array.isArray(saved.values) || saved.values.length !== 81
    || !saved.values.every(value => Number.isInteger(value) && value >= 0 && value <= 9)
    || !Array.isArray(saved.notes) || saved.notes.length !== 81
    || !saved.notes.every(note => Array.isArray(note)
      && note.every(value => Number.isInteger(value) && value >= 1 && value <= 9))) return null;
  if (saved.values.some((value, index) => fixed[index] && value !== fixed[index])) return null;
  const values = [...saved.values];
  return {
    values,
    notes: saved.notes.map((note, index) => values[index]
      ? []
      : [...new Set(note)].sort((a, b) => a - b)),
  };
}

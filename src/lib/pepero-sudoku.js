// First playtest: each straight stick has one biscuit handle, then two chocolate cells.
// Only clues and rules are stored; completion never compares against an answer.
export const givens = [
  [0,9,0,0,0,7,0,0,3],
  [0,0,0,0,0,2,0,0,0],
  [7,8,1,0,0,4,2,9,5],
  [3,2,0,0,0,0,0,0,0],
  [1,0,0,0,0,3,5,7,0],
  [0,7,0,0,0,0,3,2,0],
  [0,0,0,7,1,9,0,3,0],
  [0,0,0,2,0,0,0,0,0],
  [0,1,7,0,0,0,0,0,0],
];
export const sticks = [
  [22,13,4],
  [29,38,47],
  [33,34,35],
  [54,63,72],
  [50,49,48],
  [62,53,44],
  [32,31,30],
  [76,77,78],
];
export const boardSignature = JSON.stringify([givens, sticks]);
export const stickTriples = [];
for (let biscuit = 1; biscuit <= 9; biscuit++)
  for (let a = 1; a <= 9; a++)
    for (let b = 1; b <= 9; b++)
      if (new Set([biscuit, a, b]).size === 3 && a + b - biscuit === 11)
        stickTriples.push([biscuit, a, b]);
const fixed = givens.flat();
export const units = [
  ...Array.from({length:9}, (_,r) => Array.from({length:9}, (_,c) => r*9+c)),
  ...Array.from({length:9}, (_,c) => Array.from({length:9}, (_,r) => r*9+c)),
  ...Array.from({length:9}, (_,b) => Array.from({length:9}, (_,n) =>
    (Math.floor(b/3)*3+Math.floor(n/3))*9+(b%3)*3+n%3)),
];
export function conflicts(values) {
  const bad = new Set();
  for (const unit of units) for (const i of unit)
    if (values[i] && unit.some(j => j !== i && values[j] === values[i])) bad.add(i);
  for (const cells of sticks) {
    // Partial input is invalid only when this stick's own arithmetic cannot hold.
    const possible = stickTriples.some(t => cells.every((i,k) => !values[i] || values[i] === t[k]));
    if (!possible) cells.filter(i => values[i]).forEach(i => bad.add(i));
  }
  return bad;
}
export function solved(values) {
  return values.length === 81 && values.every((n,i) =>
    Number.isInteger(n) && n >= 1 && n <= 9 && (!fixed[i] || fixed[i] === n))
    && conflicts(values).size === 0;
}

export function parsePeperoSudokuState(saved, puzzleId) {
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

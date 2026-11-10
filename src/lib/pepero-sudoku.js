// Straight sticks have one biscuit handle and either two or three chocolate cells.
// Only clues and rules are stored; completion never compares against an answer.
export const givens = [
  [9,0,3,0,6,0,0,0,0],
  [0,6,0,0,0,0,4,0,0],
  [0,0,0,3,0,0,0,6,0],
  [0,4,6,2,0,0,0,0,0],
  [2,9,1,0,0,3,0,0,4],
  [0,0,0,1,4,0,0,0,0],
  [1,0,2,0,0,0,5,4,0],
  [0,0,0,0,5,0,1,0,0],
  [0,0,0,0,2,0,0,0,0],
];
export const sticks = [
  [2,3,4],
  [19,28,37],
  [49,40,31],
  [56,65,74],
  [78,79,80],
  [71,62,53],
  [25,24,23,22],
  [72,63,54,45],
];
export const boardSignature = JSON.stringify([givens, sticks]);
const combinationCache = new Map();
export function stickCombinations(length) {
  if (![3, 4].includes(length)) throw new RangeError('Expected a three- or four-cell stick.');
  if (!combinationCache.has(length)) {
    const combinations = [];
    function extend(digits) {
      if (digits.length === length) {
        if (digits.slice(1).reduce((sum,n) => sum+n,0) - digits[0] === 11)
          combinations.push(digits);
        return;
      }
      for (let n=1; n<=9; n++) if (!digits.includes(n)) extend([...digits,n]);
    }
    extend([]);
    combinationCache.set(length, combinations);
  }
  return combinationCache.get(length);
}
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
    const possible = stickCombinations(cells.length).some(t => cells.every((i,k) => !values[i] || values[i] === t[k]));
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

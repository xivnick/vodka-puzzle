// Transcribed from the supplied photo. A, B and C are stored as 10, 11 and 12.
export const symbols = ['1','2','3','4','5','6','7','8','9','A','B','C'];
export const label = value => symbols[value - 1] || '';
export const givens = [
  [0,1,6,0,0,0,0,8,0,5,7,0],
  [4,0,0,11,0,0,0,7,9,0,6,8],
  [7,0,0,2,0,0,11,5,4,0,0,10],
  [0,0,11,8,0,0,5,2,10,0,0,6],
  [0,0,2,0,0,0,9,0,0,0,0,4],
  [3,10,0,0,0,4,1,0,0,0,8,5],
  [10,3,0,0,0,9,8,0,0,2,5,0],
  [0,0,1,0,0,5,0,0,3,10,0,0],
  [0,0,0,9,10,7,0,0,8,0,0,0],
  [2,0,0,6,5,8,0,0,7,0,0,0],
  [5,0,0,3,1,0,0,0,12,0,0,0],
  [0,7,10,0,4,0,0,0,5,6,11,3],
];
export const boardSignature = JSON.stringify(givens);
const fixed = givens.flat();
const units = [
  ...Array.from({length:12}, (_,r) => Array.from({length:12}, (_,c) => r*12+c)),
  ...Array.from({length:12}, (_,c) => Array.from({length:12}, (_,r) => r*12+c)),
  ...Array.from({length:12}, (_,b) => Array.from({length:12}, (_,n) =>
    (Math.floor(b/3)*3+Math.floor(n/4))*12+(b%3)*4+n%4)),
];
export function conflicts(values) {
  const bad = new Set();
  for (const unit of units) for (const i of unit) {
    if (values[i] && unit.some(j => j !== i && values[j] === values[i])) bad.add(i);
  }
  return bad;
}
export function solved(values) {
  return values.length === 144 && values.every((n,i) =>
    Number.isInteger(n) && n >= 1 && n <= 12 && (!fixed[i] || fixed[i] === n)
  ) && conflicts(values).size === 0;
}
export function parseSamsungSudokuState(saved, puzzleId) {
  if (!saved || saved.version !== 1 || saved.puzzleId !== puzzleId || saved.boardSignature !== boardSignature
    || !Array.isArray(saved.values) || saved.values.length !== 144
    || !saved.values.every(n => Number.isInteger(n) && n >= 0 && n <= 12)
    || !Array.isArray(saved.notes) || saved.notes.length !== 144
    || !saved.notes.every(note => Array.isArray(note) && note.every(n => Number.isInteger(n) && n >= 1 && n <= 12))
    || saved.values.some((n,i) => fixed[i] && n !== fixed[i])) return null;
  return { values:[...saved.values], notes:saved.notes.map((note,i) => saved.values[i] ? [] : [...new Set(note)].sort((a,b) => a-b)) };
}

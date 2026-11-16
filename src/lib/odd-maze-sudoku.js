// Transcribed from the supplied photo. Marker indices are zero-based.
export const givens = [
  [0,0,0,8,0,2,3,0,0],
  [0,7,0,0,0,0,8,2,5],
  [0,2,0,0,9,0,0,0,0],
  [5,0,0,0,6,0,0,0,0],
  [0,0,7,5,3,8,2,0,0],
  [0,0,0,0,4,0,0,0,9],
  [0,0,9,0,7,0,6,1,0],
  [3,5,0,1,0,0,0,7,0],
  [0,0,0,0,0,6,0,0,0],
];
export const endpoints = [0, 80];
export const boardSignature = JSON.stringify([givens, endpoints]);
const fixed = givens.flat();
const units = [
  ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, b) => Array.from({ length: 9 }, (_, n) =>
    (Math.floor(b / 3) * 3 + Math.floor(n / 3)) * 9 + (b % 3) * 3 + n % 3)),
];

// Check only the player's current digits; no answer or solution search is needed.
export function hasOddPath(values) {
  if (values.length !== 81 || endpoints.some(i => values[i] % 2 !== 1)) return false;
  const visited = new Set([endpoints[0]]);
  const queue = [endpoints[0]];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    if (i === endpoints[1]) return true;
    const r = Math.floor(i / 9), c = i % 9;
    const neighbors = [];
    if (r > 0) neighbors.push(i - 9);
    if (r < 8) neighbors.push(i + 9);
    if (c > 0) neighbors.push(i - 1);
    if (c < 8) neighbors.push(i + 1);
    for (const next of neighbors) {
      if (!visited.has(next) && values[next] % 2 === 1) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

export function conflicts(values) {
  const bad = new Set();
  for (const unit of units) {
    for (const i of unit) {
      if (values[i] && unit.some(j => j !== i && values[j] === values[i])) bad.add(i);
    }
  }
  for (const i of endpoints) if (values[i] && values[i] % 2 !== 1) bad.add(i);
  if (values.length === 81 && values.every(n => Number.isInteger(n) && n >= 1 && n <= 9)
    && !hasOddPath(values)) endpoints.forEach(i => bad.add(i));
  return bad;
}

export function solved(values) {
  return values.length === 81 && values.every((n, i) =>
    Number.isInteger(n) && n >= 1 && n <= 9 && (!fixed[i] || fixed[i] === n)
  ) && conflicts(values).size === 0;
}

export function parseOddMazeSudokuState(saved, puzzleId) {
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

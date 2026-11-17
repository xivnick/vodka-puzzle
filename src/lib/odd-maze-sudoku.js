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

function neighbors(i) {
  const r = Math.floor(i / 9), c = i % 9;
  return [r > 0 ? i - 9 : -1, r < 8 ? i + 9 : -1,
    c > 0 ? i - 1 : -1, c < 8 ? i + 1 : -1].filter(next => next >= 0);
}

function traceOddRegion(values, start) {
  const cells = new Set();
  let open = false;
  if (values[start] % 2 !== 1) return { cells, open };
  cells.add(start);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    for (const next of neighbors(queue[head])) {
      if (values[next] === 0) open = true;
      if (!cells.has(next) && values[next] % 2 === 1) {
        cells.add(next);
        queue.push(next);
      }
    }
  }
  return { cells, open };
}

// Check only the player's current digits; no answer or solution search is needed.
export function hasOddPath(values) {
  return values.length === 81 && traceOddRegion(values, endpoints[0]).cells.has(endpoints[1]);
}

export function oddPathColors(values) {
  const green = new Set(), red = new Set();
  if (values.length !== 81) return { green, red };
  for (const start of endpoints) {
    const { cells, open } = traceOddRegion(values, start);
    // A region joining both circles is valid even when surrounded by even cells.
    const connected = endpoints.every(i => cells.has(i));
    const color = open || connected ? green : red;
    cells.forEach(i => color.add(i));
  }
  return { green, red };
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
    notes: saved.notes.map((note, index) => fixed[index]
      ? []
      : [...new Set(note)].sort((a, b) => a - b)),
  };
}

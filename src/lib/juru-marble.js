const quarter = [[0, 4], [0, 5], [1, 5], [1, 6], [1, 7], [2, 7], [3, 7], [3, 8]];
export const marblePath = Array.from({length: 4}, (_, turn) => quarter.map(([r, c]) => {
  for (let i = 0; i < turn; i++) [r, c] = [c, 8 - r];
  return [r, c];
})).flat();

// Follow only the currently known chain. Keep earlier glasses and derive later
// ones again after every edit so removed or changed inputs leave no stale marks.
export function traceGlasses(path, values) {
  const stops = [0];
  let distance = 0;
  while (distance < path.length) {
    const [r, c] = path[distance];
    const number = values[r * 9 + c];
    if (!number) break;
    distance += number;
    if (distance >= path.length) {
      if (distance > path.length) stops.push(distance % path.length);
      break;
    }
    stops.push(distance);
  }
  return { stops, distance };
}

export function stopConflicts(path, values, stops) {
  const cells = stops.map(index => {
    const [r, c] = path[index];
    return { r, c, cell: r * 9 + c };
  });
  const bad = new Set();
  const reasons = [];
  const rules = [
    ['정차 행 중복', ({ r }) => r],
    ['정차 열 중복', ({ c }) => c],
    ['정차 상자 중복', ({ r, c }) => Math.floor(r / 3) * 3 + Math.floor(c / 3)],
    ['정차 숫자 중복', ({ cell }) => values[cell] || null],
  ];
  for (const [reason, keyFor] of rules) {
    const groups = new Map();
    for (const cell of cells) {
      const key = keyFor(cell);
      if (key === null) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(cell.cell);
    }
    let conflict = false;
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      conflict = true;
      group.forEach(cell => bad.add(cell));
    }
    if (conflict) reasons.push(reason);
  }
  return { bad, reasons };
}

export function sudokuConflicts(values) {
  const bad = new Set();
  for (let unit = 0; unit < 27; unit++) {
    const groups = new Map();
    for (let k = 0; k < 9; k++) {
      const i = unit < 9 ? unit * 9 + k : unit < 18 ? k * 9 + unit - 9
        : (Math.floor((unit - 18) / 3) * 3 + Math.floor(k / 3)) * 9 + (unit - 18) % 3 * 3 + k % 3;
      if (!values[i]) continue;
      if (!groups.has(values[i])) groups.set(values[i], []);
      groups.get(values[i]).push(i);
    }
    for (const group of groups.values()) if (group.length > 1) group.forEach(i => bad.add(i));
  }
  return bad;
}

export function marbleSolved(values, givens) {
  if (values.length !== 81 || values.some((n, i) => !Number.isInteger(n) || n < 1 || n > 9 || givens[i] && givens[i] !== n)) return false;
  const { stops, distance } = traceGlasses(marblePath, values);
  return distance === 32 && sudokuConflicts(values).size === 0 && stopConflicts(marblePath, values, stops).bad.size === 0;
}

export function parseMarbleState(saved, puzzleId, givens) {
  if (!saved || saved.version !== 1 || saved.puzzleId !== puzzleId
    || !Array.isArray(saved.values) || saved.values.length !== 81
    || saved.values.some((n, i) => !Number.isInteger(n) || n < 0 || n > 9 || givens[i] && givens[i] !== n)
    || !Array.isArray(saved.notes) || saved.notes.length !== 81
    || saved.notes.some(note => !Array.isArray(note) || note.some(n => !Number.isInteger(n) || n < 1 || n > 9))) return null;
  return { values: saved.values.slice(), notes: saved.notes.map((note, i) => saved.values[i] ? [] : [...new Set(note)].sort((a, b) => a - b)) };
}

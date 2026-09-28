// Design-time technique audit for the flower sudoku preview. No answer is stored.
import { givens, flowers, solved } from '../src/lib/flower-sudoku.js';
import { grade as gradeClassic } from '../src/lib/sudoku.js';

const units = [
  ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, b) => Array.from({ length: 9 }, (_, n) =>
    (Math.floor(b / 3) * 3 + Math.floor(n / 3)) * 9 + (b % 3) * 3 + n % 3)),
];
const peers = Array.from({ length: 81 }, (_, i) => new Set(units.filter(unit => unit.includes(i)).flat().filter(j => j !== i)));
for (const [i, isFlower] of flowers.flat().entries()) {
  if (!isFlower) continue;
  const row = Math.floor(i / 9), col = i % 9;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const r = row + dr, c = col + dc;
    if (r < 0 || r >= 9 || c < 0 || c >= 9) continue;
    const j = r * 9 + c;
    peers[i].add(j);
    peers[j].add(i);
  }
}

export function gradeFlower(board) {
  if (!Array.isArray(board) || board.length !== 81 || board.some(n => !Number.isInteger(n) || n < 0 || n > 9)) {
    throw new Error('Expected 81 digits from 0 to 9');
  }
  const values = board.slice();
  const candidates = values.map((n, i) => new Set(n ? [] : Array.from({ length: 9 }, (_, v) => v + 1)
    .filter(v => ![...peers[i]].some(j => values[j] === v))));
  const techniques = { single: 0, hiddenSingle: 0, locked: 0, pair: 0 };
  const place = (i, n, technique) => {
    values[i] = n;
    candidates[i].clear();
    for (const j of peers[i]) candidates[j].delete(n);
    techniques[technique]++;
  };

  for (let step = 0; step < 2000; step++) {
    if (values.every(Boolean)) return { solved: solved(values), techniques };
    if (candidates.some((set, i) => !values[i] && set.size === 0)) break;
    let changed = false;
    for (let i = 0; i < 81; i++) if (!values[i] && candidates[i].size === 1) {
      place(i, [...candidates[i]][0], 'single'); changed = true; break;
    }
    if (changed) continue;
    findHidden: for (const unit of units) for (let n = 1; n <= 9; n++) {
      const cells = unit.filter(i => candidates[i].has(n));
      if (cells.length === 1) { place(cells[0], n, 'hiddenSingle'); changed = true; break findHidden; }
    }
    if (changed) continue;
    findLocked: for (const unit of units) for (let n = 1; n <= 9; n++) {
      const cells = unit.filter(i => candidates[i].has(n));
      if (cells.length < 2) continue;
      for (const other of units) {
        if (unit === other || !cells.every(i => other.includes(i))) continue;
        const targets = other.filter(i => !unit.includes(i) && candidates[i].has(n));
        if (!targets.length) continue;
        targets.forEach(i => candidates[i].delete(n));
        techniques.locked++;
        changed = true;
        break findLocked;
      }
    }
    if (changed) continue;
    findPair: for (const unit of units) for (const i of unit) {
      if (candidates[i].size !== 2) continue;
      const nums = [...candidates[i]];
      const twins = unit.filter(j => candidates[j].size === 2 && nums.every(n => candidates[j].has(n)));
      if (twins.length !== 2) continue;
      const targets = unit.filter(j => !twins.includes(j) && nums.some(n => candidates[j].has(n)));
      if (!targets.length) continue;
      targets.forEach(j => nums.forEach(n => candidates[j].delete(n)));
      techniques.pair++;
      changed = true;
      break findPair;
    }
    if (!changed) break;
  }
  return { solved: false, techniques, remaining: values.filter(n => !n).length };
}

if (process.argv[1]?.endsWith('/grade-flower-sudoku.mjs')) {
  const board = givens.flat();
  const classic = gradeClassic(board.join(''));
  console.log(JSON.stringify({
    clues: board.filter(Boolean).length,
    withFlowerRule: gradeFlower(board),
    withoutFlowerRule: { solved: classic.solved, techniques: classic.techniques },
  }, null, 2));
}

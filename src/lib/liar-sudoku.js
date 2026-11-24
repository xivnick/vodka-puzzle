import { units } from './sudoku.js';

export const givens = [
  '075020810',
  '609301007',
  '300006054',
  '091503090',
  '200040005',
  '050209860',
  '940700008',
  '700105406',
  '014090570',
].flatMap(row => [...row].map(Number));

export const isDigit = value => Number.isInteger(value) && value >= 1 && value <= 9;

export function inspectLiarSudoku(values, clues = givens) {
  const changed = clues.map((clue, index) => Boolean(clue && values[index] && values[index] !== clue));
  const board = values.slice();
  for (const unit of units) {
    if (!unit.some(index => changed[index])) continue;
    for (const index of unit) {
      if (!values[index] && clues[index]) board[index] = clues[index];
    }
  }

  const conflicts = new Set();
  for (const unit of units) {
    for (const index of unit) {
      if (board[index] && unit.some(other => other !== index && board[other] === board[index])) {
        conflicts.add(index);
      }
    }
  }

  const complete = board.length === 81 && board.every(isDigit) && conflicts.size === 0 && units.every(unit =>
    unit.filter(index => changed[index]).length === 1
  );
  return { board, conflicts, complete };
}

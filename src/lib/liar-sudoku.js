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
  const conflicts = new Set();
  for (const unit of units) {
    for (const index of unit) {
      if (values[index] && unit.some(other => other !== index && values[other] === values[index])) {
        conflicts.add(index);
      }
    }
  }

  const complete = values.length === 81 && values.every(isDigit) && conflicts.size === 0 && units.every(unit =>
    unit.filter(index => clues[index] && values[index] !== clues[index]).length === 1
  );
  return { conflicts, complete };
}

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

export function isLiarSudokuComplete(values, clues = givens) {
  if (values.length !== 81 || clues.length !== 81) return false;
  const board = clues.map((clue, index) => values[index] === 0 ? clue : values[index]);
  return board.every(isDigit) && units.every(unit =>
    new Set(unit.map(index => board[index])).size === 9
    && unit.filter(index => clues[index] && board[index] !== clues[index]).length === 1
  );
}

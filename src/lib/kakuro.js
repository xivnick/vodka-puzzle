import { kropkiEdges, matchesKropkiDot } from './kropki.js';

const white = null;
const wall = {};
const down = sum => ({ down: sum });
const right = sum => ({ right: sum });
const both = (right, down) => ({ right, down });

const originalBoard = [
  [wall, down(15), down(39), down(20), down(6), down(28), wall, down(40), down(12)],
  [wall, white, white, white, white, white, both(6, 19), white, white],
  [right(38), white, white, white, white, white, white, white, white],
  [right(19), white, white, white, right(7), white, white, white, wall],
  [wall, white, white, both(24, 24), white, white, white, white, white],
  [right(35), white, white, white, white, white, both(14, 24), white, white],
  [wall, right(13), white, white, white, both(14, 14), white, white, white],
  [right(37), white, white, white, white, white, white, white, white],
  [right(5), white, white, right(22), white, white, white, white, white],
];

const kropkiBoard = [
  [wall, down(20), down(21), wall, wall, wall, wall, wall, down(20), down(21)],
  [right(20), white, white, white, wall, white, white, down(21), white, white],
  [right(21), white, white, white, wall, white, white, white, white, white],
  [right(20), white, white, white, white, both(21, 21), white, white, white, white],
  [wall, white, white, white, white, white, white, white, white, white],
  [wall, down(21), wall, both(20, 20), white, white, white, down(21), wall, wall],
  [wall, white, white, white, white, white, white, white, white, white],
  [right(20), white, white, white, white, right(20), white, white, white, white],
  [right(21), white, white, white, white, white, right(21), white, white, white],
  [wall, white, white, wall, white, white, wall, white, white, white],
];

const kropki = {
  size: kropkiBoard.length,
  horizontal: ['.........', '.....W...', '..W..W..W', '..BW.....', '...B..W..', '.........', '......W..', '.W....B.W', '..WWW....', '.W.....W.'],
  vertical: ['..........', '..W..W...W', '..BW..W...', '..B......B', '..........', '..........', '.W.WW..WW.', '.W........', '..B.BW..WW'],
};
const grid = kropkiBoard.flat();
export const kakuroPuzzles = {
  '261118_01': { board: originalBoard, edges: [] },
  '261119_01': { board: kropkiBoard, edges: kropkiEdges(kropki).filter(({ a, b }) => grid[a] === white && grid[b] === white) },
};
export const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function collectRuns(board) {
  const size = board.length;
  const runs = [];
  for (const [row, line] of board.entries()) {
    for (const [column, clue] of line.entries()) {
      if (clue === white) continue;
      for (const [direction, dr, dc] of [['right', 0, 1], ['down', 1, 0]]) {
        const cells = [];
        let r = row + dr, c = column + dc;
        while (board[r]?.[c] === white) {
          cells.push(r * size + c);
          r += dr;
          c += dc;
        }
        if (cells.length) runs.push({ id: `${row * size + column}-${direction}`, cells, sum: clue[direction] });
      }
    }
  }
  return runs;
}

export function createInspector({ board, edges }) {
  const grid = board.flat();
  const runs = collectRuns(board);
  return function inspect(values) {
    const satisfied = new Set();
    const conflicts = new Set();
    const complete = grid.every((cell, index) => cell !== white || digits.includes(values[index]));
    for (const { id, cells, sum } of runs) {
      const seen = new Map();
      let total = 0;
      let filled = 0;
      for (const index of cells) {
        const value = values[index];
        if (!digits.includes(value)) continue;
        if (seen.has(value)) {
          conflicts.add(seen.get(value));
          conflicts.add(index);
        }
        seen.set(value, index);
        filled++;
        total += value;
      }
      if (seen.size === cells.length && total === sum) satisfied.add(id);
      if (sum != null && (total > sum || (filled === cells.length && total !== sum))) {
        cells.filter(index => values[index]).forEach(index => conflicts.add(index));
      }
    }
    for (const { a, b, dot } of edges) {
      if (values[a] && values[b] && !matchesKropkiDot(values[a], values[b], dot)) {
        conflicts.add(a);
        conflicts.add(b);
      }
    }
    return { complete: complete && !conflicts.size, conflicts, satisfied };
  };
}

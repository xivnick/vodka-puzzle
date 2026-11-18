const white = null;
const wall = {};
const down = sum => ({ down: sum });
const right = sum => ({ right: sum });
const both = (right, down) => ({ right, down });

export const board = [
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

export const size = board.length;
export const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
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
      if (cells.length) runs.push({ cells, sum: clue[direction] });
    }
  }
}

export function inspect(values) {
  const conflicts = new Set();
  let complete = true;
  for (const { cells, sum } of runs) {
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
    if (filled !== cells.length) complete = false;
    if (sum != null && (total > sum || (filled === cells.length && total !== sum))) {
      cells.filter(index => values[index]).forEach(index => conflicts.add(index));
    }
  }
  return { complete: complete && !conflicts.size, conflicts };
}

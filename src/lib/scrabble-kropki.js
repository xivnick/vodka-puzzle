export const size = 11;

export const words = [
  'ALGERIA', 'ANDORRA', 'ANGOLA', 'AUSTRALIA', 'GHANA', 'GRENADA',
  'GUINEA', 'MALI', 'NAURU', 'NIGER', 'PERU', 'RWANDA',
  'SAUDIARABIA', 'SOMALIA', 'TOGO', 'TONGA', 'UGANDA', 'USA',
];

// The row and column identify the cell before each marked edge, starting at 1.
export const dots = [
  { row: 1, column: 3, direction: 'across', color: 'white' },
  { row: 2, column: 1, direction: 'down', color: 'white' },
  { row: 2, column: 3, direction: 'down', color: 'white' },
  { row: 2, column: 5, direction: 'down', color: 'black' },
  { row: 3, column: 1, direction: 'across', color: 'white' },
  { row: 4, column: 10, direction: 'down', color: 'black' },
  { row: 5, column: 4, direction: 'across', color: 'black' },
  { row: 6, column: 6, direction: 'across', color: 'black' },
  { row: 7, column: 2, direction: 'down', color: 'white' },
  { row: 9, column: 5, direction: 'across', color: 'white' },
  { row: 9, column: 6, direction: 'across', color: 'white' },
];

const directions = ['across', 'down'];

function cellIndex(direction, line, offset, width) {
  return direction === 'across' ? line * width + offset : offset * width + line;
}

export function inspectScrabble(values, width = size, wordBank = words, clues = dots) {
  const wordSet = new Set(wordBank);
  const counts = new Map();
  const edges = new Map();
  const neighbors = values.map(() => []);
  let extraRun = false;

  for (const direction of directions) {
    for (let line = 0; line < width; line++) {
      let offset = 0;
      while (offset < width) {
        const cells = [];
        while (offset < width) {
          const index = cellIndex(direction, line, offset++, width);
          if (!values[index]) break;
          cells.push(index);
        }
        if (cells.length < 2) continue;

        const word = cells.map(index => values[index]).join('');
        if (wordSet.has(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
        else extraRun = true;

        for (let split = 1; split < cells.length; split++) {
          const before = cells[split - 1];
          const after = cells[split];
          neighbors[before].push(after);
          neighbors[after].push(before);
          if (wordSet.has(word)) edges.set(`${before}:${direction}`, [split, cells.length - split]);
        }
      }
    }
  }

  const satisfiedDots = clues.map(({ row, column, direction, color }) => {
    const lengths = edges.get(`${(row - 1) * width + column - 1}:${direction}`);
    if (!lengths) return false;
    const [first, second] = lengths;
    return color === 'white' ? Math.abs(first - second) === 1 : first === 2 * second || second === 2 * first;
  });
  const first = values.findIndex(Boolean);
  const connected = new Set(first < 0 ? [] : [first]);
  for (const index of connected) {
    for (const neighbor of neighbors[index]) connected.add(neighbor);
  }
  const solved = !extraRun && wordBank.every(word => counts.get(word) === 1) &&
    satisfiedDots.every(Boolean) && connected.size === values.filter(Boolean).length;
  return { counts, satisfiedDots, solved };
}

export function parseScrabbleState(saved, puzzleId) {
  if (saved?.version !== 1 || saved.puzzleId !== puzzleId || !Array.isArray(saved.values) ||
      saved.values.length !== size ** 2 || !saved.values.every(letter =>
        typeof letter === 'string' && (letter === '' || /^[A-Z]$/.test(letter)))) return null;
  return [...saved.values];
}

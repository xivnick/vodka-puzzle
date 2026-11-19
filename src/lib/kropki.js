// W: white, B: black, .: no dot. Horizontal rows list left/right edges;
// vertical rows list upper/lower edges. Transcribed from the supplied photos.
export const kropkiPuzzles = [
  {
    id: '261117_01', size: 5, difficulty: 1,
    horizontal: ['.B..', '...B', 'W..W', 'BW..', '.WBW'],
    vertical: ['.WWWW', 'W..WB', 'BW..W', 'BWWW.'],
  },
  {
    id: '261117_02', size: 6, difficulty: 2,
    horizontal: ['..WW.', '.B..W', 'WB...', '....W', 'BW..W', 'BWW.B'],
    vertical: ['WW..W.', '.W....', '....W.', 'WWW...', 'W.....'],
  },
  {
    id: '261117_03', size: 8, difficulty: 3,
    horizontal: ['..W.WBW', '...W..W', '.W....W', '..W...B', '.BW..W.', 'B.W.W.B', '.WW.WWB', 'W..B.W.'],
    vertical: ['....WB..', '...WBBWW', '..WB..WW', '.B.W..B.', '..B.W...', '...WB.WW', 'W.W.BB..'],
  },
].map(puzzle => ({ ...puzzle, digits: Array.from({ length: puzzle.size }, (_, index) => index + 1) }));

export function kropkiEdges(puzzle) {
  const edges = [];
  puzzle.horizontal.forEach((row, r) => [...row].forEach((dot, c) => edges.push({ a: r * puzzle.size + c, b: r * puzzle.size + c + 1, dot, x: c + 1, y: r + .5 })));
  puzzle.vertical.forEach((row, r) => [...row].forEach((dot, c) => edges.push({ a: r * puzzle.size + c, b: (r + 1) * puzzle.size + c, dot, x: c + .5, y: r + 1 })));
  return edges;
}

export function parseKropkiState(puzzle, saved, puzzleId) {
  if (saved?.version !== 1 || saved.puzzleId !== puzzleId || !Array.isArray(saved.values) || saved.values.length !== puzzle.size ** 2 ||
    !saved.values.every(value => value === 0 || puzzle.digits.includes(value))) return null;
  if (saved.notes !== undefined && (!Array.isArray(saved.notes) || saved.notes.length !== saved.values.length ||
    !saved.notes.every(note => Array.isArray(note) && note.every(value => puzzle.digits.includes(value))))) return null;
  return {
    values: [...saved.values],
    notes: saved.values.map((value, index) => [...new Set(saved.notes?.[index] || [])].sort((a, b) => a - b)),
  };
}

export function matchesKropkiDot(left, right, dot) {
  const consecutive = Math.abs(left - right) === 1;
  const double = left === 2 * right || right === 2 * left;
  if (dot === 'W') return consecutive;
  if (dot === 'B') return double;
  return !consecutive && !double;
}

// Inspect player entries only; do not search for a solution.
export function inspectKropki(puzzle, values) {
  const conflicts = new Set();
  if (!parseKropkiState(puzzle, { version: 1, puzzleId: '', values }, '')) return { complete: false, conflicts };
  const checkLine = indexes => {
    for (const digit of puzzle.digits) {
      const matches = indexes.filter(index => values[index] === digit);
      if (matches.length > 1) matches.forEach(index => conflicts.add(index));
    }
  };
  for (let line = 0; line < puzzle.size; line++) {
    checkLine(Array.from({ length: puzzle.size }, (_, c) => line * puzzle.size + c));
    checkLine(Array.from({ length: puzzle.size }, (_, r) => r * puzzle.size + line));
  }
  for (const { a, b, dot } of kropkiEdges(puzzle)) {
    if (!values[a] || !values[b]) continue;
    if (!matchesKropkiDot(values[a], values[b], dot)) {
      conflicts.add(a); conflicts.add(b);
    }
  }
  return { complete: values.every(Boolean) && conflicts.size === 0, conflicts };
}

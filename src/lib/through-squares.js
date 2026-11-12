export const throughSquares261112 = {
  size: 13, start: 0, finish: 168,
  // Zero-based top-left cells of the 2×2 squares, transcribed from the image.
  squares: [
    [0, 3], [0, 6], [0, 11], [1, 0], [1, 9], [2, 4],
    [3, 1], [3, 6], [3, 8], [3, 11], [4, 3],
    [5, 1], [5, 6], [5, 8], [5, 11], [6, 3],
    [7, 0], [7, 5], [7, 8], [7, 10], [8, 3],
    [9, 6], [9, 9], [10, 1], [10, 11], [11, 3], [11, 5], [11, 8],
  ],
};
export const edgeKey = (a, b) => `${Math.min(a, b)}:${Math.max(a, b)}`;
export function adjacent(puzzle, a, b) {
  const n = puzzle.size;
  return Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a < n * n && b < n * n &&
    Math.abs(Math.floor(a / n) - Math.floor(b / n)) + Math.abs(a % n - b % n) === 1;
}
export function parseThroughSquaresState(puzzle, saved, puzzleId) {
  if (saved?.version !== 1 || saved.puzzleId !== puzzleId || !Array.isArray(saved.edges)) return null;
  const edges = new Set();
  for (const key of saved.edges) {
    if (typeof key !== 'string' || !/^\d+:\d+$/.test(key)) return null;
    const [a, b] = key.split(':').map(Number);
    if (!adjacent(puzzle, a, b)) return null;
    edges.add(edgeKey(a, b));
  }
  return edges;
}
// Check only the player's drawn edges; do not search for a solution.
export function inspectThroughSquares(puzzle, edges) {
  const graph = new Map(), conflicts = new Set();
  for (const key of edges) {
    const [a, b] = key.split(':').map(Number);
    if (!adjacent(puzzle, a, b)) return { complete: false, conflicts, visits: [] };
    for (const [u, v] of [[a, b], [b, a]]) {
      if (!graph.has(u)) graph.set(u, []);
      graph.get(u).push(v);
    }
  }
  for (const [cell, neighbors] of graph) {
    if (neighbors.length > (cell === puzzle.start || cell === puzzle.finish ? 1 : 2)) conflicts.add(cell);
  }
  const visits = puzzle.squares.map(([r, c]) => {
    const cells = [r * puzzle.size + c, r * puzzle.size + c + 1, (r + 1) * puzzle.size + c, (r + 1) * puzzle.size + c + 1];
    const visited = cells.filter(cell => graph.has(cell));
    if (visited.length > 1) visited.forEach(cell => conflicts.add(cell));
    return visited.length;
  });
  const seen = new Set(), pending = graph.has(puzzle.start) ? [puzzle.start] : [];
  while (pending.length) {
    const cell = pending.pop();
    if (seen.has(cell)) continue;
    seen.add(cell); pending.push(...graph.get(cell));
  }
  const degreesMatch = graph.get(puzzle.start)?.length === 1 && graph.get(puzzle.finish)?.length === 1 &&
    [...graph].every(([cell, neighbors]) => neighbors.length === (cell === puzzle.start || cell === puzzle.finish ? 1 : 2));
  return { conflicts, visits, complete: Boolean(degreesMatch && seen.size === graph.size && visits.every(count => count === 1) && !conflicts.size) };
}

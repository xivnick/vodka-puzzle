export const arrows261023 = {
  cells: [
    [3, 4, 5, 3, 4, 4],
    [2, 4, 3, 3, 2, 4],
    [6, 2, 3, 3, 3, 4],
    [2, 4, 1, 2, 3, 2],
    [5, 4, 6, 4, 3, 6],
    [1, 3, 3, 3, 2, 2],
  ],
};
export const directions = [
  { dr: -1, dc: -1, label: '북서' }, { dr: -1, dc: 0, label: '북' }, { dr: -1, dc: 1, label: '북동' },
  { dr: 0, dc: -1, label: '서' }, { dr: 0, dc: 1, label: '동' },
  { dr: 1, dc: -1, label: '남서' }, { dr: 1, dc: 0, label: '남' }, { dr: 1, dc: 1, label: '남동' },
];
export function sourcesFor(puzzle) {
  const n = puzzle.cells.length;
  return [
    ...Array.from({ length: n }, (_, c) => ({ r: -1, c })),
    ...Array.from({ length: n }, (_, r) => ({ r, c: n })),
    ...Array.from({ length: n }, (_, c) => ({ r: n, c })),
    ...Array.from({ length: n }, (_, r) => ({ r, c: -1 })),
  ];
}
export function rayCells(puzzle, source, direction) {
  const d = directions[direction];
  if (!source || !d) return [];
  const n = puzzle.cells.length, result = [];
  let r = source.r + d.dr, c = source.c + d.dc;
  while (r >= 0 && r < n && c >= 0 && c < n) {
    result.push([r, c]); r += d.dr; c += d.dc;
  }
  return result;
}
export function analyzeArrows(puzzle, arrows) {
  const sources = sourcesFor(puzzle);
  const counts = puzzle.cells.map(row => row.map(() => 0));
  let placed = 0;
  sources.forEach((source, i) => {
    if (!Number.isInteger(arrows[i])) return;
    const ray = rayCells(puzzle, source, arrows[i]);
    if (!ray.length) return;
    placed++;
    ray.forEach(([r, c]) => counts[r][c]++);
  });
  return { counts, complete: placed === sources.length && puzzle.cells.every((row, r) => row.every((value, c) => counts[r][c] === value)) };
}
export function parseArrowsState(puzzle, saved, puzzleId) {
  const sources = sourcesFor(puzzle);
  if (saved?.version !== 1 || saved.puzzleId !== puzzleId || !Array.isArray(saved.arrows) || saved.arrows.length !== sources.length) return null;
  if (!saved.arrows.every((d, i) => d === null || Number.isInteger(d) && rayCells(puzzle, sources[i], d).length > 0)) return null;
  return [...saved.arrows];
}

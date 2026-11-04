export const dartsPuzzles = {
  '261104_01': { number: 1, target: 2021, darts: 4, scores: [549, 488, 198, 448, 512, 966, 543, 753, 409, 212, 565, 200, 1410] },
  '261104_02': { number: 2, target: 1484, darts: 4, scores: [5, 37, 14, 87, 21, 99, 1240, 38, 1274, 120, 78, 1266, 55] },
};

export function inspectDarts(selected, puzzle) {
  const valid = Array.isArray(selected) && selected.length <= puzzle.darts &&
    new Set(selected).size === selected.length && selected.every(index => Number.isInteger(index) && index >= 0 && index < puzzle.scores.length);
  const sum = valid ? selected.reduce((total, index) => total + puzzle.scores[index], 0) : 0;
  return { valid, sum, solved: valid && selected.length === puzzle.darts && sum === puzzle.target };
}

export function parseDartsState(saved, puzzleId) {
  const puzzle = dartsPuzzles[puzzleId];
  if (!puzzle || !saved || saved.version !== 1 || saved.puzzleId !== puzzleId || !inspectDarts(saved.selected, puzzle).valid) return null;
  return { selected: [...saved.selected] };
}

// Clockwise quadrants start at the upper left, matching the supplied boards.
export function dartRegion(index) {
  if (index === 12) return { path: 'M 273 240 A 33 33 0 1 0 207 240 A 33 33 0 1 0 273 240 Z', x: 240, y: 240 };
  const quadrant = index % 4;
  const [inner, outer] = [[154, 220], [88, 154], [33, 88]][Math.floor(index / 4)];
  const start = (quadrant * 90 + 180) * Math.PI / 180;
  const end = start + Math.PI / 2;
  const point = (radius, angle) => [240 + radius * Math.cos(angle), 240 + radius * Math.sin(angle)];
  const a = point(outer, start), b = point(outer, end), c = point(inner, end), d = point(inner, start);
  const [x, y] = point((inner + outer) / 2, (start + end) / 2);
  return { path: `M ${a} A ${outer} ${outer} 0 0 1 ${b} L ${c} A ${inner} ${inner} 0 0 0 ${d} Z`, x, y };
}

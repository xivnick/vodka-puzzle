// Region transcription of the supplied 261010 photo. No solution is stored.
export const size = 10;
export const starsPerUnit = 2;
export const regions = [
  [0,0,0,0,1,1,1,2,2,2],
  [0,3,3,3,1,2,1,2,4,2],
  [0,3,1,1,1,2,2,2,4,2],
  [0,3,3,3,3,3,3,3,4,2],
  [5,5,5,6,5,5,5,3,4,2],
  [5,6,6,6,5,7,7,3,4,2],
  [5,5,5,5,5,7,4,4,4,2],
  [8,7,7,7,7,7,4,9,8,2],
  [8,9,9,9,9,9,9,9,8,2],
  [8,8,8,8,8,8,8,8,8,2],
];
export const puzzles = {
  '261010_01': {title:'261010 스타배틀 1', regions},
  '261010_02': {
    title:'261010 스타배틀 2',
    regions: [
      [0,0,0,0,1,1,1,1,1,1],
      [0,2,2,2,2,2,2,2,2,1],
      [0,0,0,0,3,3,3,3,2,1],
      [4,4,4,0,3,5,5,5,2,1],
      [4,6,3,3,3,5,7,7,7,7],
      [4,6,5,5,5,5,8,8,8,7],
      [4,6,6,6,6,6,6,6,8,7],
      [4,9,9,9,9,9,9,9,8,7],
      [4,4,4,4,4,4,4,9,8,7],
      [9,9,9,9,9,9,9,9,8,8],
    ],
  },
};
function makeUnits(regionGrid) {
  const flat = regionGrid.flat();
  return [
    ...Array.from({length:size}, (_, r) => Array.from({length:size}, (_, c) => r * size + c)),
    ...Array.from({length:size}, (_, c) => Array.from({length:size}, (_, r) => r * size + c)),
    ...Array.from({length:size}, (_, region) => flat.flatMap((id, i) => id === region ? [i] : [])),
  ];
}
const puzzleUnits = new Map(Object.values(puzzles).map(puzzle => [puzzle.regions, makeUnits(puzzle.regions)]));
export const units = puzzleUnits.get(regions);

// 0 = blank, 1 = star, 2 = cross note.
export function analyze(values, regionGrid = regions) {
  const units = puzzleUnits.get(regionGrid);
  const bad = new Set();
  const counts = units.map(unit => unit.filter(i => values[i] === 1).length);
  units.forEach((unit, index) => {
    if (counts[index] > starsPerUnit) unit.filter(i => values[i] === 1).forEach(i => bad.add(i));
  });
  values.forEach((value, i) => {
    if (value !== 1) return;
    const r = Math.floor(i / size), c = i % size;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < size && cc >= 0 && cc < size && values[rr * size + cc] === 1) {
        bad.add(i);
        bad.add(rr * size + cc);
      }
    }
  });
  return {
    bad, counts,
    complete: values.length === size * size && values.every(n => [0,1,2].includes(n))
      && counts.every(count => count === starsPerUnit) && bad.size === 0,
  };
}

export function parseStarBattleState(saved, puzzleId) {
  if (!saved || saved.version !== 1 || saved.puzzleId !== puzzleId
    || !Array.isArray(saved.values) || saved.values.length !== size * size
    || !saved.values.every(n => Number.isInteger(n) && n >= 0 && n <= 2)) return null;
  return {values: [...saved.values]};
}

export const pentominoes = {
  F: [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]],
  I: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
  L: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3]],
  N: [[1, 0], [1, 1], [0, 2], [1, 2], [0, 3]],
  P: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]],
  T: [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]],
  U: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
  V: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]],
  W: [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]],
  X: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]],
  Y: [[0, 0], [0, 1], [1, 1], [0, 2], [0, 3]],
  Z: [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]],
};

export const pentominous260929 = {
  rows: 15,
  cols: 15,
  clues: [
    '...L.....Y.....',
    '..........N.WPV',
    '...............',
    '.Y..L...X......',
    '....T.......X..',
    '..I..L........T',
    '.N.............',
    '....N.......I..',
    '........Z..P..L',
    'N.......X..Y...',
    '..X..........I.',
    '.......W.......',
    '.....U....V....',
    '..F............',
    '......T....Z...',
  ],
};

export function edgeKey(a, b) {
  return `${Math.min(a, b)}:${Math.max(a, b)}`;
}

function normalized(points) {
  const minX = Math.min(...points.map(([x]) => x));
  const minY = Math.min(...points.map(([, y]) => y));
  return points.map(([x, y]) => `${x - minX},${y - minY}`).sort().join('|');
}

function variants(points) {
  const result = new Set();
  for (let flip = 0; flip < 2; flip++) {
    for (let turn = 0; turn < 4; turn++) {
      let transformed = points.map(([x, y]) => [flip ? -x : x, y]);
      for (let t = 0; t < turn; t++) transformed = transformed.map(([x, y]) => [-y, x]);
      result.add(normalized(transformed));
    }
  }
  return result;
}

const shapeNames = new Map(Object.entries(pentominoes).flatMap(([name, points]) =>
  [...variants(points)].map(key => [key, name])));

export function classifyPentomino(cells, cols) {
  if (cells.length !== 5) return null;
  return shapeNames.get(normalized(cells.map(index => [index % cols, Math.floor(index / cols)]))) || null;
}

export function validatePentominous(puzzle, edges) {
  const { rows, cols, clues } = puzzle;
  const count = rows * cols;
  const regionOf = Array(count).fill(-1);
  const regions = [];
  for (let start = 0; start < count; start++) {
    if (regionOf[start] !== -1) continue;
    const id = regions.length, cells = [], pending = [start];
    regionOf[start] = id;
    while (pending.length) {
      const current = pending.pop();
      cells.push(current);
      const row = Math.floor(current / cols), col = current % cols;
      const neighbors = [row > 0 ? current - cols : null, row < rows - 1 ? current + cols : null,
        col > 0 ? current - 1 : null, col < cols - 1 ? current + 1 : null];
      for (const next of neighbors) {
        if (next === null || regionOf[next] !== -1 || edges.has(edgeKey(current, next))) continue;
        regionOf[next] = id;
        pending.push(next);
      }
    }
    const shape = classifyPentomino(cells, cols);
    const clueMismatch = cells.some(index => {
      const clue = clues[Math.floor(index / cols)][index % cols];
      return clue !== '.' && shape !== null && clue !== shape;
    });
    regions.push({ cells, shape, clueMismatch, sameShapeNeighbor: false });
  }
  for (let index = 0; index < count; index++) {
    const row = Math.floor(index / cols), col = index % cols;
    for (const next of [col < cols - 1 && index + 1, row < rows - 1 && index + cols]) {
      if (next === false) continue;
      const a = regionOf[index], b = regionOf[next];
      if (a !== b && regions[a].shape && regions[a].shape === regions[b].shape) {
        regions[a].sameShapeNeighbor = true;
        regions[b].sameShapeNeighbor = true;
      }
    }
  }
  return {
    regions,
    regionOf,
    complete: regions.every(region => region.shape && !region.clueMismatch && !region.sameShapeNeighbor),
  };
}

// Circle coordinates are measured from the top-left grid corner in cell units.
export const spiralGalaxies = {
  '261101_04': { rows: 8, cols: 8, centers: [[5,.5],[1,1.5],[7,2],[5.5,3],[1,3.5],[2.5,4],[4,4],[1,5.5],[5.5,6],[.5,7],[7,7],[5,7.5]] },
  '261101_05': { rows: 9, cols: 9, centers: [[3,.5],[6.5,.5],[5,1.5],[8.5,2],[.5,2.5],[7.5,2.5],[2.5,3],[6.5,3.5],[5,4],[8,4.5],[2,7],[8,7],[5.5,7.5]] },
  '261101_06': { rows: 9, cols: 9, centers: [[6.5,.5],[3,1.5],[7,1.5],[8.5,1.5],[5.5,2],[.5,2.5],[4.5,2.5],[7.5,3],[5.5,4],[8.5,4],[4,4.5],[2.5,5],[3,6.5],[8,6.5],[.5,7],[1.5,7.5],[4,7.5],[2.5,8.5],[8.5,8.5]] },
};

export { edgeKey } from './star-division.js';
import { edgeKey, parseStarDivisionState } from './star-division.js';
export function parseSpiralGalaxiesState(puzzle, state, puzzleId) {
  const parsed = parseStarDivisionState(puzzle, state, puzzleId);
  if (!parsed) return null;
  // Saves made before X notes were added contain only boundary lines.
  const notes = parseStarDivisionState(puzzle, { ...state, lines: state.notes ?? [] }, puzzleId);
  if (!notes || [...notes.lines].some(key => parsed.lines.has(key))) return null;
  return { lines: parsed.lines, notes: notes.lines };
}

export function validateSpiralGalaxies(puzzle, lines) {
  const { rows, cols, centers } = puzzle;
  const regionOf = Array(rows * cols).fill(-1), regions = [], splitCenters = new Set();
  for (let start = 0; start < regionOf.length; start++) {
    if (regionOf[start] !== -1) continue;
    const id = regions.length, cells = [], pending = [start];
    regionOf[start] = id;
    while (pending.length) {
      const i = pending.pop(), r = Math.floor(i / cols), c = i % cols;
      cells.push(i);
      for (const next of [r > 0 ? i - cols : null, r + 1 < rows ? i + cols : null,
        c > 0 ? i - 1 : null, c + 1 < cols ? i + 1 : null]) {
        if (next === null || regionOf[next] !== -1 || lines.has(edgeKey(i, next))) continue;
        regionOf[next] = id;
        pending.push(next);
      }
    }
    regions.push({ cells, centers: [], splitCenter: false, internalLine: false });
  }
  // A circle on an edge or vertex belongs to all touching cells. They must stay together.
  centers.forEach(([x, y], centerIndex) => {
    const touching = [];
    for (const r of [Math.ceil(y) - 1, Math.floor(y)]) for (const c of [Math.ceil(x) - 1, Math.floor(x)]) {
      if (r >= 0 && r < rows && c >= 0 && c < cols) touching.push(r * cols + c);
    }
    const ids = new Set(touching.map(i => regionOf[i]));
    const touchingCells = new Set(touching);
    const cut = ids.size > 1 || [...lines].some(key => {
      const [a, b] = key.split(':').map(Number);
      return touchingCells.has(a) && touchingCells.has(b);
    });
    if (cut) splitCenters.add(centerIndex);
    for (const id of ids) {
      if (cut) regions[id].splitCenter = true;
      else regions[id].centers.push([x, y]);
    }
  });
  for (const key of lines) {
    const [a, b] = key.split(':').map(Number);
    if (regionOf[a] === regionOf[b]) regions[regionOf[a]].internalLine = true;
  }
  for (const region of regions) {
    let symmetric = false;
    if (region.centers.length === 1) {
      const [x, y] = region.centers[0];
      symmetric = region.cells.every(i => {
        const r = 2 * y - Math.floor(i / cols) - 1, c = 2 * x - i % cols - 1;
        return r >= 0 && r < rows && c >= 0 && c < cols && regionOf[r * cols + c] === regionOf[i];
      });
    }
    region.valid = region.centers.length === 1 && symmetric && !region.splitCenter && !region.internalLine;
    const invalid = region.centers.length === 1 && !symmetric || region.centers.length === 0;
    region.feedback = region.valid ? 'valid' : invalid ? 'invalid' : 'pending';
  }
  return { regions, regionOf, splitCenters, complete: regions.every(region => region.valid) };
}

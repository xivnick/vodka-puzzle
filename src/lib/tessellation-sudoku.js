// Coordinates follow the horizontal and vertical lines of the reference image.
const upper = new Set(['0,4','1,3','1,4','1,5','2,3','2,4','2,5','3,3','3,5']);
const left = new Set(['2,2','3,1','3,2','4,0','4,1','4,2','5,1','5,2','6,2']);
export const cells = [];
for (let row = 0; row < 9; row++) for (let col = 0; col < 9; col++) {
  if (Math.abs(row - 4) + Math.abs(col - 4) > 4) continue;
  const octagon = (row + col) % 2 === 0;
  const region = upper.has(`${row},${col}`) ? 0 : left.has(`${row},${col}`) ? 1
    : left.has(`${row},${8-col}`) ? 2 : upper.has(`${8-row},${col}`) ? 3 : 4;
  const x = 80 + col * 100, y = 80 + row * 100;
  const offsets = octagon
    ? [[-30,-70],[30,-70],[70,-30],[70,30],[30,70],[-30,70],[-70,30],[-70,-30]]
    : [[-30,-30],[30,-30],[30,30],[-30,30]];
  cells.push({row, col, x, y, octagon, region, points: offsets.map(([dx,dy]) => [x+dx,y+dy]),
    given: row === 3 && col === 3 ? 8 : row === 4 && col === 8 ? 4 : row === 6 && col === 2 ? 1 : 0});
}
export const givens = cells.map(cell => cell.given);
export const lines = [
  ...Array.from({length:9}, (_,r) => cells.flatMap((cell,i) => cell.row === r ? [i] : [])),
  ...Array.from({length:9}, (_,c) => cells.flatMap((cell,i) => cell.col === c ? [i] : [])),
];
export const regions = Array.from({length:5}, (_,r) => cells.flatMap((cell,i) => cell.region === r ? [i] : []));
// Draw shared edges once, with heavy boundaries between different regions.
const edges = new Map();
export const neighbors = [];
for (const [cellIndex, cell] of cells.entries()) cell.points.forEach((a,i) => {
  const b = cell.points[(i+1)%cell.points.length];
  const key = [a.join(','),b.join(',')].sort().join('|');
  if (edges.has(key)) {
    const edge = edges.get(key);
    edge.heavy = edge.region !== cell.region;
    neighbors.push([edge.cellIndex, cellIndex]);
  } else edges.set(key, {a,b,region:cell.region,cellIndex,heavy:true});
});
export const borders = [...edges.values()];

export function conflicts(values) {
  const bad = new Set();
  for (const unit of [...lines, ...regions]) {
    for (const i of unit) if (values[i] && unit.some(j => i !== j && values[j] === values[i])) bad.add(i);
  }
  for (const [i, j] of neighbors) {
    if (values[i] && values[i] === values[j]) { bad.add(i); bad.add(j); }
  }
  for (const unit of lines) {
    const filled = unit.filter(i => values[i]);
    if (filled.length && Math.max(...filled.map(i => values[i])) - Math.min(...filled.map(i => values[i])) >= unit.length) {
      filled.forEach(i => bad.add(i));
    }
  }
  return bad;
}
export function solved(values) {
  return values.length === cells.length && values.every((n,i) => Number.isInteger(n) && n >= 1 && n <= 9
    && (!givens[i] || givens[i] === n)) && conflicts(values).size === 0;
}
export function parseTessellationState(saved, puzzleId) {
  if (!saved || saved.version !== 1 || saved.puzzleId !== puzzleId
    || !Array.isArray(saved.values) || saved.values.length !== cells.length
    || !saved.values.every((n,i) => Number.isInteger(n) && n >= 0 && n <= 9 && (!givens[i] || givens[i] === n))
    || !Array.isArray(saved.notes) || saved.notes.length !== cells.length
    || !saved.notes.every(note => Array.isArray(note) && note.every(n => Number.isInteger(n) && n >= 1 && n <= 9))) return null;
  return {values:[...saved.values], notes:saved.notes.map((note,i) => saved.values[i] ? [] : [...new Set(note)].sort((a,b) => a-b))};
}

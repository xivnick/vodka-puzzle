// Transcription of the supplied cube net. No solution is stored or searched for.
export const puzzleId = '261017_01';
export const faces = [
  {name:'위', x:4, y:0, origin:[0,0,0], u:[1,0,0], v:[0,0,1]},
  {name:'왼쪽', x:0, y:4, origin:[0,0,0], u:[0,0,1], v:[0,1,0]},
  {name:'앞', x:4, y:4, origin:[0,0,4], u:[1,0,0], v:[0,1,0]},
  {name:'오른쪽', x:8, y:4, origin:[4,0,4], u:[0,0,-1], v:[0,1,0]},
  {name:'뒤', x:12, y:4, origin:[4,0,0], u:[-1,0,0], v:[0,1,0]},
  {name:'아래', x:4, y:8, origin:[0,4,4], u:[1,0,0], v:[0,0,-1]},
];
const point = (face, c, r) => face.origin.map((n, a) => n + c * face.u[a] + r * face.v[a]);
export const cells = faces.flatMap((face, f) => Array.from({length:16}, (_, i) => {
  const r = Math.floor(i / 4), c = i % 4;
  return {face:f, r, c, x:face.x+c, y:face.y+r,
    center:point(face,c+.5,r+.5), vertices:[[c,r],[c+1,r],[c+1,r+1],[c,r+1]].map(([cc,rr]) => point(face,cc,rr).join(','))};
}));
// Bold segments in net coordinates: [fixed coordinate, start, end].
const vertical = [[0,4,8],[4,0,12],[5,0,2],[5,6,7],[6,2,5],[6,6,11],[7,0,3],[7,6,8],[7,9,12],[8,0,3],[8,6,7],[8,9,10],[10,6,8],[11,5,6],[12,4,5],[12,6,7],[13,4,8],[16,4,8]];
const horizontal = [[0,5,7],[2,5,6],[3,7,8],[4,0,4],[4,9,12],[4,13,15],[5,4,6],[5,11,12],[6,5,6],[6,7,8],[6,10,11],[6,12,13],[7,4,5],[7,8,12],[8,0,4],[8,6,7],[8,9,10],[9,7,8],[11,6,7]];
export const boundaries = [
  ...vertical.map(([x,y1,y2]) => [x,y1,x,y2]),
  ...horizontal.map(([y,x1,x2]) => [x1,y,x2,y]),
];
const edgeKey = (a,b) => [a,b].sort().join('|');
const edges = new Map();
cells.forEach((cell, i) => {
  const segments = [[cell.x,cell.y,cell.x+1,cell.y],[cell.x+1,cell.y,cell.x+1,cell.y+1],[cell.x,cell.y+1,cell.x+1,cell.y+1],[cell.x,cell.y,cell.x,cell.y+1]];
  segments.forEach(([x1,y1,x2,y2], side) => {
    const key = edgeKey(cell.vertices[side],cell.vertices[(side+1)%4]);
    const bold = x1 === x2 ? vertical.some(([x,a,b]) => x===x1 && y1>=a && y2<=b) : horizontal.some(([y,a,b]) => y===y1 && x1>=a && x2<=b);
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push({i,bold});
  });
});
export const edgePairs = [...edges.values()];
const linked = cells.map(() => []);
edgePairs.forEach(pair => {
  if (pair.length !== 2) throw Error('Invalid cube edge');
  if (!pair.some(edge => edge.bold)) {
    linked[pair[0].i].push(pair[1].i); linked[pair[1].i].push(pair[0].i);
  }
});
export const regionIds = Array(96).fill(-1);
export const regions = [];
for (let i=0;i<96;i++) {
  if (regionIds[i] !== -1) continue;
  const region = [], pending = [i], id = regions.length;
  regionIds[i] = id;
  while (pending.length) {
    const j = pending.pop(); region.push(j);
    linked[j].forEach(k => { if (regionIds[k] === -1) { regionIds[k] = id; pending.push(k); } });
  }
  regions.push(region);
}
export const bands = [0,1,2].flatMap(axis => Array.from({length:4}, (_, k) => cells.flatMap((cell,i) => cell.center[axis] === k+.5 ? [i] : [])));
export const neighbors = cells.map((cell,i) => cells.flatMap((other,j) => i !== j && cell.vertices.some(vertex => other.vertices.includes(vertex)) ? [j] : []));
export function analyze(values) {
  const bad = new Set(), units = [...bands,...regions];
  const counts = units.map(unit => unit.filter(i => values[i] === 1).length);
  units.forEach((unit,k) => { if (counts[k] > 2) unit.forEach(i => { if (values[i] === 1) bad.add(i); }); });
  values.forEach((value,i) => { if (value === 1) neighbors[i].forEach(j => { if (values[j] === 1) { bad.add(i); bad.add(j); } }); });
  return {bad, counts, complete:values.length === 96 && values.every(n => [0,1,2].includes(n)) && counts.every(n => n === 2) && bad.size === 0};
}
export function parseState(saved) {
  return saved?.version === 1 && saved.puzzleId === puzzleId && Array.isArray(saved.values) && saved.values.length === 96 && saved.values.every(n => Number.isInteger(n) && n>=0 && n<=2) ? {values:[...saved.values]} : null;
}

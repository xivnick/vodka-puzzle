// Boundaries transcribed from the supplied 261003 photo; no solution is stored.
export const size = 12;
const horizontal = {
  1:[[1,6]], 2:[[2,3],[4,5],[7,8],[9,10]],
  3:[[0,2],[3,4],[5,7],[8,9],[10,11]],
  4:[[1,2],[6,7],[8,9],[10,11]],
  5:[[1,2],[5,6],[7,8],[9,10]],
  6:[[1,2],[5,6],[7,8],[9,10]], 7:[[1,2],[10,12]],
  8:[[0,2],[6,7],[8,9],[10,11]], 9:[[7,8]],
  10:[[2,6],[8,11]], 11:[[8,11]],
};
const vertical = {
  1:[[1,3],[4,5],[6,7]], 2:[[2,4],[5,6],[7,8],[10,12]],
  3:[[2,3]], 4:[[2,3]], 5:[[2,3],[5,6]],
  6:[[1,5],[6,8],[10,12]], 7:[[2,3],[4,5],[6,9]],
  8:[[2,3],[4,5],[6,8],[9,11]], 9:[[2,3],[4,5],[6,8]],
  10:[[2,3],[4,6],[7,8]], 11:[[3,4],[8,10],[11,12]],
};
export const boundaries = [
  ...Object.entries(horizontal).flatMap(([y, spans]) => spans.map(([a,b]) => [a,+y,b,+y])),
  ...Object.entries(vertical).flatMap(([x, spans]) => spans.map(([a,b]) => [+x,a,+x,b])),
];
const walls = new Set();
const pair = (a,b) => [Math.min(a,b),Math.max(a,b)].join(':');
for (const [x1,y1,x2,y2] of boundaries) {
  if (y1 === y2) for (let c=x1;c<x2;c++) walls.add(pair((y1-1)*size+c,y1*size+c));
  else for (let r=y1;r<y2;r++) walls.add(pair(r*size+x1-1,r*size+x1));
}
export const regions = Array(size*size).fill(-1);
let region = 0;
for (let i=0;i<regions.length;i++) {
  if (regions[i] !== -1) continue;
  const queue = [i]; regions[i] = region;
  for (const cell of queue) {
    const r=Math.floor(cell/size), c=cell%size;
    const neighbors = [r>0?cell-size:-1,r<size-1?cell+size:-1,c>0?cell-1:-1,c<size-1?cell+1:-1];
    for (const next of neighbors) if (next>=0 && regions[next]===-1 && !walls.has(pair(cell,next))) {
      regions[next]=region; queue.push(next);
    }
  }
  region++;
}
export const edges = [];
for (let r=0;r<size;r++) for (let c=0;c<size;c++) {
  const cell=r*size+c;
  if (c<size-1) edges.push({cells:[cell,cell+1], x:c+1, y:r+.5, direction:'vertical'});
  if (r<size-1) edges.push({cells:[cell,cell+size], x:c+.5, y:r+1, direction:'horizontal'});
}
export function analyze(values) {
  const counts=Array(size*2+region).fill(0), bad=new Set(), owners=Array.from({length:size*size},()=>[]);
  const edgeUnits=edges.map(edge => [...new Set(edge.cells.map(i=>Math.floor(i/size))),
    ...new Set(edge.cells.map(i=>size+i%size)), ...new Set(edge.cells.map(i=>size*2+regions[i]))]);
  values.forEach((value,i)=> {
    if (value!==1 || !edges[i]) return;
    for (const unit of edgeUnits[i]) counts[unit]++;
    for (const cell of edges[i].cells) owners[cell].push(i);
  });
  values.forEach((value,i)=> {
    if (value!==1 || !edges[i]) return;
    if (edgeUnits[i].some(unit=>counts[unit]>2)) bad.add(i);
    for (const cell of edges[i].cells) {
      const r=Math.floor(cell/size),c=cell%size;
      for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
        if (r+dr<0 || r+dr>=size || c+dc<0 || c+dc>=size) continue;
        for (const other of owners[(r+dr)*size+c+dc]) if (other!==i) {bad.add(i);bad.add(other);}
      }
    }
  });
  return {counts,bad,complete:values.length===edges.length && values.every(v=>[0,1,2].includes(v)) && counts.every(n=>n===2) && bad.size===0};
}
export function parseDominoState(saved,puzzleId) {
  if (!saved || saved.version!==1 || saved.puzzleId!==puzzleId || !Array.isArray(saved.values)
    || saved.values.length!==edges.length || !saved.values.every(v=>Number.isInteger(v) && v>=0 && v<=2)) return null;
  return {values:[...saved.values]};
}

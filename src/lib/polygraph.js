// Clues transcribed from the supplied 9 × 9 photo; no solution data.
export const clues = [
  [null,2,1,3,2,2,3,2,null],
  [null,null,null,null,2,null,null,2,null],
  [null,2,null,null,null,null,null,3,null],
  [null,1,null,null,2,3,null,1,null],
  [null,2,1,3,null,2,3,null,null],
  [1,null,2,null,null,null,3,1,null],
  [3,null,null,null,null,null,3,null,2],
  [null,null,null,null,null,2,null,null,null],
  [null,2,1,3,null,null,null,1,null],
];
export const edgeKey = (a,b) => a < b ? `${a}:${b}` : `${b}:${a}`;
export function validEdge(key, rows = 9, cols = 9) {
  if (typeof key !== 'string' || !/^(0|[1-9]\d*):(0|[1-9]\d*)$/.test(key)) return false;
  const [a,b] = key.split(':').map(Number), width = cols+1;
  return a < b && b < (rows+1)*width && (b-a === width || b-a === 1 && Math.floor(a/width) === Math.floor(b/width));
}
// Inspect the player's edges only. Flood fill from the exterior determines inside/outside.
export function analyze(edges, grid = clues) {
  const rows=grid.length, cols=grid[0].length, width=cols+1;
  const adjacency=Array.from({length:(rows+1)*width},()=>[]), badVertices=new Set(), badCells=new Set();
  let malformed=false;
  for (const key of edges) {
    if (!validEdge(key,rows,cols)) { malformed=true; continue; }
    const [a,b]=key.split(':').map(Number);
    adjacency[a].push(b); adjacency[b].push(a);
  }
  const used=adjacency.flatMap((neighbors,i)=>neighbors.length?[i]:[]);
  used.forEach(i=>{ if(adjacency[i].length>2) badVertices.add(i); });
  const seen=new Set(), stack=used.length?[used[0]]:[];
  while(stack.length) {
    const i=stack.pop(); if(seen.has(i)) continue;
    seen.add(i); stack.push(...adjacency[i]);
  }
  const closed=used.length>0 && used.every(i=>adjacency[i].length===2);
  const single=closed && seen.size===used.length && !malformed;
  if(closed && !single) used.forEach(i=>badVertices.add(i));
  const outside=new Set(), queue=[];
  const visit=i=>{if(!outside.has(i)){outside.add(i);queue.push(i);}};
  function sides(r,c) {
    const a=r*width+c;
    return [edgeKey(a,a+1),edgeKey(a+1,a+width+1),edgeKey(a+width,a+width+1),edgeKey(a,a+width)];
  }
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++) {
    const s=sides(r,c);
    if(r===0&&!edges.has(s[0]) || c===cols-1&&!edges.has(s[1]) || r===rows-1&&!edges.has(s[2]) || c===0&&!edges.has(s[3])) visit(r*cols+c);
  }
  for(let head=0;head<queue.length;head++) {
    const i=queue[head],r=Math.floor(i/cols),c=i%cols,s=sides(r,c);
    [[r-1,c],[r,c+1],[r+1,c],[r,c-1]].forEach(([rr,cc],k)=>{
      if(rr>=0&&rr<rows&&cc>=0&&cc<cols&&!edges.has(s[k])) visit(rr*cols+cc);
    });
  }
  if(single) grid.forEach((row,r)=>row.forEach((n,c)=>{
    if(n===null) return;
    const count=sides(r,c).filter(key=>edges.has(key)).length;
    if((outside.has(r*cols+c)?4-count:count)!==n) badCells.add(r*cols+c);
  }));
  return {complete:single&&badCells.size===0, single, badVertices, badCells};
}
export function parseState(saved,puzzleId) {
  if(!saved || saved.version!==1 || saved.puzzleId!==puzzleId) return null;
  for(const field of ['edges','notes']) {
    if(!Array.isArray(saved[field]) || saved[field].length>180 || !saved[field].every(key=>validEdge(key)) || new Set(saved[field]).size!==saved[field].length) return null;
  }
  if(saved.notes.some(key=>saved.edges.includes(key))) return null;
  return {edges:new Set(saved.edges),notes:new Set(saved.notes)};
}

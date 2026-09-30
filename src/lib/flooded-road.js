// Transcribed from the supplied image; no solution data.
export const floodedRoadPuzzle = {
  number: 1,
  cells: [
    ['water','water','water','water','water','water','water','water','water'],
    ['water','water',1,0,0,0,3,'water','water'],
    ['water',0,0,0,0,0,0,0,'water'],
    ['water',6,0,0,0,0,0,4,'water'],
    ['water',0,0,0,9,0,0,0,'water'],
    ['water',7,0,0,0,0,0,2,'water'],
    ['water',0,0,0,0,0,0,0,'water'],
    ['water','water',5,0,0,0,8,'water','water'],
    ['water','water','water','water','water','water','water','water','water'],
  ],
};
export const edgeKey = (a,b) => a<b ? `${a}:${b}` : `${b}:${a}`;

// Inspect only player-supplied edges, without searching for a solution.
export function validateFloodedRoad(cells, edges) {
  const rows=cells.length, cols=cells[0].length, size=rows*cols;
  const water=i=>cells[Math.floor(i/cols)][i%cols]==='water';
  const clue=i=>Number(cells[Math.floor(i/cols)][i%cols]) || 0;
  const adjacency=Array.from({length:size},()=>[]), errors=new Set(), satisfied=[], segments={};
  let malformed=false;
  for(const key of edges) {
    const parts=String(key).split(':'), [a,b]=parts.map(Number);
    if(parts.length!==2 || !Number.isInteger(a) || !Number.isInteger(b) || a<0 || b>=size || a>=b ||
      !(b-a===cols || b-a===1 && Math.floor(a/cols)===Math.floor(b/cols))) {malformed=true;continue;}
    if(!adjacency[a].includes(b)) {adjacency[a].push(b);adjacency[b].push(a);}
  }
  const used=adjacency.map((neighbors,i)=>neighbors.length?i:-1).filter(i=>i>=0);
  for(const i of used) if(adjacency[i].length>2) errors.add(i);
  const closed=used.length>0 && used.every(i=>adjacency[i].length===2);
  const connectedCells=new Set(), stack=used.length?[used[0]]:[];
  while(stack.length) {
    const i=stack.pop(); if(connectedCells.has(i)) continue;
    connectedCells.add(i); stack.push(...adjacency[i]);
  }
  const connected=connectedCells.size===used.length;
  if(closed && !connected) used.forEach(i=>errors.add(i));
  const seen=new Set();
  for(const start of used) {
    if(seen.has(start)) continue;
    const group=[], pending=[start], isWater=water(start);
    while(pending.length) {
      const i=pending.pop(); if(seen.has(i)) continue;
      seen.add(i); group.push(i);
      pending.push(...adjacency[i].filter(n=>water(n)===isWater && !seen.has(n)));
    }
    for(const i of group) segments[i]=group.length;
    const finished=group.every(i=>adjacency[i].length===2);
    const numbers=group.filter(i=>clue(i)>0), targets=new Set(numbers.map(clue));
    const mismatch=isWater ? group.length>2 : targets.size>1 || numbers.some(i=>group.length>clue(i) || finished && group.length!==clue(i));
    if(mismatch || group.some(i=>errors.has(i))) group.forEach(i=>errors.add(i));
    else if(!isWater && finished && numbers.length) satisfied.push(...group);
  }
  for(let i=0;i<size;i++) if(clue(i) && closed && !adjacency[i].length) errors.add(i);
  return {complete:closed && connected && used.some(water) && used.some(i=>!water(i)) && !malformed && errors.size===0, errors:[...errors], satisfied, segments, closed, malformed};
}

export function parseFloodedRoadState(cells, saved, puzzleId) {
  if(!saved || saved.version!==1 || saved.puzzleId!==puzzleId || !Array.isArray(saved.edges)) return null;
  const rows=cells.length, cols=cells[0].length;
  if(saved.edges.length>rows*(cols-1)+cols*(rows-1)) return null;
  if(!saved.edges.every(key=>typeof key==='string' && /^(0|[1-9][0-9]*):(0|[1-9][0-9]*)$/.test(key))) return null;
  const edges=new Set(saved.edges);
  if(edges.size!==saved.edges.length || validateFloodedRoad(cells,edges).malformed) return null;
  return edges;
}

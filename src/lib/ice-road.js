// Transcribed from the supplied image; no solution data.
export const iceRoadPuzzle = {
  number: 1,
  cells: [
    [9, 'ice', 0, 0, 0, 0, 5],
    [0, 0, 0, 0, 0, 0, 'ice'],
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 'ice', 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
    ['ice', 0, 0, 0, 0, 0, 0],
    [23, 0, 0, 0, 0, 'ice', 7],
  ],
};
export const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;

// Validate only player-supplied paths. Ice crossings pair opposite directions.
export function validateIceRoad(cells, edges) {
  const rows=cells.length, cols=cells[0].length, size=rows*cols;
  const ice=i=>cells[Math.floor(i/cols)][i%cols]==='ice';
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
  for(const i of used) {
    const neighbors=adjacency[i];
    if(ice(i)) {
      if(neighbors.length>1 && (neighbors.length===3 || neighbors.some(n=>!neighbors.includes(2*i-n)))) errors.add(i);
    } else if(neighbors.length>2) errors.add(i);
  }
  const closed=used.length>0 && used.every(i=>ice(i)
    ? (adjacency[i].length===2 || adjacency[i].length===4) && adjacency[i].every(n=>adjacency[i].includes(2*i-n))
    : adjacency[i].length===2);
  let singleLoop=false;
  if(closed && !malformed) {
    const start=used[0], first=adjacency[start][0], visited=new Set();
    let previous=start, current=first;
    while(!visited.has(edgeKey(previous,current))) {
      visited.add(edgeKey(previous,current));
      const next=ice(current)?2*current-previous:adjacency[current].find(n=>n!==previous);
      previous=current;current=next;
    }
    singleLoop=previous===start && current===first && visited.size===edges.size;
    if(!singleLoop) used.forEach(i=>errors.add(i));
  }
  const seen=new Set();
  for(const start of used) {
    if(ice(start) || seen.has(start)) continue;
    const group=[], stack=[start];
    while(stack.length) {
      const i=stack.pop();if(seen.has(i)) continue;
      seen.add(i);group.push(i);
      stack.push(...adjacency[i].filter(n=>!ice(n) && !seen.has(n)));
    }
    const numbers=group.filter(i=>clue(i)>0), targets=new Set(numbers.map(clue));
    const finished=group.every(i=>adjacency[i].length===2);
    for(const i of group) segments[i]=group.length;
    const mismatch=targets.size>1 || numbers.some(i=>group.length>clue(i) || finished && group.length!==clue(i));
    if(mismatch || group.some(i=>errors.has(i))) group.forEach(i=>errors.add(i));
    else if(finished && numbers.length) satisfied.push(...group);
  }
  for(let i=0;i<size;i++) if(clue(i) && closed && !adjacency[i].length) errors.add(i);
  return {complete:closed && singleLoop && used.some(ice) && used.some(i=>!ice(i)) && !malformed && errors.size===0, errors:[...errors], satisfied, segments, closed, malformed};
}

export function parseIceRoadState(cells, saved, puzzleId) {
  if (!saved || saved.version !== 1 || saved.puzzleId !== puzzleId || !Array.isArray(saved.edges)) return null;
  const rows=cells.length, cols=cells[0].length;
  if (saved.edges.length > rows*(cols-1)+cols*(rows-1)) return null;
  if (!saved.edges.every(key => typeof key === 'string' && /^(0|[1-9][0-9]*):(0|[1-9][0-9]*)$/.test(key))) return null;
  const edges=new Set(saved.edges);
  if (edges.size !== saved.edges.length || validateIceRoad(cells, edges).malformed) return null;
  return edges;
}

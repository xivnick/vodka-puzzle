// w: white square, b: black circle; suffix: arm-length sum. No solution data.
export const balanceLoopPuzzles = [
  { number: 1, clues: [
    ['w','','','','b8','','','','','b'],
    ['','b','','','','','','','',''],
    ['','','','w4','b5','w6','','','',''],
    ['','b5','','','','b','','','',''],
    ['','','w','','','','','','',''],
    ['','','','','','','','w','',''],
    ['','','','','w','','','','w',''],
    ['','','','','b','w6','b','','',''],
    ['','','','','','','','','w',''],
    ['w','','','','','w4','','','','b5'],
  ] },
  { number: 2, clues: [
    ['','','','b7','','','','','','','','','b5'],
    ['','','','','','','','','','','','',''],
    ['','','w4','','','','','','','','w4','',''],
    ['','','','w6','','','b7','','','b4','','','b'],
    ['','','','','w4','','','','w2','','','',''],
    ['b6','','','','','w2','','b7','','','','',''],
    ['','w2','','b6','','','w4','','','w2','','b4',''],
    ['','','','','','w2','','w','','','','','w'],
    ['','','','','w','','','','w','','','',''],
    ['','','','b4','','','w4','','','b','','',''],
    ['','','w4','','','','','','','','b','',''],
    ['','','','','','','','','','','','',''],
    ['w','','','','','','','','','w8','','',''],
  ] },
];
export const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;

// Inspect only supplied edges. Never search for or compare against a solution.
export function validateBalanceLoop(clues, edges) {
  const rows = clues.length, cols = clues[0].length, size = rows * cols;
  const adjacency = Array.from({length:size}, () => []);
  const errors = new Set();
  let malformed = false;
  for (const key of edges) {
    const parts = String(key).split(':');
    const [a,b] = parts.map(Number);
    if (parts.length !== 2 || !Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b >= size || a >= b ||
        !(b-a === cols || (b-a === 1 && Math.floor(a/cols) === Math.floor(b/cols)))) { malformed = true; continue; }
    if (!adjacency[a].includes(b)) { adjacency[a].push(b); adjacency[b].push(a); }
  }
  const used = adjacency.map((v,i) => v.length ? i : -1).filter(i => i >= 0);
  for (const i of used) if (adjacency[i].length > 2) errors.add(i);
  const seen = new Set();
  if (used.length) {
    const stack = [used[0]];
    while (stack.length) { const i=stack.pop(); if(seen.has(i)) continue; seen.add(i); stack.push(...adjacency[i]); }
  }
  const closed = used.length > 0 && used.every(i => adjacency[i].length === 2);
  const connected = seen.size === used.length;
  if (closed && !connected) used.forEach(i => errors.add(i));
  // A turn at the starting clue is excluded: both arms have positive length.
  function arm(start, next) {
    let previous=start, current=next, length=1;
    const visited=new Set([start]);
    while (!visited.has(current)) {
      visited.add(current);
      const neighbors=adjacency[current];
      if(neighbors.length === 1) return {length, finished:false};
      if(neighbors.length !== 2) return null;
      const onward=neighbors.find(i => i !== previous);
      if(onward-current !== current-previous) return {length, finished:true};
      previous=current; current=onward; length++;
    }
    return null;
  }
  const arms = {}, satisfied=[];
  clues.forEach((row,r) => row.forEach((clue,c) => {
    if(!clue) return;
    const i=r*cols+c, degree=adjacency[i].length;
    if(degree !== 2 && closed) errors.add(i);
    if(degree === 0 || degree > 2) return;
    const segments=adjacency[i].map(next => arm(i,next));
    const lengths=segments.map(segment=>segment?.length ?? null);
    arms[i]=lengths;
    const total=Number(clue.slice(1));
    const sum=lengths.reduce((sum,length)=>sum+(length ?? 0),0);
    // A drawn arm can already exceed the target even before the other arm exists.
    if(total && sum>total) errors.add(i);
    if(degree !== 2 || segments.includes(null)) return;
    const [a,b]=lengths;
    const matches=(clue[0] === 'w' ? a===b : a!==b) && (!total || sum===total);
    if(segments.every(segment=>segment.finished) && !matches) errors.add(i);
    if(matches && !errors.has(i)) satisfied.push(i);
  }));
  return { complete:closed && connected && !malformed && errors.size === 0, errors:[...errors], arms, satisfied, closed, malformed };
}

export function parseBalanceLoopState(clues, saved, puzzleId) {
  if (!saved || saved.version !== 1 || saved.puzzleId !== puzzleId || !Array.isArray(saved.edges)) return null;
  const rows=clues.length, cols=clues[0].length;
  if (saved.edges.length > rows*(cols-1)+cols*(rows-1)) return null;
  if (!saved.edges.every(key => typeof key === 'string' && /^(0|[1-9][0-9]*):(0|[1-9][0-9]*)$/.test(key))) return null;
  const edges=new Set(saved.edges);
  if (edges.size !== saved.edges.length || validateBalanceLoop(clues, edges).malformed) return null;
  return edges;
}

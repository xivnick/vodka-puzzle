// Clues transcribed from the supplied photo, using zero-based row and column indices.
export const size = 13;
export const clues = [
  [1,2,3,'down'], [1,9,1,'down'], [2,11,2,'down'],
  [3,1,0,'right'], [4,7,2,'up'], [5,4,1,'right'],
  [6,6,1,'right'], [7,8,3,'left'], [8,5,2,'down'],
  [9,11,2,'up'], [10,1,0,'down'], [11,3,4,'up'], [11,10,4,'up'],
].map(([r,c,count,direction]) => ({cell:r*size+c,count,direction}));
export const clueCells = new Set(clues.map(clue => clue.cell));
export const edgeKey = (a,b) => a < b ? `${a}:${b}` : `${b}:${a}`;
export function validEdge(key) {
  if (typeof key !== 'string' || !/^(0|[1-9]\d*):(0|[1-9]\d*)$/.test(key)) return false;
  const [a,b] = key.split(':').map(Number);
  return a < b && b < size*size && !clueCells.has(a) && !clueCells.has(b)
    && (b-a === size || b-a === 1 && Math.floor(a/size) === Math.floor(b/size));
}
export function ray(clue) {
  const [dr,dc] = {up:[-1,0],down:[1,0],left:[0,-1],right:[0,1]}[clue.direction];
  const cells = [];
  for (let r=Math.floor(clue.cell/size)+dr,c=clue.cell%size+dc; r>=0 && r<size && c>=0 && c<size; r+=dr,c+=dc) cells.push(r*size+c);
  return cells;
}
export const clueRays = clues.map(ray);
// Validate only player input; no solution search or stored answer.
export function analyze(values, edges) {
  const bad = new Set(), adjacency = Array.from({length:size*size},()=>[]);
  if (!Array.isArray(values) || values.length !== size*size || !values.every((v,i)=>[0,1,2].includes(v) && (!clueCells.has(i) || v===0))) return {bad,complete:false,malformed:true};
  let malformed = false;
  values.forEach((v,i) => {
    if (v !== 1) return;
    for (const j of [i-size,i+size,...(i%size ? [i-1] : []),...(i%size<size-1 ? [i+1] : [])]) {
      if (j>=0 && j<values.length && values[j]===1) {bad.add(i);bad.add(j);}
    }
  });
  const counts = clueRays.map(cells=>cells.filter(i=>values[i]===1).length);
  clues.forEach((clue,index)=>{if(counts[index]>clue.count) {bad.add(clue.cell);clueRays[index].filter(i=>values[i]===1).forEach(i=>bad.add(i));}});
  for (const key of edges) {
    if (!validEdge(key)) {malformed=true;continue;}
    const [a,b]=key.split(':').map(Number);
    adjacency[a].push(b);adjacency[b].push(a);
    if(values[a]===1 || values[b]===1) {bad.add(a);bad.add(b);}
  }
  adjacency.forEach((neighbors,i)=>{if(neighbors.length>2)bad.add(i);});
  const used=adjacency.flatMap((neighbors,i)=>neighbors.length?[i]:[]);
  const seen=new Set(),stack=used.length?[used[0]]:[];
  while(stack.length) {const i=stack.pop();if(seen.has(i))continue;seen.add(i);stack.push(...adjacency[i]);}
  const connected=used.length>0 && seen.size===used.length;
  if(used.length && !connected && used.every(i=>adjacency[i].length===2))used.forEach(i=>bad.add(i));
  const covered=adjacency.every((neighbors,i)=>neighbors.length===(clueCells.has(i)||values[i]===1?0:2));
  return {bad,malformed,counts,complete:!malformed && !bad.size && covered && connected && clues.every((clue,i)=>counts[i]===clue.count)};
}
export function parseYajilinState(saved,puzzleId) {
  if(!saved || saved.version!==1 || saved.puzzleId!==puzzleId
    || !Array.isArray(saved.values) || saved.values.length!==size*size || !saved.values.every((v,i)=>[0,1,2].includes(v)&&(!clueCells.has(i)||v===0))
    || !Array.isArray(saved.edges) || saved.edges.length>2*size*(size-1) || !saved.edges.every(validEdge) || new Set(saved.edges).size!==saved.edges.length)return null;
  const edges=new Set(saved.edges);
  if(saved.edges.some(key=>key.split(':').some(i=>saved.values[Number(i)]===1)))return null;
  return {values:[...saved.values],edges};
}

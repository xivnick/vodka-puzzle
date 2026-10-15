// Regions transcribed from the supplied photo. No solution data.
export const size = 12;
export const regions = [
  [0,0,0,1,1,2,2,2,2,3,3,3],
  [0,0,1,1,1,1,1,2,2,3,3,3],
  [0,0,1,1,1,4,4,2,5,3,3,3],
  [0,0,1,1,1,4,4,5,5,3,6,6],
  [0,0,1,1,1,4,4,5,3,3,6,6],
  [0,7,4,4,4,4,4,4,4,4,8,8],
  [0,7,4,4,4,4,4,4,4,4,8,8],
  [7,7,9,9,9,4,4,10,10,10,8,8],
  [7,7,9,10,9,4,4,10,10,10,8,8],
  [7,11,9,10,9,4,4,10,10,10,8,8],
  [11,11,9,10,10,10,10,10,8,8,8,8],
  [11,11,11,11,10,10,10,10,8,8,8,8],
];
export const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
const ids = regions.flat();
const regionUnits = Array.from({length:size}, (_, id) => ids.flatMap((region, i) => region === id ? [i] : []));
const units = [
  ...Array.from({length:size}, (_, r) => Array.from({length:size}, (_, c) => r * size + c)),
  ...Array.from({length:size}, (_, c) => Array.from({length:size}, (_, r) => r * size + c)),
  ...regionUnits,
];
export function validEdge(key) {
  if (typeof key !== 'string' || !/^(0|[1-9]\d*):(0|[1-9]\d*)$/.test(key)) return false;
  const [a,b] = key.split(':').map(Number);
  return a < b && b < size * size && (b - a === size || (b - a === 1 && Math.floor(a / size) === Math.floor(b / size)));
}
// Check only the player's marks and edges; never search for a solution.
export function analyze(values, edges) {
  const bad = new Set(), adjacency = Array.from({length:size * size}, () => []);
  const crossings = Array(size).fill(0);
  const validValues = Array.isArray(values) && values.length === size * size && values.every(value => [0,1,2].includes(value));
  if (!validValues) return {bad, complete:false, malformed:true};
  const counts = units.map(unit => unit.filter(i => values[i] === 1).length);
  units.forEach((unit, index) => {
    if (counts[index] > 1) unit.filter(i => values[i] === 1).forEach(i => bad.add(i));
  });
  values.forEach((value,i) => {
    if (value !== 1) return;
    const r = Math.floor(i / size), c = i % size;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < size && cc >= 0 && cc < size && values[rr * size + cc] === 1) bad.add(i);
    }
  });
  let malformed = false;
  for (const key of edges) {
    if (!validEdge(key)) { malformed = true; continue; }
    const [a,b] = key.split(':').map(Number);
    adjacency[a].push(b); adjacency[b].push(a);
    if (values[a] === 1 || values[b] === 1) { bad.add(a); bad.add(b); }
    if (ids[a] !== ids[b]) { crossings[ids[a]]++; crossings[ids[b]]++; }
  }
  adjacency.forEach((neighbors,i) => { if (neighbors.length > 2) bad.add(i); });
  regionUnits.forEach((unit,id) => {
    if (crossings[id] > 2) unit.filter(i => adjacency[i].some(j => ids[j] !== id)).forEach(i => bad.add(i));
  });
  const used = adjacency.flatMap((neighbors,i) => neighbors.length ? [i] : []);
  const seen = new Set(), stack = used.length ? [used[0]] : [];
  while (stack.length) {
    const i = stack.pop();
    if (seen.has(i)) continue;
    seen.add(i); stack.push(...adjacency[i]);
  }
  const covered = adjacency.every((neighbors,i) => neighbors.length === (values[i] === 1 ? 0 : 2));
  const connected = seen.size === used.length;
  if (used.length && !connected && used.every(i => adjacency[i].length === 2)) used.forEach(i => bad.add(i));
  return {bad, malformed, complete:!malformed && bad.size === 0 && counts.every(count => count === 1)
    && covered && connected && crossings.every(count => count === 2)};
}
export function parseStarLoopState(saved, puzzleId) {
  if (!saved || saved.version !== 1 || saved.puzzleId !== puzzleId
    || !Array.isArray(saved.values) || saved.values.length !== size * size || !saved.values.every(n => [0,1,2].includes(n))
    || !Array.isArray(saved.edges) || saved.edges.length > 2 * size * (size - 1)
    || !saved.edges.every(validEdge) || new Set(saved.edges).size !== saved.edges.length) return null;
  return {values:[...saved.values], edges:new Set(saved.edges)};
}

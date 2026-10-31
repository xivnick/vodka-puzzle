// Photo order: left to right, top to bottom. Cell indices are local to each 3×3 board.
// Only player input is checked; no solution is stored or searched.
export const boards = [
  { cages: [{sum:8,cells:[7,8]}], bulb:5, arrow:[7,3,0] },
  { cages: [{sum:14,cells:[0,1,2]},{sum:13,cells:[3,4]}], bulb:8, arrow:[5,7] },
  { cages: [{sum:7,cells:[0,1]},{sum:6,cells:[7,8]}], bulb:2, arrow:[4,8] },
  { cages: [{sum:8,cells:[3,4]}], bulb:3, arrow:[4,7,6] },
  { cages: [{sum:14,cells:[2,4,5]},{sum:10,cells:[7,8]}], bulb:2, arrow:[5,4,0] },
  { cages: [{sum:12,cells:[1,2,5]},{sum:10,cells:[3,4]}], bulb:3, arrow:[4,5] },
  { cages: [{sum:10,cells:[6,7,8]}], bulb:3, arrow:[0,4,8] },
  { cages: [{sum:18,cells:[3,4,5]},{sum:15,cells:[6,7]}], bulb:6, arrow:[3,1] },
  { cages: [{sum:16,cells:[1,4,7]}], bulb:1, arrow:[5,7] },
];
const lines = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
];
export function conflicts(values) {
  const bad = new Set();
  boards.forEach((board,b) => {
    const offset=b*9, numbers=values.slice(offset,offset+9);
    const mark = cells => cells.forEach(i=>bad.add(offset+i));
    for (const line of lines) {
      for (const i of line) if (numbers[i] && line.some(j=>j!==i && numbers[j]===numbers[i])) mark([i]);
    }
    if (new Set(numbers.filter(Boolean)).size>3) mark(numbers.flatMap((n,i)=>n?[i]:[]));
    for (const cage of board.cages) {
      const filled=cage.cells.filter(i=>numbers[i]);
      const sum=filled.reduce((total,i)=>total+numbers[i],0);
      if (new Set(filled.map(i=>numbers[i])).size!==filled.length
        || sum>cage.sum || (filled.length===cage.cells.length && sum!==cage.sum)
        || (filled.length<cage.cells.length && sum>=cage.sum)) mark(cage.cells);
    }
    const sum=board.arrow.reduce((total,i)=>total+numbers[i],0);
    const full=board.arrow.every(i=>numbers[i]);
    if (numbers[board.bulb] && full && sum!==numbers[board.bulb]) mark([board.bulb,...board.arrow]);
  });
  return bad;
}
export function solved(values) {
  return values.length===81 && values.every(n=>Number.isInteger(n) && n>=1 && n<=9)
    && boards.every((_,b)=>new Set(values.slice(b*9,b*9+9)).size===3)
    && conflicts(values).size===0;
}
export function parseLegoHouseState(saved,puzzleId) {
  if (!saved || saved.version!==1 || saved.puzzleId!==puzzleId
    || !Array.isArray(saved.values) || saved.values.length!==81
    || !saved.values.every(n=>Number.isInteger(n) && n>=0 && n<=9)
    || !Array.isArray(saved.notes) || saved.notes.length!==81
    || !saved.notes.every(note=>Array.isArray(note) && note.every(n=>Number.isInteger(n) && n>=1 && n<=9))) return null;
  return {values:[...saved.values],notes:saved.notes.map((note,i)=>saved.values[i]?[]:[...new Set(note)].sort((a,b)=>a-b))};
}
export function center(i) { return [i%3*100+50,Math.floor(i/3)*100+50]; }
export function arrowDrawing(board) {
  const start=center(board.bulb), first=center(board.arrow[0]);
  const length=Math.hypot(first[0]-start[0],first[1]-start[1]);
  const points=[[start[0]+(first[0]-start[0])*34/length,start[1]+(first[1]-start[1])*34/length],...board.arrow.map(center)];
  const end=points.at(-1), prev=points.at(-2), angle=Math.atan2(end[1]-prev[1],end[0]-prev[0]);
  const wings=[-.45,.45].map(a=>[end[0]-21*Math.cos(angle+a),end[1]-21*Math.sin(angle+a)]);
  return {line:points.map(p=>p.join(',')).join(' '),head:[wings[0],end,wings[1]].map(p=>p.join(',')).join(' ')};
}
export function cagePath(cells) {
  const edges=[];
  for (const i of cells) {
    const x=i%3,y=Math.floor(i/3);
    if (!cells.includes(i-3)) edges.push([[x,y],[x+1,y]]);
    if (x===2 || !cells.includes(i+1)) edges.push([[x+1,y],[x+1,y+1]]);
    if (!cells.includes(i+3)) edges.push([[x+1,y+1],[x,y+1]]);
    if (x===0 || !cells.includes(i-1)) edges.push([[x,y+1],[x,y]]);
  }
  const outline=[edges[0][0]];
  while (outline.length<=edges.length) {
    const next=edges.find(e=>e[0].join()===outline.at(-1).join())[1];
    if (next.join()===outline[0].join()) break;
    outline.push(next);
  }
  const corners=outline.filter((point,i)=>{
    const prev=outline[(i+outline.length-1)%outline.length],next=outline[(i+1)%outline.length];
    return (point[0]-prev[0])*(next[1]-point[1])!==(point[1]-prev[1])*(next[0]-point[0]);
  });
  return corners.map((point,i)=>{
    const prev=corners[(i+corners.length-1)%corners.length],next=corners[(i+1)%corners.length];
    const dx1=point[0]-prev[0],dy1=point[1]-prev[1],dx2=next[0]-point[0],dy2=next[1]-point[1];
    return `${i?'L':'M'}${point[0]*100-8*(Math.sign(dy1)+Math.sign(dy2))},${point[1]*100+8*(Math.sign(dx1)+Math.sign(dx2))}`;
  }).join(' ')+' Z';
}

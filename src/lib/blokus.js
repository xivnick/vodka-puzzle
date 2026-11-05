import { pentominoes, classifyPentomino, edgeKey, parsePentominousState } from './pentominous.js';

export const blokus = {
  cols: 13, rows: 9,
  dots: [[3,1],[7,1],[5,2],[7,2],[3,4],[6,4],[7,4],[5,5],[8,5],[9,5],[12,5],[5,6],[3,7],[10,7],[11,7],[4,8]],
};
export const pieces = Object.fromEntries('FNILPTVWUXYZ'.split('').map(name => [name, pentominoes[name]]));
export { edgeKey };

export function edgeSegment(key) {
  const [a,b] = key.split(':').map(Number), {cols} = blokus;
  return b-a === 1
    ? [b%cols, Math.floor(a/cols), b%cols, Math.floor(a/cols)+1]
    : [a%cols, Math.floor(b/cols), a%cols+1, Math.floor(b/cols)];
}

export function parseState(saved, puzzleId) {
  if (saved?.version === 2 || saved?.version === 1 && Array.isArray(saved.lines)) return parsePentominousState(blokus,saved,puzzleId);
  // Preserve progress made with the earlier placement UI as block outlines.
  if (saved?.version !== 1 || saved.puzzleId !== puzzleId || !Array.isArray(saved.placements) || saved.placements.length > 12) return null;
  const occupied = new Map(), names = new Set();
  for (const p of saved.placements) {
    if (!p || !Object.hasOwn(pieces,p.name) || names.has(p.name) || !Number.isInteger(p.turn) || p.turn<0 || p.turn>3 || typeof p.flip !== 'boolean' || !Number.isInteger(p.x) || !Number.isInteger(p.y)) return null;
    names.add(p.name);
    let cells=pieces[p.name].map(([x,y]) => [p.flip ? -x : x,y]);
    for(let n=0;n<p.turn;n++) cells=cells.map(([x,y]) => [-y,x]);
    const minX=Math.min(...cells.map(([x])=>x)), minY=Math.min(...cells.map(([,y])=>y));
    for(const [cx,cy] of cells) {
      const x=cx-minX+p.x, y=cy-minY+p.y, index=y*blokus.cols+x;
      if(x<0 || y<0 || x>=blokus.cols || y>=blokus.rows || occupied.has(index)) return null;
      occupied.set(index,p.name);
    }
  }
  const lines = new Set();
  for(const [index,name] of occupied) for(const next of neighbors(index)) {
    if(occupied.get(next)!==name) lines.add(edgeKey(index,next));
  }
  return {lines,crosses:new Set()};
}

function neighbors(index) {
  const {rows,cols}=blokus, x=index%cols, y=Math.floor(index/cols);
  return [x>0 ? index-1 : null,x<cols-1 ? index+1 : null,y>0 ? index-cols : null,y<rows-1 ? index+cols : null].filter(n=>n!==null);
}

export function inspect(lines) {
  const {rows,cols}=blokus;
  const visited=new Set(), blocks=[], counts={};
  for(let start=0;start<rows*cols;start++) {
    if(visited.has(start)) continue;
    const pending=[start], cells=[];
    visited.add(start);
    while(pending.length) {
      const current=pending.pop(); cells.push(current);
      for(const next of neighbors(current)) {
        if(visited.has(next) || lines.has(edgeKey(current,next)))continue;
        visited.add(next);pending.push(next);
      }
    }
    if(cells.length!==5)continue;
    const name=classifyPentomino(cells,cols);
    if(!name)continue;
    counts[name]=(counts[name] || 0)+1;
    blocks.push({name,cells,bad:false});
  }
  const board=Array.from({length:rows},()=>Array(cols).fill(null));
  for(const block of blocks) for(const index of block.cells)board[Math.floor(index/cols)][index%cols]=block;
  const at=(x,y)=>board[y]?.[x];
  for(const block of blocks) {
    if(counts[block.name]>1)block.bad=true;
    for(const index of block.cells)for(const next of neighbors(index)) {
      const other=at(next%cols,Math.floor(next/cols));
      if(other && other!==block)block.bad=other.bad=true;
    }
  }
  const dots=new Set(blokus.dots.map(p=>p.join(','))), metDots=new Set();
  for(let y=1;y<rows;y++)for(let x=1;x<cols;x++) {
    for(const [a,b] of [[at(x-1,y-1),at(x,y)],[at(x,y-1),at(x-1,y)]]) {
      if(!a || !b || a===b)continue;
      if(dots.has(`${x},${y}`))metDots.add(`${x},${y}`);
      else a.bad=b.bad=true;
    }
  }
  const complete=Object.keys(pieces).every(name=>counts[name]===1) && blocks.every(b=>!b.bad) && metDots.size===dots.size;
  return {blocks,counts,metDots,complete};
}

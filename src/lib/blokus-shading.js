import { blokus, pieces } from './blokus.js';
import { classifyPentomino } from './pentominous.js';
export { blokus, pieces };

export function parseState(saved,puzzleId) {
  if(saved?.version!==3 || saved.puzzleId!==puzzleId || !Array.isArray(saved.filled))return null;
  const filled=new Set(saved.filled);
  if(filled.size!==saved.filled.length || [...filled].some(n=>!Number.isInteger(n) || n<0 || n>=blokus.rows*blokus.cols))return null;
  return filled;
}
function neighbors(index) {
  const {cols,rows}=blokus,x=index%cols,y=Math.floor(index/cols);
  return [x>0 ? index-1 : null,x<cols-1 ? index+1 : null,y>0 ? index-cols : null,y<rows-1 ? index+cols : null].filter(n=>n!==null);
}
export function inspect(filled) {
  const {rows,cols}=blokus,visited=new Set(),blocks=[],counts={};
  for(const start of filled) {
    if(visited.has(start))continue;
    const pending=[start],cells=[];
    visited.add(start);
    while(pending.length) {
      const current=pending.pop();cells.push(current);
      for(const next of neighbors(current))if(filled.has(next) && !visited.has(next)) {
        visited.add(next);pending.push(next);
      }
    }
    const name=classifyPentomino(cells,cols);
    if(name)counts[name]=(counts[name] || 0)+1;
    blocks.push({name,cells,bad:cells.length>=5 && !name});
  }
  const board=Array.from({length:rows},()=>Array(cols).fill(null));
  for(const block of blocks) {
    if(block.name && counts[block.name]>1)block.bad=true;
    for(const cell of block.cells)board[Math.floor(cell/cols)][cell%cols]=block;
  }
  const at=(x,y)=>board[y]?.[x],dots=new Set(blokus.dots.map(p=>p.join(','))),metDots=new Set();
  for(let y=1;y<rows;y++)for(let x=1;x<cols;x++) {
    for(const [a,b] of [[at(x-1,y-1),at(x,y)],[at(x,y-1),at(x-1,y)]]) {
      if(!a || !b || a===b)continue;
      if(dots.has(`${x},${y}`))metDots.add(`${x},${y}`);
      else a.bad=b.bad=true;
    }
  }
  const complete=blocks.length===12 && blocks.every(b=>b.name && !b.bad) && Object.keys(pieces).every(name=>counts[name]===1) && metDots.size===dots.size;
  return {blocks,counts,metDots,complete};
}

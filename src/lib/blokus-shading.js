import { blokus, pieces } from './blokus.js';
import { classifyPentomino } from './pentominous.js';
export { blokus, pieces };

export function parseState(saved,puzzleId,grid=blokus) {
  if(![1,3,4].includes(saved?.version) || saved.puzzleId!==puzzleId || !Array.isArray(saved.filled) || saved.version!==3 && !Array.isArray(saved.crosses))return null;
  const filled=new Set(saved.filled),crosses=new Set(saved.version===3 ? [] : saved.crosses);
  const valid=n=>Number.isInteger(n) && n>=0 && n<grid.rows*grid.cols;
  if(filled.size!==saved.filled.length || crosses.size!==(saved.version===3 ? 0 : saved.crosses.length) || [...filled,...crosses].some(n=>!valid(n)) || [...crosses].some(n=>filled.has(n)))return null;
  return {filled,crosses};
}
function neighbors(index,grid) {
  const {cols,rows}=grid,x=index%cols,y=Math.floor(index/cols);
  return [x>0 ? index-1 : null,x<cols-1 ? index+1 : null,y>0 ? index-cols : null,y<rows-1 ? index+cols : null].filter(n=>n!==null);
}
export function inspect(filled,grid=blokus,crosses=new Set()) {
  const {rows,cols}=grid,visited=new Set(),blocks=[],counts={};
  for(const start of filled) {
    if(visited.has(start))continue;
    const pending=[start],cells=[];
    visited.add(start);
    while(pending.length) {
      const current=pending.pop();cells.push(current);
      for(const next of neighbors(current,grid))if(filled.has(next) && !visited.has(next)) {
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
  const at=(x,y)=>board[y]?.[x],dots=new Set(grid.dots.map(p=>p.join(','))),metDots=new Set();
  for(let y=1;y<rows;y++)for(let x=1;x<cols;x++) {
    for(const [a,b] of [[at(x-1,y-1),at(x,y)],[at(x,y-1),at(x-1,y)]]) {
      if(!a || !b || a===b)continue;
      if(dots.has(`${x},${y}`))metDots.add(`${x},${y}`);
      else a.bad=b.bad=true;
    }
  }
  const piecesComplete=blocks.length===12 && blocks.every(b=>b.name && !b.bad) && Object.keys(pieces).every(name=>counts[name]===1);
  // Inside: perimeter sides. Outside: unused sides. Both equal 4 minus filled neighbors.
  // Unmarked cells can still be filled; X marks count as the player's excluded cells.
  const badCells=new Set(),clueErrors=new Set();
  grid.clues?.forEach((row,y)=>row.forEach((clue,x)=>{
    if(clue===null)return;
    const index=y*cols+x,around=neighbors(index,grid);
    const adjacent=around.filter(next=>filled.has(next)).length;
    const unknown=piecesComplete ? 0 : around.filter(next=>!filled.has(next) && !crosses.has(next)).length;
    const required=4-clue;
    if(adjacent!==required)badCells.add(index);
    if(adjacent>required || adjacent+unknown<required)clueErrors.add(index);
  }));
  const complete=badCells.size===0 && piecesComplete && metDots.size===dots.size;
  return {blocks,counts,metDots,badCells,clueErrors,complete};
}

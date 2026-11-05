import { pentominoes } from './pentominous.js';

export const blokus = {
  cols: 13, rows: 9,
  dots: [[3,1],[7,1],[5,2],[7,2],[3,4],[6,4],[7,4],[5,5],[8,5],[9,5],[12,5],[5,6],[3,7],[10,7],[11,7],[4,8]],
};
export const pieces = Object.fromEntries(['F','N','I','L','P','T','V','W','U','X','Y','Z'].map(name => [name, pentominoes[name]]));
export function shape(name, turn = 0, flip = false) {
  let cells = pieces[name].map(([x,y]) => [flip ? -x : x,y]);
  for (let n = 0; n < turn; n++) cells = cells.map(([x,y]) => [-y,x]);
  const minX = Math.min(...cells.map(([x]) => x)), minY = Math.min(...cells.map(([,y]) => y));
  return cells.map(([x,y]) => [x-minX,y-minY]);
}
export function cellsOf(piece) {
  return shape(piece.name, piece.turn, piece.flip).map(([x,y]) => [x+piece.x,y+piece.y]);
}
export function boardOf(placements) {
  const board = Array.from({length: blokus.rows}, () => Array(blokus.cols).fill(null));
  for (const piece of placements) for (const [x,y] of cellsOf(piece)) {
    if (x < 0 || y < 0 || x >= blokus.cols || y >= blokus.rows || board[y][x]) return null;
    board[y][x] = piece.name;
  }
  return board;
}
export function parseState(saved, puzzleId) {
  if (saved?.version !== 1 || saved.puzzleId !== puzzleId || !Array.isArray(saved.placements) || saved.placements.length > 12) return null;
  const placements = saved.placements;
  if (new Set(placements.map(p => p?.name)).size !== placements.length || placements.some(p => !p || !Object.hasOwn(pieces,p.name) || !Number.isInteger(p.turn) || p.turn < 0 || p.turn > 3 || typeof p.flip !== 'boolean' || !Number.isInteger(p.x) || !Number.isInteger(p.y))) return null;
  return boardOf(placements) ? placements.map(p => ({name:p.name,turn:p.turn,flip:p.flip,x:p.x,y:p.y})) : null;
}
export function inspect(placements) {
  const board = boardOf(placements);
  if (!board) return {solved:false, message:'블록이 겹치거나 격자 밖으로 나갔습니다.'};
  const at = (x,y) => board[y]?.[x];
  for (let y=0;y<blokus.rows;y++) for (let x=0;x<blokus.cols;x++) {
    const a=at(x,y);
    if (a && [[x+1,y],[x,y+1]].some(([nx,ny]) => at(nx,ny) && at(nx,ny)!==a)) return {solved:false,message:'서로 다른 블록은 변끼리 맞닿을 수 없습니다.'};
  }
  const dots = new Set(blokus.dots.map(p => p.join(',')));
  for (let y=1;y<blokus.rows;y++) for (let x=1;x<blokus.cols;x++) {
    const contact = [[at(x-1,y-1),at(x,y)],[at(x,y-1),at(x-1,y)]].some(([a,b]) => a && b && a!==b);
    if (contact && !dots.has(`${x},${y}`)) return {solved:false,message:'점이 없는 곳에서 서로 다른 블록이 대각선으로 맞닿았습니다.'};
    if (!contact && dots.has(`${x},${y}`)) return {solved:false,message:'모든 점에서 서로 다른 블록이 대각선으로 맞닿아야 합니다.'};
  }
  if (placements.length !== 12) return {solved:false,message:'주어진 블록 12개를 모두 놓아주세요.'};
  return {solved:true,message:'퍼즐을 완성했습니다!'};
}

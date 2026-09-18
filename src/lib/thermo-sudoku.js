// Coordinates are one-based [row, column], ordered from bulb to tip.
export const puzzles = [
 {id:'easy',difficulty:'하',givens:[
 [5,9,0,0,0,0,0,0,6],[0,7,0,0,2,4,8,0,0],[0,0,0,7,0,0,3,4,0],
 [0,0,8,5,0,6,0,0,0],[0,0,0,0,0,0,0,9,0],[1,0,0,4,0,8,0,0,0],
 [2,0,0,0,5,0,6,0,7],[0,0,0,0,0,0,0,0,0],[0,0,7,1,0,3,0,2,0]],
 thermometers:[[[3,2],[3,3],[3,4]],[[3,2],[4,2],[5,2]],[[3,7],[3,6],[3,5],[3,4]],[[3,7],[4,7],[5,7],[6,7]],[[5,5],[5,4],[5,3],[5,2]],[[5,5],[6,5],[7,5],[8,5]],[[8,2],[7,2],[6,2],[5,2]],[[8,2],[8,3],[8,4],[8,5]],[[8,7],[7,7],[6,7]],[[8,7],[8,6],[8,5]]]},
 {id:'medium',difficulty:'중',givens:[
 [0,0,0,0,5,0,0,0,0],[2,0,7,0,0,0,0,0,0],[0,0,0,0,0,0,0,2,0],
 [0,7,0,0,0,0,0,0,0],[0,0,0,6,0,3,0,0,0],[0,0,0,0,4,0,0,0,9],
 [0,0,0,0,0,0,0,0,2],[0,0,0,0,0,0,0,6,0],[0,0,2,0,0,1,0,0,0]],
 thermometers:[[[2,5],[1,4],[1,3],[2,2]],[[2,5],[1,6],[1,7],[2,8]],[[2,5],[3,4],[3,3],[2,2]],[[2,5],[3,6],[3,7],[2,8]],[[5,2],[4,1],[3,1],[2,2]],[[5,2],[4,3],[3,3],[2,2]],[[5,2],[6,3],[6,4],[5,5]],[[5,8],[4,7],[3,7],[2,8]],[[5,8],[4,9],[3,9],[2,8]],[[5,8],[6,7],[6,6],[5,5]],[[8,5],[7,4],[6,4],[5,5]],[[8,5],[7,6],[6,6],[5,5]]]},
 {id:'hard',difficulty:'상',givens:[
 [0,0,6,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],
 [0,0,0,0,0,0,0,0,0],[0,0,0,0,0,4,0,0,0],[0,0,0,1,0,0,0,4,0],
 [0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,6,0,0,0]],
 thermometers:[[[3,2],[2,2],[2,3],[3,3]],[[4,3],[3,3],[3,4],[4,4]],[[5,4],[4,4],[4,5],[5,5]],[[2,6],[1,6],[1,7],[2,7]],[[3,7],[2,7],[2,8],[3,8]],[[4,8],[3,8],[3,9],[4,9]],[[6,1],[5,1],[5,2],[6,2]],[[7,2],[6,2],[6,3],[7,3]],[[6,7],[7,7],[7,6],[6,6]],[[7,8],[8,8],[8,7],[7,7]]]}
];
export const previewPuzzles = [
 {id:'photo-20260918-1',difficulty:'사진 1',title:'온도계 스도쿠 · 9×9',givens:Array.from({length:9},()=>Array(9).fill(0)),
 thermometers:[
 [[1,2],[1,3],[1,4],[2,4],[2,3],[2,2],[3,2],[3,3],[3,4]],
 [[2,7],[2,8],[2,9],[3,9],[3,8],[3,7],[4,7],[4,8],[4,9]],
 [[4,4],[4,3],[4,2]],[[5,2],[6,2],[7,2],[8,2]],
 [[8,3],[8,4],[7,4],[6,4],[5,4]],[[9,6],[8,6],[7,6],[6,6]],
 [[6,7],[6,8],[7,8],[8,8],[9,8],[9,7]]]},
 {id:'photo-20260918-2',difficulty:'사진 2',title:'온도계 스도쿠 · 6×6',boxRows:2,boxCols:3,givens:[
 [0,0,0,1,0,0],[0,0,0,0,0,0],[0,0,0,0,0,0],
 [0,0,0,0,0,0],[0,3,0,0,0,0],[0,0,6,0,0,0]],
 thermometers:[[[2,2],[1,1]],[[2,5],[1,6]],[[4,2],[3,1]],[[4,5],[3,6]],[[5,2],[6,1]],[[5,5],[6,6]]]}
];
export const indexOf = ([r,c],size=9) => (r-1)*size+c-1;
export function unitsFor(size=9,boxRows=3,boxCols=3){return [...Array.from({length:size},(_,r)=>Array.from({length:size},(_,c)=>r*size+c)),...Array.from({length:size},(_,c)=>Array.from({length:size},(_,r)=>r*size+c)),...Array.from({length:size},(_,b)=>Array.from({length:size},(_,n)=>(Math.floor(b/(size/boxCols))*boxRows+Math.floor(n/boxCols))*size+b%(size/boxCols)*boxCols+n%boxCols))];}
export const units = unitsFor();
export function conflicts(puzzle,values){
 const size=puzzle.givens?.length||9;const bad=new Set();for(const u of unitsFor(size,puzzle.boxRows||3,puzzle.boxCols||3))for(const i of u)if(values[i]&&u.some(j=>j!==i&&values[i]===values[j]))bad.add(i);
 for(const path of puzzle.thermometers){const ids=path.map(cell=>indexOf(cell,size));ids.forEach((i,a)=>{for(let b=a+1;b<ids.length;b++){const j=ids[b];if(values[i]&&values[j]&&values[i]>=values[j]){bad.add(i);bad.add(j);}}});}return bad;
}
export function solved(puzzle,values){return values.length===puzzle.givens.length**2&&values.every(n=>Number.isInteger(n)&&n>=1&&n<=puzzle.givens.length)&&puzzle.givens.flat().every((n,i)=>!n||values[i]===n)&&conflicts(puzzle,values).size===0;}

export function parseState(puzzle,saved,puzzleId){
 if(!saved||saved.version!==1||saved.puzzleId!==puzzleId||!Array.isArray(saved.values)||saved.values.length!==puzzle.givens.length**2||!saved.values.every(n=>Number.isInteger(n)&&n>=0&&n<=puzzle.givens.length)||!Array.isArray(saved.notes)||saved.notes.length!==puzzle.givens.length**2||!saved.notes.every(a=>Array.isArray(a)&&a.every(n=>Number.isInteger(n)&&n>=1&&n<=puzzle.givens.length)))return null;
 const values=saved.values.map((n,i)=>puzzle.givens.flat()[i]||n);
 return {values,notes:saved.notes.map((a,i)=>values[i]?[]:[...new Set(a)])};
}

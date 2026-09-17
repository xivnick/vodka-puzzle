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
export const indexOf = ([r,c]) => (r-1)*9+c-1;
export const units = [...Array.from({length:9},(_,r)=>Array.from({length:9},(_,c)=>r*9+c)),...Array.from({length:9},(_,c)=>Array.from({length:9},(_,r)=>r*9+c)),...Array.from({length:9},(_,b)=>Array.from({length:9},(_,n)=>(Math.floor(b/3)*3+Math.floor(n/3))*9+b%3*3+n%3))];
export function conflicts(puzzle,values){
 const bad=new Set();for(const u of units)for(const i of u)if(values[i]&&u.some(j=>j!==i&&values[i]===values[j]))bad.add(i);
 for(const path of puzzle.thermometers){const ids=path.map(indexOf);ids.forEach((i,a)=>{if(values[i]&&(values[i]<a+1||values[i]>9-(ids.length-1-a)))bad.add(i);for(let b=a+1;b<ids.length;b++){const j=ids[b];if(values[i]&&values[j]&&values[j]-values[i]<b-a){bad.add(i);bad.add(j);}}});}return bad;
}
export function solved(puzzle,values){return values.length===81&&values.every(n=>Number.isInteger(n)&&n>=1&&n<=9)&&puzzle.givens.flat().every((n,i)=>!n||values[i]===n)&&conflicts(puzzle,values).size===0;}

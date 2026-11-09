// Clues transcribed from the ten supplied Sudoku Raid photos. No stored solutions.
const rows = (...lines) => lines.join('').split('').map(Number);
const path = (...cells) => cells.map(([r,c]) => (r-1)*9+c-1);
const line = (r,c,dr,dc,length) => Array.from({length},(_,i)=>(r-1+dr*i)*9+c-1+dc*i);
export const raids = [
 {name:'클래식',difficulty:1,summary:'가로줄·세로줄·3×3 영역에 1~9를 채우세요',givens:rows('100007009','020050080','003000700','900406000','080000060','000205004','004000600','050090070','700100008')},
 {name:'클래식',difficulty:1,summary:'가로줄·세로줄·3×3 영역에 1~9를 채우세요',givens:rows('001230000','004560000','000000034','000000016','510000048','720000000','390000000','000045600','000078900')},
 {name:'안티-나이트',difficulty:2,summary:'나이트의 움직임으로 닿는 칸에는 서로 다른 숫자를 넣으세요',givens:rows('002000000','080600000','600020000','523790080','800050700','100042000','000074000','000060500','000030040'),rules:['한 칸에서 체스 나이트의 움직임으로 바로 갈 수 있는 칸에는 같은 숫자가 들어갈 수 없습니다.']},
 {name:'사잇값',difficulty:2,summary:'회색 선의 숫자를 양 끝 동그라미의 두 숫자 사이 값으로 채우세요',givens:rows('500000009','001000400','000203000','040000010','007000300','010000090','000607000','005000800','400000001'),lines:[line(1,3,0,1,5),line(9,3,0,1,5),line(3,1,1,0,5),line(3,9,1,0,5),line(2,2,1,1,7),line(2,8,1,-1,7)],rules:['회색 선 위의 숫자는 양 끝 동그라미 칸의 두 숫자 사이에 있는 값이어야 합니다. 동그라미 칸의 숫자와 같을 수 없습니다.','같은 선 위에서 같은 숫자가 반복될 수 있습니다.']},
 {name:'터미네이션',difficulty:2,summary:'인접한 두 칸의 합이나 곱이 0으로 끝나는 경계를 맞추세요',givens:rows('000000000','000050000','000000000','006000700','000000000','800000009','000000000','000000000','000000000'),
 // Each pair is the two cells sharing a boundary marked 0 (one-based row/column).
 edges:[[[1,2],[1,3]],[[1,7],[1,8]],[[1,8],[1,9]],[[1,8],[2,8]],[[1,9],[2,9]],[[2,3],[2,4]],[[2,6],[2,7]],[[2,1],[3,1]],[[3,1],[3,2]],[[3,1],[4,1]],[[3,6],[4,6]],[[4,4],[4,5]],[[4,8],[4,9]],[[4,6],[5,6]],[[4,9],[5,9]],[[5,5],[5,6]],[[5,6],[5,7]],[[5,2],[6,2]],[[5,3],[6,3]],[[5,6],[6,6]],[[5,7],[6,7]],[[6,3],[6,4]],[[6,6],[6,7]],[[6,7],[7,7]],[[7,4],[7,5]],[[7,2],[8,2]],[[8,1],[8,2]],[[8,2],[8,3]],[[8,6],[8,7]],[[8,2],[9,2]],[[8,5],[9,5]],[[8,6],[9,6]],[[8,8],[9,8]],[[8,9],[9,9]],[[9,4],[9,5]]].map(pair=>path(...pair)),rules:['변을 공유하는 두 칸의 합 또는 곱이 0으로 끝나면 그 경계에 0이 표시되어 있습니다.','이 조건을 만족하는 모든 경계가 표시되어 있습니다.']},
 {name:'렌반',difficulty:2,summary:'각 회색 영역을 서로 다른 연속된 숫자들로 채우세요',givens:rows('000070000','000001000','000000000','000000040','400000008','080000000','000000000','000100000','000090000'),regions:[line(1,1,0,1,4),line(2,1,0,1,4),line(3,1,0,1,4),line(1,7,1,0,2),line(3,7,1,0,2),line(1,8,1,0,4),line(1,9,1,0,2),line(3,9,1,0,2),line(6,1,1,0,4),line(6,2,1,0,2),line(8,2,1,0,2),line(6,3,1,0,4),line(7,6,0,1,2),line(7,8,0,1,2),line(8,6,0,1,2),line(8,8,0,1,2),line(9,6,0,1,2),line(9,8,0,1,2)],rules:['같은 회색 영역의 숫자는 서로 모두 다르며, 연속된 숫자들의 집합이어야 합니다. 순서는 상관없습니다.']},
 {name:'스카이스크레이퍼',difficulty:2,summary:'격자 밖 단서에 맞게 보이는 건물의 수를 맞추세요',givens:rows('040070000','000000000','000000005','100000000','000000000','000000008','400000000','000000000','000060070'),outside:[['top',2,7],['top',3,4],['left',4,2],['left',5,3],['right',3,6],['right',4,7],['bottom',5,7],['bottom',6,5]],rules:['격자 안의 숫자는 그만큼 높이를 가지는 건물입니다.','격자 밖 숫자는 그 방향에서 보이는 그 줄의 건물 수입니다. 작은 건물은 큰 건물에 가려집니다.']},
 {name:'가중치 킬러',difficulty:3,summary:'회색 칸은 두 번 더해 화살표 방향의 합을 맞추세요',givens:rows('000000000','000000000','000000000','000000000','000070000','000000000','000000000','000000000','000000000'),shaded:path([1,3],[1,9],[2,3],[2,6],[3,9],[4,1],[6,9],[7,1],[8,4],[8,7],[9,1]),arrows:[['top',1,5],['top',2,13],['top',3,20],['top',4,22],['left',1,70],['left',3,28],['left',5,32],['left',7,8],['right',1,16],['right',3,20],['right',5,31],['right',7,16],['bottom',4,29],['bottom',5,25],['bottom',6,10],['bottom',7,3]],rules:['격자 밖 단서 숫자는 옆 화살표가 가리키는 방향에 있는 숫자들의 합입니다. 회색 칸의 숫자는 두 번 더합니다.','같은 화살표 방향에 있는 숫자들 중 반복되는 숫자가 있을 수도 있습니다.']},
 {name:'XV',difficulty:3,summary:'X·V 단서의 규칙에 맞게 1~9를 채우세요',givens:rows('001000000','000500000','200060000','030007000','004090000','000800000','000000004','000000060','000000500'),rules:['X를 사이에 둔 두 숫자의 합은 10이며, V를 사이에 둔 두 숫자의 합은 5입니다. 가능한 모든 경우가 표시되어 있습니다.','오류는 없습니다. 정말로요.']},
 {name:'짝수 샌드위치',difficulty:3,summary:'양옆이 짝수인 숫자들을 격자 밖 단서에 맞추세요',givens:rows('000000000','000000000','002000300','000000000','000050000','000000000','005000800','000000000','000000000'),outside:[['top',1,[3,5,9]],['top',3,[8]],['top',4,[1]],['top',5,[4]],['top',6,[5,7]],['top',8,[]],['left',0,[5,9]],['left',2,[]],['left',3,[6]],['left',6,[]],['left',7,[1]],['left',8,[1,8]]],rules:['격자 밖 숫자는 그 행이나 열에서 두 짝수와 양옆으로 인접한 모든 숫자입니다. 행에서는 왼쪽·오른쪽, 열에서는 위·아래 칸을 봅니다.','단서 숫자의 순서는 그 줄에서 등장하는 순서와 무관합니다.','-는 조건을 만족하는 숫자가 없다는 뜻입니다. 단서가 없는 줄에는 조건을 만족하는 숫자가 없을 수도, 한 개 또는 여러 개일 수도 있습니다.']},
];
export const units = [...Array.from({length:9},(_,r)=>line(r+1,1,0,1,9)),...Array.from({length:9},(_,c)=>line(1,c+1,1,0,9)),...Array.from({length:9},(_,b)=>Array.from({length:9},(_,i)=>(Math.floor(b/3)*3+Math.floor(i/3))*9+(b%3)*3+i%3))];
export const sightLine = (side,index) => side==='top'?line(1,index+1,1,0,9):side==='bottom'?line(9,index+1,-1,0,9):side==='left'?line(index+1,1,0,1,9):line(index+1,9,0,-1,9);
export function arrowCells(side,index) {
 // The source-image arrows approach grid vertices. Start on the diagonal
 // reached by extending each 45-degree arrow through the board.
 let [r,c] = {top:[0,index-1], left:[index+1,0], right:[index-1,8], bottom:[8,index+1]}[side];
 const dr=side==='top'||side==='left'?1:-1,dc=side==='top'||side==='right'?-1:1,result=[];
 while(r>=0&&r<9&&c>=0&&c<9){result.push(r*9+c);r+=dr;c+=dc;}
 return result;
}
// Preserve the clue positions from the source image.
export function weightedArrowGeometry(side, i) {
 if (side === 'top') return {a:[i+.55,-.55], b:[i+.1,-.1], t:[i+1,-.8]};
 if (side === 'left') return {a:[-.55,i+.45], b:[-.1,i+.9], t:[-.85,i+.2]};
 if (side === 'right') return {a:[9.55,i+.55], b:[9.1,i+.1], t:[9.85,i+.95]};
 return {a:[i+.5,9.5], b:[i+.95,9.05], t:[i+.15,9.95]};
}
export function conflicts(puzzle,values) {
 const bad=new Set(), mark=cells=>cells.forEach(i=>bad.add(i));
 for(const unit of units) for(const i of unit) if(values[i]&&unit.some(j=>j!==i&&values[j]===values[i])) bad.add(i);
 if(puzzle.name==='안티-나이트') for(let i=0;i<81;i++) for(const [dr,dc] of [[1,2],[1,-2],[2,1],[2,-1]]){
  const r=Math.floor(i/9)+dr,c=i%9+dc,j=r*9+c;if(r<9&&c>=0&&c<9&&values[i]&&values[i]===values[j])mark([i,j]);
 }
 for(const cells of puzzle.lines||[]){const a=values[cells[0]],b=values[cells.at(-1)];if(a&&b)for(const i of cells.slice(1,-1))if(values[i]&&(values[i]<=Math.min(a,b)||values[i]>=Math.max(a,b)))mark([cells[0],i,cells.at(-1)]);}
 for(const cells of puzzle.regions||[]){const ns=cells.map(i=>values[i]).filter(Boolean);if(new Set(ns).size!==ns.length||(ns.length&&Math.max(...ns)-Math.min(...ns)>=cells.length))mark(cells);}
 if(['터미네이션','XV'].includes(puzzle.name))for(let i=0;i<81;i++)for(const j of [i%9<8?i+1:-1,i<72?i+9:-1])if(j>=0&&values[i]&&values[j]){
 const a=values[i],b=values[j],actual=puzzle.name==='XV'?a+b===5||a+b===10:(a+b)%10===0||(a*b)%10===0;
 const expected=puzzle.edges?.some(([x,y])=>x===i&&y===j)||false;if(actual!==expected)mark([i,j]);
 }
 return bad;
}
export function skyscraperClueConflicts(puzzle, values) {
 const bad = new Set();
 if (puzzle.name !== '스카이스크레이퍼') return bad;
 puzzle.outside.forEach(([side, index, clue], clueIndex) => {
  const cells = sightLine(side, index);
  if (!cells.every(i => values[i])) return;
  let highest = 0, visible = 0;
  for (const i of cells) if (values[i] > highest) { highest = values[i]; visible++; }
  if (visible !== clue) bad.add(clueIndex);
 });
 return bad;
}
export function weightedArrowStates(puzzle, values) {
 return (puzzle.arrows || []).map(([side, index, clue]) => {
  const cells = arrowCells(side, index);
  const sum = cells.reduce((total, i) => total + values[i] * (puzzle.shaded.includes(i) ? 2 : 1), 0);
  if (sum > clue) return 'invalid';
  if (!cells.every(i => values[i])) return 'pending';
  return sum === clue ? 'valid' : 'invalid';
 });
}
export function sandwichClueStates(puzzle, values) {
 if (puzzle.name !== '짝수 샌드위치') return [];
 const even = n => n > 0 && n % 2 === 0;
 return puzzle.outside.map(([side, index, clues]) => {
  const ns = sightLine(side, index).map(i => values[i]);
  const full = ns.every(Boolean);
  const actual = ns.slice(1, -1).filter((n, i) => n && even(ns[i]) && even(ns[i + 2]));
  if (!clues.length) return [actual.length ? 'invalid' : full ? 'valid' : 'pending'];
  // Any extra sandwich violates this entire set of outside clues.
  if (actual.some(n => !clues.includes(n))) return clues.map(() => 'invalid');
  return clues.map(n => {
   const positions = ns.flatMap((value, i) => value === n ? [i] : []);
   if (!positions.length) return full ? 'invalid' : 'pending';
   if (positions.length > 1) return 'invalid';
   const i = positions[0];
   if (i === 0 || i === 8) return 'invalid';
   const left = ns[i - 1], right = ns[i + 1];
   if ((left && !even(left)) || (right && !even(right))) return 'invalid';
   return even(left) && even(right) ? 'valid' : 'pending';
  });
 });
}
export function solved(puzzle,values){return values.length===81&&values.every((n,i)=>Number.isInteger(n)&&n>=1&&n<=9&&(!puzzle.givens[i]||puzzle.givens[i]===n))&&conflicts(puzzle,values).size===0&&skyscraperClueConflicts(puzzle,values).size===0&&weightedArrowStates(puzzle,values).every(state=>state==='valid')&&sandwichClueStates(puzzle,values).flat().every(state=>state==='valid');}

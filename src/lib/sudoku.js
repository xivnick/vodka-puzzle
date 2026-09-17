export const units = [...Array.from({length:9},(_,r)=>Array.from({length:9},(_,c)=>r*9+c)),...Array.from({length:9},(_,c)=>Array.from({length:9},(_,r)=>r*9+c)),...Array.from({length:9},(_,b)=>Array.from({length:9},(_,n)=>(Math.floor(b/3)*3+Math.floor(n/3))*9+(b%3)*3+n%3))];
const peers = Array.from({length:81},(_,i)=>[...new Set(units.filter(u=>u.includes(i)).flat())].filter(j=>j!==i));
export function countSolutions(input, limit=2) {
 if(typeof input!=='string'||! /^[0-9]{81}$/.test(input))return 0;
 const board=[...input].map(Number);if(units.some(u=>{const n=u.map(i=>board[i]).filter(Boolean);return new Set(n).size!==n.length;}))return 0;let count=0;
 function search(){if(count>=limit)return;let index=-1,options=[];for(let i=0;i<81;i++)if(!board[i]){const used=new Set(peers[i].map(j=>board[j]));const c=[1,2,3,4,5,6,7,8,9].filter(n=>!used.has(n));if(!c.length)return;if(index<0||c.length<options.length){index=i;options=c;}if(c.length===1)break;}
 if(index<0){count++;return;}for(const n of options){board[index]=n;search();}board[index]=0;}
 search();return count;
}
export function grade(input) {
 const board=[...input].map(Number), candidates=board.map((n,i)=>new Set(n?[]:[1,2,3,4,5,6,7,8,9].filter(v=>!peers[i].some(j=>board[j]===v))));
 const techniques={single:0,hiddenSingle:0,locked:0,pair:0};
 function place(i,n,kind){board[i]=n;candidates[i].clear();for(const j of peers[i])candidates[j].delete(n);techniques[kind]++;}
 for(let step=0;step<1000;step++){
  if(board.every(Boolean))return {solved:true,techniques,solution:board.join(''),difficulty:techniques.locked+techniques.pair?'medium':'easy'};
  if(candidates.some((c,i)=>!board[i]&&!c.size))break;
  let changed=false;
  for(let i=0;i<81;i++)if(!board[i]&&candidates[i].size===1){place(i,[...candidates[i]][0],'single');changed=true;break;}if(changed)continue;
  outer:for(const u of units)for(let n=1;n<=9;n++){const cells=u.filter(i=>candidates[i].has(n));if(cells.length===1){place(cells[0],n,'hiddenSingle');changed=true;break outer;}}if(changed)continue;
  locked:for(const u of units)for(let n=1;n<=9;n++){const cells=u.filter(i=>candidates[i].has(n));if(cells.length<2)continue;for(const v of units){if(u===v||!cells.every(i=>v.includes(i)))continue;const targets=v.filter(i=>!u.includes(i)&&candidates[i].has(n));if(targets.length){targets.forEach(i=>candidates[i].delete(n));techniques.locked++;changed=true;break locked;}}}if(changed)continue;
  pairs:for(const u of units)for(const i of u){if(candidates[i].size!==2)continue;const nums=[...candidates[i]];const twins=u.filter(j=>candidates[j].size===2&&nums.every(n=>candidates[j].has(n)));if(twins.length!==2)continue;const targets=u.filter(j=>!twins.includes(j)&&nums.some(n=>candidates[j].has(n)));if(targets.length){targets.forEach(j=>nums.forEach(n=>candidates[j].delete(n)));techniques.pair++;changed=true;break pairs;}}if(!changed)break;
 }
 return {solved:false,techniques,difficulty:'hard'};
}
export function generateMedium(random=Math.random) {
 const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
 for(let attempt=0;attempt<3000;attempt++){
  const order=()=>shuffle([0,1,2]).flatMap(b=>shuffle([0,1,2]).map(n=>b*3+n));const rows=order(),cols=order(),digits=shuffle([1,2,3,4,5,6,7,8,9]);
  const solution=rows.flatMap(r=>cols.map(c=>digits[(r*3+Math.floor(r/3)+c)%9])).join('');const board=[...solution];
  for(const i of shuffle(Array.from({length:81},(_,i)=>i))){const old=board[i];board[i]='0';if(countSolutions(board.join(''))!==1)board[i]=old;}
  const result=grade(board.join(''));if(result.solved&&result.difficulty==='medium')return {givens:board.join(''),solution,...result};
 }
 throw new Error('Could not generate medium puzzle');
}
export function dailyDate(now=new Date()) { return new Date(now.getTime()+9*3600000).toISOString().slice(0,10); }

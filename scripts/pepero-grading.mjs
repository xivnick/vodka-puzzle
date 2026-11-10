// Design-time logic review. Never guesses, searches for answers or compares to a stored answer.
import {units,stickCombinations} from '../src/lib/pepero-sudoku.js';
const peers=Array.from({length:81},(_,i)=>[...new Set(units.filter(u=>u.includes(i)).flat())].filter(j=>j!==i));
const choose=(items,size)=>{const out=[];function visit(start,a){if(a.length===size){out.push(a);return;}for(let k=start;k<=items.length-(size-a.length);k++)visit(k+1,[...a,items[k]]);}visit(0,[]);return out;};
export function gradePepero(input,sticks,{allowAdvanced=true,allowSticks=true,maxOptions=8}={}) {
 const board=input.flat().slice(), trace=[];
 const techniques={single:0,hiddenSingle:0,locked:0,pointing:0,claiming:0,pair:0,hiddenPair:0,range:0,arithmetic:0,combination:0};
 const candidates=board.map((n,i)=>new Set(n?[]:[1,2,3,4,5,6,7,8,9].filter(n=>!peers[i].some(j=>board[j]===n))));
 const result=solved=>({solved,remaining:board.filter(n=>!n).length,techniques,effort:techniques.locked+2*techniques.pair+3*techniques.hiddenPair,trace});
 const has=(i,n)=>board[i]?board[i]===n:candidates[i].has(n);
 function place(i,n,kind){board[i]=n;candidates[i].clear();for(const j of peers[i])candidates[j].delete(n);techniques[kind]++;}
 function restrict(cells,tuples,kind){
  let removed=0;
  cells.forEach((i,k)=>{if(board[i])return;const supported=new Set(tuples.map(t=>t[k]));for(const n of [...candidates[i]])if(!supported.has(n)){candidates[i].delete(n);removed++;}});
  if(removed){techniques[kind]++;trace.push({kind,handle:cells[0],length:cells.length,unknown:cells.filter(i=>!board[i]).length,options:tuples.length,removed});}
  return removed>0;
 }
 function subset(hidden){
  for(const u of units){const cells=u.filter(i=>!board[i]);const source=hidden?[1,2,3,4,5,6,7,8,9].filter(n=>cells.some(i=>candidates[i].has(n))):cells.filter(i=>candidates[i].size<=2);
   for(const group of choose(source,2)){
    const selected=hidden?cells.filter(i=>group.some(n=>candidates[i].has(n))):group;
    const nums=hidden?group:[...new Set(group.flatMap(i=>[...candidates[i]]))];
    if(selected.length!==2||nums.length!==2)continue;
    let removed=0;for(const i of cells)for(const n of [...candidates[i]])if(hidden?selected.includes(i)&&!nums.includes(n):!selected.includes(i)&&nums.includes(n)){candidates[i].delete(n);removed++;}
    if(removed){const kind=hidden?'hiddenPair':'pair';techniques[kind]++;trace.push({kind,cells:selected,removed});return true;}
   }
  }return false;
 }
 for(let step=0;step<1500;step++){
  if(units.some(u=>{const ns=u.map(i=>board[i]).filter(Boolean);return new Set(ns).size!==ns.length;}))return result(false);
  if(board.every(Boolean))return result(!allowSticks||sticks.every(p=>p.slice(1).reduce((s,i)=>s+board[i],0)-board[p[0]]===11));
  if(candidates.some((s,i)=>!board[i]&&!s.size))return result(false);
  let changed=false;
  for(let i=0;i<81;i++)if(!board[i]&&candidates[i].size===1){place(i,[...candidates[i]][0],'single');changed=true;break;}
  if(changed)continue;
  hidden:for(const u of units)for(let n=1;n<=9;n++){if(u.some(i=>board[i]===n))continue;const positions=u.filter(i=>!board[i]&&candidates[i].has(n));if(!positions.length)return result(false);if(positions.length===1){place(positions[0],n,'hiddenSingle');changed=true;break hidden;}}
  if(changed)continue;
  let eligible=[];
  if(allowSticks){
   for(const cells of sticks){const ts=stickCombinations(cells.length).filter(t=>cells.every((i,k)=>has(i,t[k])));if(!ts.length)return result(false);eligible.push({cells,ts,unknown:cells.filter(i=>!board[i]).length});}
   // Digit bounds are a separate, cheap deduction, and depend on stick length.
   for(const {cells} of eligible)if(restrict(cells,stickCombinations(cells.length),'range')){changed=true;break;}
   if(changed)continue;
   eligible.sort((a,b)=>a.unknown-b.unknown||a.ts.length-b.ts.length);
   for(const {cells,ts,unknown} of eligible)if(unknown===1&&restrict(cells,ts,'arithmetic')){changed=true;break;}
   if(changed)continue;
   for(const {cells,ts,unknown} of eligible)if(unknown>1&&ts.length<=2&&restrict(cells,ts,'combination')){changed=true;break;}
   if(changed)continue;
  }
  if(allowAdvanced){
   locked:for(let a=0;a<units.length;a++)for(let n=1;n<=9;n++){
    const u=units[a],positions=u.filter(i=>!board[i]&&candidates[i].has(n));if(positions.length<2)continue;
    for(let b=0;b<units.length;b++){
     if((a<18)===(b<18))continue;const v=units[b];if(!positions.every(i=>v.includes(i)))continue;
     const targets=v.filter(i=>!u.includes(i)&&!board[i]&&candidates[i].has(n));if(!targets.length)continue;
     targets.forEach(i=>candidates[i].delete(n));techniques.locked++;techniques[a>=18?'pointing':'claiming']++;trace.push({kind:'locked',source:a,target:b,digit:n,removed:targets.length});changed=true;break locked;
    }
   }
   if(changed)continue;
   if(subset(false)||subset(true))continue;
  }
  if(allowSticks){for(const {cells,ts,unknown} of eligible)if(unknown>1&&ts.length<=maxOptions&&restrict(cells,ts,'combination')){changed=true;break;}}
  if(!changed)return result(false);
 }
 return result(false);
}

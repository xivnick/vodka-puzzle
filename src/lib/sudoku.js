export const units = [...Array.from({length:9},(_,r)=>Array.from({length:9},(_,c)=>r*9+c)),...Array.from({length:9},(_,c)=>Array.from({length:9},(_,r)=>r*9+c)),...Array.from({length:9},(_,b)=>Array.from({length:9},(_,n)=>(Math.floor(b/3)*3+Math.floor(n/3))*9+(b%3)*3+n%3))];
const peers = Array.from({length:81},(_,i)=>[...new Set(units.filter(u=>u.includes(i)).flat())].filter(j=>j!==i));
export function countSolutions(input, limit=2) {
 if(typeof input!=='string'||! /^[0-9]{81}$/.test(input))return 0;
 const board=[...input].map(Number);if(units.some(u=>{const n=u.map(i=>board[i]).filter(Boolean);return new Set(n).size!==n.length;}))return 0;let count=0;
 function search(){if(count>=limit)return;let index=-1,options=[];for(let i=0;i<81;i++)if(!board[i]){const used=new Set(peers[i].map(j=>board[j]));const c=[1,2,3,4,5,6,7,8,9].filter(n=>!used.has(n));if(!c.length)return;if(index<0||c.length<options.length){index=i;options=c;}if(c.length===1)break;}
 if(index<0){count++;return;}for(const n of options){board[index]=n;search();}board[index]=0;}
 search();return count;
}
function combinations(items, size) {
 const result=[];
 function choose(from, selected) {
  if(selected.length===size){result.push(selected);return;}
  for(let i=from;i<=items.length-(size-selected.length);i++)choose(i+1,[...selected,items[i]]);
 }
 choose(0,[]);return result;
}
export function grade(input) {
 const techniques={single:0,hiddenSingle:0,locked:0,pointing:0,claiming:0,pair:0,hiddenPair:0,triple:0,hiddenTriple:0};
 const unfinished=()=>({solved:false,techniques,difficulty:'ungraded'});
 if(typeof input!=='string'||!/^[0-9]{81}$/.test(input))return unfinished();
 const board=[...input].map(Number);
 if(units.some(u=>{const values=u.map(i=>board[i]).filter(Boolean);return new Set(values).size!==values.length;}))return unfinished();
 const candidates=board.map((n,i)=>new Set(n?[]:[1,2,3,4,5,6,7,8,9].filter(v=>!peers[i].some(j=>board[j]===v))));
 function place(i,n,kind){board[i]=n;candidates[i].clear();for(const j of peers[i])candidates[j].delete(n);techniques[kind]++;}
 function subset(size, hidden) {
  for(const u of units){
   const cells=u.filter(i=>!board[i]);
   const source=hidden?[1,2,3,4,5,6,7,8,9].filter(n=>cells.some(i=>candidates[i].has(n))):cells.filter(i=>candidates[i].size<=size);
   for(const group of combinations(source,size)){
    const selected=hidden?cells.filter(i=>group.some(n=>candidates[i].has(n))):group;
    const nums=hidden?group:[...new Set(group.flatMap(i=>[...candidates[i]]))];
    if(selected.length!==size||nums.length!==size)continue;
    let changed=false;
    for(const i of cells)for(const n of [...candidates[i]]){
     if(hidden?selected.includes(i)&&!nums.includes(n):!selected.includes(i)&&nums.includes(n)){candidates[i].delete(n);changed=true;}
    }
    if(changed){techniques[hidden?(size===2?'hiddenPair':'hiddenTriple'):(size===2?'pair':'triple')]++;return true;}
   }
  }
  return false;
 }
 for(let step=0;step<1000;step++){
  if(board.every(Boolean))return {solved:true,techniques,solution:board.join(''),difficulty:techniques.locked+techniques.pair+techniques.hiddenPair+techniques.triple+techniques.hiddenTriple?'medium':'easy'};
  if(candidates.some((c,i)=>!board[i]&&!c.size))break;
  let changed=false;
  for(let i=0;i<81;i++)if(!board[i]&&candidates[i].size===1){place(i,[...candidates[i]][0],'single');changed=true;break;}if(changed)continue;
  outer:for(const u of units)for(let n=1;n<=9;n++){const cells=u.filter(i=>candidates[i].has(n));if(cells.length===1){place(cells[0],n,'hiddenSingle');changed=true;break outer;}}if(changed)continue;
  locked:for(let a=0;a<units.length;a++)for(let n=1;n<=9;n++){
   const u=units[a],cells=u.filter(i=>candidates[i].has(n));if(cells.length<2)continue;
   for(let b=0;b<units.length;b++){
    if((a<18)===(b<18))continue;
    const v=units[b];if(!cells.every(i=>v.includes(i)))continue;
    const targets=v.filter(i=>!u.includes(i)&&candidates[i].has(n));
    if(targets.length){targets.forEach(i=>candidates[i].delete(n));techniques.locked++;techniques[a>=18?'pointing':'claiming']++;changed=true;break locked;}
   }
  }if(changed)continue;
  if(subset(2,false)||subset(2,true)||subset(3,false)||subset(3,true))continue;
  break;
 }
 return unfinished();
}
export function generateComplete(random=Math.random) {
 const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
 const board=Array(81).fill(0);
 function fill(){
  let best=10,choices=[];
  for(let i=0;i<81;i++)if(!board[i]){
   const used=new Set(peers[i].map(j=>board[j]));const options=[1,2,3,4,5,6,7,8,9].filter(n=>!used.has(n));
   if(!options.length)return false;
   if(options.length<best){best=options.length;choices=[];}
   if(options.length===best)choices.push({i,options});
  }
  if(!choices.length)return true;
  const {i,options}=choices[Math.floor(random()*choices.length)];
  for(const n of shuffle(options)){board[i]=n;if(fill())return true;}
  board[i]=0;return false;
 }
 if(!fill())throw new Error('Could not generate complete board');
 return board.join('');
}
export function generateDaily(random=Math.random) {
 const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
 const board=[...generateComplete(random)];
 for(const i of shuffle(Array.from({length:81},(_,i)=>i))){const old=board[i];board[i]='0';if(!grade(board.join('')).solved)board[i]=old;}
 const result=grade(board.join(''));return {givens:board.join(''),...result};
}
export function generateMedium(random=Math.random) {
 for(let attempt=0;attempt<3000;attempt++){const puzzle=generateDaily(random);if(puzzle.difficulty==='medium')return puzzle;}
 throw new Error('Could not generate medium puzzle');
}
export function dailyDate(now=new Date()) { return new Date(now.getTime()+9*3600000).toISOString().slice(0,10); }

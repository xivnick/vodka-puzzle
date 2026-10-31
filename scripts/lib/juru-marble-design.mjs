import { marblePath } from '../../src/lib/juru-marble.js';
// Authoring only: no solver or answer is bundled with the playable page.
export const units = [
  ...Array.from({length:9},(_,r)=>Array.from({length:9},(_,c)=>r*9+c)),
  ...Array.from({length:9},(_,c)=>Array.from({length:9},(_,r)=>r*9+c)),
  ...Array.from({length:9},(_,b)=>Array.from({length:9},(_,k)=>(Math.floor(b/3)*3+Math.floor(k/3))*9+b%3*3+k%3)),
];
export const peers = Array.from({length:81},(_,i)=>[...new Set(units.filter(u=>u.includes(i)).flat())].filter(j=>j!==i));
export const path = marblePath.map(([r, c]) => r * 9 + c);
const row=i=>Math.floor(i/9),col=i=>i%9,box=i=>Math.floor(i/27)*3+Math.floor(i%9/3);
const clash=(i,j)=>row(i)===row(j)||col(i)===col(j)||box(i)===box(j);
export const digits=mask=>{const ns=[];for(let n=1;n<=9;n++)if(mask&(1<<n))ns.push(n);return ns};
const single=m=>m&&!(m&(m-1));
const ALL=1022;
export function candidates(board){return board.map((n,i)=>n?1<<n:peers[i].reduce((m,j)=>m&~(1<<board[j]),ALL));}
export function enumerateRoutes(){
 const routes=[];
 function go(at,ns,stops){for(let n=2;n<=9;n++){
  if(ns.includes(n)||at+n>32)continue;
  if(at+n===32){routes.push({numbers:[...ns,n],stops});continue;}
  if(stops.some(p=>clash(path[p],path[at+n])))continue;
  go(at+n,[...ns,n],[...stops,at+n]);
 }}
 go(0,[],[0]);return routes;
}
export function complete(route,random){
 const board=Array(81).fill(0);route.stops.forEach((p,k)=>board[path[p]]=route.numbers[k]);
 const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
 function fill(){let best=-1,opts=[];const cs=candidates(board);for(let i=0;i<81;i++)if(!board[i]){const ns=digits(cs[i]);if(!ns.length)return false;if(best<0||ns.length<opts.length){best=i;opts=ns;}if(ns.length===1)break;}
 if(best<0)return true;for(const n of shuffle(opts)){board[best]=n;if(fill())return true;}board[best]=0;return false;}
 if(!fill())return null;return board;
}
// A candidate can be rejected only by a bounded walk through current Sudoku
// candidates. No hypothetical Sudoku solve and no full-route oracle are used.
function continuation(board,cs,at,used,stops,depth){
 const cell=path[at],options=board[cell]?[board[cell]]:digits(cs[cell]);
 for(const n of options){
  if(used.includes(n)||at+n>32)continue;
  if(at+n===32)return true;
  const next=at+n;if(stops.some(p=>clash(path[p],path[next])))continue;
  if(depth<=1)return true;
  if(continuation(board,cs,next,[...used,n],[...stops,next],depth-1))return true;
 }
 return false;
}
export function walkPrefix(board){let at=0;const used=[],stops=[0];while(board[path[at]]){const n=board[path[at]];if(used.includes(n)||at+n>32)return {invalid:true};used.push(n);at+=n;if(at===32)return {complete:true};if(stops.some(p=>clash(path[p],path[at])))return {invalid:true};stops.push(at);}return {at,used,stops};}
export function grade(input,{route=true,maxLookahead=3,log=true}={}){
 const board=input.slice(),cs=candidates(board),steps=[];
 const emit=e=>{if(log)steps.push(e)};
 function put(i,n,kind,extra={}){board[i]=n;cs[i]=1<<n;for(const j of peers[i])if(!board[j])cs[j]&=~(1<<n);emit({kind,cell:i,value:n,...extra});}
 function hiddenStart(){const cells=units[19].filter(i=>!board[i]);for(let n=1;n<=9;n++){const spots=cells.filter(i=>cs[i]&(1<<n));if(spots.length===1&&spots[0]===4){put(4,n,'hidden-single',{unit:19});return true;}}return false;}
 if(!board[4])hiddenStart();
 for(let iteration=0;iteration<1000;iteration++){
  if(cs.some((m,i)=>!board[i]&&!m))return {solved:false,invalid:true,board,steps};
  if(board.every(Boolean))return {solved:!route||walkPrefix(board).complete===true,board,steps};
  let changed=false;
  for(let i=0;i<81;i++)if(!board[i]&&single(cs[i])){put(i,digits(cs[i])[0],'single');changed=true;break;}if(changed)continue;
  outer:for(let u=0;u<27;u++)for(let n=1;n<=9;n++){
   if(units[u].some(i=>board[i]===n))continue;
   const spots=units[u].filter(i=>!board[i]&&(cs[i]&(1<<n)));
   if(!spots.length)return {solved:false,invalid:true,board,steps};
   if(spots.length===1){put(spots[0],n,'hidden-single',{unit:u});changed=true;break outer;}
  }if(changed)continue;
  // Locked candidates, then naked pairs: ordinary Sudoku only.
  locked:for(let a=0;a<27;a++)for(let n=1;n<=9;n++){
   const spots=units[a].filter(i=>!board[i]&&(cs[i]&(1<<n)));if(spots.length<2)continue;
   for(let b=0;b<27;b++){
    if((a<18)===(b<18)||!spots.every(i=>units[b].includes(i)))continue;
    const targets=units[b].filter(i=>!units[a].includes(i)&&!board[i]&&(cs[i]&(1<<n)));
    if(targets.length){targets.forEach(i=>cs[i]&=~(1<<n));emit({kind:'locked',unit:a,targetUnit:b,value:n,cells:targets});changed=true;break locked;}
   }
  }if(changed)continue;
  pairs:for(let u=0;u<27;u++)for(const i of units[u])if(!board[i]&&digits(cs[i]).length===2){
   const twins=units[u].filter(j=>!board[j]&&cs[j]===cs[i]);if(twins.length!==2)continue;
   const targets=units[u].filter(j=>!board[j]&&!twins.includes(j)&&(cs[j]&cs[i]));
   if(targets.length){const mask=cs[i];targets.forEach(j=>cs[j]&=~mask);emit({kind:'pair',unit:u,cells:twins,targets,values:digits(mask)});changed=true;break pairs;}
  }if(changed)continue;
  if(route){
   const prefix=walkPrefix(board);if(prefix.invalid)return {solved:false,invalid:true,board,steps};
   if(!prefix.complete){const {at,used,stops}=prefix,i=path[at];
    for(const n of digits(cs[i])){
     const assumed=board.slice();assumed[i]=n;
     if(continuation(assumed,cs,at,used,stops,maxLookahead))continue;
     let depth=1;while(depth<maxLookahead&&continuation(assumed,cs,at,used,stops,depth))depth++;
     cs[i]&=~(1<<n);emit({kind:'route-elimination',cell:i,value:n,depth,prefix:used.slice(),stops:stops.map(p=>path[p]),candidates:digits(cs[i])});changed=true;break;
    }
   }
  }if(changed)continue;
  return {solved:false,board,steps,candidates:cs.map(digits)};
 }
 return {solved:false,board,steps};
}

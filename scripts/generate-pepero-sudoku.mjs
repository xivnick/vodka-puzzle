import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateComplete,units} from '../src/lib/sudoku.js';
import {stickCombinations} from '../src/lib/pepero-sudoku.js';
import {gradePepero} from './pepero-grading.mjs';
const args=process.argv.slice(2),option=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const seed=Number(option('--seed','1111202612')),attempts=Number(option('--attempts','1200'));
const output=path.resolve(option('--output',path.join(os.tmpdir(),'pepero-daily-design.json')));
if(!Number.isInteger(seed)||!Number.isInteger(attempts)||attempts<1)throw Error('Expected integer seed and positive attempts.');
let state=seed>>>0;
const random=()=>{state+=0x6D2B79F5;let t=state;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const peers=Array.from({length:81},(_,i)=>[...new Set(units.filter(u=>u.includes(i)).flat())].filter(j=>j!==i));
let best=null,eligible=0;
for(let attempt=0;attempt<attempts;attempt++){
 // The constructed grid is transient. Output contains clues and design metrics only.
 const complete=[...generateComplete(random)].map(Number),options={3:[],4:[]};
 for(let i=0;i<81;i++)for(const [dr,dc] of [[0,1],[0,-1],[1,0],[-1,0]])for(const length of [3,4]){
  const r=Math.floor(i/9),c=i%9;if(r+(length-1)*dr<0||r+(length-1)*dr>8||c+(length-1)*dc<0||c+(length-1)*dc>8)continue;
  const p=Array.from({length},(_,k)=>(r+k*dr)*9+c+k*dc);
  if(p.slice(1).reduce((s,j)=>s+complete[j],0)-complete[p[0]]===11)options[length].push(p);
 }
 let sticks=null,used;
 for(let retry=0;retry<20;retry++){
  const selected=[];used=new Set();
  for(const [length,target] of [[4,2],[3,8]]){
   for(const p of shuffle(options[length])){
    if(selected.length===target)break;
    if(p.some(i=>used.has(i)))continue;
    if(length===4&&selected.length===1&&Math.abs(p[1]-p[0])===Math.abs(selected[0][1]-selected[0][0]))continue;
    selected.push(p);p.forEach(i=>used.add(i));
   }
   if(selected.length!==target)break;
  }
  if(selected.length!==8)continue;
  const vertical=selected.filter(p=>Math.abs(p[1]-p[0])===9).length;if(vertical<3||vertical>5)continue;
  sticks=[...shuffle(selected.slice(2)),...selected.slice(0,2)];break;
 }
 if(!sticks)continue;
 const protectedCells=new Set();
 for(const p of sticks.slice(0,2))shuffle(p).slice(0,2).forEach(i=>protectedCells.add(i));
 for(const p of [...sticks.slice(2,4),...sticks.slice(6)])protectedCells.add(p[Math.floor(random()*p.length)]);
 const givens=complete.map((n,i)=>!used.has(i)||protectedCells.has(i)?n:0);
 for(const i of shuffle(Array.from({length:81},(_,i)=>i).filter(i=>!used.has(i)))){
  if(givens.filter(Boolean).length<=24)break;
  if(units.some(u=>u.includes(i)&&u.filter(j=>givens[j]).length<=1))continue;
  const n=givens[i];givens[i]=0;
  if(!gradePepero(givens,sticks,{maxOptions:6}).solved)givens[i]=n;
 }
 const full=gradePepero(givens,sticks,{maxOptions:6});
 if(!full.solved||full.effort<4||!full.techniques.locked||full.techniques.pair+full.techniques.hiddenPair<1)continue;
 const basic=gradePepero(givens,sticks,{allowAdvanced:false,maxOptions:6});
 const classic=gradePepero(givens,sticks,{allowSticks:false});
 if(basic.remaining<10||classic.remaining<20)continue;
 const cs=givens.map((n,i)=>n?[n]:[1,2,3,4,5,6,7,8,9].filter(n=>!peers[i].some(j=>givens[j]===n)));
 const opening=sticks.map(p=>{const ts=stickCombinations(p.length).filter(t=>p.every((i,k)=>cs[i].includes(t[k])));return {length:p.length,givens:p.filter(i=>givens[i]).length,options:ts.length,forced:p.filter((i,k)=>!givens[i]&&new Set(ts.map(t=>t[k])).size===1).length};});
 if(opening.slice(6).some(o=>o.options<2||o.options>16||o.forced))continue;
 if(opening.filter(o=>o.forced).length>3)continue;
 eligible++;
 const combinations=full.trace.filter(e=>e.kind==='combination');
 const score=100-8*Math.abs(full.effort-7)-5*Math.abs(full.techniques.combination-3)-6*Math.max(0,givens.filter(Boolean).length-24)-4*Math.max(0,opening.filter(o=>o.forced).length-3)-combinations.reduce((s,e)=>s+Math.max(0,e.options-4),0);
 if(!best||score>best.score){
  best={seed,attempt:attempt+1,score,givens:Array.from({length:9},(_,r)=>givens.slice(r*9,r*9+9)),sticks,analysis:{clues:givens.filter(Boolean).length,opening,full,basicRemaining:basic.remaining,classicRemaining:classic.remaining}};
  fs.writeFileSync(output,JSON.stringify(best,null,2)+'\n');
  console.log(JSON.stringify({attempt:attempt+1,eligible,score,clues:best.analysis.clues,effort:full.effort,techniques:full.techniques}));
 }
 if(best.score>=95)break;
}
if(!best)throw Error('No candidate met the daily-level constraints; try another seed or more attempts.');
console.log(JSON.stringify({output,seed,selectedAttempt:best.attempt,score:best.score}));

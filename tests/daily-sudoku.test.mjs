import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {countSolutions,grade,generateMedium,dailyDate,units} from '../src/lib/sudoku.js';
import {rankings} from '../src/lib/daily-sudoku-client.js';
import '../public/js/ranking-ui.js';
test('daily date changes at Korean midnight, including year boundary',()=>{
 assert.equal(dailyDate(new Date('2026-09-16T14:59:59Z')),'2026-09-16');
 assert.equal(dailyDate(new Date('2026-09-16T15:00:00Z')),'2026-09-17');
 assert.equal(dailyDate(new Date('2025-12-31T14:59:59Z')),'2025-12-31');
});
test('daily local play uses one key and preserves old account and guest saves',()=>{
 const source=fs.readFileSync('src/scripts/daily-sudoku.js','utf8');
 const start=source.indexOf('function loadLocalDay('),end=source.indexOf('function isSolved()',start);
 const values=new Map([
  ['daily-sudoku:guest:2026-09-28',JSON.stringify({values:[1]})],
  ['daily-sudoku:account-a:2026-09-29',JSON.stringify({values:[2]})],
 ]);
 const sandbox=vm.createContext({window:{puzzleAccount:{user:null}},localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}});
 vm.runInContext(source.slice(start,end),sandbox);
 assert.equal(vm.runInContext("loadLocalDay('2026-09-28').values[0]",sandbox),1);
 assert.equal(values.get('daily-sudoku:local:2026-09-28'),values.get('daily-sudoku:guest:2026-09-28'));
 sandbox.window.puzzleAccount.user={id:'account-a'};
 assert.equal(vm.runInContext("loadLocalDay('2026-09-28').values[0]",sandbox),1);
 assert.equal(vm.runInContext("loadLocalDay('2026-09-29').values[0]",sandbox),2);
 assert.equal(values.get('daily-sudoku:account-a:2026-09-29'),JSON.stringify({values:[2]}));
});
test('generated medium puzzles have one solution and need candidate elimination',()=>{
 let seed=472;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
 for(let n=0;n<3;n++){const p=generateMedium(random);assert.equal(countSolutions(p.givens),1);const result=grade(p.givens);assert.equal(result.solved,true);assert.equal(result.difficulty,'medium');assert.equal(result.solution,p.solution);assert.ok(result.techniques.locked+result.techniques.pair>0);for(const unit of units)assert.equal(new Set(unit.map(i=>p.solution[i])).size,9);}
});
test('daily puzzle stays outside paginated semester IDs and has a heading with a right-side rank buttons',()=>{
 const home=fs.readFileSync('src/pages/index.astro','utf8');assert.ok(home.indexOf('id="dailyCard"')<home.indexOf('{visible.map'));assert.match(home,/id="dailyRankBtn"/);assert.match(home,/class="lb-title" id="rankTitle"/);assert.ok(!home.includes('dailyRankDate'));assert.match(home,/id="dailyRankPanel"/);
 const card=home.match(/<a id="dailyCard"[^>]+>/)[0];assert.ok(!card.includes('data-puzzle-id'));
});

test('daily puzzle rankings add a rabbit after moon solver names',()=>{
 const original=globalThis.document;
 const node=()=>({children:[],replaceChildren(...children){this.children=children;},append(...children){this.children.push(...children);}});
 globalThis.document={createElement:node};
 try{
  const element=node();
  rankings(element,[{rank:1,nickname:'moon',completed_at:'2026-09-25T01:00:00Z'}],{moonSolvers:new Set(['moon'])});
  const name=element.children[0].children[0].children[1];
  assert.equal(name.className,'lb-name seasonal-rank-name');
  assert.equal(name.children[0].textContent,'moon');
  assert.equal(name.children[1].src,'/icons/seasonal/rabbit.svg');
  assert.equal(name.children[1].alt,'한가위 스도쿠 완성');
 }finally{globalThis.document=original;}
});

test('daily puzzle rankings add a flower after Ran-yeong solver names',()=>{
 const original=globalThis.document;
 const node=()=>({children:[],replaceChildren(...children){this.children=children;},append(...children){this.children.push(...children);}});
 globalThis.document={createElement:node};
 try{
  const element=node();
  rankings(element,[{rank:1,nickname:'flower',completed_at:'2026-09-28T01:00:00Z'}],{flowerSolvers:new Set(['flower'])});
  const badge=element.children[0].children[0].children[1].children[1];
  assert.equal(badge.src,'/icons/flower/flower.svg');
  assert.equal(badge.alt,'란영 스도쿠 완성');
 }finally{globalThis.document=original;}
});

test('daily puzzle ranking folds like a regular puzzle and keeps the final rank visible',()=>{
 const original=globalThis.document;
 const node=()=>({children:[],attributes:{},listeners:{},replaceChildren(...children){this.children=children;},append(...children){this.children.push(...children);},setAttribute(key,value){this.attributes[key]=value;},addEventListener(type,listener){this.listeners[type]=listener;}});
 globalThis.document={createElement:node};
 try{
  const element=node();
  const rows=Array.from({length:13},(_,index)=>({rank:index+1,nickname:`solver-${index+1}`,completed_at:'2026-09-28T01:00:00Z',is_me:index===11}));
  rankings(element,rows);
  const folded=element.children[0].children;
  assert.equal(folded.length,14);
  assert.equal(folded[10].children[0].textContent,'⋯');
  assert.equal(folded[11].children[0].textContent,12);
  assert.equal(folded[12].children[0].textContent,'⋯');
  assert.equal(folded[13].children[0].textContent,13);
  folded[10].listeners.click();
  assert.equal(element.children[0].children.length,13);
 }finally{globalThis.document=original;}
});

test('malformed or conflicting boards have no solution',()=>{assert.equal(countSolutions('1'.repeat(81)),0);assert.equal(countSolutions('0'.repeat(80)),0);});

test('full valid board submits automatically once; partial and conflicting boards do not',async()=>{
 const {default:vm}=await import('node:vm');
 const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{addEventListener(){},setAttribute(){},textContent:''});return elements.get(id);};
 const calls=[];const sandbox=vm.createContext({units,URLSearchParams,location:{search:''},document:{getElementById:element,addEventListener(){}},window:{addEventListener(){},puzzleAccount:{user:{id:'test'},profile:{nickname:'test'},client:{rpc:async(name,args)=>{calls.push({name,args});return {data:{rank:1,completed_at:'2026-09-16T03:00:00Z'}};}}}},context:async()=>({current_day:'2026-09-16',rankings:[]}),getMoonBadgeSolvers:async()=>new Set(),getFlowerBadgeSolvers:async()=>new Set(),rankings(){},renderStreak(){},time:()=> '12:00:00'});
 const source=fs.readFileSync('src/scripts/daily-sudoku.js','utf8').replace(/^import .*;\n/gm,'').split('init();setInterval(')[0];
 vm.runInContext(source,sandbox);
 const solution=Array.from({length:81},(_,i)=>((Math.floor(i/9)*3+Math.floor(Math.floor(i/9)/3)+i%9)%9)+1);
 vm.runInContext(`ready=true;data={day:'2026-09-16',givens:'0'.repeat(81)};state={values:${JSON.stringify(solution)},notes:[]};state.values[80]=0;`,sandbox);
 await vm.runInContext('submit()',sandbox);assert.equal(calls.length,0);
 vm.runInContext('state.values[80]=state.values[79]',sandbox);await vm.runInContext('submit()',sandbox);assert.equal(calls.length,0);
 vm.runInContext(`state.values=${JSON.stringify(solution)}`,sandbox);await vm.runInContext('submit()',sandbox);await vm.runInContext('submit()',sandbox);
 assert.equal(calls.length,1);assert.equal(calls[0].name,'submit_completion');assert.equal(calls[0].args.requested_puzzle,'daily-sudoku:2026-09-16');assert.deepEqual(Array.from(calls[0].args.submitted_state.values),solution);assert.equal(calls[0].args.state_version,1);
});

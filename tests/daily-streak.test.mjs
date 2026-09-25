import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {renderStreak,renderStreakRankings} from '../src/lib/daily-streak.js';
import {context} from '../src/lib/daily-sudoku-client.js';
function node(){return {children:[],hidden:false,attributes:{},listeners:{},replaceChildren(...children){this.children=children;},append(...children){this.children.push(...children);},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},addEventListener(type,listener){this.listeners[type]=listener;}};}
test('streak renders no record, outline, rest and restored completion with accessible labels',()=>{
 const original=globalThis.document;globalThis.document={createElement:node};
 try{
  const el=node();
  for(const [count,status,icon] of [[6,'pending','flame'],[6,'rest','zzz'],[7,'completed','flame-filled']]){
   renderStreak(el,{count,status});assert.equal(el.hidden,false);assert.equal(el.children[0].textContent,String(count));assert.equal(el.children[1].src,`/icons/daily-streak/${icon}.svg`);assert.equal(el.children[1].width,14);
  }
  renderStreak(el,{count:0,status:'none'},{label:true});assert.equal(el.hidden,false);assert.equal(el.children[0].textContent,'1일 연속 도전 중..');assert.equal(el.children[1].src,'/icons/daily-streak/flame.svg');
  renderStreak(el,{count:6,status:'pending'},{label:true});assert.equal(el.children[0].textContent,'7일 연속 도전 중..');
  renderStreak(el,{count:7,status:'completed'},{label:true});assert.equal(el.children[0].textContent,'7일 연속 완성');
  renderStreak(el,{count:6,status:'rest'},{label:true});assert.equal(el.children[0].textContent,'7일 연속 도전 중..');assert.match(el.attributes['aria-label'],/오늘 완료하면 이어집니다/);assert.equal(el.children[1].src,'/icons/daily-streak/flame.svg');
  for(const invalid of [null,{count:0,status:'none'},{count:6,status:'unknown'},{count:-1,status:'pending'}]){renderStreak(el,invalid);assert.equal(el.hidden,true);assert.equal(el.children.length,0);assert.equal(el.attributes['aria-label'],undefined);}
 }finally{globalThis.document=original;}
});
test('an in-flight personal streak response cannot render after account change or logout',async()=>{
 const original=globalThis.window;
 try{
  let resolve;
  globalThis.window={puzzleAuthReady:Promise.resolve(),puzzleAccount:{user:{id:'a'},client:{rpc:()=>new Promise(r=>{resolve=r;})}}};
  const pending=context();await Promise.resolve();window.puzzleAccount.user={id:'b'};resolve({data:{streak:{count:6,status:'pending'}}});await assert.rejects(pending,/ACCOUNT_CHANGED/);
  const logout=context();await Promise.resolve();window.puzzleAccount.user=null;resolve({data:{streak:{count:7,status:'completed'}}});await assert.rejects(logout,/ACCOUNT_CHANGED/);
 }finally{globalThis.window=original;}
});
test('home refresh preserves solver count and renders personal streak separately at right edge',()=>{
 const elements=new Map();for(const id of ['dailyStreak','dailyTitle','dailyRank','rankTitle'])elements.set(id,node());
 elements.get('rankTitle').dataset={};
 const title=node();title.querySelector=()=>null;
 const card=node();card.querySelector=()=>title;elements.set('dailyCard',card);
 elements.set('dailyRankBtn',{getAttribute:()=> 'false'});
 const sandbox=vm.createContext({document:{getElementById:id=>elements.get(id),createElement:node,querySelectorAll:()=>[],addEventListener(){}},window:{addEventListener(){}},renderStreak,renderStreakRankings,Date,title:d=>`${d} Daily Sudoku`,rankings(){},rankMessage(){},dailyDate:()=> '2026-09-19'});
 // renderStreak uses document in its originating module scope.
 const original=globalThis.document;globalThis.document={createElement:node};
 try{
  const source=fs.readFileSync('src/scripts/daily-home.js','utf8').replace(/^import .*;\n/gm,'').split('refresh();setInterval(')[0].replace('localLabel();','');
  // Stop before listener setup and its initial network activity.
  vm.runInContext(source.split('const buttons=')[0],sandbox);
  vm.runInContext("apply({current_day:'2026-09-19',available:true,rankings:[{is_me:true},{}],streak_rankings:[{rank:1,nickname:'solver',count:1,status:'completed'}],streak:{count:1,status:'completed'}})",sandbox);
  assert.equal(elements.get('dailyTitle').textContent,'2026-09-19 Daily Sudoku');assert.equal(title.children[0].textContent,'(2)');assert.equal(title.children.length,2);assert.equal(title.children[1].className,'check-mark');assert.equal(title.children[1].textContent,'✓');assert.equal(elements.get('dailyStreak').children[0].textContent,'1');
  vm.runInContext('updateCard([])',sandbox);assert.equal(elements.get('dailyStreak').hidden,true);
 }finally{globalThis.document=original;}
});

test('streak leaderboard displays server order, nicknames and numeric icons without submission times',()=>{
 const original=globalThis.document;globalThis.document={createElement:node};
 try{
  const el=node();
  renderStreakRankings(el,[{rank:1,nickname:'<solver>',count:6,status:'completed',is_me:true},{rank:2,nickname:'resting',count:6,status:'rest',is_me:false}]);
  const [first,second]=el.children[0].children;
  assert.equal(first.className,'lb-row lb-me');assert.equal(first.children[0].textContent,1);assert.equal(first.children[1].children[0].textContent,'<solver>');assert.equal(first.children[2].children[0].textContent,'6');assert.equal(first.children[2].children[1].src,'/icons/daily-streak/flame-filled.svg');assert.equal(second.children[2].children[1].src,'/icons/daily-streak/zzz.svg');assert.equal(first.children.length,3);
  renderStreakRankings(el,[]);assert.equal(el.children[0].textContent,'아직 기록이 없습니다.');
 }finally{globalThis.document=original;}
});

test('streak leaderboard adds a rabbit after moon solver names',()=>{
 const original=globalThis.document;globalThis.document={createElement:node};
 try{
  const el=node();
  renderStreakRankings(el,[{rank:1,nickname:'moon',count:3,status:'completed'}],{moonSolvers:new Set(['moon'])});
  const name=el.children[0].children[0].children[1];
  assert.equal(name.className,'lb-name seasonal-rank-name');
  assert.equal(name.children[0].textContent,'moon');
  assert.equal(name.children[1].src,'/icons/seasonal/rabbit.svg');
  assert.equal(name.children[1].width,18);
  assert.equal(name.children[1].alt,'한가위 스도쿠 완성');
 }finally{globalThis.document=original;}
});

test('streak leaderboard folds after ten rows and keeps an out-of-range personal rank visible',()=>{
 const original=globalThis.document;globalThis.document={createElement:node};
 try{
  const el=node();
  const rows=Array.from({length:13},(_,index)=>({rank:index+1,nickname:`solver-${index+1}`,count:13-index,status:'completed',is_me:index===11}));
  renderStreakRankings(el,rows);
  const folded=el.children[0];
  assert.equal(folded.children.length,13);
  assert.deepEqual(folded.children.slice(0,10).map(row=>row.children[0].textContent),[1,2,3,4,5,6,7,8,9,10]);
  assert.equal(folded.children[10].children[0].textContent,'⋯');
  assert.equal(folded.children[10].attributes.role,'button');
  assert.equal(folded.children[10].attributes.tabindex,'0');
  assert.equal(folded.children[11].children[0].textContent,12);
  assert.equal(folded.children[11].className,'lb-row lb-me');
  assert.equal(folded.children[12].children[0].textContent,'⋯');
  folded.children[10].listeners.click();
  assert.equal(el.children[0].children.length,13);
  assert.equal(el.children[0].children.some(row=>row.className.includes('lb-ellipsis')),false);
 }finally{globalThis.document=original;}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {renderStreak} from '../src/lib/daily-streak.js';
import {context} from '../src/lib/daily-sudoku-client.js';
function node(){return {children:[],hidden:false,attributes:{},replaceChildren(){this.children=[];},append(...children){this.children.push(...children);},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];}};}
test('streak renders no record, outline, rest and restored completion with accessible labels',()=>{
 const original=globalThis.document;globalThis.document={createElement:node};
 try{
  const el=node();
  for(const [count,status,icon] of [[6,'pending','flame'],[6,'rest','zzz'],[7,'completed','flame-filled']]){
   renderStreak(el,{count,status});assert.equal(el.hidden,false);assert.equal(el.children[0].textContent,String(count));assert.equal(el.children[1].src,`/icons/daily-streak/${icon}.svg`);assert.equal(el.children[1].width,14);
  }
  renderStreak(el,{count:0,status:'none'},{label:true});assert.equal(el.hidden,false);assert.equal(el.children[0].textContent,'1일 연속 도전 중..');assert.equal(el.children[1].src,'/icons/daily-streak/flame.svg');
  renderStreak(el,{count:7,status:'completed'},{label:true});assert.equal(el.children[0].textContent,'7일 연속 완성');
  renderStreak(el,{count:6,status:'rest'},{label:true});assert.equal(el.children[0].textContent,'6일 연속 도전 중..');assert.match(el.attributes['aria-label'],/오늘 완료하면 이어집니다/);assert.equal(el.children[1].src,'/icons/daily-streak/flame.svg');
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
 const sandbox=vm.createContext({document:{getElementById:id=>elements.get(id),createElement:node,querySelectorAll:()=>[],addEventListener(){}},window:{addEventListener(){}},renderStreak,Date,title:d=>`${d} Daily Sudoku`,rankings(){},rankMessage(){},dailyDate:()=> '2026-09-19'});
 // renderStreak uses document in its originating module scope.
 const original=globalThis.document;globalThis.document={createElement:node};
 try{
  const source=fs.readFileSync('src/scripts/daily-home.js','utf8').replace(/^import .*;\n/gm,'').split('refresh();setInterval(')[0].replace('localLabel();','');
  // Stop before listener setup and its initial network activity.
  vm.runInContext(source.split('const buttons=')[0],sandbox);
  vm.runInContext("apply({current_day:'2026-09-19',available:true,rankings:[{is_me:true},{}],streak:{count:1,status:'completed'}})",sandbox);
  assert.equal(elements.get('dailyTitle').textContent,'2026-09-19 Daily Sudoku');assert.equal(title.children[0].textContent,'(2)');assert.equal(title.children.length,1);assert.equal(elements.get('dailyStreak').children[0].textContent,'1');
  vm.runInContext('updateCard([])',sandbox);assert.equal(elements.get('dailyStreak').hidden,true);
 }finally{globalThis.document=original;}
});

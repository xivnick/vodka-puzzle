// Deterministic clock test: no waiting for midnight and no real account writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const saved={window:globalThis.window,document:globalThis.document,sessionStorage:globalThis.sessionStorage,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout,now:Date.now};
try{
 const start=Date.parse('2026-11-06T14:59:59Z');Date.now=()=>start;
 globalThis.window=new EventTarget();globalThis.document=new EventTarget();document.hidden=false;
 const storage=new Map();globalThis.sessionStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
 let scheduled,delay,reads=0,visits=0;
 globalThis.setTimeout=(fn,ms)=>{scheduled=fn;delay=ms;return 1;};globalThis.clearTimeout=()=>{};
 window.puzzleAuthReady=Promise.resolve();window.puzzleAccount={user:{id:'one'},profile:{nickname:'fixture'},client:{async rpc(name){assert.equal(name,'record_site_visit');visits++;return {error:null};}}};
 window.sbPublicRpc=async name=>{assert.equal(name,'cosmetic_release_context');reads++;return {active:reads>1,launch_at:'2026-11-06T15:00:00Z',server_now:reads>1?'2026-11-06T15:00:00Z':'2026-11-06T14:59:59Z'};};
 await import('../src/scripts/cosmetic-release.js');await window.puzzleCosmeticReleaseReady;
 assert.equal(window.puzzleCosmeticRelease.active,false);assert.equal(delay,1150);assert.equal(visits,0);
 scheduled();await window.puzzleCosmeticReleaseReady;await Promise.resolve();
 assert.equal(window.puzzleCosmeticRelease.active,true);assert.equal(visits,1);assert.equal(delay,86400150);
 window.dispatchEvent(new Event('focus'));await window.puzzleCosmeticReleaseReady;await Promise.resolve();assert.equal(visits,1,'same-day visit must not repeat');
 window.puzzleAccount.user={id:'two'};window.dispatchEvent(new Event('puzzle-auth-ready'));await Promise.resolve();await Promise.resolve();assert.equal(visits,2,'account visits are isolated');
 console.log('Release clock: prelaunch gate, server-time midnight transition, next-day timer and account-isolated attendance passed.');
}finally{
 Date.now=saved.now;for(const key of ['window','document','sessionStorage','setTimeout','clearTimeout'])if(saved[key]===undefined)delete globalThis[key];else globalThis[key]=saved[key];
}

// The existing completion toast stays visible before queued mission notices.
const inline=fs.readFileSync(new URL('../src/components/Toast.astro',import.meta.url),'utf8').match(/<script is:inline>([\s\S]*?)<\/script>/)[1];
const classes=new Set(),element={textContent:'',classList:{add:k=>classes.add(k),remove:k=>classes.delete(k)}};
let nextTimer=0;const timers=new Map(),store=new Map();
const rewardEvents=[];
const toastWindow={puzzleAuthReady:new Promise(()=>{}),puzzleAccount:{user:{id:'fixture'}},dispatchEvent:event=>rewardEvents.push(event.type)};
vm.runInNewContext(inline,{window:toastWindow,Event,document:{getElementById:()=>element},setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id),sessionStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}});
const tick=()=>{const [id,fn]=timers.entries().next().value;timers.delete(id);fn();};
toastWindow.showToast('완료 기록 저장');const response={operation_id:'fixture-operation',achievement_notifications:[{id:'first',name:'반가워요'},{id:'first',name:'반가워요'}],daily_task_notifications:[{id:'daily-complete',name:'하루 한 문제'}]};
toastWindow.showAchievementNotifications(response);assert.equal(element.textContent,'완료 기록 저장');
assert.deepEqual(rewardEvents,['puzzle-rewards-changed'],'new rewards refresh the header indicator');
tick();tick();assert.equal(element.textContent,'도전 과제 달성: 반가워요');tick();tick();assert.equal(element.textContent,'일일 과제 달성: 하루 한 문제');tick();assert.equal(timers.size,0);
toastWindow.showAchievementNotifications(response);assert.equal(timers.size,0,'same operation notice must not repeat');
toastWindow.showAchievementNotifications(response,{defer:true});assert.equal(JSON.parse(store.get('puzzle-mission-notice')).userId,'fixture');
console.log('Mission toasts: existing style, completion-first queue, unique milestones, replay deduplication and account-bound navigation notice passed.');

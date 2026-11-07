// Exercise failures and slow requests without sending any real telemetry.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const listeners={},sent=[],timers=new Map();let clock=0,nextTimer=0,mode='fast',calls=0;
let release;
const gate=new Promise(resolve=>{release=resolve;});
const sandbox={URL,Request,Response,Headers,crypto,Date,Set,Map,JSON,Promise,console,
 location:{href:'https://puzzle.xivnick.me/daily-sudoku/?access_token=SECRET',pathname:'/daily-sudoku/'},
 navigator:{onLine:true},document:{hidden:false,addEventListener:(name,fn)=>{listeners[name]=fn;}},
 performance:{now:()=>clock},setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id),
 addEventListener:(name,fn)=>{listeners[name]=fn;},
 async fetch(input,init){
  if(String(input).endsWith('/functions/v1/client-events')){sent.push(JSON.parse(init.body));return new Response(null,{status:204});}
  calls++;
  if(mode==='wait'){await gate;return new Response('{}');}
  if(mode==='network')throw new TypeError('SECRET email@example.com');
  if(mode==='slow'){clock+=2100;return new Response('{"state":"SECRET"}');}
  if(mode==='error')return new Response(JSON.stringify({code:'57014',message:'SECRET email@example.com',state:'ANSWER'}),{status:500,headers:{'sb-request-id':'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'}});
  return new Response('{}');
 }};
sandbox.window=sandbox;vm.runInNewContext(fs.readFileSync('public/js/request-diagnostics.js','utf8'),sandbox);
const url='https://hlhrzbylbwebtoytmmpd.supabase.co/rest/v1/rpc/daily_sudoku_context?token=SECRET';
await sandbox.puzzleFetch(url);assert.equal(timers.size,0,'fast success emits nothing');
mode='slow';const slow=await sandbox.puzzleFetch(url,{puzzleTrigger:'poll',body:'ANSWER'});assert.equal(await slow.text(),'{"state":"SECRET"}');
listeners.pagehide();await new Promise(resolve=>setImmediate(resolve));assert.equal(sent[0].events[0].duration_ms,2100);assert.equal(sent[0].events[0].trigger,'poll');
mode='error';const response=await sandbox.puzzleFetch(url,{headers:{Authorization:'SECRET'}});assert.equal(response.status,500);assert.equal((await response.json()).code,'57014');
await new Promise(resolve=>setTimeout(resolve,30));listeners.pagehide();await new Promise(resolve=>setImmediate(resolve));
assert.equal(sent[1].events[0].code,'57014');assert.equal(sent[1].events[0].request_id,'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1');
await sandbox.puzzleFetch(url);await new Promise(resolve=>setTimeout(resolve,30));listeners.pagehide();assert.equal(sent.length,2,'same failure is deduplicated');
mode='network';await assert.rejects(()=>sandbox.puzzleFetch(url),/SECRET/);listeners.pagehide();await new Promise(resolve=>setImmediate(resolve));assert.equal(sent[2].events[0].code,'FETCH_ERROR');
assert(!JSON.stringify(sent).match(/SECRET|ANSWER|email@|access_token|Authorization/),'only sanitized metadata leaves browser');
// Same-identity daily refreshes share one request; account changes never share it.
let rpcCalls=0;
sandbox.puzzleAuthReady=Promise.resolve();sandbox.puzzleAccount={user:{id:'one'},client:{rpc(){rpcCalls++;return {setHeader:()=>gate.then(()=>({data:{day:'today'}}))};}}};
globalThis.window=sandbox;
const {summary}=await import('../src/lib/daily-sudoku-client.js');
const first=summary(),second=summary();await new Promise(resolve=>setImmediate(resolve));assert.equal(rpcCalls,1);
sandbox.puzzleAccount.user={id:'two'};const third=summary();await new Promise(resolve=>setImmediate(resolve));assert.equal(rpcCalls,2);
release();const results=await Promise.allSettled([first,second,third]);assert.equal(results[0].status,'rejected');assert.equal(results[1].status,'rejected');assert.equal(results[2].status,'fulfilled');
delete globalThis.window;
// A successful submission must refresh again after an older poll finishes.
const dailySource=fs.readFileSync('src/scripts/daily-sudoku.js','utf8');
const refreshSource=dailySource.slice(dailySource.indexOf('async function refreshRanks('),dailySource.indexOf('\nfunction showPuzzle('));
let finishPoll,rankCalls=0;
const pollGate=new Promise(resolve=>{finishPoll=resolve;});
const rankResult={day:'2026-11-07',current_day:'2026-11-07',rankings:[],can_submit:true};
const rankSandbox={Promise,summary:()=>{rankCalls++;return rankCalls===1?pollGate:Promise.resolve(rankResult);},
 getMoonBadgeSolvers:async()=>new Set(),getFlowerBadgeSolvers:async()=>new Set(),getBombBadgeSolvers:async()=>new Set(),
 updateStreak:()=>{},rankings:()=>{},$:()=>({})};
vm.createContext(rankSandbox);
vm.runInContext("let rankRefresh=null,data={day:'2026-11-07',current_day:'2026-11-07'},contextRevision=0,day='2026-11-07',closed=false,state=null;"+refreshSource,rankSandbox);
const polling=rankSandbox.refreshRanks('poll'),visible=rankSandbox.refreshRanks('visible'),submitted=rankSandbox.refreshRanks('submit');
assert.equal(rankCalls,1,'poll and visibility share the current request');
finishPoll(rankResult);await Promise.all([polling,visible,submitted]);assert.equal(rankCalls,2,'submission reads fresh results after the earlier poll');
const {createHandler}=await import('../supabase/functions/client-events/index.js');
const collected=[],handler=createHandler(event=>collected.push(event));
const makeRequest=(events,extra={})=>new Request('https://example.test/',{method:'POST',headers:{origin:'https://puzzle.xivnick.me','content-type':'application/json',...extra},body:JSON.stringify({events})});
assert.equal((await handler(makeRequest([{...sent[0].events[0],email:'SECRET',body:'ANSWER',authorization:'SECRET'}]))).status,204);
assert(!JSON.stringify(collected).match(/SECRET|ANSWER|email|authorization/),'collector independently strips unknown fields');
assert.equal((await handler(makeRequest(sent[0].events,{origin:'https://attacker.test'}))).status,403);
assert.equal((await handler(makeRequest([{...sent[0].events[0],endpoint:'/rest/v1/rpc/name?token=SECRET'}]))).status,400);
assert.equal((await handler(makeRequest([{...sent[0].events[0],duration_ms:1}]))).status,400);
assert.equal((await handler(makeRequest(Array(11).fill(sent[0].events[0])))).status,400);
assert.equal((await handler(makeRequest([{...sent[0].events[0],padding:'x'.repeat(17000)}]))).status,413);
for(let i=0;i<3;i++)assert.equal((await handler(makeRequest(Array(10).fill(sent[0].events[0])))).status,204);
assert.equal((await handler(makeRequest(Array(10).fill(sent[0].events[0])))).status,429);
console.log('Slow/failing requests, privacy, response preservation, deduplication, transport errors and account-isolated concurrent refreshes: passed.');

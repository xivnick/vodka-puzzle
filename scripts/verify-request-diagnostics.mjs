// Exercise failures and slow requests without sending any real telemetry.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const listeners={},sent=[],timers=new Map(),requests=[],probeRequests=[];let clock=0,nextTimer=0,mode='fast',calls=0;
let release;
const gate=new Promise(resolve=>{release=resolve;});
const sandbox={URL,Request,Response,Headers,AbortController,crypto,Date,Set,Map,JSON,Promise,console,
 location:{href:'https://puzzle.xivnick.me/daily-sudoku/?access_token=SECRET',pathname:'/daily-sudoku/'},
 navigator:{onLine:true,userAgent:'Mozilla/5.0 Chrome/140.0.0.0'},document:{hidden:false,addEventListener:(name,fn)=>{listeners[name]=fn;}},
 performance:{now:()=>clock},setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id),
 addEventListener:(name,fn)=>{listeners[name]=fn;},
 async fetch(input,init){
  if(String(input).endsWith('/functions/v1/client-events')){sent.push(JSON.parse(init.body));return new Response(null,{status:204});}
  if(String(input)==='/diagnostics/ping.json'||String(input).endsWith('/auth/v1/health')){probeRequests.push({input,init});return new Response('{}');}
  requests.push({input,init});
  calls++;
  if(mode==='wait'){await gate;return new Response('{}');}
  if(mode==='network')throw new TypeError('SECRET email@example.com');
  if(mode==='abort')throw Object.assign(new Error('SECRET'),{name:'AbortError'});
  if(mode==='lifecycle'){listeners.visibilitychange();throw new TypeError('Failed to fetch SECRET');}
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
// Correlate even unreadable responses, without discarding SDK/trigger headers.
const originalHeaders=new Headers({'x-client-info':'vodka-trigger/retry',apikey:'PUBLIC_TEST_KEY',Authorization:'SECRET'});
const diagnosticUrl='https://hlhrzbylbwebtoytmmpd.supabase.co/rest/v1/rpc/puzzle_details';
await assert.rejects(()=>sandbox.puzzleFetch(diagnosticUrl,{headers:originalHeaders}),/SECRET/);
await new Promise(resolve=>setImmediate(resolve));listeners.pagehide();await new Promise(resolve=>setImmediate(resolve));
const diagnostics=sent.at(-1).events,requestEvent=diagnostics.find(event=>event.phase==='request'),probeEvent=diagnostics.find(event=>event.phase==='probe');
assert.equal(requestEvent.error_name,'TypeError');assert.equal(requestEvent.error_kind,'other');assert.equal(requestEvent.browser,'chromium');
assert.equal(requestEvent.trigger,'retry');assert.equal(requestEvent.timing,'missing');
assert.equal(requests.at(-1).init.headers.get('x-client-info'),`vodka-trigger/retry; vodka-diag/${requestEvent.client_request_id}`);
assert.equal(originalHeaders.get('x-client-info'),'vodka-trigger/retry','caller headers remain unchanged');
assert.equal(probeEvent.client_request_id,requestEvent.client_request_id);assert.equal(probeEvent.probe_site.status,200);assert.equal(probeEvent.probe_api.status,200);
assert.equal(probeRequests.length,2);assert.equal(probeRequests[1].init.headers.apikey,'PUBLIC_TEST_KEY');assert.equal(probeRequests[1].init.headers.Authorization,undefined,'probe never forwards user token');
await assert.rejects(()=>sandbox.puzzleFetch(diagnosticUrl,{headers:originalHeaders}));
await new Promise(resolve=>setImmediate(resolve));assert.equal(probeRequests.length,2,'reachability probes are rate limited');
mode='abort';const controller=new AbortController();controller.abort();
await assert.rejects(()=>sandbox.puzzleFetch(diagnosticUrl,{headers:originalHeaders,signal:controller.signal}));
listeners.pagehide();await new Promise(resolve=>setImmediate(resolve));
assert.equal(sent.at(-1).events[0].error_kind,'aborted');assert.equal(sent.at(-1).events[0].signal_aborted,true);
clock+=61000;mode='lifecycle';await assert.rejects(()=>sandbox.puzzleFetch(diagnosticUrl,{headers:originalHeaders}));
listeners.pagehide();await new Promise(resolve=>setImmediate(resolve));
assert.equal(sent.at(-1).events[0].lifecycle_changed,true);assert.equal(probeRequests.length,2,'navigation/background failures do not probe');
assert(!JSON.stringify(sent).match(/SECRET|ANSWER|email@|access_token|Authorization|PUBLIC_TEST_KEY/),'v2 metadata excludes messages, tokens, URLs and API keys');
// An unavailable collector must not erase events; replay survives a new page.
const durable = { unrelated_puzzle_save: 'keep' }, replayed = [];
let delivery = 'offline', uploads = 0;
Object.defineProperties(durable, {
 getItem:{value:key=>durable[key]??null}, setItem:{value:(key,value)=>{durable[key]=value;}}, removeItem:{value:key=>{delete durable[key];}},
});
function newPage() {
 const handlers={},pendingTimers=new Map();let tick=0,seq=0;
 const runtime={...sandbox,localStorage:durable,performance:{now:()=>tick},
  document:{hidden:false,addEventListener:(name,fn)=>{handlers[name]=fn;}},
  addEventListener:(name,fn)=>{handlers[name]=fn;},
  setTimeout:fn=>{pendingTimers.set(++seq,fn);return seq;},clearTimeout:id=>pendingTimers.delete(id),
  async fetch(input,init){
   if(String(input).endsWith('/functions/v1/client-events')){
    uploads++;if(delivery==='offline')throw new TypeError('Failed to fetch');
    if(delivery==='unavailable')return new Response(null,{status:503});
    replayed.push(...JSON.parse(init.body).events);return new Response(null,{status:204});
   }
   tick+=2100;return new Response('{}');
  }};
 runtime.window=runtime;vm.runInNewContext(fs.readFileSync('public/js/request-diagnostics.js','utf8'),runtime);
 return {runtime,handlers};
}
let tab=newPage();await tab.runtime.puzzleFetch(url);tab.handlers.pagehide();await new Promise(resolve=>setImmediate(resolve));
let storedKeys=Object.keys(durable).filter(key=>key.startsWith('vodka_request_event_v3:'));
assert.equal(storedKeys.length,1,'event is retained after transport failure');
const saved=JSON.parse(durable[storedKeys[0]]);saved.event.authorization='SECRET';durable[storedKeys[0]]=JSON.stringify(saved);
delivery='unavailable';tab=newPage();tab.handlers.pagehide();await new Promise(resolve=>setImmediate(resolve));
assert(durable[storedKeys[0]],'HTTP 503 does not acknowledge a batch');
const beforeRetries=uploads;
for(let n=0;n<10;n++){tab.handlers.pagehide();await new Promise(resolve=>setImmediate(resolve));}
assert.equal(uploads-beforeRetries,7,'consecutive failed uploads stop after eight attempts per page');
assert(durable[storedKeys[0]],'exhausting the retry budget retains the event');
delivery='ok';tab.handlers.online();await new Promise(resolve=>setImmediate(resolve));
assert.equal(replayed.length,1,'a fresh page replays the earlier event');assert.equal(durable[storedKeys[0]],undefined,'204 acknowledges and removes the event');
assert(!JSON.stringify(replayed).includes('SECRET'),'unknown stored fields never leave the browser');
const expiredKey='vodka_request_event_v3:expired';durable[expiredKey]=JSON.stringify({...saved,expires:Date.now()-1});newPage();
assert.equal(durable[expiredKey],undefined);assert.equal(durable.unrelated_puzzle_save,'keep','queue cleanup preserves player saves');
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
assert.equal((await handler(makeRequest([{...probeEvent,page_id:crypto.randomUUID(),probe_api:{...probeEvent.probe_api,message:'SECRET'}}]))).status,204);
assert.equal(collected.at(-1).probe_api.message,undefined,'nested probe fields are independently sanitized');
assert.equal((await handler(makeRequest([{...requestEvent,error_name:'SECRET'}]))).status,400);
assert.equal((await handler(makeRequest([{...requestEvent,client_request_id:'SECRET'}]))).status,400);
assert.equal((await handler(makeRequest([{...probeEvent,probe_api:{status:0,duration_ms:1,error:'SECRET'}}]))).status,400);
assert(!JSON.stringify(collected).match(/SECRET|ANSWER|email|authorization/),'collector independently strips unknown fields');
assert.equal((await handler(makeRequest(sent[0].events,{origin:'https://attacker.test'}))).status,403);
assert.equal((await handler(makeRequest([{...sent[0].events[0],endpoint:'/rest/v1/rpc/name?token=SECRET'}]))).status,400);
assert.equal((await handler(makeRequest([{...sent[0].events[0],duration_ms:1}]))).status,400);
assert.equal((await handler(makeRequest(Array(11).fill(sent[0].events[0])))).status,400);
assert.equal((await handler(makeRequest([{...sent[0].events[0],padding:'x'.repeat(17000)}]))).status,413);
for(let i=0;i<3;i++)assert.equal((await handler(makeRequest(Array(10).fill(sent[0].events[0])))).status,204);
assert.equal((await handler(makeRequest(Array(10).fill(sent[0].events[0])))).status,429);
console.log('Slow/failing requests, privacy, response preservation, deduplication, transport errors and account-isolated concurrent refreshes: passed.');

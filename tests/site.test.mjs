import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const read=p=>fs.readFileSync(p,'utf8');
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]);
function runtime(file, fetch) {
 const values=new Map();
 const context=vm.createContext({ URLSearchParams, fetch, console, setTimeout, clearTimeout, setInterval, clearInterval,
 window:{addEventListener(){}}, document:{querySelector(){return null;},addEventListener(){},documentElement:{dataset:{season:'2026-2'}},getElementById(){return null;}},
 localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)} });
 vm.runInContext(read(file),context);return {context,values,run:code=>vm.runInContext(code,context)};
}
test('all built HTML scripts compile and local links resolve',()=>{
 for(const file of walk('dist').filter(f=>f.endsWith('.html'))){
 const html=read(file);
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
  if(/type="(?:module|application\/ld\+json)"/.test(m[1]))continue;
  assert.doesNotThrow(()=>new vm.Script(m[2]),file);
 }
 for(const m of html.matchAll(/(?:href|src)="(\/(?!\/)[^"?#]*)/g)){
 const target=path.join('dist',decodeURI(m[1].slice('/'.length)));
 assert.ok(fs.existsSync(target),`${file}: missing ${m[1]}`);
 }
 }
});
test('archive loads only snapshot and cannot write records',async()=>{
 const calls=[];const rows=JSON.parse(read('public/archive/2026-1/records.json'));
 const r=runtime('public/archive/2026-1/js/common.js',async(url,opts)=>{calls.push([url,opts]);return{ok:true,json:async()=>rows}});
 const result=await r.run("sbSelect('completions','order=completed_at.desc&limit=3')");assert.equal(result.length,3);
 await r.run('registerNickname("test")');await r.run('saveProgressCloud("test",{})');
 await assert.rejects(r.run('sbInsert("completions",{})'));
 assert.equal(calls.length,1);assert.equal(calls[0][0],'/archive/2026-1/records.json');assert.equal(calls[0][1],undefined);
 assert.ok(!read('public/archive/2026-1/js/common.js').includes('supabase.co'));
 assert.ok(rows.every(row=>Object.keys(row).sort().join(',')==='completed_at,nickname,puzzle_id'));
});
test('new reads are semester-scoped and paginate beyond 1000 rows',async()=>{
 const calls=[];const r=runtime('public/js/common.js',async url=>{calls.push(url);const p=new URL(url).searchParams;assert.equal(p.get('season_id'),'eq.2026-2');return{ok:true,json:async()=>Array.from({length:calls.length<3?500:7},()=>({nickname:'n'}))}});
 const rows=await r.run("sbSelect('completions','select=nickname')");assert.equal(rows.length,1007);assert.equal(calls.length,3);
});
test('overall rankings mark moon solvers and the badge is limited to the Chuseok holiday',async()=>{
 const r=runtime('public/js/common.js',async()=>({ok:true,json:async()=>[
  {nickname:'moon',puzzle_id:'260925_01',completed_at:'2026-09-25T01:00:00Z'},
  {nickname:'moon',puzzle_id:'260923_01',completed_at:'2026-09-24T01:00:00Z'},
  {nickname:'plain',puzzle_id:'260923_01',completed_at:'2026-09-23T01:00:00Z'},
 ]}));
 const rows=await r.run("getSolverRankings(['260925_01','260923_01'])");
 assert.equal(rows[0].nick,'moon');assert.equal(rows[0].hasMoonBadge,true);
 assert.equal(rows[1].hasMoonBadge,false);
 const home=read('public/js/home.js');
 assert.ok(home.includes("day >= '2026-09-24' && day <= '2026-09-27'"));
 assert.ok(home.includes("timeZone: 'Asia/Seoul'"));
 assert.ok(home.includes('/icons/seasonal/rabbit.svg'));
 assert.ok(home.includes('showMoonBadges && hasMoonBadge'));
});
test('writes require a session; identity and local state follow account IDs',async()=>{
 const calls=[];const r=runtime('public/js/common.js',async(url,opts)=>{calls.push([url,opts]);return{ok:true}});
 r.values.set('vodka_nickname:2026-2','someone');
 assert.equal(r.run('isGuest()'),true);
 await assert.rejects(r.run("sbUpsert('progress',{},'season_id,user_id,puzzle_id')"));
 assert.equal(calls.length,0);
 r.run("window.puzzleAccount={user:{id:'account-a'},profile:{nickname:'a'},client:{auth:{getSession:async()=>({data:{session:{access_token:'session-token'}}})}}}");
 r.run("saveLocalState('puzzle_test',{n:1})");
 assert.ok(r.values.has('2026-2:account-a:puzzle_test'));
 r.run("window.puzzleAccount.profile.nickname='renamed'");
 assert.equal(r.run("loadLocalState('puzzle_test').n"),1);
 await r.run("sbUpsert('progress',{nickname:'renamed',user_id:'forged',puzzle_id:'test',state:{}},'season_id,user_id,puzzle_id')");
 const body=JSON.parse(calls[0][1].body);
 assert.equal(body.season_id,'2026-2');assert.equal(body.user_id,'account-a');
 assert.equal(calls[0][1].headers.Authorization,'Bearer session-token');
 r.run("window.puzzleAccount.user.id='account-b'");assert.equal(r.run("loadLocalState('puzzle_test')"),null);
});
test('registered puzzle titles remain available to the banner offline',async()=>{
 const calls=[];const r=runtime('public/js/common.js',async url=>{calls.push(url);throw new Error('offline')});
 r.run("window.puzzleTitles={'260916_01':'260916 Mini Rectangles',puzzle_test:'테스트 스도쿠'}");
 const titles=await r.run('getPuzzleTitleMap()');
 assert.equal(titles.get('260916_01'),'260916 Mini Rectangles');
 assert.equal(titles.get('puzzle_test'),'테스트 스도쿠');
 assert.equal(calls.length,0);
 assert.ok(read('dist/index.html').includes('data-puzzle-id="260916_01"'));
 assert.ok(!read('dist/index.html').includes('data-puzzle-id="puzzle_test"'));
});
test('practice uses shared puzzle rules and remains outside completion rankings',()=>{
 const html=read('dist/practice/index.html');
 assert.ok(html.includes('page-content puzzle-content'));
 assert.equal((html.match(/id="rulesToggle"/g)||[]).length,1);
 assert.equal((html.match(/id="rulesBox"/g)||[]).length,1);
 assert.ok(html.includes('puzzle-body'));
 assert.ok(!html.includes('id="leaderboard"'));
});

test('shared pages reserve an empty banner before JavaScript and empty results keep its space',async()=>{
 const html=read('dist/index.html');assert.match(html,/<div id="recentBanner" class="recent-banner" aria-live="polite"><\/div>/);
 const r=runtime('public/js/common.js',async()=>{throw Error('unexpected request');});
 r.run("window.banner={style:{},classList:{remove(){}},innerHTML:'old',querySelector(){return null}};document.querySelector=()=>({});document.getElementById=()=>window.banner;");
 await r.run('renderRecentBanner([])');assert.equal(r.run('window.banner.style.display'),'flex');assert.equal(r.run('window.banner.innerHTML'),'');
});


test('banner loads combined records and formats daily dates with escaped nicknames',async()=>{
 const calls=[];
 const r=runtime('public/js/common.js',async(url,opts)=>{calls.push([url,opts]);return {ok:true,json:async()=>[{nickname:'<solver>',puzzle_id:'daily-sudoku:2026-09-17',completed_at:'2026-09-17T01:00:00Z'}]};});
 const rows=await r.run('getLatestCompletions()');
 assert.equal(rows[0].puzzle_id,'daily-sudoku:2026-09-17');
 assert.match(calls[0][0],/rpc\/recent_completions$/);assert.equal(calls[0][1].method,'POST');
 r.run("window.messages=[];document.querySelector=()=>({});document.getElementById=()=>({style:{}});getPuzzleTitleMap=async()=>new Map([['normal','일반 문제']]);applyRecentBannerMessage=(banner,message)=>window.messages.push(message);startRecentBannerRotation=(banner,messages)=>window.messages=messages;");
 await r.run("renderRecentBanner([{nickname:'<solver>',puzzle_id:'daily-sudoku:2026-09-17'},{nickname:'solver',puzzle_id:'normal'}])");
 assert.match(r.run('window.messages[0]'),/260917 Daily Sudoku/);
 assert.match(r.run('window.messages[0]'),/&lt;solver&gt;/);
 assert.match(r.run('window.messages[1]'),/일반 문제/);
});

test('banner initialization shares one request and one render',async()=>{
 let resolveFetch;const calls=[];
 const r=runtime('public/js/common.js',(url,opts)=>{calls.push([url,opts]);return new Promise(resolve=>{resolveFetch=resolve;});});
 r.run("window.puzzleTitles={normal:'일반 문제'};window.renders=0;renderRecentBanner=async()=>{window.renders+=1};");
 const first=r.run('initRecentBanner()');const second=r.run('initRecentBanner()');
 await Promise.resolve();await Promise.resolve();
 resolveFetch({ok:true,json:async()=>[{nickname:'solver',puzzle_id:'normal',completed_at:'2026-09-19T00:00:00Z'}]});
 await Promise.all([first,second]);assert.equal(calls.length,1);assert.equal(r.run('window.renders'),1);
});

test('unchanged banner data does not restart animation; new data returns to latest item',async()=>{
 const r=runtime('public/js/common.js',async()=>{throw Error('unexpected request')});
 r.run("window.banner={style:{},classList:{remove(){}},innerHTML:''};document.querySelector=()=>({});document.getElementById=()=>window.banner;window.puzzleTitles={normal:'일반 문제'};window.renders=0;applyRecentBannerMessage=()=>{window.renders+=1};startRecentBannerRotation=()=>{};");
 const rows="[{nickname:'a',puzzle_id:'normal',completed_at:'2026-09-19T00:00:00Z'},{nickname:'b',puzzle_id:'normal',completed_at:'2026-09-18T00:00:00Z'}]";
 await r.run(`renderRecentBanner(${rows})`);r.run('_recentBannerIndex=1');await r.run(`renderRecentBanner(${rows})`);
 assert.equal(r.run('window.renders'),1);assert.equal(r.run('_recentBannerIndex'),1);
 await r.run("renderRecentBanner([{nickname:'new',puzzle_id:'normal',completed_at:'2026-09-19T01:00:00Z'},..."+rows+"])");
 assert.equal(r.run('window.renders'),2);assert.equal(r.run('_recentBannerIndex'),0);
});

test('completion snapshots are sent once; failure retries the original board and success marks storage',async()=>{
 const calls=[],timers=[];let fail=true;
 const r=runtime('public/js/common.js',async(url,opts)=>{calls.push([url,opts]);return {ok:!fail,status:503,json:async()=>({completed_at:'2026-09-17T00:00:00Z'})};});
 r.context.setTimeout=(callback)=>{timers.push(callback);return timers.length;};
 r.run("window.puzzleAccount={user:{id:'account-a'},profile:{nickname:'a'},client:{auth:{getSession:async()=>({data:{session:{access_token:'token'}}})}}};showToast=()=>{};refreshRecentBanner=()=>{};renderLeaderboard=()=>{};window.board={version:1,values:[1,2,3]};");
 await r.run("recordCompletion('260917_01',window.board)");
 assert.equal(r.values.has('completion_saved_2026-2_account-a_260917_01'),false);
 r.run('window.board.values[0]=9');fail=false;
 await timers[0]();
 const submitted=JSON.parse(calls[1][1].body);
 assert.equal(submitted.submitted_state.values[0],1);assert.equal(submitted.state_version,1);
 assert.deepEqual(Object.keys(submitted).sort(),['requested_puzzle','state_version','submitted_state']);
 assert.equal(r.values.get('completion_saved_2026-2_account-a_260917_01'),'1');
 await r.run("recordCompletion('260917_01',window.board)");assert.equal(calls.length,2);
});

test('completion requests cannot send a solved board after changing accounts',async()=>{
 const calls=[],timers=[];
 const r=runtime('public/js/common.js',async(url,opts)=>{calls.push([url,opts]);return {ok:false,status:503};});
 r.context.setTimeout=callback=>{timers.push(callback);return timers.length;};
 r.run("window.puzzleAccount={user:{id:'a'},profile:{nickname:'a'},client:{auth:{getSession:async()=>({data:{session:{access_token:'token'}}})}}};showToast=()=>{};");
 await r.run("recordCompletion('260917_01',{version:1,values:[1]})");
 r.run("window.puzzleAccount.user.id='b'");await timers[0]();assert.equal(calls.length,1);
});

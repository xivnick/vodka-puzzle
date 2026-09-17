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

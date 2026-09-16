import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync('src/scripts/auth.js','utf8').replace(/^import .*;\n/,'').replace('export function safeNext','function safeNext');
async function run({search='',profile=null,error=null,loggedIn=true}={}){
 const redirects=[],exchanges=[];
 const status={textContent:''};
 let resolve;
 const ready=new Promise(r=>resolve=r);
 const user=loggedIn?{id:'user-a',app_metadata:{provider:'google'}}:null;
 const client={auth:{
  onAuthStateChange(){},
  async exchangeCodeForSession(code){exchanges.push(code);return{error};},
  async getSession(){return{data:{session:user?{user}:null}};}
 },from(){return{select(){return this;},eq(){return this;},async maybeSingle(){return{data:profile,error:null};}}}};
 const context=vm.createContext({createClient:()=>client,URL,URLSearchParams,Event,setTimeout,
  location:{origin:'https://xivnick.me',pathname:'/puzzle/auth/callback/',search,replace:p=>redirects.push(p)},
  history:{replaceState(){}},sessionStorage:{getItem:()=>'/puzzle/practice/',removeItem(){}},
  document:{documentElement:{dataset:{season:'2026-2'}},getElementById:id=>id==='authCallbackStatus'?status:null},
  window:{puzzleAccount:{user:null,profile:null},resolvePuzzleAuth:resolve,dispatchEvent(){}}
 });
 vm.runInContext(source,context);await ready;
 return{context,redirects,exchanges,status};
}
test('OAuth code is exchanged once and first login goes to nickname setup',async()=>{
 const r=await run({search:'?code=one-use-code'});assert.deepEqual(r.exchanges,['one-use-code']);assert.deepEqual(r.redirects,['/puzzle/nickname/']);
});
test('existing account returns to its original puzzle',async()=>{
 const r=await run({search:'?code=code',profile:{nickname:'solver'}});assert.deepEqual(r.redirects,['/puzzle/practice/']);
});
test('OAuth cancellation or expired code shows retry instead of a false success',async()=>{
 const denied=await run({search:'?error=access_denied'});assert.equal(denied.exchanges.length,0);assert.equal(denied.redirects.length,0);assert.match(denied.status.textContent,/다시/);
 const expired=await run({search:'?code=expired',error:{message:'invalid'}});assert.equal(expired.redirects.length,0);assert.match(expired.status.textContent,/만료/);
});
test('return path cannot redirect outside this site or back into auth',async()=>{
 const r=await run({search:'?error=access_denied'});
 for(const url of ['https://evil.example/','//evil.example/','javascript:alert(1)','/puzzle/auth/callback/','/puzzle/nickname/']){
  assert.equal(vm.runInContext(`safeNext(${JSON.stringify(url)})`,r.context),'/puzzle/');
 }
 assert.equal(vm.runInContext("safeNext('/puzzle/practice/#board')",r.context),'/puzzle/practice/#board');
});

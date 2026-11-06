// Account adapter contract: real server state, monotonic versions and request replay.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCosmeticAccountClient,normalizeCosmeticAccount,serverItemId} from '../src/scripts/cosmetic-account-client.js';
const template=JSON.parse(fs.readFileSync(new URL('../src/data/mypage-v2-preview.json',import.meta.url)));
const equipment={equipment_version:2,icon_id:'icon:leaf',color_id:'uncommon:common:c0:common:c0',effect_id:null,expression:'gradient',direction:'diagonal'};
const initial={coins:100,state_revision:4,inventory:[{item_id:'icon:leaf',kind:'icon',quantity:1,name:'잎사귀',definition:{src:'/icons/achievement-preview/leaf.svg'}},{item_id:'uncommon:common:c0:common:c0',kind:'uncommon_color',quantity:1,name:'수박',definition:{a:'#D9747C',b:'#D9747C'}}],equipment,tickets:2,all_clear:{eligible:true,enabled:true,completed:50,total:50,active:true}};
const achievements=[{id:'feature-draw',name:'행운을 빌어요',description:'색깔·효과 뽑기',category:'basic',current:10,threshold:10,state:'claimable',configured:true,active:true,scope_key:'account',display_item_id:'icon:clover',reward:{coin_options:[10,20,30,40,50,60,70,80,90,100]}}];
const model={state:initial,catalog:[],achievements,daily_tasks:[],day:'2026-11-06',draw:{version:1,price_per_draw:100}};
const ui=normalizeCosmeticAccount(model,template,{nickname:'실제닉네임'});
assert.equal(ui.nickname,'실제닉네임');assert.equal(ui.coins,100);assert.deepEqual(ui.ownedEffects,[]);assert.equal(ui.applied.color,'uncommon:common:c0:common:c0');assert.equal(ui.missions[0].serverGoal.kind,'random-coins');assert.equal(serverItemId(ui.applied.color,'rare'),ui.applied.color);assert.equal(serverItemId('none','icon'),null);
// Server daily task keys must match the rows rendered by the shared page.
const dailyKeys=['attendance','daily-complete','daily-champion'];
assert.deepEqual(template.dailyQuests.map(q=>q.id),dailyKeys);
const dailyUI=normalizeCosmeticAccount({...model,daily_tasks:dailyKeys.map(id=>({id,name:id,complete:false,state:'in_progress',configured:true,reward:id==='daily-champion'?{tickets:1}:{coins:20}}))},template,{nickname:'실제닉네임'});
assert(dailyUI.dailyQuests.every(q=>q.icon&&q.text),'every server task has its rendered row and UI metadata');
let state=structuredClone(initial),calls=[],drawCalls=0,visitCalls=0;const recorded=new Map();
const store=new Map(),storage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};
const account={user:{id:'test-user'},profile:{nickname:'실제닉네임'},client:{async rpc(name,args){
 calls.push({name,args});
 if(name==='cosmetic_context')return {data:{state:structuredClone(state),catalog:[],draw:{version:1,price_per_draw:100}}};
 if(name==='achievement_context')return {data:{state:structuredClone(state),achievements,daily_tasks:[],current_day:'2026-11-06'}};
 if(name==='record_site_visit'){visitCalls++;return {data:{day:'2026-11-06',daily_tasks:[]}};}
 if(name==='cosmetic_operation')return {data:recorded.get(args.request_id)??null};
 if(name==='draw_cosmetics'){
  drawCalls++;assert.equal(args.count,1);assert.equal(args.expected_draw_config_version,1);
  state={...state,coins:0,state_revision:5};const response={state:structuredClone(state),results:[{item_id:'common:c0',kind:'common_color',name:'수박',definition:{a:'#D9747C',b:'#D9747C'},refund_coins:0}]};recorded.set(args.request_id,response);
  if(drawCalls===1)return {error:{message:'Failed to fetch',code:''}};return {data:response};
 }
 throw new Error('Unexpected RPC '+name);
}}};
const api=createCosmeticAccountClient(account,template,storage);await api.initialize();assert.equal(visitCalls,1);assert.equal(api.snapshot().coins,100);
const result=await api.draw(1);assert.equal(result.results[0].name,'수박');assert.equal(drawCalls,1,'recover committed request instead of drawing twice');assert.equal(api.snapshot().coins,0);assert.equal(store.get('cosmetic-pending:test-user'),'{}');
// Equipment revision wins independently from the economic snapshot revision.
state={...state,state_revision:3,equipment:{...equipment,equipment_version:1,icon_id:null},coins:9999};await api.refresh();assert.equal(api.snapshot().coins,0);assert.equal(api.snapshot().applied.icon,'leaf');assert(api.snapshot().allClearEnabled);
account.user={id:'other-user'};await assert.rejects(()=>api.refresh(),/ACCOUNT_CHANGED/);
// Reload recovery uses the persisted request UUID, without importing demo storage.
account.user={id:'test-user'};state={...initial,state_revision:6};
const pendingId='pending-draw';store.set('cosmetic-pending:test-user',JSON.stringify({[pendingId]:{name:'draw_cosmetics',args:{request_id:pendingId,count:1,expected_draw_config_version:1}}}));recorded.set(pendingId,{state,results:[{item_id:'common:c0',kind:'common_color',name:'수박',definition:{a:'#D9747C',b:'#D9747C'}}]});
const recovered=createCosmeticAccountClient(account,template,storage);await recovered.initialize();assert.equal(recovered.takeRecovered()[0].response.results[0].name,'수박');assert.equal(drawCalls,1);
console.log('Live normalization, no demo seed, monotonic economic/equipment state, interrupted request recovery, reload recovery and account switching: passed.');

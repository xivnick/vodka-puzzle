// Real account adapter. Demo storage, demo balances and client RNG never enter it.
export const localItemId=id=>id==null?null:id.replace(/^(icon|effect|common|rare):/,'');
export function serverItemId(id,kind){
 if(!id||id==='none'||id==='base')return null;
 if(id.startsWith('uncommon:'))return id;
 return `${kind}:${id}`;
}
const rarityByKind={common_color:'common',uncommon_color:'uncommon',rare_color:'rare',effect:'epic'};
export function normalizeCosmeticItem(item){return {id:localItemId(item.item_id??item.id),name:item.name,rarity:rarityByKind[item.kind],...item.definition,refund:Number(item.refund_coins??0)};}
export function normalizeCosmeticAccount(model,template,identity){
 const state=model.state,equipment=state.equipment??{},owned=state.inventory??[];
 const applied={icon:localItemId(equipment.icon_id)??'none',color:localItemId(equipment.color_id)??'base',effect:localItemId(equipment.effect_id)??'none',mode:equipment.expression??'gradient',angle:equipment.direction==='horizontal'?'90deg':equipment.direction==='vertical'?'180deg':'135deg',reversed:Boolean(equipment.reversed)};
 const colors=[...(model.catalog??[]),...owned].filter(i=>rarityByKind[i.kind]&&i.kind!=='effect').map(normalizeCosmeticItem);
 const missions=(model.achievements??[]).map(row=>{
  const original=template.missions.find(m=>m.id===row.id);if(!original)return null;
  const reward=row.reward;let serverGoal;
  if(row.threshold!=null){
   serverGoal={at:Number(row.threshold)};
   if(reward?.item_id)Object.assign(serverGoal,{kind:'icon',value:localItemId(reward.item_id)});
   else if(reward?.tickets!=null)Object.assign(serverGoal,{kind:'tickets',value:Number(reward.tickets)});
   else if(reward?.coin_options)Object.assign(serverGoal,{kind:'random-coins',options:reward.coin_options.map(Number)});
   else Object.assign(serverGoal,{kind:'coins',value:Number(reward?.coins??0)});
  }
  return {...original,name:row.name,text:row.description,icon:localItemId(row.display_item_id)??original.icon,count:Number(row.current),active:row.active,configured:row.configured,serverState:row.state,serverScope:row.scope_key,serverGoal,claimed:[]};
 }).filter(Boolean);
 const dailyQuests=(model.daily_tasks??[]).map(row=>{
  const original=template.dailyQuests.find(q=>q.id===row.id);const reward=row.reward;
  return {...original,id:row.id,name:row.name,complete:row.complete,unavailable:row.state==='unavailable',claimed:row.state==='completed',configured:row.configured,kind:reward?.tickets!=null?'tickets':'coins',value:Number(reward?.tickets??reward?.coins??0)};
 });
 return {nickname:identity.nickname,coins:Number(state.coins),tickets:Number(state.tickets??0),colors,
  inventory:owned.filter(i=>['common_color','uncommon_color','rare_color'].includes(i.kind)).map(i=>[localItemId(i.item_id),Number(i.quantity)]),
  ownedIcons:owned.filter(i=>i.kind==='icon').map(i=>localItemId(i.item_id)),ownedEffects:owned.filter(i=>i.kind==='effect').map(i=>localItemId(i.item_id)),
  applied,allClearEnabled:Boolean(state.all_clear?.enabled),allClearCompleted:Number(state.all_clear?.completed??0),total:Number(state.all_clear?.total??0),
  dailyDate:model.day,dailyClaimed:dailyQuests.filter(q=>q.claimed).map(q=>q.id),missions,dailyQuests,
  drawPrice:Number(model.draw?.price_per_draw??100),drawAvailable:Boolean(model.draw)};
}
const errors={COSMETICS_DISABLED:'이 계정은 테스트 대상이 아닙니다.',LOGIN_REQUIRED:'로그인해 주세요.',PROFILE_REQUIRED:'닉네임을 먼저 설정해 주세요.',INSUFFICIENT_COINS:'코인이 부족합니다.',INSUFFICIENT_MATERIALS:'조합 재료가 부족합니다.',EQUIPMENT_CHANGED:'다른 화면에서 설정이 바뀌었습니다. 다시 선택해 주세요.',ITEM_NOT_OWNED:'보유하지 않은 아이템입니다.',ACHIEVEMENT_NOT_READY:'아직 달성하지 않은 과제입니다.',DAILY_TASK_NOT_READY:'아직 달성하지 않은 일일 과제입니다.',DAILY_TASK_EXPIRED:'날짜가 바뀌었습니다. 일일 과제를 다시 확인해 주세요.',ALL_CLEAR_REQUIRED:'현재 공개된 일반 문제를 모두 완료해야 합니다.',CONFIG_CHANGED:'뽑기 설정이 바뀌었습니다. 다시 시도해 주세요.',DRAW_NOT_CONFIGURED:'뽑기를 준비 중입니다.',INVALID_STAGE:'과제 단계가 바뀌었습니다. 다시 확인해 주세요.'};
export function cosmeticError(error){return errors[error?.message]??(error?.message==='ACCOUNT_CHANGED'?'계정이 변경되었습니다. 새로고침해 주세요.':'연결을 확인한 뒤 다시 시도해 주세요.');}
export function createCosmeticAccountClient(account,template,storage=globalThis.sessionStorage){
 const uid=account.user.id,client=account.client,identity={nickname:account.profile.nickname};
 const model={state:{state_revision:-1,equipment:{equipment_version:-1}},catalog:[],achievements:[],daily_tasks:[],draw:null,day:null};
 const recovered=[];
 const pendingKey=`cosmetic-pending:${uid}`;let pending={},tail=Promise.resolve(),readSequence=0;
 try{pending=JSON.parse(storage.getItem(pendingKey)??'{}');}catch{}
 const savePending=()=>storage.setItem(pendingKey,JSON.stringify(pending));
 function assertAccount(){if(account.user?.id!==uid)throw new Error('ACCOUNT_CHANGED');}
 async function rpc(name,args={}){
  assertAccount();const {data,error}=await client.rpc(name,args);assertAccount();if(error)throw error;return data;
 }
 function mergeState(state){
  if(!state)return;
  const prior=model.state,oldEquipment=prior.equipment;
  if(Number(state.state_revision)>=Number(prior.state_revision))model.state={...prior,...state,equipment:oldEquipment,all_clear:prior.all_clear};
  if(Number(state.equipment?.equipment_version)>=Number(oldEquipment?.equipment_version??-1)){
   model.state.equipment=state.equipment;
   if(state.all_clear)model.state.all_clear=state.all_clear;
  }
 }
 function apply(response){
  mergeState(response.state);
  if(response.achievements)model.achievements=response.achievements;
  if(response.daily_tasks)model.daily_tasks=response.daily_tasks;
  if(response.current_day??response.day)model.day=response.current_day??response.day;
 }
 async function refresh(){
  const sequence=++readSequence;
  const [cosmetics,achievements]=await Promise.all([rpc('cosmetic_context'),rpc('achievement_context')]);
  if(sequence!==readSequence)return;
  mergeState(cosmetics.state);mergeState(achievements.state);
  model.catalog=cosmetics.catalog;model.draw=cosmetics.draw;model.achievements=achievements.achievements;model.daily_tasks=achievements.daily_tasks;model.day=achievements.current_day;
 }
 async function recover(){
  for(const [id,request] of Object.entries(pending)){
   const recorded=await rpc('cosmetic_operation',{request_id:id});
   const response=recorded??await rpc(request.name,request.args);apply(response);recovered.push({name:request.name,response});delete pending[id];savePending();
  }
 }
 const enqueue=task=>{const result=tail.then(task);tail=result.catch(()=>{});return result;};
 async function mutation(name,args){
  return enqueue(async()=>{
   await recover();const id=crypto.randomUUID(),payload={request_id:id,...args};
   pending[id]={name,args:payload};savePending();let response;
   try{response=await rpc(name,payload);}
   catch(error){
    // Server SQL errors rolled back; transport failures may have committed.
    if(error.code&&error.code!=='FETCH_ERROR'){delete pending[id];savePending();throw error;}
    try{response=await rpc('cosmetic_operation',{request_id:id});if(!response)response=await rpc(name,payload);}
    catch{throw error;}
   }
   delete pending[id];savePending();apply(response);
   await refresh().catch(()=>{});return response;
  });
 }
 const snapshot=()=>normalizeCosmeticAccount(model,template,identity);
 return {snapshot,errorText:cosmeticError,takeRecovered:()=>recovered.splice(0),
  async initialize(){await refresh();await recover();const visit=await rpc('record_site_visit',{request_id:crypto.randomUUID()});apply(visit);await refresh();},
  refresh:()=>enqueue(async()=>{await recover();await refresh();}),
  claim:mission=>mutation('claim_achievement',{achievement_id:mission.id,scope_key:mission.serverScope,threshold:mission.serverGoal.at}),
  claimDaily:id=>mutation('claim_daily_task',{task_key:id,target_day:model.day}),
  draw:count=>mutation('draw_cosmetics',{expected_draw_config_version:model.draw?.version??0,count}),
  craft:materials=>mutation('craft_cosmetic',{material_ids:materials.map(id=>serverItemId(id,'common'))}),
  equip:value=>enqueue(async()=>{
   const args={expected_equipment_version:Number(model.state.equipment.equipment_version),equipment:{icon_id:serverItemId(value.icon,'icon'),color_id:serverItemId(value.color,value.color?.startsWith('c')?'common':'rare'),effect_id:serverItemId(value.effect,'effect'),expression:value.mode,direction:value.angle==='90deg'?'horizontal':value.angle==='180deg'?'vertical':'diagonal',reversed:Boolean(value.reversed)}};
   const response=await rpc('set_cosmetic_equipment',args);apply(response);await refresh().catch(()=>{});return response;
  }),
  toggleAllClear:enabled=>enqueue(async()=>{const response=await rpc('set_all_clear_effect',{expected_equipment_version:Number(model.state.equipment.equipment_version),enabled});apply(response);await refresh().catch(()=>{});return response;}),
  rename:nickname=>enqueue(async()=>{
   assertAccount();const {data,error}=await client.from('semester_nicknames').update({nickname}).eq('season_id',document.documentElement.dataset.season).eq('user_id',uid).select('nickname').single();assertAccount();if(error)throw error;identity.nickname=data.nickname;account.profile.nickname=data.nickname;window.dispatchEvent(new Event('puzzle-auth-ready'));
  })
 };
}

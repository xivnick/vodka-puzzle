const inFlight=new Map();
async function request(name,args,{publicOnly=false,trigger='initial'}={}) {
 if(!publicOnly)await window.puzzleAuthReady;
 const owner=publicOnly?null:window.puzzleAccount.user?.id;
 const key=JSON.stringify([name,args,owner,publicOnly]);
 if(inFlight.has(key))return inFlight.get(key);
 const pending=(async()=>{
  if(publicOnly)return window.sbPublicRpc(name,args,{trigger});
  const {data,error}=await window.puzzleAccount.client.rpc(name,args).setHeader('x-client-info',`vodka-trigger/${trigger}`);
  if(owner!==window.puzzleAccount.user?.id)throw new Error('ACCOUNT_CHANGED');
  if(error)throw error;return data;
 })();
 inFlight.set(key,pending);
 try{return await pending;}finally{inFlight.delete(key);}
}
export function context(day=null,options={}) {
 return request('daily_sudoku_context',{requested_day:day},options);
}
export function summary(day=null,{includeStreakRankings=false,...options}={}) {
 return request('daily_sudoku_summary',{requested_day:day,include_streak_rankings:includeStreakRankings},options);
}
export function title(day) {return `${day.replaceAll('-','').slice(2)} Daily Sudoku`;}
export function time(value) {return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit',hourCycle:'h12'}).format(new Date(value));}
export function rankMessage(element,text) {
 const empty=document.createElement('div');empty.className='lb-empty';empty.textContent=text;element.replaceChildren(empty);
}
export function rankings(element,rows,{moonSolvers=new Set(),flowerSolvers=new Set(),bombSolvers=new Set()}={}) {
 globalThis.rankingUi.render(element,rows.map(row=>({rank:row.rank,nickname:row.nickname,completedAt:row.completed_at,isMe:row.is_me})),{
  solvers:{moon:moonSolvers,flower:flowerSolvers,bomb:bombSolvers},showLast:true,value:row=>time(row.completedAt),
 });
}

export async function context(day=null,{publicOnly=false}={}) {
 if(publicOnly)return window.sbPublicRpc('daily_sudoku_context',{requested_day:day});
 await window.puzzleAuthReady;
 const owner=window.puzzleAccount.user?.id;
 const {data,error}=await window.puzzleAccount.client.rpc('daily_sudoku_context',{requested_day:day});
 if(owner!==window.puzzleAccount.user?.id)throw new Error('ACCOUNT_CHANGED');
 if(error)throw error;return data;
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

export async function context(day=null) {
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
export function rankings(element,rows,{moonSolvers=new Set()}={}) {
 element.replaceChildren();
 if(!rows.length){rankMessage(element,'아직 기록이 없습니다.');return;}
 const list=document.createElement('div');list.className='lb-list';element.append(list);
 for(const row of rows){
  const div=document.createElement('div');div.className=`lb-row${row.is_me?' lb-me':''}`;
  const rank=document.createElement('span');rank.className='lb-rank';rank.textContent=row.rank;
  const name=document.createElement('span');name.className='lb-name seasonal-rank-name';
  const nickname=document.createElement('span');nickname.textContent=row.nickname;name.append(nickname);
  if(moonSolvers.has(row.nickname)){const badge=document.createElement('img');badge.className='seasonal-rank-badge';badge.src='/icons/seasonal/rabbit.svg';badge.width=18;badge.height=18;badge.alt='한가위 스도쿠 완성';badge.title='한가위 스도쿠 완성';name.append(badge);}
  const completed=document.createElement('span');completed.className='lb-time';completed.textContent=time(row.completed_at);
  div.append(rank,name,completed);list.append(div);
 }
}

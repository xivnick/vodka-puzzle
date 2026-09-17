export async function context(day=null) {
 await window.puzzleAuthReady;
 const {data,error}=await window.puzzleAccount.client.rpc('daily_sudoku_context',{requested_day:day});
 if(error)throw error;return data;
}
export function title(day) {return `${day.replaceAll('-','').slice(2)} Daily Sudoku`;}
export function time(value) {return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit',hourCycle:'h12'}).format(new Date(value));}
export function rankMessage(element,text) {
 const empty=document.createElement('div');empty.className='lb-empty';empty.textContent=text;element.replaceChildren(empty);
}
export function rankings(element,rows) {
 element.replaceChildren();
 if(!rows.length){rankMessage(element,'아직 기록이 없습니다.');return;}
 const list=document.createElement('div');list.className='lb-list';element.append(list);
 for(const row of rows){const div=document.createElement('div');div.className=`lb-row${row.is_me?' lb-me':''}`;for(const [cls,value] of [['lb-rank',row.rank],['lb-name',row.nickname],['lb-time',time(row.completed_at)]]){const span=document.createElement('span');span.className=cls;span.textContent=value;div.append(span);}list.append(div);}
}

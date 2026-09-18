// Only server-confirmed, account-owned completion records drive this display.
const icons={pending:'flame',completed:'flame-filled',rest:'zzz'};
export function renderStreak(element,streak,{label=false}={}) {
 if(!element)return;
 element.replaceChildren();element.hidden=true;element.removeAttribute('aria-label');
 // The daily heading invites the first attempt before any completion exists.
 if(label&&streak?.count===0&&streak.status==='none')streak={count:1,status:'pending'};
 if(!Number.isInteger(streak?.count)||streak.count<1||!icons[streak.status])return;
 const completed=streak.status==='completed';
 const text=label?`${streak.count}일 연속 ${completed?'완성':'도전 중..'}`:String(streak.count);
 const value=document.createElement('span');value.textContent=text;
 const icon=document.createElement('img');icon.src=`/icons/daily-streak/${label&&!completed?'flame':icons[streak.status]}.svg`;
 icon.width=14;icon.height=14;icon.alt='';icon.setAttribute('aria-hidden','true');
 element.append(value,icon);element.hidden=false;
 element.setAttribute('aria-label',`${label?text:streak.count+'일 스트릭'}, ${completed?'오늘 완료':streak.status==='rest'?'하루 휴식 중, 오늘 완료하면 이어집니다':'오늘 도전 중'}`);
}

export function renderStreakRankings(element,rows) {
 element.replaceChildren();
 if(!rows?.length){
  const empty=document.createElement('div');empty.className='lb-empty';empty.textContent='아직 기록이 없습니다.';element.append(empty);return;
 }
 const list=document.createElement('div');list.className='lb-list';element.append(list);
 for(const row of rows){
  const line=document.createElement('div');line.className=`lb-row${row.is_me?' lb-me':''}`;
  const rank=document.createElement('span');rank.className='lb-rank';rank.textContent=row.rank;
  const name=document.createElement('span');name.className='lb-name';name.textContent=row.nickname;
  const streak=document.createElement('span');streak.className='daily-streak';renderStreak(streak,row);
  line.append(rank,name,streak);list.append(line);
 }
}

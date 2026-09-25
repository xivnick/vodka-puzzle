// Only server-confirmed, account-owned completion records drive this display.
const icons={pending:'flame',completed:'flame-filled',rest:'zzz'};
export function renderStreak(element,streak,{label=false}={}) {
 if(!element)return;
 element.replaceChildren();element.hidden=true;element.removeAttribute('aria-label');
 // The daily heading shows the streak that completing today's puzzle will make.
 if(label&&Number.isInteger(streak?.count)&&streak.count>=0&&streak.status!=='completed')streak={...streak,count:streak.count+1,status:streak.status==='none'?'pending':streak.status};
 if(!Number.isInteger(streak?.count)||streak.count<1||!icons[streak.status])return;
 const completed=streak.status==='completed';
 const text=label?`${streak.count}일 연속 ${completed?'완성':'도전 중..'}`:String(streak.count);
 const value=document.createElement('span');value.textContent=text;
 const icon=document.createElement('img');icon.src=`/icons/daily-streak/${label&&!completed?'flame':icons[streak.status]}.svg`;
 icon.width=14;icon.height=14;icon.alt='';icon.setAttribute('aria-hidden','true');
 element.append(value,icon);element.hidden=false;
 element.setAttribute('aria-label',`${label?text:streak.count+'일 스트릭'}, ${completed?'오늘 완료':streak.status==='rest'?'하루 휴식 중, 오늘 완료하면 이어집니다':'오늘 도전 중'}`);
}

export function renderStreakRankings(element,rows,{moonSolvers=new Set()}={}) {
 element.replaceChildren();
 if(!rows?.length){
  const empty=document.createElement('div');empty.className='lb-empty';empty.textContent='아직 기록이 없습니다.';element.append(empty);return;
 }
 const myIndex=rows.findIndex(row=>row.is_me);
 const rowElement=row=>{
  const line=document.createElement('div');line.className=`lb-row${row.is_me?' lb-me':''}`;
  const rank=document.createElement('span');rank.className='lb-rank';rank.textContent=row.rank;
  const name=document.createElement('span');name.className='lb-name seasonal-rank-name';
  const nickname=document.createElement('span');nickname.textContent=row.nickname;name.append(nickname);
  if(moonSolvers.has(row.nickname)){
   const badge=document.createElement('img');badge.className='seasonal-rank-badge';badge.src='/icons/seasonal/rabbit.svg';badge.width=18;badge.height=18;badge.alt='한가위 스도쿠 완성';badge.title='한가위 스도쿠 완성';name.append(badge);
  }
  const streak=document.createElement('span');streak.className='daily-streak';renderStreak(streak,row);
  line.append(rank,name,streak);return line;
 };
 const render=(expanded=false)=>{
  const list=document.createElement('div');list.className='lb-list';
  const visible=expanded||rows.length<=10?rows:rows.slice(0,10);
  for(const row of visible)list.append(rowElement(row));
  if(!expanded&&rows.length>10){
   const ellipsis=()=>{
    const line=document.createElement('div');line.className='lb-row lb-ellipsis lb-ellipsis-toggle';line.setAttribute('role','button');line.setAttribute('tabindex','0');line.setAttribute('aria-label','전체 랭킹 펼치기');
    const rank=document.createElement('span');rank.className='lb-rank';rank.textContent='⋯';
    const name=document.createElement('span');name.className='lb-name';
    const streak=document.createElement('span');streak.className='lb-time';line.append(rank,name,streak);
    const expand=()=>render(true);line.addEventListener('click',expand,{once:true});line.addEventListener('keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;event.preventDefault();expand();},{once:true});
    return line;
   };
   list.append(ellipsis());
   if(myIndex>=10){
    list.append(rowElement(rows[myIndex]));
    if(myIndex<rows.length-1)list.append(ellipsis());
   }
  }
  element.replaceChildren(list);
 };
 render();
 }

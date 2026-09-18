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

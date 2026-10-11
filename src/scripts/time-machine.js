const $ = id => document.getElementById(id);
const dateFor = day => new Date(`${day}T00:00:00Z`);
const dayFor = (year, month, date) => new Date(Date.UTC(year, month, date)).toISOString().slice(0,10);
let data, days = new Map(), months = [], selected, busy = false, loading = false;
const requested = new URLSearchParams(location.search).get('day');
function message(text='') {
  $('timeMachineMessage').textContent = text;
  $('timeMachineMessage').hidden = !text;
}
function selectDay(day) {
  selected = day;
  renderMonth();
  renderSelection();
}
function renderMonth() {
  const index = Number($('calendarMonth').value), {year, month} = months[index];
  $('previousMonth').disabled = busy || index === months.length - 1;
  $('nextMonth').disabled = busy || index === 0;
  $('todayMonth').disabled = $('calendarMonth').disabled = busy;
  const grid = document.createElement('div');
  grid.className = 'time-machine-calendar';
  grid.setAttribute('aria-label', `${year}년 ${month + 1}월`);
  for (const [i, weekday] of ['일','월','화','수','목','금','토'].entries()) {
    const label = document.createElement('span');
    label.className = `calendar-weekday${i===0 ? ' sunday' : i===6 ? ' saturday' : ''}`;
    label.textContent = weekday; grid.append(label);
  }
  const offset = new Date(Date.UTC(year, month, 1)).getUTCDay();
  for (let i=0; i<offset; i++) {
    const blank = document.createElement('span'); blank.className = 'calendar-blank'; blank.setAttribute('aria-hidden','true'); grid.append(blank);
  }
  const count = new Date(Date.UTC(year, month+1, 0)).getUTCDate();
  for (let date=1; date<=count; date++) {
    const day = dayFor(year, month, date), entry = days.get(day);
    const cell = document.createElement(entry ? 'button' : 'span');
    cell.className = `calendar-day${entry ? '' : ' unavailable'}${entry?.completed ? ' complete' : ''}${day===selected ? ' selected-date' : ''}`;
    if (entry) {
      cell.type = 'button'; cell.disabled = busy;
      cell.setAttribute('aria-pressed', String(day===selected));
      cell.setAttribute('aria-label', `${month+1}월 ${date}일, ${day===data.current_day ? '오늘, ' : ''}${entry.completed ? '완료' : entry.ticket_used ? '진행 중' : '미완료'}${entry.ticket_used ? ', 티켓 사용' : ''}`);
      cell.addEventListener('click', () => { message(); selectDay(day); });
    }
    const number = document.createElement('span'); number.className = 'calendar-number'; number.textContent = date;
    const status = document.createElement('span'); status.className = 'calendar-status'; status.setAttribute('aria-hidden','true');
    if (entry?.ticket_used) {
      const icon = document.createElement('img'); icon.src='/icons/time-machine/history.svg'; icon.width=12; icon.height=12; icon.alt=''; status.append(icon);
    } else status.textContent = entry?.completed ? '✓' : day===data.current_day ? '오늘' : '';
    cell.append(number,status); grid.append(cell);
  }
  $('pastDates').replaceChildren(grid);
  $('pastDates').setAttribute('aria-busy','false');
}
function renderSelection() {
  const date = dateFor(selected), entry = days.get(selected), today = selected===data.current_day;
  $('departure').hidden = !entry;
  if (!entry) return;
  $('departureTitle').textContent = `${date.getUTCFullYear()}년 ${date.getUTCMonth()+1}월 ${date.getUTCDate()}일`;
  $('departureStatus').textContent = entry.completed ? '완료' : today ? '오늘의 문제' : !data.signed_in ? '로그인 필요' : entry.ticket_used ? '진행 중' : '미완료';
  const button = $('departButton');
  button.textContent = busy ? '문제를 여는 중...' : today ? '데일리 스도쿠 풀기' : !data.signed_in ? '로그인 후 티켓 사용하기' : !window.puzzleAccount.profile ? '닉네임 설정하기' : entry.completed ? '완료한 문제 보기' : entry.ticket_used ? '이어서 풀기' : data.tickets>0 ? '티켓 사용하기' : '티켓 없음';
  button.disabled = busy || (!today && data.signed_in && window.puzzleAccount.profile && !entry.completed && !entry.ticket_used && !data.tickets);
}
async function load() {
  if (loading || busy) return;
  loading = true; $('timeMachineRetry').hidden=true; message('달력을 불러오는 중...');
  try {
    await window.puzzleAuthReady;
    if (window.puzzleAccount.error) throw new Error('ACCOUNT_ERROR');
    const owner=window.puzzleAccount.user?.id;
    const {data:result,error} = await window.puzzleAccount.client.rpc('time_machine_context');
    if (owner!==window.puzzleAccount.user?.id) return;
    if (error) throw error;
    data=result; days=new Map(data.days.map(entry=>[entry.day,entry]));
    $('remainingUses').textContent = data.tickets ?? '—';
    months=[];
    const first=dateFor(data.days[0]?.day || data.current_day), last=dateFor(data.current_day);
    for (let cursor=new Date(Date.UTC(last.getUTCFullYear(),last.getUTCMonth(),1)); cursor>=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),1)); cursor.setUTCMonth(cursor.getUTCMonth()-1)) months.push({year:cursor.getUTCFullYear(),month:cursor.getUTCMonth()});
    const previousMonth=$('calendarMonth').selectedOptions[0]?.textContent;
    $('calendarMonth').replaceChildren(...months.map(({year,month}, index)=>{
      const option=document.createElement('option'); option.value=index; option.textContent=`${year}년 ${month+1}월`; return option;
    }));
    selected = days.has(selected) ? selected : days.has(requested) ? requested : data.current_day;
    const selectedDate=dateFor(selected);
    const index=months.findIndex(({year,month})=>year===selectedDate.getUTCFullYear() && month===selectedDate.getUTCMonth());
    const previousIndex=months.findIndex(({year,month})=>`${year}년 ${month+1}월`===previousMonth);
    $('calendarMonth').value=previousIndex>=0 ? previousIndex : Math.max(0,index);
    message(); renderMonth(); renderSelection();
  } catch {
    message(window.puzzleAccount.error || '달력을 불러오지 못했습니다. 다시 확인해 주세요.');
    $('timeMachineRetry').hidden=false;
  } finally { loading=false; }
}
$('todayMonth').addEventListener('click',()=>{ $('calendarMonth').value='0'; selectDay(data.current_day); message(); });
$('previousMonth').addEventListener('click',()=>{ $('calendarMonth').value=Number($('calendarMonth').value)+1; renderMonth(); });
$('nextMonth').addEventListener('click',()=>{ $('calendarMonth').value=Number($('calendarMonth').value)-1; renderMonth(); });
$('calendarMonth').addEventListener('change',renderMonth);
$('timeMachineRetry').addEventListener('click',load);
$('departButton').addEventListener('click',async()=>{
  if (busy || !data || !days.has(selected)) return;
  if (selected===data.current_day) { location.assign('/daily-sudoku/'); return; }
  if (!window.puzzleAccount.user || !window.puzzleAccount.profile) {
    location.assign(`/nickname/?next=${encodeURIComponent(`/time-machine/?day=${selected}`)}`); return;
  }
  const entry=days.get(selected), target=selected;
  const url=`/daily-sudoku/?day=${target}&time-machine=1`;
  if (entry.completed || entry.ticket_used) { location.assign(url); return; }
  busy=true; message(); renderMonth(); renderSelection();
  const owner=window.puzzleAccount.user.id;
  try {
    const {error}=await window.puzzleAccount.client.rpc('open_time_machine',{requested_day:target});
    if (owner!==window.puzzleAccount.user?.id) return;
    if (error) throw error;
    location.assign(url);
  } catch(error) {
    if (owner!==window.puzzleAccount.user?.id) return;
    message(error.message?.includes('NO_TICKETS') ? '사용할 티켓이 없습니다.' : error.message?.includes('UNAVAILABLE') ? '이 날짜의 문제를 열 수 없습니다.' : '문제를 열지 못했습니다. 다시 시도해 주세요.');
  } finally { busy=false; renderMonth(); renderSelection(); }
});
load();
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});

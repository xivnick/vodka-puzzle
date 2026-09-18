import {context,title,rankings,rankMessage} from '../lib/daily-sudoku-client.js';
import {renderStreak} from '../lib/daily-streak.js';
import {units,dailyDate} from '../lib/sudoku.js';
import {readPuzzleCache,writePuzzleCache,clearPuzzleCache} from '../lib/daily-sudoku-cache.js';
const $=id=>document.getElementById(id),message=text=>{$('sudokuMessage').textContent=text;};
let data,state,selected=0,notesMode=false,key,submitting=false,loading=false,closed=false,rollover,completedAnswer=null,rejectedAnswer=null,ready=false,reinitPending=false;
const requested=new URLSearchParams(location.search).get('day');
const day=/^\d{4}-\d{2}-\d{2}$/.test(requested||'')?requested:null;
function updateStreak(result){
 const element=$('dailyStreak');
 renderStreak(element,result?.day===result?.current_day?result?.streak:null,{label:true});
 $('dailyStreakHeading').hidden=element.hidden;
}
function clean(saved){return {values:Array.from({length:81},(_,i)=>Number(data.givens[i])||((Number.isInteger(saved?.values?.[i])&&saved.values[i]>=0&&saved.values[i]<=9)?saved.values[i]:0)),notes:Array.from({length:81},(_,i)=>[...new Set((Array.isArray(saved?.notes?.[i])?saved.notes[i]:[]).filter(n=>Number.isInteger(n)&&n>=1&&n<=9))])};}
function persist(){try{localStorage.setItem(key,JSON.stringify(state));}catch{message('기기 저장 공간이 부족합니다. 클라우드 저장을 이용해 주세요.');}}
function isSolved(){return state?.values.length===81&&state.values.every(n=>Number.isInteger(n)&&n>=1&&n<=9)&&data.givens.split('').every((n,i)=>n==='0'||Number(n)===state.values[i])&&units.every(u=>new Set(u.map(i=>state.values[i])).size===9);}
function complete(){ $('sudokuComplete').hidden=false;message(''); }
function setReady(value){ready=value;$('sudokuBoard').classList.toggle('sudoku-loading',!value);$('sudokuBoard').setAttribute('aria-busy',String(!value));document.querySelectorAll('#dailyGame button,#cloudBtns button').forEach(b=>{b.disabled=!value;});}
function render(){ $('sudokuComplete').hidden=!isSolved();const conflicts=new Set();for(const u of units)for(const i of u)if(state.values[i]&&u.some(j=>j!==i&&state.values[j]===state.values[i]))conflicts.add(i);
 const board=$('sudokuBoard');board.replaceChildren();for(let i=0;i<81;i++){const b=document.createElement('button');b.type='button';b.disabled=!ready;b.className=`sudoku-cell${data.givens[i]!=='0'?' given':''}${selected===i?' selected':''}${conflicts.has(i)?' conflict':''}`;b.setAttribute('aria-label',`${Math.floor(i/9)+1}행 ${i%9+1}열, ${state.values[i]||'빈칸'}${data.givens[i]!=='0'?', 고정 숫자':''}`);b.tabIndex=i===selected?0:-1;b.dataset.cell=i;if(state.values[i])b.textContent=state.values[i];else{const n=document.createElement('span');n.className='notes';for(let v=1;v<=9;v++){const s=document.createElement('span');s.textContent=state.notes[i].includes(v)?v:'\u00a0';n.append(s);}b.append(n);}board.append(b);}}
function focus(){document.querySelector(`[data-cell="${selected}"]`)?.focus();}
function change(n){if(!ready||!state||data.givens[selected]!=='0')return;if(notesMode&&n){const a=state.notes[selected];state.notes[selected]=a.includes(n)?a.filter(v=>v!==n):[...a,n];}else{state.values[selected]=n;state.notes[selected]=[];}persist();render();if(state.values.every(Boolean)&&!notesMode)submit();}
async function submit(){
 if(!ready||submitting||!state||!state.values.every(Boolean))return;
 const answer=state.values.join('');
 if(answer===completedAnswer||answer===rejectedAnswer)return;
 if(!isSolved()){rejectedAnswer=answer;message('아직 정답이 아닙니다.');return;}
 if(closed){completedAnswer=answer;complete();return;}
 if(!window.puzzleAccount.user||!window.puzzleAccount.profile){completedAnswer=answer;complete();return;}
 const owner=window.puzzleAccount.user.id;
 submitting=true;complete();message('완료 기록을 저장하고 있습니다...');
 try{
  const {data:result,error}=await window.puzzleAccount.client.rpc('submit_completion',{requested_puzzle:`daily-sudoku:${data.day}`,submitted_state:{version:1,values:state.values.slice()},state_version:1});
  if(error)throw error;
  if(owner!==window.puzzleAccount.user?.id)return;
  completedAnswer=answer;complete();window.refreshRecentBanner?.(true);await refreshRanks();
 }catch(e){
  if(owner!==window.puzzleAccount.user?.id)return;
  message(e.message?.includes('CLOSED')?'순위 집계가 마감되었습니다.':e.message?.includes('PROFILE_REQUIRED')?'닉네임을 설정해 주세요.':'제출하지 못했습니다. 잠시 후 자동으로 다시 시도합니다.');
 }finally{submitting=false;if(state?.values.every(Boolean)&&state.values.join('')!==answer)submit();}
}
async function refreshRanks(){const requestedDay=data?.day;if(!requestedDay)return;const result=await context(requestedDay);if(data?.day!==requestedDay)return;updateStreak(result);if(!day&&result.current_day!==data.day){await init();return;}rankings($('sudokuRank'),result.rankings);const mine=result.rankings.find(r=>r.is_me);if(mine){completedAnswer=state?.values.every(Boolean)?state.values.join(''):null;if(isSolved())complete();}closed=data.day!==result.current_day;$('dailyStatus').textContent=closed?'마감':'';}
function showPuzzle(puzzle, preserve=false){
 data=puzzle;updateStreak(puzzle);document.querySelector('h1').textContent=title(data.day);document.title=`${title(data.day)} · vodka puzzle`;
 $('dailyGame').hidden=false;$('dailyUnavailable').hidden=true;
 for(const selector of ['#cloudBtns','.help-toggles','.lb-section'])document.querySelector(selector).hidden=false;
 closed=data.day!==data.current_day;
 if(!preserve){
  key=`daily-sudoku:${window.puzzleAccount.user?.id||'guest'}:${data.day}`;
  let saved;try{saved=JSON.parse(localStorage.getItem(key));if(!saved&&window.puzzleAccount.user)saved=JSON.parse(localStorage.getItem(`daily-sudoku:guest:${data.day}`));}catch{}
  state=clean(saved);completedAnswer=null;rejectedAnswer=null;
 }
 render();
}
function showLoading(){
 updateStreak(null);
 const heading=title(day||dailyDate());document.querySelector('h1').textContent=heading;document.title=`${heading} · vodka puzzle`;
 ready=false;state=null;data=null;$('dailyGame').hidden=false;$('dailyUnavailable').hidden=true;
 $('sudokuComplete').hidden=true;message('');$('dailyStatus').textContent='문제를 불러오는 중...';
 const board=$('sudokuBoard');board.replaceChildren();
 for(let i=0;i<81;i++){const cell=document.createElement('button');cell.type='button';cell.className='sudoku-cell';cell.disabled=true;cell.setAttribute('aria-label',`${Math.floor(i/9)+1}행 ${i%9+1}열, 불러오는 중`);board.append(cell);}
 setReady(false);
 for(const selector of ['.help-toggles','.lb-section'])document.querySelector(selector).hidden=false;
}
function showUnavailable(text){
 updateStreak(null);setReady(false);state=null;data=null;
 for(const selector of ['#cloudBtns','.help-toggles','.lb-section'])document.querySelector(selector).hidden=true;
 $('dailyGame').hidden=true;$('dailyUnavailable').hidden=false;$('dailyStatus').textContent='';$('dailyUnavailableTitle').textContent=text;
}
async function init(){
 if(loading){reinitPending=true;return;}loading=true;
 const cached=readPuzzleCache(localStorage,dailyDate(),day);
 if(!ready||data?.day!==(day||dailyDate()))showLoading();
 if(!ready&&cached){
  data=cached;state=clean(null);document.querySelector('h1').textContent=title(cached.day);document.title=`${title(cached.day)} · vodka puzzle`;render();
 }
 await window.puzzleAuthReady;
 if(!ready&&cached){showPuzzle(cached);setReady(true);window.initCloudBtns();$('dailyStatus').textContent='';}
 try{
  const result=await context(day);
  document.querySelector('h1').textContent=title(result.day);document.title=`${title(result.day)} · vodka puzzle`;
  clearTimeout(rollover);rollover=setTimeout(()=>{updateStreak(null);if(!day)init();else if(data?.available)refreshRanks().catch(()=>{});else init();},Math.max(1000,new Date(result.next_opens_at)-new Date(result.server_now)+100));
  if(!result.available){if(result.day===result.current_day)clearPuzzleCache(localStorage);showUnavailable('문제가 준비되지 않았습니다');return;}
  const preserve=ready&&data?.day===result.day&&data?.givens===result.givens;
  showPuzzle(result,preserve);setReady(true);window.initCloudBtns();writePuzzleCache(localStorage,result);
  if(!day)historyReplace(result.day);
  rankings($('sudokuRank'),result.rankings);$('dailyStatus').textContent=closed?'마감':'';
  submit();
 }catch{
  if(ready&&data?.available&&data.day===(day||dailyDate())){rankMessage($('sudokuRank'),'기록을 불러오지 못했습니다.');$('dailyStatus').textContent='';}
  else showUnavailable('문제를 불러오지 못했습니다');
 }finally{loading=false;if(reinitPending){reinitPending=false;init();}}
}
function historyReplace(date){window.history.replaceState(null,'',`?day=${date}`);}
$('dailyRetry').addEventListener('click',init);$('sudokuBoard').addEventListener('click',e=>{const b=e.target.closest('[data-cell]');if(ready&&b){selected=Number(b.dataset.cell);render();focus();}});
$('sudokuBoard').addEventListener('keydown',e=>{if(!ready)return;if(/^[1-9]$/.test(e.key)){e.preventDefault();change(Number(e.key));focus();}else if(['Backspace','Delete','0'].includes(e.key)){e.preventDefault();change(0);focus();}else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();selected=Math.max(0,Math.min(80,selected+({ArrowLeft:-1,ArrowRight:1,ArrowUp:-9,ArrowDown:9}[e.key])));render();focus();}});
$('sudokuNumbers').addEventListener('click',e=>{const b=e.target.closest('[data-number]');if(b)change(Number(b.dataset.number));});
$('sudokuNotes').addEventListener('click',()=>{notesMode=!notesMode;$('sudokuNotes').setAttribute('aria-pressed',String(notesMode));});$('sudokuErase').addEventListener('click',()=>change(0));$('sudokuReset').addEventListener('click',()=>{if(confirm('입력한 숫자와 메모를 초기화할까요?')){state=clean(null);persist();render();}});
window.handleCloudSave=async()=>{if(!ready||!data?.available||!state)return;try{const {error}=await window.puzzleAccount.client.rpc('save_daily_sudoku_progress',{requested_day:data.day,saved_state:state});if(error)throw error;window.showToast('저장했습니다.');}catch{message('저장하지 못했습니다. 로그인과 연결을 확인해 주세요.');}};
window.handleCloudLoad=async()=>{if(!ready||!data?.available||!state)return;if(!window.puzzleAccount.user){message('로그인 후 불러올 수 있습니다.');return;}try{const {data:row,error}=await window.puzzleAccount.client.from('daily_sudoku_progress').select('state').eq('day',data.day).eq('user_id',window.puzzleAccount.user.id).maybeSingle();if(error)throw error;if(!row){message('저장된 기록이 없습니다.');return;}if(confirm('클라우드 기록으로 현재 진행 상황을 바꿀까요?')){state=clean(row.state);persist();render();window.showToast('불러왔습니다.');submit();}}catch{message('불러오지 못했습니다. 다시 시도해 주세요.');}};
window.addEventListener('puzzle-auth-ready',()=>{updateStreak(null);setReady(false);completedAnswer=null;init();});
init();setInterval(()=>{if(!document.hidden&&data?.available){refreshRanks().catch(()=>{});submit();}else if(!document.hidden&&!loading)init();},30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&data?.available)refreshRanks().catch(()=>{});});

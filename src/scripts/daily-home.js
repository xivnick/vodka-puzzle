import {context,title,rankings,rankMessage} from '../lib/daily-sudoku-client.js';
import {renderStreak} from '../lib/daily-streak.js';
import {dailyDate} from '../lib/sudoku.js';
const card=document.getElementById('dailyCard'),label=document.getElementById('dailyTitle'),panel=document.getElementById('dailyRank');
let current,offset=0,busy=false,rollover,refreshPending=false;
function localLabel(){label.textContent=title(dailyDate(new Date(Date.now()+offset))).replace('Daily Sudoku','오늘의 스도쿠');}
function updateRankTitle(){
 const heading=document.getElementById('rankTitle');
 const daily=document.getElementById('dailyRankBtn').getAttribute('aria-pressed')==='true';
 const count=heading.dataset[daily?'dailyCount':'regularCount'];
 heading.textContent=(daily?'데일리 스도쿠':'랭킹')+(count===undefined?'':` (${count})`);
}
function updateCard(rows,streak=null){
 renderStreak(document.getElementById('dailyStreak'),streak);
 const text=card.querySelector('.title');
 text.querySelector('.solver-count')?.remove();text.querySelector('.check-mark')?.remove();
 if(rows.length){const count=document.createElement('span');count.className='solver-count';count.textContent=`(${rows.length})`;text.append(count);}
}
function apply(data){
 current=data.current_day;label.textContent=title(current).replace('Daily Sudoku','오늘의 스도쿠');card.href=`/daily-sudoku/?day=${current}`;
 updateCard(data.rankings,data.streak);document.getElementById('rankTitle').dataset.dailyCount=String(data.rankings.length);updateRankTitle();
 rankings(panel,data.rankings);if(!data.available)rankMessage(panel,'아직 기록이 없습니다.');
}
localLabel();
async function refresh(){
 if(busy){refreshPending=true;return;}busy=true;
 try{const data=await context();offset=new Date(data.server_now).getTime()-Date.now();clearTimeout(rollover);rollover=setTimeout(refresh,Math.max(1000,new Date(data.next_opens_at)-new Date(data.server_now)+100));apply(data);}
 catch{rankMessage(panel,'기록을 불러오지 못했습니다.');}
 finally{busy=false;if(refreshPending){refreshPending=false;refresh();}}
}
async function loadRank(){try{apply(await context());}catch{rankMessage(panel,'기록을 불러오지 못했습니다.');}}
const buttons=[...document.querySelectorAll('[data-rank-mode]')];
for(const button of buttons)button.addEventListener('click',()=>{
 const daily=button.dataset.rankMode==='daily';
 for(const other of buttons){other.classList.toggle('active',other===button);other.setAttribute('aria-pressed',String(other===button));}
 updateRankTitle();
 document.getElementById('regularRankPanel').hidden=daily;
 document.getElementById('dailyRankPanel').hidden=!daily;
 if(daily)loadRank();
});
refresh();setInterval(()=>{if(document.hidden)return;localLabel();if(current!==dailyDate(new Date(Date.now()+offset)))updateCard([]);refresh();},30000);
window.addEventListener('pageshow',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});

window.addEventListener('puzzle-auth-ready',()=>{updateCard([]);refresh();});

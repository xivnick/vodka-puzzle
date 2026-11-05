import {blokus,parseState,inspect} from '../lib/blokus-shading.js';

const game=document.getElementById('blokusGame');
const puzzleId=game.dataset.puzzleId, preview=game.dataset.preview==='true';
const $=id=>document.getElementById(`blokus${id}`);
const board=$('Board'),inputs=[...board.querySelectorAll('[data-cell]')];
const account=()=>window.puzzleAccount?.user?.id || 'guest';
let filled=new Set(),crosses=new Set(),ready=false,owner=null,recorded=false,press=null;
const state=()=>({version:4,puzzleId,filled:[...filled].sort((a,b)=>a-b),crosses:[...crosses].sort((a,b)=>a-b)});
const active=()=>ready && (preview || owner===account());
function persist() {
  if(!active())return;
  try {
    if(preview)localStorage.setItem(puzzleId,JSON.stringify(state()));
    else window.saveLocalState(puzzleId,state());
  }catch {window.showToast('브라우저에 저장하지 못했습니다.');}
}
function render() {
  const result=inspect(filled);
  let html='';
  for(const block of result.blocks)for(const index of block.cells) {
    const color=block.bad ? '#df9292' : block.name ? '#91bd91' : '#ababab';
    html+=`<rect x="${index%blokus.cols*40}" y="${Math.floor(index/blokus.cols)*40}" width="40" height="40" fill="${color}"/>`;
  }
  $('Fills').innerHTML=html;
  $('Crosses').innerHTML=[...crosses].map(index=>{
    const x=(index%blokus.cols+.5)*40,y=(Math.floor(index/blokus.cols)+.5)*40;
    return `<path d="M${x-6} ${y-6}L${x+6} ${y+6}M${x+6} ${y-6}L${x-6} ${y+6}" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round"/>`;
  }).join('');
  inputs.forEach((cell,index)=>{
    cell.setAttribute('aria-pressed',String(filled.has(index)));
    cell.setAttribute('aria-label',`${Math.floor(index/blokus.cols)+1}행 ${index%blokus.cols+1}열, ${filled.has(index) ? '칠한 칸' : crosses.has(index) ? 'X 메모' : '빈칸'}`);
    cell.setAttribute('aria-disabled',String(!active()));
  });
  document.querySelectorAll('.shape-item[data-piece]').forEach(item=>{
    const count=result.counts[item.dataset.piece] || 0;
    item.classList.toggle('used',count===1);
    item.classList.toggle('duplicate',count>1);
    item.setAttribute('aria-label',`${item.dataset.piece} 블록, ${count}개`);
  });
  $('Complete').hidden=!result.complete;
  $('Reset').disabled=!active() || !filled.size && !crosses.size;
  const formed=Object.values(result.counts).filter(count=>count===1).length;
  $('Status').textContent=result.complete ? '퍼즐을 완성했습니다.' : `칠한 칸 ${filled.size}개. 한 번씩 만든 블록 ${formed} / 12개.`;
  if(!result.complete)recorded=false;
  else if(!preview && active() && !recorded) {
    recorded=true;
    if(window.puzzlePage?.published)window.recordCompletion(puzzleId,state());
  }
}
function toggle(index,mark='fill') {
  if(!active())return;
  const target=mark==='cross' ? crosses : filled,other=mark==='cross' ? filled : crosses;
  if(target.has(index))target.delete(index);
  else {other.delete(index);target.add(index);}
  persist();render();
}
function cancelPress() {
  if(press)clearTimeout(press.timer);
  press=null;
}
board.addEventListener('contextmenu',event=>event.preventDefault());
board.addEventListener('pointerdown',event=>{
  if(!active() || event.button!==0 || press)return;
  const cell=event.target.closest('[data-cell]');
  if(!cell)return;
  if(event.pointerType==='mouse')event.preventDefault();
  const index=Number(cell.dataset.cell);
  press={id:event.pointerId,index,x:event.clientX,y:event.clientY,long:false,timer:null};
  press.timer=setTimeout(()=>{
    if(!press || press.id!==event.pointerId)return;
    press.long=true;toggle(index,'cross');
  },550);
});
window.addEventListener('pointermove',event=>{
  if(press?.id===event.pointerId && Math.hypot(event.clientX-press.x,event.clientY-press.y)>10)cancelPress();
});
window.addEventListener('pointerup',event=>{
  if(press?.id!==event.pointerId)return;
  const previous=press;cancelPress();
  if(!previous.long && Math.hypot(event.clientX-previous.x,event.clientY-previous.y)<=10)toggle(previous.index);
});
window.addEventListener('pointercancel',event=>{if(press?.id===event.pointerId)cancelPress();});
window.addEventListener('blur',cancelPress);
$('Reset').addEventListener('click',()=>{
  if(!active() || !filled.size && !crosses.size || !confirm('초기화하시겠습니까?'))return;
  cancelPress();filled.clear();crosses.clear();persist();render();
});
function restore(saved) {
  cancelPress();
  const parsed=parseState(saved,puzzleId);
  filled=parsed?.filled || new Set();crosses=parsed?.crosses || new Set();recorded=false;
}
function init() {
  if(ready && (preview || owner===account()))return;
  ready=false;owner=account();
  let saved=null;
  try {saved=preview ? JSON.parse(localStorage.getItem(puzzleId) || 'null') : window.loadLocalState(puzzleId);}catch {}
  restore(saved);ready=true;render();
  if(!preview)window.initCloudBtns();
}
if(!preview) {
  window.handleCloudSave=()=>{if(active())return window.saveProgressCloud(puzzleId,state());};
  window.handleCloudLoad=async()=>{
    if(!active())return;
    const requestedOwner=owner,before=JSON.stringify(state());
    const saved=await window.loadProgressCloud(puzzleId);
    if(saved==null || requestedOwner!==account() || before!==JSON.stringify(state()))return;
    if(!parseState(saved,puzzleId)){window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.');return;}
    restore(saved);persist();render();
  };
}
render();
if(preview)init();else window.startLocalPuzzle(puzzleId,init,()=>{ready=false;init();});

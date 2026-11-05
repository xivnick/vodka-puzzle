import {blokus,parseState,inspect} from '../lib/blokus-shading.js';

const game=document.getElementById('blokusGame');
const puzzleId=game.dataset.puzzleId, preview=game.dataset.preview==='true';
const $=id=>document.getElementById(`blokus${id}`);
const board=$('Board'),inputs=[...board.querySelectorAll('[data-cell]')];
const account=()=>window.puzzleAccount?.user?.id || 'guest';
let filled=new Set(),ready=false,owner=null,recorded=false,selected=0,press=null;
const state=()=>({version:3,puzzleId,filled:[...filled].sort((a,b)=>a-b)});
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
    const color=block.bad ? '#fce8e7' : block.name ? '#e9f4e9' : '#dce5f1';
    html+=`<rect x="${index%blokus.cols*40}" y="${Math.floor(index/blokus.cols)*40}" width="40" height="40" fill="${color}"/>`;
  }
  $('Fills').innerHTML=html;
  inputs.forEach((cell,index)=>{
    cell.setAttribute('aria-pressed',String(filled.has(index)));
    cell.setAttribute('aria-label',`${Math.floor(index/blokus.cols)+1}행 ${index%blokus.cols+1}열, ${filled.has(index) ? '칠한 칸' : '빈칸'}`);
    cell.setAttribute('aria-disabled',String(!active()));
    cell.tabIndex=selected===index ? 0 : -1;
  });
  document.querySelectorAll('.shape-item[data-piece]').forEach(item=>{
    const count=result.counts[item.dataset.piece] || 0;
    item.classList.toggle('used',count===1);
    item.classList.toggle('duplicate',count>1);
    item.setAttribute('aria-label',`${item.dataset.piece} 블록, ${count}개`);
  });
  $('Complete').hidden=!result.complete;
  $('Reset').disabled=!active() || !filled.size;
  const formed=Object.values(result.counts).filter(count=>count===1).length;
  $('Status').textContent=result.complete ? '퍼즐을 완성했습니다.' : `칠한 칸 ${filled.size}개. 한 번씩 만든 블록 ${formed} / 12개.`;
  if(!result.complete)recorded=false;
  else if(!preview && active() && !recorded) {
    recorded=true;
    if(window.puzzlePage?.published)window.recordCompletion(puzzleId,state());
  }
}
function toggle(index) {
  if(!active())return;
  selected=index;
  if(filled.has(index))filled.delete(index);else filled.add(index);
  persist();render();
}
board.addEventListener('pointerdown',event=>{
  if(!active() || event.button!==0 || press)return;
  const cell=event.target.closest('[data-cell]');
  if(!cell)return;
  press={id:event.pointerId,index:Number(cell.dataset.cell),x:event.clientX,y:event.clientY};
});
window.addEventListener('pointermove',event=>{
  if(press?.id===event.pointerId && Math.hypot(event.clientX-press.x,event.clientY-press.y)>10)press=null;
});
window.addEventListener('pointerup',event=>{
  if(press?.id!==event.pointerId)return;
  const previous=press;press=null;
  if(Math.hypot(event.clientX-previous.x,event.clientY-previous.y)<=10)toggle(previous.index);
});
window.addEventListener('pointercancel',event=>{if(press?.id===event.pointerId)press=null;});
window.addEventListener('blur',()=>{press=null;});
board.addEventListener('keydown',event=>{
  if(!active())return;
  const cell=event.target.closest('[data-cell]');
  if(!cell)return;
  selected=Number(cell.dataset.cell);
  if(event.key==='Enter' || event.key===' '){event.preventDefault();toggle(selected);return;}
  const row=Math.floor(selected/blokus.cols),col=selected%blokus.cols;
  const next={ArrowLeft:col>0 ? selected-1 : selected,ArrowRight:col<blokus.cols-1 ? selected+1 : selected,ArrowUp:row>0 ? selected-blokus.cols : selected,ArrowDown:row<blokus.rows-1 ? selected+blokus.cols : selected}[event.key];
  if(next!==undefined){event.preventDefault();selected=next;render();inputs[next].focus({preventScroll:true});}
});
$('Reset').addEventListener('click',()=>{
  if(!active() || !filled.size || !confirm('초기화하시겠습니까?'))return;
  press=null;filled.clear();persist();render();
});
function restore(saved) {
  press=null;filled=parseState(saved,puzzleId) || new Set();recorded=false;
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

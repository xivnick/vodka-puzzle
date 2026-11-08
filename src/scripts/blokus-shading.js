import {parseState,inspect} from '../lib/blokus-shading.js';

const game=document.getElementById('blokusGame');
const blokus=JSON.parse(game.dataset.grid);
const puzzleId=game.dataset.puzzleId, preview=game.dataset.preview==='true';
const $=id=>document.getElementById(`blokus${id}`);
const board=$('Board'),mode=$('Mode'),inputs=[...board.querySelectorAll('[data-cell]')];
const account=()=>window.puzzleAccount?.user?.id || 'guest';
let filled=new Set(),crosses=new Set(),ready=false,owner=null,recorded=false,press=null;
let longPressMeans='cross';
const state=()=>({version:1,puzzleId,filled:[...filled].sort((a,b)=>a-b),crosses:[...crosses].sort((a,b)=>a-b)});
const active=()=>ready && (preview || owner===account());
function persist() {
  if(!active())return;
  try {
    if(preview)localStorage.setItem(puzzleId,JSON.stringify(state()));
    else window.saveLocalState(puzzleId,state());
  }catch {window.showToast('브라우저에 저장하지 못했습니다.');}
}
function render() {
  const result=inspect(filled,blokus);
  let html='';
  for(const block of result.blocks)for(const index of block.cells) {
    const color=block.bad ? '#b65c5c' : block.name ? '#5b8c64' : '#333';
    const cell=`<rect x="${index%blokus.cols*40}" y="${Math.floor(index/blokus.cols)*40}" width="40" height="40" fill="${color}"/>`;
    html+=cell;
  }
  $('Fills').innerHTML=html;
  board.querySelectorAll('[data-clue]').forEach(text=>{text.style.fill=filled.has(Number(text.dataset.clue)) ? '#fff' : '#222';});
  $('Crosses').innerHTML=[...crosses].map(index=>{
    const x=(index%blokus.cols+.5)*40,y=(Math.floor(index/blokus.cols)+.5)*40;
    return `<path d="M${x-6} ${y-6}L${x+6} ${y+6}M${x+6} ${y-6}L${x-6} ${y+6}" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round"/>`;
  }).join('');
  inputs.forEach((cell,index)=>{
    cell.setAttribute('aria-pressed',String(filled.has(index)));
    cell.setAttribute('aria-label',`${Math.floor(index/blokus.cols)+1}행 ${index%blokus.cols+1}열, ${filled.has(index) ? '칠한 칸' : crosses.has(index) ? 'X 메모' : '빈칸'}${blokus.clues?.[Math.floor(index/blokus.cols)]?.[index%blokus.cols]!=null ? ', 숫자 '+blokus.clues[Math.floor(index/blokus.cols)][index%blokus.cols] : ''}`);
    cell.setAttribute('aria-disabled',String(!active()));
  });
  document.querySelectorAll('.shape-item[data-piece]').forEach(item=>{
    const count=result.counts[item.dataset.piece] || 0;
    item.classList.toggle('used',count===1);
    item.classList.toggle('duplicate',count>1);
    item.setAttribute('aria-label',`${item.dataset.piece} 블록, ${count}개`);
  });
  $('Complete').hidden=!result.complete;
  mode.disabled=!active();
  mode.textContent=longPressMeans==='cross' ? '길게 눌러 x 표시' : '길게 눌러 칠하기';
  mode.setAttribute('aria-pressed',String(longPressMeans==='fill'));
  board.setAttribute('aria-label',`${blokus.rows}행 ${blokus.cols}열 블로커스 격자. ${longPressMeans==='cross' ? '짧게 눌러 칠하고 길게 눌러 X로 메모하세요' : '짧게 눌러 X로 메모하고 길게 눌러 칠하세요'}`);
  $('Reset').disabled=!active() || !filled.size && !crosses.size;
  const formed=Object.values(result.counts).filter(count=>count===1).length;
  $('Status').textContent=result.complete ? '퍼즐을 완성했습니다.' : `칠한 칸 ${filled.size}개. 한 번씩 만든 블록 ${formed} / 12개.`;
  if(!result.complete)recorded=false;
  else if(!preview && active() && !recorded) {
    recorded=true;
    window.recordCompletion(puzzleId,state());
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
mode.addEventListener('click',()=>{
  if(!active())return;
  cancelPress();
  longPressMeans=longPressMeans==='cross' ? 'fill' : 'cross';
  render();
});
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
    press.long=true;toggle(index,longPressMeans);
  },550);
});
window.addEventListener('pointermove',event=>{
  if(press?.id===event.pointerId && Math.hypot(event.clientX-press.x,event.clientY-press.y)>10)cancelPress();
});
window.addEventListener('pointerup',event=>{
  if(press?.id!==event.pointerId)return;
  const previous=press;cancelPress();
  if(!previous.long && Math.hypot(event.clientX-previous.x,event.clientY-previous.y)<=10)toggle(previous.index,longPressMeans==='cross' ? 'fill' : 'cross');
});
window.addEventListener('pointercancel',event=>{if(press?.id===event.pointerId)cancelPress();});
window.addEventListener('blur',cancelPress);
$('Reset').addEventListener('click',()=>{
  if(!active() || !filled.size && !crosses.size || !confirm('초기화하시겠습니까?'))return;
  cancelPress();filled.clear();crosses.clear();persist();render();
});
function restore(saved) {
  cancelPress();
  const parsed=parseState(saved,puzzleId,blokus);
  filled=parsed?.filled || new Set();crosses=parsed?.crosses || new Set();recorded=false;
}
function init() {
  if(ready && (preview || owner===account()))return;
  ready=false;owner=account();
  let saved=null,migrated=false;
  try {
    saved=preview ? JSON.parse(localStorage.getItem(puzzleId) || 'null') : window.loadLocalState(puzzleId);
    if(!preview && puzzleId==='261105_01' && !parseState(saved,puzzleId,blokus)) {
      // Preserve outlines without guessing which enclosed regions were empty.
      const backupKey=`${puzzleId}:before-shading`;
      if(saved!=null && localStorage.getItem(backupKey)===null)localStorage.setItem(backupKey,JSON.stringify(saved));
      const testId='test-blokus-shading';
      const test=JSON.parse(localStorage.getItem(testId) || 'null');
      const parsed=parseState(test,testId,blokus);
      if(parsed && (parsed.filled.size || parsed.crosses.size)) {
        saved={...test,version:1,puzzleId};migrated=true;
      }
    }
  }catch {}
  restore(saved);ready=true;
  if(migrated)persist();
  render();
  if(!preview)window.initCloudBtns();
}
if(!preview) {
  window.checkComplete=()=>{
    if(!ready)return;
    if(owner!==account()) {cancelPress();owner=account();}
    recorded=false;render();
  };
  window.handleCloudSave=()=>{if(active())return window.saveProgressCloud(puzzleId,state());};
  window.handleCloudLoad=async()=>{
    if(!active())return;
    const requestedOwner=owner,before=JSON.stringify(state());
    const saved=await window.loadProgressCloud(puzzleId);
    if(saved==null || requestedOwner!==account() || before!==JSON.stringify(state()))return;
    if(!parseState(saved,puzzleId,blokus)){window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.');return;}
    restore(saved);persist();render();
  };
}
render();
if(preview)init();else window.startLocalPuzzle(puzzleId,init,()=>{ready=false;init();});

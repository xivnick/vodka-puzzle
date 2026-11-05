import { blokus, edgeKey, edgeSegment, parseState, inspect } from '../lib/blokus.js';

const game=document.getElementById('blokusGame');
const puzzleId=game.dataset.puzzleId;
const $=id=>document.getElementById(`blokus${id}`);
const board=$('Board'), mode=$('Mode'), reset=$('Reset'), complete=$('Complete');
const {rows,cols}=blokus, size=40, width=cols*size, height=rows*size;
const account=()=>window.puzzleAccount?.user?.id || 'guest';
let lines=new Set(), crosses=new Set(), ready=false, owner=null, recorded=false;
let press=null, longPressMeans='cross';
board.setAttribute('viewBox',`0 0 ${width} ${height}`);
const state=()=>({version:1,puzzleId,lines:[...lines],crosses:[...crosses]});
const active=()=>ready && owner===account();
function persist() {
  if(!active())return;
  try {window.saveLocalState(puzzleId,state());}
  catch {window.showToast('브라우저에 저장하지 못했습니다.');}
}
function cancelPress() {
  if(press)clearTimeout(press.timer);
  press=null;
}
function render() {
  const result=inspect(lines);
  let html='';
  for(const block of result.blocks)for(const index of block.cells) {
    html+=`<rect x="${index%cols*size}" y="${Math.floor(index/cols)*size}" width="${size}" height="${size}" fill="${block.bad ? '#fce8e7' : '#e9f4e9'}"/>`;
  }
  for(let y=1;y<rows;y++)html+=`<path d="M0 ${y*size}H${width}" stroke="#d2d8df" stroke-width="1" stroke-dasharray="3 4"/>`;
  for(let x=1;x<cols;x++)html+=`<path d="M${x*size} 0V${height}" stroke="#d2d8df" stroke-width="1" stroke-dasharray="3 4"/>`;
  for(const key of lines) {
    const [x1,y1,x2,y2]=edgeSegment(key);
    html+=`<path d="M${x1*size} ${y1*size}L${x2*size} ${y2*size}" stroke="#334f72" stroke-width="4" stroke-linecap="round"/>`;
  }
  for(const key of crosses) {
    const [x1,y1,x2,y2]=edgeSegment(key), x=(x1+x2)/2*size, y=(y1+y2)/2*size;
    html+=`<rect x="${x-9}" y="${y-9}" width="18" height="18" fill="white"/>`;
    html+=`<path d="M${x-6} ${y-6}L${x+6} ${y+6}M${x+6} ${y-6}L${x-6} ${y+6}" stroke="#58636f" stroke-width="2.5" stroke-linecap="round"/>`;
  }
  for(const [x,y] of blokus.dots)html+=`<circle cx="${x*size}" cy="${y*size}" r="5" fill="#222"/>`;
  html+=`<rect x="1.5" y="1.5" width="${width-3}" height="${height-3}" fill="none" stroke="#202a36" stroke-width="3"/>`;
  board.innerHTML=html;
  document.querySelectorAll('.shape-item[data-piece]').forEach(item=>{
    const count=result.counts[item.dataset.piece] || 0;
    item.classList.toggle('used',count===1);
    item.classList.toggle('duplicate',count>1);
    item.setAttribute('aria-label',`${item.dataset.piece} 블록, ${count}개`);
  });
  complete.hidden=!result.complete;
  reset.disabled=!active() || !lines.size && !crosses.size;
  mode.disabled=!active();
  const formed=Object.values(result.counts).filter(count=>count===1).length;
  $('Status').textContent=result.complete ? '퍼즐을 완성했습니다.' : `한 번씩 그린 블록 ${formed} / 12개. 서로 다른 블록이 맞닿은 점 ${result.metDots.size} / 16개.`;
  if(!result.complete)recorded=false;
  else if(active() && !recorded) {
    recorded=true;
    window.recordCompletion(puzzleId,state());
  }
}
function toggleMark(key,mark) {
  if(!active())return;
  const target=mark==='line' ? lines : crosses, other=mark==='line' ? crosses : lines;
  if(target.has(key))target.delete(key);
  else {other.delete(key);target.add(key);}
  persist();render();
}
function edgeAt(event) {
  const rect=board.getBoundingClientRect();
  const x=(event.clientX-rect.left)/rect.width*width, y=(event.clientY-rect.top)/rect.height*height;
  if(x<0 || y<0 || x>width || y>height)return null;
  const col=Math.round(x/size), row=Math.round(y/size);
  const dx=Math.abs(x-col*size), dy=Math.abs(y-row*size);
  const vertical=col>0 && col<cols && dx<14, horizontal=row>0 && row<rows && dy<14;
  if(vertical && (!horizontal || dx<=dy)) {
    const index=Math.min(rows-1,Math.floor(y/size))*cols+col;
    return edgeKey(index-1,index);
  }
  if(horizontal) {
    const index=row*cols+Math.min(cols-1,Math.floor(x/size));
    return edgeKey(index-cols,index);
  }
  return null;
}
mode.addEventListener('click',()=>{
  longPressMeans=longPressMeans==='cross' ? 'line' : 'cross';
  mode.textContent=longPressMeans==='cross' ? '길게 눌러 x 표시' : '길게 눌러 선 긋기';
  mode.setAttribute('aria-pressed',String(longPressMeans==='line'));
});
board.addEventListener('contextmenu',event=>event.preventDefault());
board.addEventListener('pointerdown',event=>{
  if(!active() || event.button!==0 || press)return;
  const key=edgeAt(event);
  if(!key)return;
  press={id:event.pointerId,key,x:event.clientX,y:event.clientY,long:false,timer:null};
  press.timer=setTimeout(()=>{
    if(!press || press.id!==event.pointerId)return;
    press.long=true;toggleMark(key,longPressMeans);
  },550);
});
window.addEventListener('pointermove',event=>{
  if(!press || press.id!==event.pointerId || press.long)return;
  if(Math.hypot(event.clientX-press.x,event.clientY-press.y)>10)cancelPress();
});
window.addEventListener('pointerup',event=>{
  if(!press || press.id!==event.pointerId)return;
  const {key,long,x,y}=press;
  cancelPress();
  if(!long && Math.hypot(event.clientX-x,event.clientY-y)<=10)toggleMark(key,longPressMeans==='cross' ? 'line' : 'cross');
});
window.addEventListener('pointercancel',event=>{if(press?.id===event.pointerId)cancelPress();});
window.addEventListener('blur',cancelPress);
reset.addEventListener('click',()=>{
  if(!active() || !lines.size && !crosses.size || !confirm('초기화하시겠습니까?'))return;
  cancelPress();lines.clear();crosses.clear();persist();render();
});
function restore(saved) {
  cancelPress();
  const parsed=parseState(saved,puzzleId);
  lines=parsed?.lines || new Set();crosses=parsed?.crosses || new Set();recorded=false;
}
function init() {
  const nextOwner=account();
  if(ready && owner===nextOwner)return;
  ready=false;owner=nextOwner;
  let saved=null;
  try {saved=window.loadLocalState(puzzleId);}catch {}
  restore(saved);ready=true;render();window.initCloudBtns();
}
window.checkComplete=()=>{
  if(!ready)return;
  // Device progress is shared across accounts; keep the board when auth settles.
  if(owner!==account()) {cancelPress();owner=account();}
  recorded=false;render();
};
window.handleCloudSave=()=>{if(active())return window.saveProgressCloud(puzzleId,state());};
window.handleCloudLoad=async()=>{
  if(!active())return;
  const requestedOwner=owner,before=JSON.stringify(state());
  const saved=await window.loadProgressCloud(puzzleId);
  if(saved==null || requestedOwner!==account() || before!==JSON.stringify(state()))return;
  if(!parseState(saved,puzzleId)){window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.');return;}
  restore(saved);persist();render();
};
render();
window.startLocalPuzzle(puzzleId,init,()=>{ready=false;init();});

import {clues,edgeKey,analyze,parseState} from '../lib/polygraph.js';
const $=id=>document.getElementById(id), game=$('polygraphGame'), board=$('polygraphBoard'), puzzleId=game.dataset.puzzleId;
let edges=new Set(),notes=new Set(),selected=null,gesture=null,swapped=false,ready=false,completionRecorded=false;
const state=()=>({version:1,puzzleId,edges:[...edges],notes:[...notes]});
const xy=i=>[18+i%10*40,18+Math.floor(i/10)*40];
function persist(){
  if(!ready)return;
  try{window.saveLocalState(puzzleId,state());}catch{window.showToast('브라우저에 저장하지 못했습니다.');}
}
function render(){
  const result=analyze(edges);
  let html='';
  clues.forEach((row,r)=>row.forEach((n,c)=>{
    if(result.badCells.has(r*9+c))html+=`<rect x="${18+c*40}" y="${18+r*40}" width="40" height="40" fill="#fbeaea"/>`;
    if(n!==null)html+=`<text x="${38+c*40}" y="${38+r*40}" dy=".35em" text-anchor="middle" font-family="sans-serif" font-size="25" fill="${result.badCells.has(r*9+c)?'#c34242':'#222'}">${n}</text>`;
  }));
  for(let r=0;r<10;r++)for(let c=0;c<10;c++){
    const a=r*10+c,[x,y]=xy(a);
    for(const b of [c<9?a+1:null,r<9?a+10:null]){
      if(b===null)continue;
      const key=edgeKey(a,b),[u,v]=xy(b);
      html+=`<path d="M${x} ${y}L${u} ${v}" stroke="${edges.has(key)?result.badVertices.has(a)||result.badVertices.has(b)?'#c34242':'#4a6fa5':'#b6b6b6'}" stroke-width="${edges.has(key)?4:1.5}" ${edges.has(key)?'stroke-linecap="round"':'stroke-dasharray="3 4"'}/>`;
      if(notes.has(key))html+=`<path d="M${(x+u)/2-4} ${(y+v)/2-4}l8 8m-8 0l8 -8" stroke="#999" stroke-width="1.8"/>`;
    }
  }
  for(let i=0;i<100;i++){
    const [x,y]=xy(i);
    html+=`<circle cx="${x}" cy="${y}" r="3.3" fill="${result.badVertices.has(i)?'#c34242':'white'}" stroke="${result.badVertices.has(i)?'#c34242':'#888'}" stroke-width="1.2"/>`;
  }
  board.innerHTML=html;
  $('polygraphComplete').hidden=!result.complete;
  $('polygraphStatus').textContent=result.complete?'퍼즐을 완성했습니다.':result.badVertices.size?'선이 교차하거나 여러 루프로 나뉘어 있습니다.':result.badCells.size?`규칙에 어긋나는 숫자 ${result.badCells.size}개.`:'';
  if(!result.complete)completionRecorded=false;
  else if(ready&&window.puzzlePage?.published&&!completionRecorded){completionRecorded=true;window.recordCompletion(puzzleId,state());}
}
function hit(event){
  const rect=board.getBoundingClientRect(),x=((event.clientX-rect.left)/rect.width*396-18)/40,y=((event.clientY-rect.top)/rect.height*396-18)/40;
  const c=Math.round(x),r=Math.round(y),dx=Math.abs(x-c),dy=Math.abs(y-r);
  // Leave a small gap at vertices to avoid turning a drag onto an unintended edge.
  if(dx<.15&&dy<.15)return null;
  if(dy<=dx&&dy<.28&&r>=0&&r<=9&&x>=0&&x<9)return edgeKey(r*10+Math.floor(x),r*10+Math.floor(x)+1);
  if(dx<dy&&dx<.28&&c>=0&&c<=9&&y>=0&&y<9)return edgeKey(Math.floor(y)*10+c,(Math.floor(y)+1)*10+c);
  return null;
}
function apply(key,value){
  edges.delete(key);notes.delete(key);
  if(value===1)edges.add(key);else if(value===2)notes.add(key);
  selected=key;render();
}
function cancel(){if(gesture)clearTimeout(gesture.timer);gesture=null;}
board.addEventListener('pointerdown',event=>{
  if(!ready||gesture||event.button!==0)return;
  const key=hit(event);if(!key)return;
  event.preventDefault();board.focus({preventScroll:true});board.setPointerCapture(event.pointerId);
  const value=swapped?2:1;
  gesture={id:event.pointerId,key,x:event.clientX,y:event.clientY,value:(value===1?edges:notes).has(key)?0:value,visited:new Set([key]),moved:false,long:false,lastX:event.clientX,lastY:event.clientY,timer:null};
  gesture.timer=setTimeout(()=>{
    if(!gesture||gesture.moved)return;
    gesture.long=true;
    const secondary=swapped?1:2;
    apply(key,(secondary===1?edges:notes).has(key)?0:secondary);persist();
  },550);
});
board.addEventListener('pointermove',event=>{
  if(!gesture||gesture.id!==event.pointerId||gesture.long)return;
  if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>8){
    clearTimeout(gesture.timer);
    if(!gesture.moved){gesture.moved=true;apply(gesture.key,gesture.value);}
    const dx=event.clientX-gesture.lastX,dy=event.clientY-gesture.lastY;
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/(board.getBoundingClientRect().width/80)));
    for(let n=1;n<=steps;n++){
      const key=hit({clientX:gesture.lastX+dx*n/steps,clientY:gesture.lastY+dy*n/steps});
      if(key&&!gesture.visited.has(key)){gesture.visited.add(key);apply(key,gesture.value);}
    }
    gesture.lastX=event.clientX;gesture.lastY=event.clientY;
  }
});
function end(event){
  if(!gesture||gesture.id!==event.pointerId)return;
  if(event.type==='pointerup'&&!gesture.moved&&!gesture.long)apply(gesture.key,gesture.value);
  cancel();persist();render();
}
board.addEventListener('pointerup',end);board.addEventListener('pointercancel',end);board.addEventListener('lostpointercapture',end);
board.addEventListener('contextmenu',event=>{
  event.preventDefault();if(!ready)return;
  const key=hit(event),already=gesture?.long;cancel();
  if(key&&!already){const value=swapped?1:2;apply(key,(value===1?edges:notes).has(key)?0:value);persist();}
});
window.addEventListener('blur',()=>{cancel();persist();});
function toggleInput(){cancel();swapped=!swapped;$('polygraphNotes').textContent=swapped?'길게 눌러 선 그리기':'길게 눌러 × 표시';$('polygraphNotes').setAttribute('aria-pressed',String(swapped));}
$('polygraphNotes').addEventListener('click',toggleInput);
board.addEventListener('keydown',event=>{if(event.key.toLowerCase()==='m'){event.preventDefault();toggleInput();}});
$('polygraphErase').addEventListener('click',()=>{if(ready&&selected){cancel();apply(selected,0);persist();}});
$('polygraphReset').addEventListener('click',()=>{
  if(!ready||!edges.size&&!notes.size||!confirm('입력한 선과 메모를 모두 초기화할까요?'))return;
  cancel();edges.clear();notes.clear();selected=null;persist();render();
});
function init(){
  cancel();selected=null;
  let saved=null;try{saved=window.loadLocalState(puzzleId);}catch{}
  const restored=parseState(saved,puzzleId);
  edges=restored?.edges||new Set();notes=restored?.notes||new Set();ready=true;completionRecorded=false;render();window.initCloudBtns();
}
window.handleCloudSave=()=>{if(ready&&window.puzzlePage?.published)return window.saveProgressCloud(puzzleId,state());};
window.handleCloudLoad=async()=>{
  if(!ready||!window.puzzlePage?.published)return;
  const before=JSON.stringify(state()),owner=window.puzzleAccount?.user?.id,saved=await window.loadProgressCloud(puzzleId);
  if(saved==null||owner!==window.puzzleAccount?.user?.id||before!==JSON.stringify(state()))return;
  const restored=parseState(saved,puzzleId);if(!restored){window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.');return;}
  cancel();edges=restored.edges;notes=restored.notes;selected=null;completionRecorded=false;persist();render();
};
window.checkComplete=render;
window.startLocalPuzzle(puzzleId,init,init);

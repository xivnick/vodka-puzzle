import {SIZE,blocked,normalize,contains,validateRect,parseState,analyze} from '../lib/mini-rectangles.js';
const ID='260916_01',board=document.getElementById('mr-board'),ns='http://www.w3.org/2000/svg';
let rects=[],anchor=null,end=null,cursor={r:0,c:0},keyboard=false,ready=false,pointer=null;
const square=q=>q.r1-q.r0===q.c1-q.c0;
function announce(text){document.getElementById('mr-status').textContent=text;}
function node(tag,attrs){const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);board.append(el);}
function box(q,attrs){node('rect',{x:q.c0*50,y:q.r0*50,width:(q.c1-q.c0+1)*50,height:(q.r1-q.r0+1)*50,...attrs});}
function render(){
 board.dataset.keyboard=keyboard;
 board.replaceChildren();
 for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)node('rect',{x:c*50,y:r*50,width:50,height:50,fill:blocked(r,c)?'#171717':'#fff'});
 for(const q of rects)box(q,{fill:square(q)?'#f4d5d5':'#dcebdc'});
 for(let n=0;n<=SIZE;n++){
  node('line',{x1:n*50,y1:0,x2:n*50,y2:450,stroke:'#bbb','stroke-width':1});
  node('line',{x1:0,y1:n*50,x2:450,y2:n*50,stroke:'#bbb','stroke-width':1});
 }
 for(const q of rects)box(q,{fill:'none',stroke:square(q)?'#b65c5c':'#5b8c64','stroke-width':2.5});
 node('rect',{x:0,y:0,width:450,height:450,fill:'none',stroke:'#333','stroke-width':2});
 if(anchor&&end){const q=normalize(anchor,end),invalid=validateRect(q,rects),red=invalid||square(q);box(q,{fill:red?'#b65c5c33':'#5b8c6433',stroke:red?'#b65c5c':'#5b8c64','stroke-width':3,'stroke-dasharray':'6 4'});}
 if(keyboard)box({r0:cursor.r,r1:cursor.r,c0:cursor.c,c1:cursor.c},{fill:'none',stroke:'#4a6fa5','stroke-width':2,'stroke-dasharray':'3 3'});
 document.getElementById('mr-complete').hidden=!analyze(rects).complete;
 board.setAttribute('aria-label',`9행 9열 직사각형 퍼즐. 현재 ${cursor.r+1}행 ${cursor.c+1}열${blocked(cursor.r,cursor.c)?', 검은 칸':''}. 드래그로 만들고 누르면 삭제합니다.`);
}
function state(){return {version:1,rects:structuredClone(rects)};}
function persist(){try{window.saveLocalState(ID,state());}catch{window.showToast('브라우저에 저장하지 못했습니다.');}}
function checkComplete(){if(ready&&analyze(rects).complete)window.recordCompletion(ID);}
function update(next){rects=next;persist();render();checkComplete();}
function cancel(){anchor=null;end=null;pointer=null;render();}
function finish(){const q=normalize(anchor,end),error=validateRect(q,rects);anchor=null;end=null;pointer=null;if(error){announce(error);render();return;}update([...rects,q]);announce('사각형을 추가했습니다.');}
function cell(event,clamp=false){
 const b=board.getBoundingClientRect(),x=(event.clientX-b.left)/b.width*454-2,y=(event.clientY-b.top)/b.height*454-2;
 if(!clamp&&(x<0||y<0||x>=450||y>=450))return null;
 return {r:Math.max(0,Math.min(8,Math.floor(y/50))),c:Math.max(0,Math.min(8,Math.floor(x/50)))};
}
function remove(index){if(index<0)return;update(rects.filter((_,i)=>i!==index));announce('사각형을 삭제했습니다.');}
board.addEventListener('pointerdown',event=>{
 if(!ready||event.button!==0||!event.isPrimary||pointer)return;const p=cell(event);if(!p)return;
 event.preventDefault();board.focus({preventScroll:true});keyboard=false;cursor=p;anchor=null;end=null;
 if(blocked(p.r,p.c)){render();return;}
 pointer={id:event.pointerId,index:rects.findIndex(q=>contains(q,p.r,p.c)),x:event.clientX,y:event.clientY,moved:false};
 if(pointer.index<0){anchor=p;end=p;}
 board.setPointerCapture(event.pointerId);render();
});
board.addEventListener('pointermove',event=>{
 if(!pointer||pointer.id!==event.pointerId)return;
 if(Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)>8)pointer.moved=true;
 if(!anchor)return;const next=cell(event,true);if(next.r===end.r&&next.c===end.c)return;end=next;cursor=end;render();
});
board.addEventListener('pointerup',event=>{
 if(!pointer||pointer.id!==event.pointerId)return;
 if(anchor){end=cell(event,true);finish();return;}
 const {index,moved}=pointer,p=cell(event);pointer=null;
 if(!moved&&p&&contains(rects[index],p.r,p.c))remove(index);
});
board.addEventListener('pointercancel',cancel);
board.addEventListener('lostpointercapture',()=>{if(pointer)cancel();});
board.addEventListener('keydown',event=>{
 if(!ready||pointer)return;
 const directions={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]};
 if(directions[event.key]){event.preventDefault();keyboard=true;const [r,c]=directions[event.key];cursor={r:Math.max(0,Math.min(8,cursor.r+r)),c:Math.max(0,Math.min(8,cursor.c+c))};if(anchor)end=cursor;render();announce(`${cursor.r+1}행 ${cursor.c+1}열${blocked(cursor.r,cursor.c)?', 검은 칸':''}`);return;}
 if(event.key==='Escape'){event.preventDefault();cancel();return;}
 if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();if(!anchor)remove(rects.findIndex(q=>contains(q,cursor.r,cursor.c)));return;}
 if(event.key==='Enter'||event.key===' '){event.preventDefault();keyboard=true;if(anchor){end=cursor;finish();return;}
  const index=rects.findIndex(q=>contains(q,cursor.r,cursor.c));if(index>=0){remove(index);return;}
  if(blocked(cursor.r,cursor.c))return;anchor={...cursor};end={...cursor};render();announce('끝 칸을 지정하세요.');
 }
});
document.getElementById('mr-reset').onclick=()=>{if(rects.length&&confirm('초기화하시겠습니까?')){cancel();update([]);}};
window.checkComplete=checkComplete;
window.handleCloudSave=()=>window.saveProgressCloud(ID,state());
window.handleCloudLoad=async()=>{
 if(rects.length&&!confirm('저장된 진행 상황을 불러오시겠습니까?'))return;
 const saved=await window.loadProgressCloud(ID);if(saved==null)return;const next=parseState(saved);
 if(!next){window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.');return;}cancel();update(next);
};
function restore(){cancel();let saved=null;try{saved=window.loadLocalState(ID);}catch{}rects=parseState(saved)||[];ready=true;render();window.initCloudBtns();checkComplete();}
window.puzzleAuthReady.then(restore);
window.addEventListener('puzzle-auth-ready',restore);
render();

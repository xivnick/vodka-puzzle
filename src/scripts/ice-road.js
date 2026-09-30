import { edgeKey, validateIceRoad, parseIceRoadState } from '../lib/ice-road.js';
const game=document.getElementById('iceGame');
if(game) {
  const cells=JSON.parse(game.dataset.cells), rows=cells.length, cols=cells[0].length;
  const board=document.getElementById('iceBoard'), status=document.getElementById('iceStatus');
  const undo=document.getElementById('iceUndo'), complete=document.getElementById('iceComplete');
  let edges=new Set(), selected=null, gesture=null;
  const history=[];
  const preview=game.dataset.preview==='true', ID=game.dataset.puzzleId;
  let ready=preview, owner=null, completionRecorded=false, lastSaved=null, authReady=false;
  const account=()=>window.puzzleAccount?.user?.id || 'guest';
  const state=()=>({version:1,puzzleId:ID,edges:[...edges]});
  function syncProgress(result) {
    if(preview || !ready || owner!==account() || gesture) return;
    const snapshot=state(), serialized=JSON.stringify(snapshot);
    if(!authReady && lastSaved===null) lastSaved=serialized;
    if(serialized!==lastSaved) {
      try { window.saveLocalState(ID,snapshot); lastSaved=serialized; }
      catch { window.showToast('브라우저에 저장하지 못했습니다.'); }
    }
    if(authReady && result.complete && !completionRecorded) {
      completionRecorded=true;
      window.recordCompletion(ID,snapshot);
    }
  }
  const xy=i => [(i%cols+.5)*40,(Math.floor(i/cols)+.5)*40];
  function straightEdges(a,b) {
    if(a===null || b===null || a===b) return [];
    const sameRow=Math.floor(a/cols)===Math.floor(b/cols);
    if(!sameRow && a%cols!==b%cols) return [];
    const step=Math.sign(b-a)*(sameRow?1:cols), keys=[];
    for(let i=a;i!==b;i+=step) keys.push(edgeKey(i,i+step));
    return keys;
  }
  const checkpoint=() => { history.push([...edges]); if(history.length>200) history.shift(); };
  board.setAttribute('viewBox',`0 0 ${cols*40} ${rows*40}`);
  function render() {
    const result=validateIceRoad(cells,edges), errors=new Set(result.errors), satisfied=new Set(result.satisfied);
    let html='';
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++) {
      const i=r*cols+c;
      if(cells[r][c]==='ice') html+=`<rect x="${c*40}" y="${r*40}" width="40" height="40" fill="#b6b4b7"/>`;
      if(errors.has(i)||satisfied.has(i)||i===selected) html+=`<rect x="${c*40}" y="${r*40}" width="40" height="40" fill="${errors.has(i)?'#f4d5d5':satisfied.has(i)?'#dcebdc':'#e7eef7'}"/>`;
    }
    for(let r=1;r<rows;r++) html+=`<path d="M0 ${r*40}H${cols*40}" stroke="#c9c9c9" stroke-dasharray="2 3"/>`;
    for(let c=1;c<cols;c++) html+=`<path d="M${c*40} 0V${rows*40}" stroke="#c9c9c9" stroke-dasharray="2 3"/>`;
    for(const key of edges) {
      const [a,b]=key.split(':').map(Number), [x,y]=xy(a),[u,v]=xy(b);
      html+=`<path d="M${x} ${y}L${u} ${v}" stroke="#4a6fa5" stroke-width="5" stroke-linecap="round"/>`;

    }
    cells.forEach((row,r)=>row.forEach((clue,c)=>{
      if(typeof clue!=='number' || !clue) return;
      const i=r*cols+c,[x,y]=xy(i);
      html+=`<text x="${x}" y="${y}" dy=".35em" text-anchor="middle" font-size="18" font-weight="700" fill="#222" stroke="white" stroke-width="2" paint-order="stroke" style="pointer-events:none">${clue}</text>`;
    }));
    html+=`<rect x="1" y="1" width="${cols*40-2}" height="${rows*40-2}" fill="none" stroke="#333" stroke-width="2"/>`;
    board.innerHTML=html;
    complete.hidden=!result.complete;
    syncProgress(result);
    undo.disabled=!ready || !history.length;
    const location=selected===null?'':`${Math.floor(selected/cols)+1}행 ${selected%cols+1}열. `;
    const length=result.segments[selected];
    status.textContent=location+(length?`비얼음 구간 크기 ${length}. `:'')+(result.complete?'퍼즐을 완성했습니다.':errors.size?`규칙에 어긋나는 칸 ${errors.size}개.`:'');
  }
  function cell(event) {
    const rect=board.getBoundingClientRect(), c=Math.floor((event.clientX-rect.left)/rect.width*cols),r=Math.floor((event.clientY-rect.top)/rect.height*rows);
    return c>=0&&c<cols&&r>=0&&r<rows ? r*cols+c:null;
  }
  function toggle(a,b) { const key=edgeKey(a,b); if(edges.has(key)) edges.delete(key); else edges.add(key); }
  board.addEventListener('pointerdown',event=>{
    if(!ready || !preview && owner!==account() || event.button!==0 || gesture) return;
    const current=cell(event); if(current===null) return;
    event.preventDefault(); board.setPointerCapture(event.pointerId);
    gesture={id:event.pointerId,start:current,previous:selected,moved:false};
    selected=current; render();
  });
  board.addEventListener('pointermove',event=>{
    if(!gesture || gesture.id!==event.pointerId) return;
    if(cell(event)!==gesture.start) gesture.moved=true;
  });
  function end(event) {
    if(!gesture || gesture.id!==event.pointerId) return;
    if(event.type==='pointerup' && !gesture.moved) {
      const keys=straightEdges(gesture.previous,gesture.start);
      if(keys.length) {
        checkpoint();
        const erase=keys.every(key=>edges.has(key));
        keys.forEach(key=>erase?edges.delete(key):edges.add(key));
        selected=null;
      }
    }
    if(gesture.moved) selected=null;
    gesture=null; render();
  }
  board.addEventListener('pointerup',end); board.addEventListener('pointercancel',end); board.addEventListener('lostpointercapture',end);
  function revert() { if(ready && history.length) { edges=new Set(history.pop()); render(); } }
  undo.addEventListener('click',revert);
  document.getElementById('iceReset').addEventListener('click',()=>{
    if(!ready || !edges.size) return;
    checkpoint(); edges.clear(); selected=null; render();
  });
  let keyboardActive = false;
  document.addEventListener('pointerdown', event => { keyboardActive = board.contains(event.target); });
  document.addEventListener('keydown',event=>{
    if (!keyboardActive) return;
    if(!ready || !preview && owner!==account()) return;
    if((event.ctrlKey||event.metaKey) && event.key.toLowerCase()==='z') { event.preventDefault(); revert(); return; }
    const directions={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]};
    if(directions[event.key]) {
      event.preventDefault(); if(selected===null) selected=0;
      const [dr,dc]=directions[event.key],r=Math.floor(selected/cols)+dr,c=selected%cols+dc;
      if(r>=0&&r<rows&&c>=0&&c<cols) { const next=r*cols+c; if(event.shiftKey) {checkpoint();toggle(selected,next);} selected=next; }
      render();
    } else if(['Delete','Backspace'].includes(event.key)) {
      event.preventDefault(); const incident=[...edges].filter(key=>key.split(':').map(Number).includes(selected));
      if(incident.length) {checkpoint();incident.forEach(key=>edges.delete(key));render();}
    } else if(event.key==='Escape') { selected=null;render(); }
  });
  function init() {
    const nextOwner=account();
    if(ready && owner===nextOwner) return;
    owner=nextOwner; ready=false; gesture=null; selected=null; history.length=0;
    completionRecorded=false; lastSaved=null;
    let saved=null;
    try { saved=window.loadLocalState(ID); } catch {}
    edges=parseIceRoadState(cells,saved,ID) || new Set();
    ready=true; render(); window.initCloudBtns();
  }
  if(!preview) {
    window.handleCloudSave=()=>{
      if(ready && owner===account()) return window.saveProgressCloud(ID,state());
    };
    window.handleCloudLoad=async()=>{
      if(!ready || owner!==account()) return;
      const requestedOwner=owner, before=JSON.stringify(state());
      const saved=await window.loadProgressCloud(ID);
      if(saved==null || requestedOwner!==account() || before!==JSON.stringify(state())) return;
      const restored=parseIceRoadState(cells,saved,ID);
      if(!restored) {window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.');return;}
      checkpoint(); edges=restored; selected=null; gesture=null; render();
    };
    init();
    window.puzzleAuthReady.then(()=>{authReady=true;init();render();});
    window.addEventListener('puzzle-auth-ready',init);
  }
  render();
}

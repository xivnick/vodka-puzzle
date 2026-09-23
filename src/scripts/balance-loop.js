import { edgeKey, validateBalanceLoop, parseBalanceLoopState } from '../lib/balance-loop.js';
const game=document.getElementById('balanceGame');
if(game) {
  const clues=JSON.parse(game.dataset.clues), rows=clues.length, cols=clues[0].length;
  const board=document.getElementById('balanceBoard'), status=document.getElementById('balanceStatus');
  const undo=document.getElementById('balanceUndo'), complete=document.getElementById('balanceComplete');
  let edges=new Set(), selected=null, gesture=null;
  const history=[];
  const preview=game.dataset.preview==='true', ID=game.dataset.puzzleId;
  let ready=preview, owner=null, completionRecorded=false, lastSaved=null;
  const account=()=>window.puzzleAccount?.user?.id || 'guest';
  const state=()=>({version:1,puzzleId:ID,edges:[...edges]});
  function syncProgress(result) {
    if(preview || !ready || owner!==account() || gesture) return;
    const snapshot=state(), serialized=JSON.stringify(snapshot);
    if(serialized!==lastSaved) {
      try { window.saveLocalState(ID,snapshot); lastSaved=serialized; }
      catch { window.showToast('브라우저에 저장하지 못했습니다.'); }
    }
    if(result.complete && !completionRecorded) {
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
    const result=validateBalanceLoop(clues,edges), errors=new Set(result.errors);
    let html='';
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++) {
      const i=r*cols+c;
      if(errors.has(i)||i===selected) html+=`<rect x="${c*40}" y="${r*40}" width="40" height="40" fill="${errors.has(i)?'#fbe0df':'#e7eef7'}"/>`;
    }
    for(let r=1;r<rows;r++) html+=`<path d="M0 ${r*40}H${cols*40}" stroke="#c9c9c9" stroke-dasharray="2 3"/>`;
    for(let c=1;c<cols;c++) html+=`<path d="M${c*40} 0V${rows*40}" stroke="#c9c9c9" stroke-dasharray="2 3"/>`;
    for(const key of edges) {
      const [a,b]=key.split(':').map(Number), [x,y]=xy(a),[u,v]=xy(b);
      html+=`<path d="M${x} ${y}L${u} ${v}" stroke="#4a6fa5" stroke-width="5" stroke-linecap="round"/>`;
      // Leave cell centers available for selecting a new straight-line endpoint.
      const dx=(u-x)/40,dy=(v-y)/40;
      html+=`<path data-edge="${key}" d="M${x+dx*8} ${y+dy*8}L${u-dx*8} ${v-dy*8}" stroke="transparent" stroke-width="14" style="cursor:pointer"/>`;
    }
    clues.forEach((row,r)=>row.forEach((clue,c)=>{
      const i=r*cols+c,[x,y]=xy(i);
      if(!clue) return;
      const black=clue[0]==='b', number=clue.slice(1);
      const satisfied=!!result.arms[i] && !result.arms[i].includes(null) && !errors.has(i);
      const stroke=errors.has(i)?'#c66565':satisfied?'#5b8c64':black?'#666':'#222';
      html+=black ? `<circle cx="${x}" cy="${y}" r="13" fill="${satisfied?'#5b8c64':'#222'}" stroke="${stroke}" stroke-width="2"/>` : `<rect x="${x-12}" y="${y-12}" width="24" height="24" fill="${satisfied?'#dcebdc':'white'}" stroke="${stroke}" stroke-width="2"/>`;
      if(number) html+=`<text x="${x}" y="${y}" dy=".35em" text-anchor="middle" font-size="22" font-weight="700" fill="${black?'white':'#222'}">${number}</text>`;
    }));
    html+=`<rect x="1" y="1" width="${cols*40-2}" height="${rows*40-2}" fill="none" stroke="#333" stroke-width="2"/>`;
    board.innerHTML=html;
    complete.hidden=!result.complete;
    undo.disabled=!ready || !history.length;
    syncProgress(result);
    const location=selected===null?'':`${Math.floor(selected/cols)+1}행 ${selected%cols+1}열. `;
    const lengths=result.arms[selected];
    status.textContent=location+(lengths && !lengths.includes(null)?`팔 길이 ${lengths.join(', ')}. `:'')+(result.complete?'퍼즐을 완성했습니다.':errors.size?`규칙에 어긋나는 칸 ${errors.size}개.`:'');
  }
  function cell(event) {
    const rect=board.getBoundingClientRect(), c=Math.floor((event.clientX-rect.left)/rect.width*cols),r=Math.floor((event.clientY-rect.top)/rect.height*rows);
    return c>=0&&c<cols&&r>=0&&r<rows ? r*cols+c:null;
  }
  function toggle(a,b) { const key=edgeKey(a,b); if(edges.has(key)) edges.delete(key); else edges.add(key); }
  board.addEventListener('pointerdown',event=>{
    if(!ready || owner!==account() && !preview || event.button!==0 || gesture) return;
    const current=cell(event); if(current===null) return;
    event.preventDefault(); board.focus({preventScroll:true}); board.setPointerCapture(event.pointerId);
    gesture={id:event.pointerId,start:current,last:current,previous:selected,moved:false,mode:null,hitEdge:event.target.closest('[data-edge]')?.dataset.edge,visited:new Set()};
    selected=current; render();
  });
  board.addEventListener('pointermove',event=>{
    if(!gesture || gesture.id!==event.pointerId) return;
    const current=cell(event), keys=straightEdges(gesture.last,current);
    if(!keys.length) return;
    if(!gesture.moved) { checkpoint(); gesture.mode=edges.has(keys[0])?'erase':'draw'; gesture.moved=true; }
    for(const key of keys) if(!gesture.visited.has(key)) {
      if(gesture.mode==='erase') edges.delete(key); else edges.add(key);
      gesture.visited.add(key);
    }
    gesture.last=current; selected=current; render();
  });
  function end(event) {
    if(!gesture || gesture.id!==event.pointerId) return;
    if(event.type==='pointerup' && !gesture.moved) {
      if(gesture.hitEdge && edges.has(gesture.hitEdge)) {
        checkpoint(); edges.delete(gesture.hitEdge); selected=null;
      } else {
        const keys=straightEdges(gesture.previous,gesture.start);
        if(keys.some(key=>!edges.has(key))) { checkpoint(); keys.forEach(key=>edges.add(key)); }
        if(keys.length) selected=null;
      }
    }
    if(gesture.moved) selected=null;
    gesture=null; render();
  }
  board.addEventListener('pointerup',end); board.addEventListener('pointercancel',end); board.addEventListener('lostpointercapture',end);
  function revert() { if(ready && history.length) { edges=new Set(history.pop()); render(); } }
  undo.addEventListener('click',revert);
  document.getElementById('balanceReset').addEventListener('click',()=>{
    if(!ready || !edges.size) return;
    checkpoint(); edges.clear(); selected=null; render();
  });
  board.addEventListener('keydown',event=>{
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
    edges=parseBalanceLoopState(clues,saved,ID) || new Set();
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
      const restored=parseBalanceLoopState(clues,saved,ID);
      if(!restored) {window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.');return;}
      checkpoint(); edges=restored; selected=null; gesture=null; render();
    };
    window.puzzleAuthReady.then(init);
    window.addEventListener('puzzle-auth-ready',init);
  }
  render();
}

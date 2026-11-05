import { pieces, shape, cellsOf, boardOf, parseState, inspect } from '../lib/blokus.js';

const game = document.getElementById('blokusGame');
const puzzleId = game.dataset.puzzleId;
const byId = id => document.getElementById(`blokus${id}`);
const names = Object.keys(pieces);
const colors = ['#c9d8ed','#ead2c5','#d7e2c2','#e7d0e4','#c3dfdc','#eee0b9','#d5d0ed','#cddfcb','#edced0','#ccdce4','#ded9c3','#d9cbe0'];
let placements = [], selected = null, candidate = null, turn = 0, flip = false, ready = false, recorded = false;
const state = () => ({version:1,puzzleId,placements:placements.map(p => ({...p}))});
const draft = () => selected && candidate ? {name:selected,turn,flip,...candidate} : null;
function validDraft() {
  const p = draft();
  return p && boardOf([...placements.filter(p => p.name !== selected),p]);
}
function persist() {
  try { window.saveLocalState(puzzleId,state()); } catch { window.showToast('브라우저에 저장하지 못했습니다.'); }
}
function draw(parent, piece, ghost = false) {
  const color = ghost ? (validDraft() ? '#6b8fbb' : '#bf6a61') : colors[names.indexOf(piece.name)];
  const cells = cellsOf(piece);
  const group = document.createElementNS('http://www.w3.org/2000/svg','g');
  group.setAttribute('opacity',ghost ? '.52' : '1');
  for (const [x,y] of cells) {
    const rect = document.createElementNS(group.namespaceURI,'rect');
    Object.entries({x:x*40+1,y:y*40+1,width:38,height:38,fill:color}).forEach(([k,v]) => rect.setAttribute(k,v));
    group.append(rect);
  }
  // Outline the whole block, keeping its five cells visually connected.
  const has = (x,y) => cells.some(([cx,cy]) => cx===x && cy===y);
  let path = '';
  for (const [x,y] of cells) {
    if (!has(x,y-1)) path+=`M${x*40+1} ${y*40+1}h38`;
    if (!has(x,y+1)) path+=`M${x*40+1} ${y*40+39}h38`;
    if (!has(x-1,y)) path+=`M${x*40+1} ${y*40+1}v38`;
    if (!has(x+1,y)) path+=`M${x*40+39} ${y*40+1}v38`;
  }
  const outline = document.createElementNS(group.namespaceURI,'path');
  Object.entries({d:path,fill:'none',stroke:'#56616e','stroke-width':1.7}).forEach(([k,v]) => outline.setAttribute(k,v));
  group.append(outline);
  parent.append(group);
}
function render() {
  byId('Placed').replaceChildren(); byId('Ghost').replaceChildren();
  placements.forEach(p => draw(byId('Placed'),p));
  if (draft()) draw(byId('Ghost'),draft(),true);
  game.querySelectorAll('[data-piece]').forEach(button => {
    const name = button.dataset.piece;
    const placed = placements.find(p => p.name===name);
    const cells = shape(name, selected===name ? turn : placed?.turn ?? 0, selected===name ? flip : placed?.flip ?? false);
    button.querySelectorAll('rect').forEach((rect,index) => {
      rect.setAttribute('x',cells[index][0]*20);rect.setAttribute('y',cells[index][1]*20);
    });
    button.querySelector('svg').setAttribute('viewBox',`${(Math.max(...cells.map(([x]) => x))+1)*10-53} ${(Math.max(...cells.map(([,y]) => y))+1)*10-53} 106 106`);
    button.classList.toggle('used',placements.some(p => p.name===button.dataset.piece));
    button.setAttribute('aria-pressed',String(selected===button.dataset.piece));
    button.disabled=!ready;
  });
  byId('Selection').textContent = selected ? `${selected} 블록 · ${candidate ? '위치를 확인하고 놓기를 누르세요.' : '격자를 눌러 위치를 잡으세요.'}` : '블록을 선택하세요.';
  byId('Progress').textContent = `놓은 블록 ${placements.length} / 12`;
  for (const id of ['Rotate','Flip']) byId(id).disabled=!ready || !selected;
  byId('Place').disabled=!ready || !validDraft();
  byId('Remove').disabled=!ready || !placements.some(p => p.name===selected);
  byId('Check').disabled=!ready;
  byId('Reset').disabled=!ready || !placements.length;
}
function select(name) {
  selected=name;
  const placed=placements.find(p => p.name===name);
  turn=placed?.turn ?? 0; flip=placed?.flip ?? false;
  candidate=placed ? {x:placed.x,y:placed.y} : null;
  render();
}
function changed() {
  recorded=false; byId('Complete').hidden=true; byId('Feedback').hidden=true;
  persist(); render();
}
game.querySelectorAll('[data-piece]').forEach(button => button.addEventListener('click',() => {if(ready) select(button.dataset.piece);}));
function chooseCell(x,y) {
  if (!ready) return;
  const hit=boardOf(placements)[y][x];
  if (hit && hit!==selected) {select(hit); return;}
  if (!selected) return;
  candidate={x,y}; render();
}
game.querySelectorAll('.blokus-input rect').forEach(cell => {
  const activate=() => chooseCell(Number(cell.dataset.x),Number(cell.dataset.y));
  cell.addEventListener('click',activate);
  cell.addEventListener('keydown',event => {if(event.key==='Enter' || event.key===' ') {event.preventDefault();activate();}});
});
byId('Rotate').addEventListener('click',() => {turn=(turn+1)%4;render();});
byId('Flip').addEventListener('click',() => {flip=!flip;render();});
byId('Place').addEventListener('click',() => {
  if (!ready || !validDraft()) return;
  placements=[...placements.filter(p => p.name!==selected),draft()];
  selected=null;candidate=null;changed();
});
byId('Remove').addEventListener('click',() => {
  if (!ready) return;
  placements=placements.filter(p => p.name!==selected);candidate=null;changed();
});
byId('Reset').addEventListener('click',() => {
  if (!ready || !confirm('초기화하시겠습니까?')) return;
  placements=[];selected=null;candidate=null;changed();
});
byId('Check').addEventListener('click',() => {
  if (!ready) return;
  const result=inspect(placements);
  byId('Complete').hidden=!result.solved;
  byId('Feedback').hidden=result.solved;
  byId('Feedback').textContent=result.message;
  if (result.solved && !recorded) {
    recorded=true;
    if(window.puzzlePage?.published) window.recordCompletion(puzzleId,state());
  }
});
function restore(saved) {
  placements=parseState(saved,puzzleId) || [];
  selected=null;candidate=null;recorded=false;
  byId('Complete').hidden=true;byId('Feedback').hidden=true;
}
window.handleCloudSave=() => window.saveProgressCloud(puzzleId,state());
window.handleCloudLoad=async () => {
  const saved=await window.loadProgressCloud(puzzleId);
  if(saved==null)return;
  if(!parseState(saved,puzzleId)){window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.');return;}
  restore(saved);persist();render();
};
function init() {
  if(ready)return;
  let saved=null;
  try {saved=window.loadLocalState(puzzleId);} catch {}
  restore(saved);ready=true;render();window.initCloudBtns();
}
render();
window.startLocalPuzzle(puzzleId,init,() => {ready=false;init();});

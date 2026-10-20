import { inspectProduct, parseProductState } from '../lib/product.js';
const game = document.getElementById('productGame');
const puzzleId = game.dataset.puzzleId;
const rows = JSON.parse(game.dataset.rows);
const columns = JSON.parse(game.dataset.columns);
const size = rows.length;
const cells = [...game.querySelectorAll('.product-cell')];
const pad = [...game.querySelectorAll('[data-number]')];
const complete = document.getElementById('productComplete');
const status = document.getElementById('productStatus');
let values = Array(size*size).fill(0);
let selected = 0;
let ready = false;
let completionRecorded = false;
let keyBuffer = '';
let keyTimer;
function state() { return { version:1, puzzleId, values:[...values] }; }
function persist() {
  if (!ready) return;
  try { window.saveLocalState(puzzleId, state()); }
  catch { window.showToast('브라우저에 저장하지 못했습니다.'); }
}
function render() {
  const result = inspectProduct(values, rows, columns);
  cells.forEach((cell,index) => {
    cell.replaceChildren();
    if (values[index]) cell.textContent = values[index];
    cell.classList.toggle('selected', index === selected);
    cell.classList.toggle('conflict', result.conflicts.has(index));
    cell.tabIndex = index === selected ? 0 : -1;
    cell.setAttribute('aria-selected',String(index === selected));
    cell.setAttribute('aria-label',`${Math.floor(index/size)+1}행 ${index%size+1}열, ${values[index] > 0 ? `숫자 ${values[index]}` : '빈칸'}${result.conflicts.has(index) ? ', 규칙 오류' : ''}`);
  });
  for (const [attribute,lines] of [['row',result.rowStates],['column',result.columnStates]]) {
    game.querySelectorAll(`.product-clue[data-${attribute}]`).forEach((clue,index) => {
      clue.classList.toggle('error',lines[index].error);
      clue.classList.toggle('satisfied',lines[index].satisfied);
    });
  }
  pad.forEach(button => { button.disabled = !ready; });
  complete.hidden = !result.solved;
  if (!result.solved) completionRecorded = false;
  else if (ready && !completionRecorded) {
    completionRecorded = true;
    // Test puzzles only show local success; public records are enabled after release.
    if (window.puzzlePage?.published) window.recordCompletion(puzzleId,state());
  }
}
function clearBuffer() { clearTimeout(keyTimer); keyBuffer = ''; }
function select(index,focus=false) {
  clearBuffer(); selected=index; render();
  if (focus) cells[index].focus({preventScroll:true});
}
function input(value) {
  if (!ready) return;
  values[selected] = value;
  persist(); render();
  status.textContent = `${Math.floor(selected/size)+1}행 ${selected%size+1}열, ${value === 0 ? '지웠습니다.' : `${value}을 입력했습니다.`}`;
}
cells.forEach((cell,index) => cell.addEventListener('click',() => select(index)));
pad.forEach(button => button.addEventListener('click',() => { clearBuffer(); input(Number(button.dataset.number)); }));
document.getElementById('productErase').addEventListener('click',() => { clearBuffer(); input(0); });
document.getElementById('productReset').addEventListener('click',() => {
  if (!ready || !confirm('입력한 숫자를 초기화할까요?')) return;
  clearBuffer(); values.fill(0); persist(); render();
});
document.getElementById('productBoard').addEventListener('keydown',event => {
  if (!ready || event.ctrlKey || event.metaKey || event.altKey) return;
  const row=Math.floor(selected/size), column=selected%size;
  const moves={ArrowUp:Math.max(0,row-1)*size+column,ArrowDown:Math.min(size-1,row+1)*size+column,ArrowLeft:row*size+Math.max(0,column-1),ArrowRight:row*size+Math.min(size-1,column+1)};
  if (event.key in moves) { event.preventDefault(); select(moves[event.key],true); }
  else if (/^\d$/.test(event.key)) {
    event.preventDefault();
    const candidate=keyBuffer+event.key;
    clearBuffer();
    if (candidate.length === 2 && Number(candidate) <= size*2) input(Number(candidate));
    else if (event.key === '1' || event.key === '2') {
      keyBuffer=event.key;
      keyTimer=setTimeout(() => { const number=Number(keyBuffer); keyBuffer=''; input(number); },500);
    } else if (event.key !== '0') input(Number(event.key));
  } else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); clearBuffer(); input(0); }
});
function restore(saved) {
  clearBuffer();
  const parsed=parseProductState(saved,puzzleId,size);
  values=parsed?.values || Array(size*size).fill(0);
  completionRecorded=false;
}
window.handleCloudSave=() => window.saveProgressCloud(puzzleId,state());
window.handleCloudLoad=async () => {
  const saved=await window.loadProgressCloud(puzzleId);
  if (saved == null) return;
  if (!parseProductState(saved,puzzleId,size)) { window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.'); return; }
  restore(saved); persist(); render();
};
function init() {
  if (ready) return;
  let saved=null;
  try { saved=window.loadLocalState(puzzleId); } catch {}
  restore(saved); ready=true; render(); window.initCloudBtns();
}
render();
window.startLocalPuzzle(puzzleId,init,() => { ready=false; init(); });

import { size, regions, edges, analyze, parseDominoState } from '../lib/domino-star-battle.js';
const $ = id => document.getElementById(id);
const puzzleId = $('dominoGame').dataset.puzzleId;
const board = $('dominoBoard');
const cells = [...$('dominoBoard').querySelectorAll('[data-edge]')];
let values = Array(edges.length).fill(0), selected = 0, inputSwapped = false;
let press = null;
let ready = false, completionRecorded = false;
const state = () => ({version:1, puzzleId, values:[...values]});
function persist() {
  if (!ready) return;
  try { window.saveLocalState(puzzleId, state()); }
  catch { window.showToast('브라우저에 저장하지 못했습니다.'); }
}
function render() {
  const {bad, complete} = analyze(values);
  const used = new Set(), conflictCells = new Set();
  values.forEach((value,i) => {
    if (value !== 1) return;
    edges[i].cells.forEach(cell => {used.add(cell); if (bad.has(i)) conflictCells.add(cell);});
  });
  board.querySelectorAll('[data-cell]').forEach(cell => {
    const i = Number(cell.dataset.cell);
    cell.classList.toggle('used', used.has(i));
    cell.classList.toggle('conflict', conflictCells.has(i));
  });
  cells.forEach((cell, i) => {
    cell.textContent = ['', '★', '×'][values[i]];
    cell.classList.toggle('marked', values[i] !== 0);
    cell.classList.toggle('note', values[i] === 2);
    cell.classList.toggle('conflict', bad.has(i));
    cell.tabIndex = i === selected ? 0 : -1;
    cell.setAttribute('aria-label', `${edges[i].cells.map(cell => `${Math.floor(cell / size) + 1}행 ${cell % size + 1}열`).join('과 ')} 사이${edges[i].regionBoundary ? ', 영역 경계, 별 입력 불가' : ''}, ${['빈 변','별','× 메모'][values[i]]}${bad.has(i) ? ', 규칙 위반' : ''}`);
  });
  $('dominoComplete').hidden = !complete;
  if (!complete) completionRecorded = false;
  else if (ready && window.puzzlePage?.published && !completionRecorded) {
    completionRecorded = true;
    window.recordCompletion(puzzleId, state());
  }
}
function change(value) {
  if (!ready || values[selected] === value) return;
  if (value === 1 && edges[selected].regionBoundary) return;
  values[selected] = value;
  persist(); render();
}
function activate(index, secondary = false) {
  selected = index;
  const mark = secondary !== inputSwapped ? 2 : 1;
  change(values[index] === mark ? 0 : mark);
  render();
  cells[selected].focus({preventScroll:true});
}
function toggleInput() {
  inputSwapped = !inputSwapped;
  $('dominoNotes').textContent = inputSwapped ? '길게 눌러 ★ 표시' : '길게 눌러 x 표시';
  $('dominoNotes').setAttribute('aria-pressed', String(inputSwapped));
}
function cancelPress() {
  if (press) clearTimeout(press.timer);
  press = null;
}
$('dominoNotes').addEventListener('click', toggleInput);
board.addEventListener('pointerdown', event => {
  const cell = event.target.closest('[data-edge]');
  if (!ready || !cell || event.button !== 0 || press) return;
  const index = Number(cell.dataset.edge);
  press = {id:event.pointerId, index, x:event.clientX, y:event.clientY, long:false, timer:null};
  press.timer = setTimeout(() => {
    if (!press || press.id !== event.pointerId) return;
    press.long = true;
    activate(index, true);
  }, 550);
});
window.addEventListener('pointermove', event => {
  if (!press || press.id !== event.pointerId || press.long) return;
  if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) cancelPress();
});
window.addEventListener('pointerup', event => {
  if (!press || press.id !== event.pointerId) return;
  const {index, long, x, y} = press;
  cancelPress();
  if (!long && Math.hypot(event.clientX - x, event.clientY - y) <= 10) activate(index);
});
window.addEventListener('pointercancel', event => {
  if (press?.id === event.pointerId) cancelPress();
});
window.addEventListener('blur', cancelPress);
board.addEventListener('click', event => {
  // Pointer input is handled on release; only keyboard/assistive clicks remain.
  if (event.detail > 0 || event.pointerType) return;
  const cell = event.target.closest('[data-edge]');
  if (cell) activate(Number(cell.dataset.edge));
});
board.addEventListener('contextmenu', event => {
  const cell = event.target.closest('[data-edge]');
  if (!cell) return;
  event.preventDefault();
  const alreadyMarked = press?.long;
  cancelPress();
  if (!alreadyMarked) activate(Number(cell.dataset.edge), true);
});
$('dominoBoard').addEventListener('keydown', event => {
  const current = edges[selected];
  const delta = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
  let next;
  if (delta) {
    let distance = Infinity;
    edges.forEach((edge,i) => {
      const dx=edge.x-current.x, dy=edge.y-current.y;
      if (dx*delta[0]+dy*delta[1] <= 0) return;
      const score=Math.hypot(dx,dy) + Math.abs(dx*delta[1]-dy*delta[0])*2;
      if (score<distance) {distance=score;next=i;}
    });
    if (next === undefined) next = selected;
  }
  if (next !== undefined) {
    event.preventDefault(); selected = next; render(); cells[selected].focus({preventScroll:true});
  } else if (['Backspace','Delete','0'].includes(event.key)) { event.preventDefault(); change(0); }
  else if (event.key.toLowerCase() === 'm') { event.preventDefault(); toggleInput(); }
});
$('dominoErase').addEventListener('click', () => change(0));
$('dominoReset').addEventListener('click', () => {
  if (!ready || !values.some(Boolean)) return;
  if (confirm('입력한 별과 메모를 모두 초기화할까요?')) {
    values.fill(0); persist(); render();
  }
});
function init() {
  cancelPress();
  let saved = null;
  try { saved = window.loadLocalState(puzzleId); } catch {}
  values = parseDominoState(saved, puzzleId)?.values || Array(edges.length).fill(0);
  completionRecorded = false;
  ready = true;
  render();
  window.initCloudBtns();
}
window.handleCloudSave = () => window.saveProgressCloud(puzzleId, state());
window.handleCloudLoad = async () => {
  const saved = await window.loadProgressCloud(puzzleId);
  if (saved == null) return;
  const parsed = parseDominoState(saved, puzzleId);
  if (!parsed) { window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.'); return; }
  values = parsed.values; completionRecorded = false;
  persist(); render();
};
window.checkComplete = render;
render();
window.startLocalPuzzle(puzzleId, init, init);

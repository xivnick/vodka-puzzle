import { size, puzzles, analyze, parseStarBattleState } from '../lib/star-battle.js';
const $ = id => document.getElementById(id);
const puzzleId = $('starBattleGame').dataset.puzzleId;
const {regions} = puzzles[puzzleId];
const board = $('starBattleBoard');
const cells = [...$('starBattleBoard').querySelectorAll('[data-cell]')];
let values = Array(size * size).fill(0), selected = 0, inputSwapped = false;
let press = null;
let ready = false, completionRecorded = false;
const state = () => ({version:1, puzzleId, values:[...values]});
function persist() {
  if (!ready) return;
  try { window.saveLocalState(puzzleId, state()); }
  catch { window.showToast('브라우저에 저장하지 못했습니다.'); }
}
function render() {
  const {bad, complete} = analyze(values, regions);
  cells.forEach((cell, i) => {
    cell.textContent = ['', '★', '×'][values[i]];
    cell.classList.toggle('selected', !complete && i === selected);
    cell.classList.toggle('note', values[i] === 2);
    cell.classList.toggle('conflict', bad.has(i));
    cell.tabIndex = i === selected ? 0 : -1;
    cell.setAttribute('aria-label', `${Math.floor(i / size) + 1}행 ${i % size + 1}열, 영역 ${regions.flat()[i] + 1}, ${['빈칸','별','× 메모'][values[i]]}${bad.has(i) ? ', 규칙 위반' : ''}`);
  });
  $('starBattleComplete').hidden = !complete;
  if (!complete) completionRecorded = false;
  else if (ready && window.puzzlePage?.published && !completionRecorded) {
    completionRecorded = true;
    window.recordCompletion(puzzleId, state());
  }
}
function change(value) {
  if (!ready || values[selected] === value) return;
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
  $('starBattleNotes').textContent = inputSwapped ? '길게 눌러 ★ 표시' : '길게 눌러 x 표시';
  $('starBattleNotes').setAttribute('aria-pressed', String(inputSwapped));
}
function cancelPress() {
  if (press) clearTimeout(press.timer);
  press = null;
}
$('starBattleNotes').addEventListener('click', toggleInput);
board.addEventListener('pointerdown', event => {
  const cell = event.target.closest('[data-cell]');
  if (!ready || !cell || event.button !== 0 || press) return;
  const index = Number(cell.dataset.cell);
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
  const cell = event.target.closest('[data-cell]');
  if (cell) activate(Number(cell.dataset.cell));
});
board.addEventListener('contextmenu', event => {
  const cell = event.target.closest('[data-cell]');
  if (!cell) return;
  event.preventDefault();
  const alreadyMarked = press?.long;
  cancelPress();
  if (!alreadyMarked) activate(Number(cell.dataset.cell), true);
});
$('starBattleBoard').addEventListener('keydown', event => {
  const r = Math.floor(selected / size), c = selected % size;
  const next = {
    ArrowLeft:r * size + Math.max(0,c - 1), ArrowRight:r * size + Math.min(size - 1,c + 1),
    ArrowUp:Math.max(0,r - 1) * size + c, ArrowDown:Math.min(size - 1,r + 1) * size + c,
  }[event.key];
  if (next !== undefined) {
    event.preventDefault(); selected = next; render(); cells[selected].focus({preventScroll:true});
  } else if (['Backspace','Delete','0'].includes(event.key)) { event.preventDefault(); change(0); }
  else if (event.key.toLowerCase() === 'm') { event.preventDefault(); toggleInput(); }
});
$('starBattleErase').addEventListener('click', () => change(0));
$('starBattleReset').addEventListener('click', () => {
  if (!ready || !values.some(Boolean)) return;
  if (confirm('입력한 별과 메모를 모두 초기화할까요?')) {
    values.fill(0); persist(); render();
  }
});
function init() {
  cancelPress();
  let saved = null;
  try { saved = window.loadLocalState(puzzleId); } catch {}
  values = parseStarBattleState(saved, puzzleId)?.values || Array(size * size).fill(0);
  completionRecorded = false;
  ready = true;
  render();
  window.initCloudBtns();
}
window.handleCloudSave = () => window.saveProgressCloud(puzzleId, state());
window.handleCloudLoad = async () => {
  const saved = await window.loadProgressCloud(puzzleId);
  if (saved == null) return;
  const parsed = parseStarBattleState(saved, puzzleId);
  if (!parsed) { window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.'); return; }
  values = parsed.values; completionRecorded = false;
  persist(); render();
};
window.checkComplete = render;
render();
window.startLocalPuzzle(puzzleId, init, init);

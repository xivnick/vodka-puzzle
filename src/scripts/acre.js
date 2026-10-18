import { validateAcre, parseAcreState } from '../lib/acre.js';
const $ = id => document.getElementById(id);
const puzzleId = $('acreGame').dataset.puzzleId;
const puzzle = JSON.parse($('acreGame').dataset.puzzle);
const {rows: size, regions, clues} = puzzle;
const regionIds = regions.join('').split('');
const board = $('acreBoard');
const cells = [...$('acreBoard').querySelectorAll('[data-cell]')];
let values = Array(size * size).fill(0), selected = 0, inputSwapped = false;
let press = null;
let ready = false, completionRecorded = false, owner = null;
const account = () => window.puzzleAccount?.user?.id || 'guest';
const state = () => ({version:1, puzzleId, values:[...values]});
function persist() {
  if (!ready || owner !== account()) return;
  try { window.saveLocalState(puzzleId, state()); }
  catch { window.showToast('브라우저에 저장하지 못했습니다.'); }
}
function render() {
  const {bad, complete} = validateAcre(puzzle, values);
  cells.forEach((cell, i) => {
    cell.querySelector('.mark').textContent = values[i] === 2 ? '×' : '';
    cell.classList.toggle('shaded', values[i] === 1);
    cell.classList.toggle('note', values[i] === 2);
    cell.classList.toggle('conflict', bad.has(i));
    cell.tabIndex = i === selected ? 0 : -1;
    const clue = clues.find(clue => clue.cell === i);
    cell.setAttribute('aria-label', `${Math.floor(i / size) + 1}행 ${i % size + 1}열, 영역 ${regionIds[i]}${clue ? `, 단서 ${clue.count}` : ''}, ${['빈칸','칠한 칸','× 메모'][values[i]]}${bad.has(i) ? ', 규칙 위반' : ''}`);
  });
  $('acreComplete').hidden = !complete;
  if (!complete) completionRecorded = false;
  else if (ready && owner === account() && window.puzzlePage?.published && !completionRecorded) {
    completionRecorded = true;
    window.recordCompletion(puzzleId, state());
  }
}
function change(value) {
  if (!ready || owner !== account() || values[selected] === value) return;
  values[selected] = value;
  persist(); render();
}
function activate(index, secondary = false) {
  if (!ready || owner !== account()) return;
  selected = index;
  const mark = secondary !== inputSwapped ? 2 : 1;
  change(values[index] === mark ? 0 : mark);
  render();
  cells[selected].focus({preventScroll:true});
}
function toggleInput() {
  inputSwapped = !inputSwapped;
  $('acreNotes').textContent = inputSwapped ? '길게 눌러 칠하기' : '길게 눌러 × 표시';
  $('acreNotes').setAttribute('aria-pressed', String(inputSwapped));
}
function cancelPress() {
  if (press) clearTimeout(press.timer);
  press = null;
}
$('acreNotes').addEventListener('click', toggleInput);
board.addEventListener('pointerdown', event => {
  const cell = event.target.closest('[data-cell]');
  if (!ready || owner !== account() || !cell || cell.disabled || event.button !== 0 || press) return;
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
$('acreBoard').addEventListener('keydown', event => {
  const r = Math.floor(selected / size), c = selected % size;
  const direction = {ArrowLeft:[0,-1], ArrowRight:[0,1], ArrowUp:[-1,0], ArrowDown:[1,0]}[event.key];
  if (direction) {
    event.preventDefault();
    const rr = r + direction[0], cc = c + direction[1];
    if (rr >= 0 && rr < size && cc >= 0 && cc < size) selected = rr * size + cc;
    render(); cells[selected].focus({preventScroll:true});
  } else if (['Backspace','Delete','0'].includes(event.key)) { event.preventDefault(); change(0); }
  else if (event.key.toLowerCase() === 'm') { event.preventDefault(); toggleInput(); }
});
$('acreErase').addEventListener('click', () => change(0));
$('acreReset').addEventListener('click', () => {
  if (!ready || owner !== account() || !values.some(Boolean)) return;
  if (confirm('칠한 칸과 메모를 모두 초기화할까요?')) {
    values.fill(0); persist(); render();
  }
});
function init() {
  if (ready && owner === account()) return;
  owner = account();
  cancelPress();
  let saved = null;
  try { saved = window.loadLocalState(puzzleId); } catch {}
  values = parseAcreState(puzzle, saved, puzzleId)?.values || Array(size * size).fill(0);
  completionRecorded = false;
  ready = true;
  render();
  window.initCloudBtns();
}
window.handleCloudSave = () => {
  if (ready && owner === account() && window.puzzlePage?.published) return window.saveProgressCloud(puzzleId, state());
};
window.handleCloudLoad = async () => {
  if (!ready || owner !== account() || !window.puzzlePage?.published) return;
  const requestedOwner = owner, before = JSON.stringify(state());
  const saved = await window.loadProgressCloud(puzzleId);
  if (saved == null || requestedOwner !== account() || before !== JSON.stringify(state())) return;
  const parsed = parseAcreState(puzzle, saved, puzzleId);
  if (!parsed) { window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.'); return; }
  values = parsed.values; completionRecorded = false;
  persist(); render();
};
window.checkComplete = render;
render();
init();
window.puzzleAuthReady.then(init);
window.addEventListener('puzzle-auth-ready', init);

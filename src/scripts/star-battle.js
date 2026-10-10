import { size, regions, analyze, parseStarBattleState } from '../lib/star-battle.js';
const $ = id => document.getElementById(id);
const puzzleId = $('starBattleGame').dataset.puzzleId;
const cells = [...$('starBattleBoard').querySelectorAll('[data-cell]')];
let values = Array(size * size).fill(0), selected = 0, notesMode = false;
let ready = false, completionRecorded = false;
const history = [];
const state = () => ({version:1, puzzleId, values:[...values]});
function persist() {
  if (!ready) return;
  try { window.saveLocalState(puzzleId, state()); }
  catch { window.showToast('브라우저에 저장하지 못했습니다.'); }
}
function render() {
  const {bad, complete} = analyze(values);
  cells.forEach((cell, i) => {
    cell.textContent = ['', '★', '×'][values[i]];
    cell.classList.toggle('selected', !complete && i === selected);
    cell.classList.toggle('note', values[i] === 2);
    cell.classList.toggle('conflict', bad.has(i));
    cell.tabIndex = i === selected ? 0 : -1;
    cell.setAttribute('aria-label', `${Math.floor(i / size) + 1}행 ${i % size + 1}열, 영역 ${regions.flat()[i] + 1}, ${['빈칸','별','× 메모'][values[i]]}${bad.has(i) ? ', 규칙 위반' : ''}`);
  });
  $('starBattleUndo').disabled = !history.length;
  $('starBattleComplete').hidden = !complete;
  if (!complete) completionRecorded = false;
  else if (ready && window.puzzlePage?.published && !completionRecorded) {
    completionRecorded = true;
    window.recordCompletion(puzzleId, state());
  }
}
function change(value) {
  if (!ready || values[selected] === value) return;
  history.push([...values]);
  if (history.length > 100) history.shift();
  values[selected] = value;
  persist(); render();
}
function activate(index, memo = notesMode) {
  selected = index;
  change(memo ? (values[index] === 2 ? 0 : 2) : (values[index] + 1) % 3);
  render();
  cells[selected].focus({preventScroll:true});
}
function toggleNotes() {
  notesMode = !notesMode;
  $('starBattleNotes').setAttribute('aria-pressed', String(notesMode));
}
$('starBattleNotes').addEventListener('click', toggleNotes);
$('starBattleBoard').addEventListener('click', event => {
  const cell = event.target.closest('[data-cell]');
  if (cell) activate(Number(cell.dataset.cell));
});
$('starBattleBoard').addEventListener('contextmenu', event => {
  const cell = event.target.closest('[data-cell]');
  if (cell) { event.preventDefault(); activate(Number(cell.dataset.cell), true); }
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
  else if (event.key.toLowerCase() === 'm') { event.preventDefault(); toggleNotes(); }
});
$('starBattleErase').addEventListener('click', () => change(0));
$('starBattleUndo').addEventListener('click', () => {
  if (!ready || !history.length) return;
  values = history.pop(); persist(); render();
});
$('starBattleReset').addEventListener('click', () => {
  if (!ready || !values.some(Boolean)) return;
  if (confirm('입력한 별과 메모를 모두 초기화할까요?')) {
    history.push([...values]); values.fill(0); persist(); render();
  }
});
function init() {
  let saved = null;
  try { saved = window.loadLocalState(puzzleId); } catch {}
  values = parseStarBattleState(saved, puzzleId)?.values || Array(size * size).fill(0);
  history.length = 0;
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
  values = parsed.values; history.length = 0; completionRecorded = false;
  persist(); render();
};
window.checkComplete = render;
render();
window.startLocalPuzzle(puzzleId, init, init);

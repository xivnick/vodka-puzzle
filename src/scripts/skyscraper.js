import { parseSkyscraperState, skyscraperClueErrors, skyscraperConflicts, solvedSkyscraper } from '../lib/skyscraper.js';

const game = document.getElementById('skyGame');
const puzzle = JSON.parse(game.dataset.puzzle);
const puzzleId = game.dataset.puzzleId;
const preview = game.dataset.preview === 'true';
const size = puzzle.givens.length;
const givens = puzzle.givens.flat();
const cells = [...document.querySelectorAll('.sky-cell')];
const complete = document.getElementById('skyComplete');
const status = document.getElementById('skyStatus');
let values = [...givens];
let selected = 0;
let ready = preview;
let completionRecorded = false;

function state() { return { version: 1, puzzleId, values: [...values] }; }

function announce(message) { status.textContent = message; }

function persist() {
  if (preview || !ready) return;
  try { window.saveLocalState(puzzleId, state()); }
  catch { window.showToast('브라우저에 저장하지 못했습니다.'); }
}

function checkComplete() {
  const solved = solvedSkyscraper(puzzle, values);
  complete.hidden = !solved;
  if (!solved) { completionRecorded = false; return; }
  announce('퍼즐을 완성했습니다!');
  if (!preview && ready && !completionRecorded) {
    completionRecorded = true;
    window.recordCompletion(puzzleId, state());
  }
}

function render() {
  const conflicts = skyscraperConflicts(puzzle, values);
  const clueErrors = skyscraperClueErrors(puzzle, values);
  cells.forEach((cell, index) => {
    cell.textContent = values[index] || '';
    cell.classList.toggle('selected', index === selected);
    cell.classList.toggle('conflict', conflicts.has(index));
    cell.tabIndex = index === selected ? 0 : -1;
    const row = Math.floor(index / size);
    const column = index % size;
    cell.setAttribute('aria-label', `${row + 1}행 ${column + 1}열${values[index] ? `, 숫자 ${values[index]}` : ', 빈칸'}${givens[index] ? ', 주어진 숫자' : ''}${conflicts.has(index) ? ', 중복 오류' : ''}`);
  });
  document.querySelectorAll('.sky-clue').forEach(clue => clue.classList.toggle('error', clueErrors.has(clue.dataset.clue)));
  checkComplete();
}

function select(index, focus = false) {
  selected = Math.max(0, Math.min(values.length - 1, index));
  render();
  if (focus) cells[selected].focus({ preventScroll: true });
}

function input(value) {
  if (!ready || givens[selected]) return;
  values[selected] = value;
  completionRecorded = false;
  persist();
  render();
  announce(value ? `${Math.floor(selected / size) + 1}행 ${selected % size + 1}열에 ${value}을 입력했습니다.` : '숫자를 지웠습니다.');
}

cells.forEach((cell, index) => cell.addEventListener('click', () => select(index)));
document.querySelectorAll('[data-number]').forEach(button => button.addEventListener('click', () => input(Number(button.dataset.number))));
document.getElementById('skyErase').addEventListener('click', () => input(0));
document.getElementById('skyReset').addEventListener('click', () => {
  if (!ready) return;
  const changed = values.some((value, index) => !givens[index] && value);
  if (changed && !confirm('현재 문제를 초기화하시겠습니까?')) return;
  values = [...givens];
  completionRecorded = false;
  persist();
  render();
  announce('퍼즐을 초기화했습니다.');
});

document.getElementById('skyBoard').addEventListener('keydown', event => {
  if (!ready) return;
  const row = Math.floor(selected / size);
  const column = selected % size;
  const moves = {
    ArrowUp: [Math.max(0, row - 1), column],
    ArrowDown: [Math.min(size - 1, row + 1), column],
    ArrowLeft: [row, Math.max(0, column - 1)],
    ArrowRight: [row, Math.min(size - 1, column + 1)],
  };
  if (moves[event.key]) {
    event.preventDefault();
    const [nextRow, nextColumn] = moves[event.key];
    select(nextRow * size + nextColumn, true);
    return;
  }
  if (event.key >= '1' && event.key <= String(size)) { event.preventDefault(); input(Number(event.key)); }
  else if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); input(0); }
});

window.handleCloudSave = () => window.saveProgressCloud(puzzleId, state());
window.handleCloudLoad = async () => {
  const saved = await window.loadProgressCloud(puzzleId);
  if (saved == null) return;
  const parsed = parseSkyscraperState(puzzle, saved, puzzleId);
  if (!parsed) { window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.'); return; }
  values = parsed;
  completionRecorded = false;
  persist();
  render();
};

function init() {
  if (ready) return;
  let saved = null;
  try { saved = window.loadLocalState(puzzleId); } catch {}
  values = parseSkyscraperState(puzzle, saved, puzzleId) || [...givens];
  ready = true;
  render();
  window.initCloudBtns();
}

render();
if (!preview) {
  window.puzzleAuthReady.then(init);
  window.addEventListener('puzzle-auth-ready', init);
}

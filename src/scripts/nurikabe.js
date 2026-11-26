import { clues, EMPTY, SHADED, NOTE, inspectNurikabe } from '../lib/nurikabe.js';

const game = document.getElementById('nurikabeGame');
const puzzleId = game.dataset.puzzleId;
const grid = document.getElementById('nurikabeBoard');
const cells = [...grid.querySelectorAll('[data-cell]')];
const clueCells = [...grid.querySelectorAll('[data-clue]')];
const notesToggle = document.getElementById('nurikabeNotes');
const completion = document.getElementById('nurikabeComplete');
const regionLabels = {
  satisfied: ', 영역 크기 일치',
  conflict: ', 영역 크기 불일치',
  'missing-clue': ', 숫자 단서가 없는 영역',
};

let board = clues.map(() => EMPTY);
let inputSwapped = false;
let press = null;
let complete = false;

function state() {
  return { version: 1, board: [...board] };
}

function checkComplete() {
  if (complete && window.puzzlePage?.published) window.recordCompletion(puzzleId, state());
}

function render() {
  const { conflicts, regionStatuses, complete: solved } = inspectNurikabe(board);
  complete = solved;
  for (const cell of cells) {
    const index = Number(cell.dataset.cell);
    const value = board[index];
    const squareConflict = conflicts.has(index);
    const status = regionStatuses.get(index);
    cell.classList.toggle('shaded', value === SHADED);
    cell.classList.toggle('conflict', squareConflict || status === 'conflict' || status === 'missing-clue');
    cell.classList.toggle('satisfied', status === 'satisfied');
    cell.firstElementChild.textContent = value === NOTE ? '×' : '';
    const label = value === SHADED ? '칠한 칸' : value === NOTE ? '× 메모' : '빈칸';
    const feedback = squareConflict ? ', 2×2 위반' : (regionLabels[status] ?? '');
    cell.setAttribute('aria-label', `${cell.dataset.position}, ${label}${feedback}`);
  }
  for (const cell of clueCells) {
    const index = Number(cell.dataset.clue);
    const status = regionStatuses.get(index);
    cell.classList.toggle('satisfied', status === 'satisfied');
    cell.classList.toggle('conflict', status === 'conflict');
    const label = regionLabels[status] ?? '';
    cell.setAttribute('aria-label', `${cell.dataset.position}, 단서 ${clues[index]}${label}`);
  }
  completion.hidden = !complete;
  checkComplete();
}

function persist() {
  try { window.saveLocalState(puzzleId, state()); }
  catch { window.showToast('브라우저에 저장하지 못했습니다.'); }
}

function toggleInput() {
  inputSwapped = !inputSwapped;
  notesToggle.textContent = inputSwapped ? '길게 눌러 칠하기' : '길게 눌러 × 표시';
  notesToggle.setAttribute('aria-pressed', String(inputSwapped));
}

function markCell(index, longPress = false) {
  const mark = longPress !== inputSwapped ? NOTE : SHADED;
  board[index] = board[index] === mark ? EMPTY : mark;
  persist();
  render();
}

notesToggle.addEventListener('click', toggleInput);
game.addEventListener('keydown', event => {
  if (event.key.toLowerCase() === 'm' && !event.isComposing && !event.repeat
    && !event.altKey && !event.ctrlKey && !event.metaKey) toggleInput();
});

grid.addEventListener('pointerdown', event => {
  const cell = event.target.closest('[data-cell]');
  if (!cell || event.button !== 0 || !event.isPrimary) return;
  press = { id: event.pointerId, cell, x: event.clientX, y: event.clientY, time: event.timeStamp };
});
window.addEventListener('pointermove', event => {
  if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) {
    press = null;
  }
});
window.addEventListener('pointerup', event => {
  if (press?.id !== event.pointerId) return;
  const { cell, x, y, time } = press;
  press = null;
  if (Math.hypot(event.clientX - x, event.clientY - y) <= 10) {
    markCell(Number(cell.dataset.cell), event.timeStamp - time >= 550);
  }
});
window.addEventListener('pointercancel', event => {
  if (press?.id === event.pointerId) press = null;
});
window.addEventListener('blur', () => { press = null; });
grid.addEventListener('click', event => {
  // Keyboard and assistive clicks do not have a matching pointer release.
  if (event.detail > 0 || event.pointerType) return;
  const cell = event.target.closest('[data-cell]');
  if (cell) markCell(Number(cell.dataset.cell));
});

document.getElementById('nurikabeReset').addEventListener('click', () => {
  if (!board.some(Boolean) || !confirm('칠한 칸과 메모를 모두 초기화할까요?')) return;
  board.fill(EMPTY);
  if (window.puzzlePage?.published) window.resetCompletion(puzzleId);
  persist();
  render();
});

function parseBoard(saved) {
  if (saved?.version !== 1 || !Array.isArray(saved.board) || saved.board.length !== clues.length) return null;
  return clues.map((clue, index) => {
    const mark = saved.board[index];
    return !clue && (mark === SHADED || mark === NOTE) ? mark : EMPTY;
  });
}

function restore() {
  try {
    const restored = parseBoard(window.loadLocalState(puzzleId));
    if (restored) board = restored;
  } catch {}
  render();
}

window.checkComplete = checkComplete;
window.handleCloudSave = () => window.saveProgressCloud(puzzleId, state());
window.handleCloudLoad = async () => {
  const owner = window.puzzleAccount?.user?.id;
  const before = JSON.stringify(board);
  const saved = await window.loadProgressCloud(puzzleId);
  if (saved == null || owner !== window.puzzleAccount?.user?.id || before !== JSON.stringify(board)) return;
  const restored = parseBoard(saved);
  if (!restored) {
    window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.');
    return;
  }
  if (!confirm('클라우드 기록으로 현재 진행 상황을 바꿀까요?')) return;
  board = restored;
  persist();
  render();
};
window.startLocalPuzzle(puzzleId, restore, restore);

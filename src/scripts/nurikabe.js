import { clues, EMPTY, SHADED, NOTE, inspectNurikabe } from '../lib/nurikabe.js';

const game = document.getElementById('nurikabeGame');
const puzzleId = game.dataset.puzzleId;
const grid = document.getElementById('nurikabeBoard');
const cells = [...grid.querySelectorAll('[data-cell]')];
const clueCells = [...grid.querySelectorAll('[data-clue]')];
const notesToggle = document.getElementById('nurikabeNotes');
const completion = document.getElementById('nurikabeComplete');

let board = clues.map(() => EMPTY);
let inputSwapped = false;
let press = null;

function render() {
  const { conflicts, clueStatuses, complete } = inspectNurikabe(board);
  for (const cell of cells) {
    const index = Number(cell.dataset.cell);
    const value = board[index];
    const conflict = conflicts.has(index);
    cell.classList.toggle('shaded', value === SHADED);
    cell.classList.toggle('conflict', conflict);
    cell.firstElementChild.textContent = value === NOTE ? '×' : '';
    const label = value === SHADED ? '칠한 칸' : value === NOTE ? '× 메모' : '빈칸';
    cell.setAttribute('aria-label', `${cell.dataset.position}, ${label}${conflict ? ', 2×2 위반' : ''}`);
  }
  for (const cell of clueCells) {
    const index = Number(cell.dataset.clue);
    const status = clueStatuses.get(index);
    cell.classList.toggle('satisfied', status === 'satisfied');
    cell.classList.toggle('conflict', status === 'conflict');
    const label = { satisfied: ', 영역 크기 일치', conflict: ', 영역 크기 불일치' }[status] ?? '';
    cell.setAttribute('aria-label', `${cell.dataset.position}, 단서 ${clues[index]}${label}`);
  }
  completion.hidden = !complete;
}

function persist() {
  try { window.saveLocalState(puzzleId, { version: 1, board }); }
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
  persist();
  render();
});

function restore() {
  try {
    const saved = window.loadLocalState(puzzleId);
    if (saved?.version === 1 && Array.isArray(saved.board) && saved.board.length === clues.length) {
      board = saved.board.map((mark, index) => !clues[index] && (mark === SHADED || mark === NOTE) ? mark : EMPTY);
    }
  } catch {}
  render();
}

window.startLocalPuzzle(puzzleId, restore, restore);

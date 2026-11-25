import { clues, EMPTY, SHADED, NOTE, isNurikabeComplete } from '../lib/nurikabe.js';

const game = document.getElementById('nurikabeGame');
const puzzleId = game.dataset.puzzleId;
const cells = [...game.querySelectorAll('[data-cell]')];
const notesToggle = document.getElementById('nurikabeNotes');
const completion = document.getElementById('nurikabeComplete');

let board = clues.map(() => EMPTY);
let notesMode = false;

function render() {
  for (const cell of cells) {
    const value = board[cell.dataset.cell];
    cell.classList.toggle('shaded', value === SHADED);
    cell.firstElementChild.textContent = value === NOTE ? '×' : '';
    const label = value === SHADED ? '칠한 칸' : value === NOTE ? '× 메모' : '빈칸';
    cell.setAttribute('aria-label', `${cell.dataset.position}, ${label}`);
  }
  completion.hidden = !isNurikabeComplete(board);
}

function persist() {
  try { window.saveLocalState(puzzleId, { version: 1, board }); }
  catch { window.showToast('브라우저에 저장하지 못했습니다.'); }
}

function toggleNotes() {
  notesMode = !notesMode;
  notesToggle.setAttribute('aria-pressed', String(notesMode));
}

notesToggle.addEventListener('click', toggleNotes);
game.addEventListener('keydown', event => {
  if (event.key.toLowerCase() === 'm' && !event.isComposing && !event.repeat
    && !event.altKey && !event.ctrlKey && !event.metaKey) toggleNotes();
});

for (const cell of cells) {
  cell.addEventListener('click', () => {
    const index = Number(cell.dataset.cell);
    const mark = notesMode ? NOTE : SHADED;
    board[index] = board[index] === mark ? EMPTY : mark;
    persist();
    render();
  });
}

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

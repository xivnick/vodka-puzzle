import { givens, isDigit, inspectLiarSudoku } from '../lib/liar-sudoku.js';
import { writeNumber } from '../lib/number-notes.js';

const get = id => document.getElementById(id);
const puzzleId = get('liarGame').dataset.puzzleId;
const board = get('liarBoard');
const notesToggle = get('liarNotes');
const cells = [...board.querySelectorAll('[data-cell]')].map(cell => ({
  cell,
  number: cell.querySelector('.liar-value'),
  memo: cell.querySelector('.notes'),
}));
const emptyValues = () => givens.map(() => 0);
const emptyNotes = () => givens.map(() => []);
const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

let values = emptyValues();
let activeValues = values;
let notes = emptyNotes();
let selected = 0;
let notesMode = false;
let complete = false;

function state() {
  return { version: 1, values: [...values], notes: notes.map(memo => [...memo]) };
}

function persist() {
  try { window.saveLocalState(puzzleId, state()); }
  catch { window.showToast('브라우저에 저장하지 못했습니다.'); }
}

function renderCell(index, active, conflict) {
  const { cell, number, memo } = cells[index];
  const clue = givens[index];
  const confirmed = clue > 0 && active === clue;
  const value = confirmed ? 0 : active;
  const showNotes = !active && notes[index].length > 0;
  cell.classList.toggle('annotated', Boolean(value || showNotes));
  cell.classList.toggle('confirmed', confirmed);
  cell.classList.toggle('conflict', conflict);
  number.textContent = value || '';
  memo.hidden = !showNotes;
  if (showNotes) {
    Array.from(memo.children).forEach((digit, i) => {
      digit.textContent = notes[index].includes(i + 1) ? i + 1 : '';
    });
  }
  const label = [`${Math.floor(index / 9) + 1}행 ${index % 9 + 1}열`];
  if (clue) label.push(confirmed ? `확정 숫자 ${clue}` : `단서 ${clue}`);
  if (value) label.push(`입력 ${value}`);
  else if (!clue) label.push('빈칸');
  if (showNotes) label.push(`메모 ${notes[index].join(', ')}`);
  if (conflict) label.push('중복 숫자');
  cell.setAttribute('aria-label', label.join(', '));
}

function render() {
  const { board: active, conflicts, complete: solved } = inspectLiarSudoku(values);
  activeValues = active;
  complete = solved;
  cells.forEach((_, index) => renderCell(index, active[index], conflicts.has(index)));
  get('liarComplete').hidden = !complete;
  checkComplete();
}

function checkComplete() {
  if (complete && window.puzzlePage?.published) window.recordCompletion(puzzleId, state());
}

function select(index) {
  cells[selected].cell.classList.remove('selected');
  cells[selected].cell.tabIndex = -1;
  selected = index;
  cells[index].cell.classList.add('selected');
  cells[index].cell.tabIndex = 0;
}

function toggleNotes() {
  notesMode = !notesMode;
  notesToggle.setAttribute('aria-pressed', String(notesMode));
}

function change(digit) {
  if (notesMode && digit) {
    if (activeValues[selected]) return;
    const memo = notes[selected];
    notes[selected] = memo.includes(digit)
      ? memo.filter(value => value !== digit)
      : [...memo, digit].sort((a, b) => a - b);
  } else {
    writeNumber(values, notes, selected, digit);
  }
  persist();
  render();
}

cells.forEach(({ cell }, index) => {
  cell.addEventListener('focus', () => select(index));
  cell.addEventListener('click', () => select(index));
});

board.addEventListener('keydown', event => {
  if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
  if (/^[1-9]$/.test(event.key)) {
    event.preventDefault();
    change(Number(event.key));
  } else if (['Backspace', 'Delete', '0'].includes(event.key)) {
    event.preventDefault();
    change(0);
  } else if (event.key.toLowerCase() === 'm') {
    event.preventDefault();
    toggleNotes();
  } else if (Object.hasOwn(moves, event.key)) {
    event.preventDefault();
    const [rowDelta, columnDelta] = moves[event.key];
    const row = Math.floor(selected / 9) + rowDelta;
    const column = selected % 9 + columnDelta;
    if (row >= 0 && row < 9 && column >= 0 && column < 9) {
      cells[row * 9 + column].cell.focus({ preventScroll: true });
    }
  }
});

notesToggle.addEventListener('click', toggleNotes);
get('liarNumbers').querySelectorAll('[data-number]').forEach(button => {
  button.addEventListener('click', () => change(Number(button.dataset.number)));
});
get('liarErase').addEventListener('click', () => change(0));
get('liarReset').addEventListener('click', () => {
  if (!values.some(Boolean) && !notes.some(memo => memo.length)) return;
  if (!confirm('입력한 숫자와 메모를 모두 초기화할까요?')) return;
  window.resetCompletion(puzzleId);
  values = emptyValues();
  notes = emptyNotes();
  persist();
  render();
});

function applyState(saved) {
  values = givens.map((_, index) => {
    const value = saved.values?.[index];
    return isDigit(value) ? value : 0;
  });
  notes = givens.map((_, index) => {
    const memo = saved.notes?.[index];
    return Array.isArray(memo) ? [...new Set(memo.filter(isDigit))].sort((a, b) => a - b) : [];
  });
}

function restore() {
  try {
    const saved = window.loadLocalState(puzzleId);
    if (saved?.version === 1) applyState(saved);
  } catch {}
  render();
}

window.checkComplete = checkComplete;
window.handleCloudSave = () => window.saveProgressCloud(puzzleId, state());
window.handleCloudLoad = async () => {
  const saved = await window.loadProgressCloud(puzzleId);
  if (saved == null) return;
  if (saved.version !== 1 || saved.values?.length !== givens.length || saved.notes?.length !== givens.length
    || !Array.isArray(saved.values) || !Array.isArray(saved.notes)) {
    window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.');
    return;
  }
  if (!confirm('클라우드 기록으로 현재 진행 상황을 바꿀까요?')) return;
  applyState(saved);
  persist();
  render();
};
select(0);
window.startLocalPuzzle(puzzleId, restore, restore);

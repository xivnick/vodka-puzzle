import { equalSumRegionConflicts, parseEqualSumSudokuState, solvedEqualSumSudoku, sudokuConflicts } from '../lib/equal-sum-sudoku.js';

const game = document.getElementById('equalSumGame');
const puzzle = JSON.parse(game.dataset.puzzle);
const puzzleId = game.dataset.puzzleId;
const preview = game.dataset.preview === 'true';
const size = puzzle.givens.length;
const givens = puzzle.givens.flat();
const cells = [...document.querySelectorAll('.equal-sum-cell')];
const complete = document.getElementById('equalSumComplete');
const status = document.getElementById('equalSumStatus');
let values = [...givens];
let notes = Array.from({ length: size ** 2 }, () => []);
let selected = 0;
let notesMode = false;
let ready = preview;
let completionRecorded = false;

function state() { return { version: 1, puzzleId, values: [...values], notes: notes.map(note => [...note]) }; }
function announce(message) { status.textContent = message; }

function persist() {
  if (preview || !ready) return;
  try { window.saveLocalState(puzzleId, state()); }
  catch { window.showToast('브라우저에 저장하지 못했습니다.'); }
}

function checkComplete() {
  const solved = solvedEqualSumSudoku(puzzle, values);
  complete.hidden = !solved;
  if (!solved) { completionRecorded = false; return; }
  announce('퍼즐을 완성했습니다!');
  if (!preview && ready && !completionRecorded) {
    completionRecorded = true;
    window.recordCompletion(puzzleId, state());
  }
}

function render() {
  const sumConflicts = equalSumRegionConflicts(puzzle, values);
  const duplicateConflicts = sudokuConflicts(puzzle, values);
  cells.forEach((cell, index) => {
    cell.replaceChildren();
    if (values[index]) cell.textContent = values[index];
    else {
      const box = document.createElement('span');
      box.className = 'notes';
      box.setAttribute('aria-hidden', 'true');
      for (let value = 1; value <= size; value += 1) {
        const note = document.createElement('span');
        note.textContent = notes[index].includes(value) ? value : '';
        box.append(note);
      }
      cell.append(box);
    }
    cell.classList.toggle('selected', index === selected);
    cell.classList.toggle('sum-conflict', sumConflicts.has(index));
    cell.classList.toggle('sudoku-conflict', duplicateConflicts.has(index));
    cell.tabIndex = index === selected ? 0 : -1;
    const row = Math.floor(index / size);
    const column = index % size;
    cell.setAttribute('aria-label', `${row + 1}행 ${column + 1}열${values[index] ? `, 숫자 ${values[index]}` : ', 빈칸'}${givens[index] ? ', 주어진 숫자' : ''}${cell.classList.contains('shaded') ? ', 회색 영역' : ''}${sumConflicts.has(index) ? ', 영역 합 불일치' : ''}${duplicateConflicts.has(index) ? ', 숫자 중복' : ''}${!values[index] && notes[index].length ? `, 메모 ${notes[index].join(', ')}` : ''}`);
  });
  checkComplete();
}

function select(index, focus = false) {
  selected = Math.max(0, Math.min(values.length - 1, index));
  render();
  if (focus) cells[selected].focus({ preventScroll: true });
}

function input(value) {
  if (!ready || givens[selected]) return;
  if (notesMode && value) {
    if (values[selected]) return;
    notes[selected] = notes[selected].includes(value)
      ? notes[selected].filter(note => note !== value)
      : [...notes[selected], value].sort((a, b) => a - b);
  } else {
    values[selected] = value;
    notes[selected] = [];
  }
  completionRecorded = false;
  persist();
  render();
  announce(value ? `${Math.floor(selected / size) + 1}행 ${selected % size + 1}열에 ${value}${notesMode ? ' 메모를 변경했습니다.' : '을 입력했습니다.'}` : '숫자와 메모를 지웠습니다.');
}

function toggleNotes() {
  notesMode = !notesMode;
  document.getElementById('equalSumNotes').setAttribute('aria-pressed', String(notesMode));
}

cells.forEach((cell, index) => cell.addEventListener('click', () => select(index)));
document.querySelectorAll('#equalSumNumbers [data-number]').forEach(button => button.addEventListener('click', () => input(Number(button.dataset.number))));
document.getElementById('equalSumNotes').addEventListener('click', toggleNotes);
document.getElementById('equalSumErase').addEventListener('click', () => input(0));
document.getElementById('equalSumReset').addEventListener('click', () => {
  if (!ready) return;
  const changed = values.some((value, index) => !givens[index] && value) || notes.some(note => note.length);
  if (changed && !confirm('입력한 숫자와 메모를 초기화할까요?')) return;
  values = [...givens];
  notes = Array.from({ length: size ** 2 }, () => []);
  completionRecorded = false;
  persist();
  render();
  announce('퍼즐을 초기화했습니다.');
});

document.getElementById('equalSumBoard').addEventListener('keydown', event => {
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
  } else if (/^[1-9]$/.test(event.key)) { event.preventDefault(); input(Number(event.key)); }
  else if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') { event.preventDefault(); input(0); }
  else if (event.key.toLowerCase() === 'm') { event.preventDefault(); toggleNotes(); }
});

function init() {
  if (ready) return;
  let saved = null;
  try { saved = window.loadLocalState(puzzleId); } catch {}
  const parsed = parseEqualSumSudokuState(puzzle, saved, puzzleId);
  values = parsed?.values || [...givens];
  notes = parsed?.notes || Array.from({ length: size ** 2 }, () => []);
  ready = true;
  render();
  window.initCloudBtns();
}

render();
if (!preview) {
  window.handleCloudSave = () => window.saveProgressCloud(puzzleId, state());
  window.handleCloudLoad = async () => {
    const saved = await window.loadProgressCloud(puzzleId);
    if (saved == null) return;
    const parsed = parseEqualSumSudokuState(puzzle, saved, puzzleId);
    if (!parsed) { window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.'); return; }
    values = parsed.values;
    notes = parsed.notes;
    completionRecorded = false;
    persist();
    render();
  };
  window.puzzleAuthReady.then(init);
  window.addEventListener('puzzle-auth-ready', init);
}

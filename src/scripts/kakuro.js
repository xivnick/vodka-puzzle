import { writeNumber } from '../lib/number-notes.js';
import { digits, size, inspect } from '../lib/kakuro.js';

const game = document.getElementById('kakuroGame');
const puzzleId = game.dataset.puzzleId;
const cells = [...game.querySelectorAll('.kakuro-cell')];
const clues = game.querySelectorAll('[data-clue]');
const cellByIndex = new Map(cells.map(cell => [Number(cell.dataset.index), cell]));
const complete = document.getElementById('kakuroComplete');
const status = document.getElementById('kakuroStatus');
let values = Array(size ** 2).fill(0);
let notes = values.map(() => []);
let selected = Number(cells[0].dataset.index);
let notesMode = false;
let completionRecorded = false;

const state = () => ({ version: 1, puzzleId, values: [...values], notes: notes.map(note => [...note]) });
function persist() {
  try { window.saveLocalState(puzzleId, state()); }
  catch { window.showToast('브라우저에 저장하지 못했습니다.'); }
}
function checkComplete(solved = inspect(values).complete) {
  complete.hidden = !solved;
  if (!solved) { completionRecorded = false; return; }
  status.textContent = '퍼즐을 완성했습니다!';
  if (window.puzzlePage?.published && !completionRecorded) {
    completionRecorded = true;
    window.recordCompletion(puzzleId, state());
  }
}
window.checkComplete = checkComplete;

function render() {
  const result = inspect(values);
  const { conflicts, satisfied } = result;
  for (const clue of clues) {
    clue.classList.toggle('satisfied', satisfied.has(clue.dataset.clue));
  }
  for (const [index, cell] of cellByIndex) {
    cell.replaceChildren();
    if (values[index]) cell.textContent = values[index];
    else if (notes[index].length) {
      const box = document.createElement('span');
      box.className = 'notes';
      box.setAttribute('aria-hidden', 'true');
      for (const digit of digits) {
        const note = document.createElement('span');
        note.textContent = notes[index].includes(digit) ? digit : '';
        box.append(note);
      }
      cell.append(box);
    }
    cell.classList.toggle('selected', index === selected);
    cell.classList.toggle('conflict', conflicts.has(index));
    cell.tabIndex = index === selected ? 0 : -1;
    cell.setAttribute('aria-label', `${Math.floor(index / size) + 1}행 ${index % size + 1}열, ${values[index] ? `숫자 ${values[index]}` : '빈칸'}${!values[index] && notes[index].length ? `, 메모 ${notes[index].join(', ')}` : ''}${conflicts.has(index) ? ', 규칙 오류' : ''}`);
  }
  checkComplete(result.complete);
}
function select(index, focus = false) {
  if (!cellByIndex.has(index)) return;
  selected = index;
  render();
  if (focus) cellByIndex.get(index).focus({ preventScroll: true });
}
function input(value) {
  if (notesMode && value) {
    if (values[selected]) return;
    notes[selected] = notes[selected].includes(value) ? notes[selected].filter(note => note !== value) : [...notes[selected], value].sort((a, b) => a - b);
  } else {
    writeNumber(values, notes, selected, value);
  }
  status.textContent = value ? `${value}${notesMode ? ' 메모를 변경했습니다.' : '을 입력했습니다.'}` : '지웠습니다.';
  persist();
  render();
}
function toggleNotes() {
  notesMode = !notesMode;
  document.getElementById('kakuroNotes').setAttribute('aria-pressed', String(notesMode));
}
cells.forEach(cell => cell.addEventListener('click', () => select(Number(cell.dataset.index))));
game.querySelectorAll('[data-number]').forEach(button => button.addEventListener('click', () => input(Number(button.dataset.number))));
document.getElementById('kakuroNotes').addEventListener('click', toggleNotes);
document.getElementById('kakuroErase').addEventListener('click', () => input(0));
document.getElementById('kakuroReset').addEventListener('click', () => {
  if ((values.some(Boolean) || notes.some(note => note.length)) && !confirm('입력한 숫자와 메모를 초기화할까요?')) return;
  values = values.map(() => 0);
  notes = values.map(() => []);
  persist();
  status.textContent = '퍼즐을 초기화했습니다.';
  render();
});
game.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (digits.includes(Number(event.key)) && event.key.length === 1) {
    event.preventDefault(); input(Number(event.key));
  } else if (['Backspace', 'Delete'].includes(event.key)) {
    event.preventDefault(); input(0);
  } else if (event.key.toLowerCase() === 'm') {
    event.preventDefault(); toggleNotes();
  } else if (event.key.startsWith('Arrow')) {
    event.preventDefault();
    const [dr, dc] = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key] || [0, 0];
    if (!dr && !dc) return;
    let row = Math.floor(selected / size) + dr, column = selected % size + dc;
    while (row >= 0 && row < size && column >= 0 && column < size) {
      const next = row * size + column;
      if (cellByIndex.has(next)) { select(next, true); break; }
      row += dr; column += dc;
    }
  }
});
function parseState(saved) {
  if (saved?.version !== 1 || saved.puzzleId !== puzzleId) return null;
  if (!Array.isArray(saved.values) || saved.values.length !== size ** 2 ||
      !saved.values.every((value, index) => value === 0 || (cellByIndex.has(index) && digits.includes(value)))) return null;
  if (!Array.isArray(saved.notes) || saved.notes.length !== size ** 2 ||
      !saved.notes.every(note => Array.isArray(note) && note.every(value => digits.includes(value)))) return null;
  return { values: saved.values, notes: saved.notes };
}
function restore() {
  let saved;
  try { saved = window.loadLocalState(puzzleId); } catch {}
  const parsed = parseState(saved);
  values = parsed?.values || Array(size ** 2).fill(0);
  notes = parsed?.notes || values.map(() => []);
  completionRecorded = false;
  render();
}
window.handleCloudSave = () => window.saveProgressCloud(puzzleId, state());
window.handleCloudLoad = async () => {
  const saved = await window.loadProgressCloud(puzzleId);
  if (saved == null) return;
  const parsed = parseState(saved);
  if (!parsed) { window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.'); return; }
  ({ values, notes } = parsed);
  completionRecorded = false;
  persist();
  render();
};
window.startLocalPuzzle(puzzleId, restore, restore);

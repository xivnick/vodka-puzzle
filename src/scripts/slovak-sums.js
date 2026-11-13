import { inspectSlovakSums, parseSlovakSumsState } from '../lib/slovak-sums.js';

const game = document.getElementById('slovakGame');
const puzzle = JSON.parse(game.dataset.puzzle);
const puzzleId = game.dataset.puzzleId;
const cells = [...game.querySelectorAll('.slovak-cell')];
const cellByIndex = new Map(cells.map(cell => [Number(cell.dataset.index), cell]));
const clueCells = [...game.querySelectorAll('.slovak-clue')];
const complete = document.getElementById('slovakComplete');
const status = document.getElementById('slovakStatus');
let values = Array(puzzle.size ** 2).fill(0);
let notes = values.map(() => []);
let selected = Number(cells[0].dataset.index);
let notesMode = false;
let completionRecorded = false;

const state = () => ({ version: 1, puzzleId, values: [...values], notes: notes.map(note => [...note]) });
function persist() {
  try { window.saveLocalState(puzzleId, state()); }
  catch { window.showToast('브라우저에 저장하지 못했습니다.'); }
}
function checkComplete() {
  const solved = inspectSlovakSums(puzzle, values).complete;
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
  const { conflicts, satisfiedSums, satisfiedCounts } = inspectSlovakSums(puzzle, values);
  for (const [index, cell] of cellByIndex) {
    cell.replaceChildren();
    if (values[index]) cell.textContent = values[index];
    else if (notes[index].length) {
      const box = document.createElement('span');
      box.className = 'notes';
      box.setAttribute('aria-hidden', 'true');
      for (const digit of puzzle.digits) {
        const note = document.createElement('span');
        note.textContent = notes[index].includes(digit) ? digit : '';
        box.append(note);
      }
      cell.append(box);
    }
    cell.classList.toggle('selected', index === selected);
    cell.classList.toggle('conflict', conflicts.has(index));
    cell.tabIndex = index === selected ? 0 : -1;
    cell.setAttribute('aria-label', `${Math.floor(index / puzzle.size) + 1}행 ${index % puzzle.size + 1}열, ${values[index] ? `숫자 ${values[index]}` : '빈칸'}${notes[index].length ? `, 메모 ${notes[index].join(', ')}` : ''}${conflicts.has(index) ? ', 규칙 오류' : ''}`);
  }
  clueCells.forEach(cell => {
    const index = Number(cell.dataset.index);
    cell.querySelector('.clue-sum')?.classList.toggle('satisfied', satisfiedSums.has(index));
    cell.querySelector('.clue-circles')?.classList.toggle('satisfied', satisfiedCounts.has(index));
  });
  checkComplete();
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
    values[selected] = value;
    notes[selected] = [];
  }
  status.textContent = value ? `${value}${notesMode ? ' 메모를 변경했습니다.' : '을 입력했습니다.'}` : '숫자와 메모를 지웠습니다.';
  persist();
  render();
}
function toggleNotes() {
  notesMode = !notesMode;
  document.getElementById('slovakNotes').setAttribute('aria-pressed', String(notesMode));
}
cells.forEach(cell => cell.addEventListener('click', () => select(Number(cell.dataset.index))));
game.querySelectorAll('[data-number]').forEach(button => button.addEventListener('click', () => input(Number(button.dataset.number))));
document.getElementById('slovakNotes').addEventListener('click', toggleNotes);
document.getElementById('slovakErase').addEventListener('click', () => input(0));
document.getElementById('slovakReset').addEventListener('click', () => {
  if ((values.some(Boolean) || notes.some(note => note.length)) && !confirm('입력한 숫자와 메모를 초기화할까요?')) return;
  values = values.map(() => 0);
  notes = values.map(() => []);
  persist();
  status.textContent = '퍼즐을 초기화했습니다.';
  render();
});
game.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (puzzle.digits.includes(Number(event.key)) && event.key.length === 1) {
    event.preventDefault(); input(Number(event.key));
  } else if (['Backspace', 'Delete'].includes(event.key)) {
    event.preventDefault(); input(0);
  } else if (event.key.toLowerCase() === 'm') {
    event.preventDefault(); toggleNotes();
  } else if (event.key.startsWith('Arrow')) {
    event.preventDefault();
    const [dr, dc] = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key] || [0, 0];
    if (!dr && !dc) return;
    let row = Math.floor(selected / puzzle.size) + dr, column = selected % puzzle.size + dc;
    while (row >= 0 && row < puzzle.size && column >= 0 && column < puzzle.size) {
      const next = row * puzzle.size + column;
      if (cellByIndex.has(next)) { select(next, true); break; }
      row += dr; column += dc;
    }
  }
});
function restore() {
  let saved;
  try { saved = window.loadLocalState(puzzleId); } catch {}
  const parsed = parseSlovakSumsState(puzzle, saved, puzzleId);
  values = parsed?.values || Array(puzzle.size ** 2).fill(0);
  notes = parsed?.notes || values.map(() => []);
  completionRecorded = false;
  render();
}
window.handleCloudSave = () => window.saveProgressCloud(puzzleId, state());
window.handleCloudLoad = async () => {
  const saved = await window.loadProgressCloud(puzzleId);
  if (saved == null) return;
  const parsed = parseSlovakSumsState(puzzle, saved, puzzleId);
  if (!parsed) { window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.'); return; }
  ({ values, notes } = parsed);
  completionRecorded = false;
  persist();
  render();
};
window.startLocalPuzzle(puzzleId, restore, restore);

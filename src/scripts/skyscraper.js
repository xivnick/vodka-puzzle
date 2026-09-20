import { parseSkyscraperNotes, parseSkyscraperState, skyscraperClueErrors, skyscraperConflicts, solvedSkyscraper } from '../lib/skyscraper.js';

const game = document.getElementById('skyGame');
const puzzle = JSON.parse(game.dataset.puzzle);
const puzzleId = game.dataset.puzzleId;
const preview = game.dataset.preview === 'true';
const notesEnabled = game.dataset.notes === 'true';
const size = puzzle.givens.length;
const givens = puzzle.givens.flat();
const cells = [...document.querySelectorAll('.sky-cell')];
const complete = document.getElementById('skyComplete');
const status = document.getElementById('skyStatus');
let values = [...givens];
let notes = Array.from({ length: size ** 2 }, () => []);
let selected = 0;
let notesMode = false;
let ready = preview;
let completionRecorded = false;

function state() { return { version: 1, puzzleId, values: [...values], ...(notesEnabled ? { notes: notes.map(note => [...note]) } : {}) }; }

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
    cell.replaceChildren();
    if (values[index]) cell.textContent = values[index];
    else if (notesEnabled) {
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
    cell.classList.toggle('conflict', conflicts.has(index));
    cell.tabIndex = index === selected ? 0 : -1;
    const row = Math.floor(index / size);
    const column = index % size;
    cell.setAttribute('aria-label', `${row + 1}행 ${column + 1}열${values[index] ? `, 숫자 ${values[index]}` : ', 빈칸'}${givens[index] ? ', 주어진 숫자' : ''}${conflicts.has(index) ? ', 중복 오류' : ''}${!values[index] && notes[index].length ? `, 메모 ${notes[index].join(', ')}` : ''}`);
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
  if (notesEnabled && notesMode && value) {
    if (values[selected]) return;
    notes[selected] = notes[selected].includes(value) ? notes[selected].filter(note => note !== value) : [...notes[selected], value].sort((a, b) => a - b);
  } else {
    values[selected] = value;
    notes[selected] = [];
  }
  completionRecorded = false;
  persist();
  render();
  announce(value ? `${Math.floor(selected / size) + 1}행 ${selected % size + 1}열에 ${value}${notesEnabled && notesMode ? ' 메모를 변경했습니다.' : '을 입력했습니다.'}` : '숫자와 메모를 지웠습니다.');
}

function toggleNotes() {
  if (!notesEnabled) return;
  notesMode = !notesMode;
  document.getElementById('skyNotes').setAttribute('aria-pressed', String(notesMode));
}

cells.forEach((cell, index) => cell.addEventListener('click', () => select(index)));
document.querySelectorAll('[data-number]').forEach(button => button.addEventListener('click', () => input(Number(button.dataset.number))));
document.getElementById('skyNotes')?.addEventListener('click', toggleNotes);
document.getElementById('skyErase').addEventListener('click', () => input(0));
document.getElementById('skyReset').addEventListener('click', () => {
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
  else if (notesEnabled && event.key.toLowerCase() === 'm') { event.preventDefault(); toggleNotes(); }
});

window.handleCloudSave = () => window.saveProgressCloud(puzzleId, state());
window.handleCloudLoad = async () => {
  const saved = await window.loadProgressCloud(puzzleId);
  if (saved == null) return;
  const parsed = parseSkyscraperState(puzzle, saved, puzzleId);
  if (!parsed) { window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.'); return; }
  values = parsed;
  notes = notesEnabled ? parseSkyscraperNotes(puzzle, saved, puzzleId) || Array.from({ length: size ** 2 }, () => []) : notes;
  completionRecorded = false;
  persist();
  render();
};

function init() {
  if (ready) return;
  let saved = null;
  try { saved = window.loadLocalState(puzzleId); } catch {}
  values = parseSkyscraperState(puzzle, saved, puzzleId) || [...givens];
  notes = notesEnabled ? parseSkyscraperNotes(puzzle, saved, puzzleId) || Array.from({ length: size ** 2 }, () => []) : notes;
  ready = true;
  render();
  window.initCloudBtns();
}

render();
if (!preview) {
  window.puzzleAuthReady.then(init);
  window.addEventListener('puzzle-auth-ready', init);
}

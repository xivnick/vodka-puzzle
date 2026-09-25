import { givens, solution, conflicts, solved, parseMoonSudokuState } from '../lib/moon-sudoku.js';

const $ = id => document.getElementById(id);
const game = $('moonGame');
const puzzleId = game.dataset.puzzleId;
const preview = game.dataset.preview === 'true';
const fixed = givens.flat();
const cells = [...$('moonBoard').querySelectorAll('[data-cell]')];
const params = new URLSearchParams(location.search);
const completedExample = preview && params.get('completed') === '1';
const completionTest = preview && params.get('completion-test') === '1';
let values = completedExample || completionTest ? solution.flat() : fixed.slice();
let selected = completionTest ? 40 : 0;
if (completionTest) values[selected] = 0;
let notes = Array.from({length:81}, () => []), notesMode = false;
let ready = preview, completionRecorded = false;

function state() {
  return { version: 1, puzzleId, values: [...values], notes: notes.map(note => [...note]) };
}

function persist() {
  if (preview || !ready) return;
  try { window.saveLocalState(puzzleId, state()); }
  catch { window.showToast('브라우저에 저장하지 못했습니다.'); }
}

function render() {
  const bad = conflicts(values);
  const complete = solved(values);
  cells.forEach((cell, i) => {
    cell.classList.toggle('selected', !complete && i === selected);
    cell.classList.toggle('conflict', bad.has(i));
    cell.tabIndex = i === selected ? 0 : -1;
    cell.setAttribute('aria-pressed', String(i === selected));
    cell.setAttribute('aria-label', `${Math.floor(i / 9) + 1}행 ${i % 9 + 1}열, ${values[i] || '빈칸'}${fixed[i] ? ', 고정 숫자' : ''}${bad.has(i) ? ', 숫자 중복' : ''}${notes[i].length ? ', 메모 ' + notes[i].join(', ') : ''}`);
    cell.replaceChildren();
    if (values[i]) cell.textContent = values[i];
    else if (notes[i].length) {
      const box = document.createElement('span');
      box.className = 'notes';
      box.setAttribute('aria-hidden', 'true');
      for (let n = 1; n <= 9; n++) {
        const digit = document.createElement('span');
        digit.textContent = notes[i].includes(n) ? n : '';
        box.append(digit);
      }
      cell.append(box);
    }
  });
  $('moonBoard').classList.toggle('moon-complete', complete);
  $('moonComplete').hidden = !complete;
  if (!complete) completionRecorded = false;
  else if (!preview && ready && !completionRecorded) {
    completionRecorded = true;
    window.recordCompletion(puzzleId, state());
  }
}

function select(index) {
  selected = index;
  render();
  cells[selected].focus({preventScroll:true});
}

function change(number) {
  if (!ready || fixed[selected]) return;
  if (notesMode && number) {
    if (values[selected]) return;
    notes[selected] = notes[selected].includes(number)
      ? notes[selected].filter(n => n !== number)
      : [...notes[selected], number].sort((a,b) => a-b);
  } else {
    values[selected] = number;
    notes[selected] = [];
  }
  completionRecorded = false;
  persist();
  render();
  cells[selected].focus({preventScroll:true});
}

function toggleNotes() {
  notesMode = !notesMode;
  $('moonNotes').setAttribute('aria-pressed', String(notesMode));
}

$('moonNotes').addEventListener('click', () => {
  toggleNotes();
  cells[selected].focus({preventScroll:true});
});

$('moonBoard').addEventListener('click', event => {
  const cell = event.target.closest('[data-cell]');
  if (cell) select(Number(cell.dataset.cell));
});
$('moonBoard').addEventListener('keydown', event => {
  if (/^[1-9]$/.test(event.key)) { event.preventDefault(); change(Number(event.key)); }
  else if (['Backspace', 'Delete', '0'].includes(event.key)) { event.preventDefault(); change(0); }
  else if (event.key.toLowerCase() === 'm') { event.preventDefault(); toggleNotes(); }
  else if (['Enter', ' '].includes(event.key)) { event.preventDefault(); select(selected); }
  else {
    const r = Math.floor(selected / 9), c = selected % 9;
    const next = {
      ArrowLeft: r * 9 + Math.max(0, c - 1), ArrowRight: r * 9 + Math.min(8, c + 1),
      ArrowUp: Math.max(0, r - 1) * 9 + c, ArrowDown: Math.min(8, r + 1) * 9 + c,
    }[event.key];
    if (next !== undefined) { event.preventDefault(); select(next); }
  }
});
$('moonNumbers').addEventListener('click', event => {
  const button = event.target.closest('[data-number]');
  if (button) change(Number(button.dataset.number));
});
$('moonErase').addEventListener('click', () => change(0));
$('moonReset').addEventListener('click', () => {
  if (!ready) return;
  if (!values.some((n, i) => n !== fixed[i]) && !notes.some(a => a.length)) return;
  if (confirm('입력한 숫자와 메모를 모두 초기화할까요?')) {
    values = fixed.slice();
    notes = Array.from({length:81}, () => []);
    completionRecorded = false;
    persist();
    render();
  }
});
render();

function init() {
  if (ready) return;
  let saved = null;
  try { saved = window.loadLocalState(puzzleId); } catch {}
  const parsed = parseMoonSudokuState(saved, puzzleId);
  values = parsed?.values || fixed.slice();
  notes = parsed?.notes || Array.from({length:81}, () => []);
  ready = true;
  render();
  window.initCloudBtns();
}

if (!preview) {
  window.handleCloudSave = () => window.saveProgressCloud(puzzleId, state());
  window.handleCloudLoad = async () => {
    const saved = await window.loadProgressCloud(puzzleId);
    if (saved == null) return;
    const parsed = parseMoonSudokuState(saved, puzzleId);
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

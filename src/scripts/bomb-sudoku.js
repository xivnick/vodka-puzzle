import { givens, bombValues, boardSignature, isBomb, validValue, conflicts, solved, parseBombSudokuState } from '../lib/bomb-sudoku.js';

const $ = id => document.getElementById(id);
const puzzleId = $('bombGame').dataset.puzzleId;
const fixed = givens.flat();
const cells = [...$('bombBoard').querySelectorAll('[data-cell]')];
let values = fixed.slice(), selected = fixed.findIndex(n => !n);
let notes = Array.from({length:81}, () => []), notesMode = false;
let ready = false;

function persist() {
  if (!ready) return;
  try {
    window.saveLocalState(puzzleId, {
      version: 1, puzzleId, boardSignature,
      values: [...values], notes: notes.map(note => [...note]),
    });
  } catch { window.showToast('브라우저에 저장하지 못했습니다.'); }
}

function render() {
  const bad = conflicts(values);
  const complete = solved(values);
  cells.forEach((cell, i) => {
    cell.classList.toggle('selected', !complete && i === selected);
    cell.classList.toggle('conflict', bad.has(i));
    cell.classList.toggle('has-notes', !values[i] && notes[i].length > 0);
    cell.tabIndex = i === selected ? 0 : -1;
    cell.setAttribute('aria-pressed', String(i === selected));
    cell.setAttribute('aria-label', `${Math.floor(i / 9) + 1}행 ${i % 9 + 1}열, ${isBomb(i) ? '폭탄 ' : ''}${values[i] || '빈칸'}${fixed[i] ? ', 고정 숫자' : ''}${bad.has(i) ? ', 규칙 위반' : ''}${notes[i].length ? ', 메모 ' + notes[i].join(', ') : ''}`);
    cell.replaceChildren();
    if (values[i]) {
      const digit = document.createElement('span');
      digit.className = 'cell-value';
      digit.textContent = values[i];
      cell.append(digit);
    } else if (notes[i].length) {
      const box = document.createElement('span');
      box.className = 'notes';
      box.setAttribute('aria-hidden', 'true');
      const candidates = isBomb(i) ? bombValues : Array.from({length:9}, (_, n) => n + 1);
      for (const n of candidates) {
        const digit = document.createElement('span');
        digit.textContent = notes[i].includes(n) ? n : '';
        box.append(digit);
      }
      cell.append(box);
    }
  });
  $('bombNotes').setAttribute('aria-pressed', String(notesMode));
  $('bombComplete').hidden = !complete;
}

function select(index) {
  selected = index;
  render();
  cells[selected].focus({preventScroll:true});
}

function change(number) {
  if (!ready || fixed[selected] || number !== 0 && !validValue(number, selected)) return;
  if (notesMode && number) {
    if (values[selected]) return;
    notes[selected] = notes[selected].includes(number)
      ? notes[selected].filter(n => n !== number)
      : [...notes[selected], number].sort((a,b) => a-b);
  } else {
    values[selected] = number;
    notes[selected] = [];
  }
  persist();
  render();
  cells[selected].focus({preventScroll:true});
}

function toggleNotes() { notesMode = !notesMode; render(); }
$('bombNotes').addEventListener('click', () => {
  toggleNotes(); cells[selected].focus({preventScroll:true});
});
$('bombBoard').addEventListener('click', event => {
  const cell = event.target.closest('[data-cell]');
  if (cell) select(Number(cell.dataset.cell));
});
$('bombBoard').addEventListener('keydown', event => {
  if (/^[0-8]$/.test(event.key)) {
    event.preventDefault(); change(Number(event.key) + (isBomb(selected) ? 0.5 : 0));
  } else if (['Backspace', 'Delete'].includes(event.key)) {
    event.preventDefault(); change(0);
  } else if (event.key.toLowerCase() === 'm') {
    event.preventDefault(); toggleNotes();
  } else if (['Enter', ' '].includes(event.key)) {
    event.preventDefault(); select(selected);
  } else {
    const r = Math.floor(selected / 9), c = selected % 9;
    const next = {
      ArrowLeft: r * 9 + Math.max(0, c - 1), ArrowRight: r * 9 + Math.min(8, c + 1),
      ArrowUp: Math.max(0, r - 1) * 9 + c, ArrowDown: Math.min(8, r + 1) * 9 + c,
    }[event.key];
    if (next !== undefined) { event.preventDefault(); select(next); }
  }
});
for (const id of ['bombNumbers', 'bombValues']) $(id).addEventListener('click', event => {
  const button = event.target.closest('[data-number]');
  if (button) change(Number(button.dataset.number));
});
$('bombErase').addEventListener('click', () => change(0));
$('bombReset').addEventListener('click', () => {
  if (!ready) return;
  if (!values.some((n, i) => n !== fixed[i]) && !notes.some(a => a.length)) return;
  if (confirm('입력한 숫자와 메모를 모두 초기화할까요?')) {
    values = fixed.slice(); notes = Array.from({length:81}, () => []);
    persist();
    render();
  }
});
function restore() {
  let saved = null;
  try { saved = window.loadLocalState(puzzleId); } catch {}
  const parsed = parseBombSudokuState(saved, puzzleId);
  values = parsed?.values || fixed.slice();
  notes = parsed?.notes || Array.from({length:81}, () => []);
  ready = true;
  render();
}
window.startLocalPuzzle(puzzleId, restore, restore);

import { givens } from '../lib/visual-sudoku.js';
import { units } from '../lib/sudoku.js';
function conflicts(values) {
 const bad=new Set();
 for(const u of units)for(const i of u)if(values[i]&&u.some(j=>j!==i&&values[j]===values[i]))bad.add(i);
 return bad;
}
function solved(values) {
 return values.every(n=>Number.isInteger(n)&&n>=1&&n<=9)&&fixed.every((n,i)=>!n||values[i]===n)&&units.every(u=>new Set(u.map(i=>values[i])).size===9);
}

const $ = id => document.getElementById(id);
const game = $('visualGame');
const puzzleId = game.dataset.puzzleId;
const fixed = [...givens].map(Number);
const cells = [...$('visualBoard').querySelectorAll('[data-cell]')];
let values = fixed.slice(), selected = 0;
let notes = Array.from({length:81}, () => []), notesMode = false;
let ready = true;

function state() {
  return { version: 1, puzzleId, values: [...values], notes: notes.map(note => [...note]) };
}

function persist() {
  if (!ready) return;
  try { localStorage.setItem(`puzzle-test:${puzzleId}`, JSON.stringify(state())); }
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
    cell.setAttribute('aria-label', `${Math.floor(i / 9) + 1}행 ${i % 9 + 1}열, ${values[i] || '빈칸'}${fixed[i] ? ', 고정 숫자' : ''}${bad.has(i) ? ', 규칙 위반' : ''}${notes[i].length ? ', 메모 ' + notes[i].join(', ') : ''}`);
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
  $('visualComplete').hidden = !complete;

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
  persist();
  render();
  cells[selected].focus({preventScroll:true});
}

function toggleNotes() {
  notesMode = !notesMode;
  $('visualNotes').setAttribute('aria-pressed', String(notesMode));
}

$('visualNotes').addEventListener('click', () => {
  toggleNotes();
  cells[selected].focus({preventScroll:true});
});

$('visualBoard').addEventListener('click', event => {
  const cell = event.target.closest('[data-cell]');
  if (cell) select(Number(cell.dataset.cell));
});
$('visualBoard').addEventListener('keydown', event => {
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
$('visualNumbers').addEventListener('click', event => {
  const button = event.target.closest('[data-number]');
  if (button) change(Number(button.dataset.number));
});
$('visualErase').addEventListener('click', () => change(0));
$('visualReset').addEventListener('click', () => {
  if (!ready) return;
  if (!values.some((n, i) => n !== fixed[i]) && !notes.some(a => a.length)) return;
  if (confirm('입력한 숫자와 메모를 모두 초기화할까요?')) {
    values = fixed.slice();
    notes = Array.from({length:81}, () => []);
    persist();
    render();
  }
});
try {
 const saved=JSON.parse(localStorage.getItem(`puzzle-test:${puzzleId}`));
 if(saved?.puzzleId===puzzleId){
  values=fixed.map((n,i)=>n||(Number.isInteger(saved.values?.[i])&&saved.values[i]>=0&&saved.values[i]<=9?saved.values[i]:0));
  notes=Array.from({length:81},(_,i)=>fixed[i]?[]:[...new Set((Array.isArray(saved.notes?.[i])?saved.notes[i]:[]).filter(n=>Number.isInteger(n)&&n>=1&&n<=9))]);
 }
} catch {}
render();

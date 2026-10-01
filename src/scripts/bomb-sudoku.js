import { givens, bombs, bombValues, isBomb, validValue, conflicts, solved } from '../lib/bomb-sudoku.js';

const $ = id => document.getElementById(id);
const fixed = givens.flat();
const cells = [...$('bombBoard').querySelectorAll('[data-cell]')];
let values = fixed.slice(), selected = fixed.findIndex(n => !n);
let notes = Array.from({length:81}, () => []), notesMode = false;

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
  const bomb = isBomb(selected);
  $('bombNumbers').hidden = bomb;
  $('bombValues').hidden = !bomb;
  $('bombInputLabel').textContent = `${bomb ? '폭탄 값' : '숫자'} ${notesMode ? '메모' : '입력'} · ${bomb ? '0.5~8.5' : '1~8'}${fixed[selected] ? ' · 고정 칸' : ''}`;
  $('bombPadHelp').textContent = bomb
    ? '옅은 버튼은 다른 폭탄에서 사용한 값입니다.'
    : '폭탄 칸을 선택하면 0.5~8.5를 입력할 수 있습니다.';
  for (const button of document.querySelectorAll('.bomb-number-pad [data-number]')) {
    const n = Number(button.dataset.number);
    const used = n % 1 !== 0 && bombs.some(i => i !== selected && values[i] === n);
    button.classList.toggle('used', used);
    button.classList.toggle('active', notesMode ? notes[selected].includes(n) : values[selected] === n);
    button.disabled = !!fixed[selected];
    button.setAttribute('aria-label', `${n}${used ? ', 다른 폭탄에서 사용 중' : ''}`);
    button.setAttribute('aria-pressed', String(notesMode ? notes[selected].includes(n) : values[selected] === n));
  }
  $('bombErase').disabled = !!fixed[selected];
  $('bombNotes').setAttribute('aria-pressed', String(notesMode));
  $('bombComplete').hidden = !complete;
}

function select(index) {
  selected = index;
  render();
  cells[selected].focus({preventScroll:true});
}

function change(number) {
  if (fixed[selected] || number !== 0 && !validValue(number, selected)) return;
  if (notesMode && number) {
    if (values[selected]) return;
    notes[selected] = notes[selected].includes(number)
      ? notes[selected].filter(n => n !== number)
      : [...notes[selected], number].sort((a,b) => a-b);
  } else {
    values[selected] = number;
    notes[selected] = [];
  }
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
  if (button && !button.disabled) change(Number(button.dataset.number));
});
$('bombErase').addEventListener('click', () => change(0));
$('bombReset').addEventListener('click', () => {
  if (!values.some((n, i) => n !== fixed[i]) && !notes.some(a => a.length)) return;
  if (confirm('입력한 숫자와 메모를 모두 초기화할까요?')) {
    values = fixed.slice(); notes = Array.from({length:81}, () => []);
    render();
  }
});
render();

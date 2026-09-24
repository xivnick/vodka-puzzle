import { givens, units, conflicts, solved } from '../lib/moon-sudoku.js';

const $ = id => document.getElementById(id);
const fixed = givens.flat();
const cells = [...$('moonBoard').querySelectorAll('[data-cell]')];
let values = fixed.slice(), selected = 0;
const history = [];

function render() {
  const bad = conflicts(values);
  const related = new Set(units.filter(unit => unit.includes(selected)).flat());
  cells.forEach((cell, i) => {
    cell.classList.toggle('selected', i === selected);
    cell.classList.toggle('related', i !== selected && related.has(i));
    cell.classList.toggle('conflict', bad.has(i));
    cell.tabIndex = i === selected ? 0 : -1;
    cell.setAttribute('aria-pressed', String(i === selected));
    cell.setAttribute('aria-label', `안쪽부터 ${Math.floor(i / 6) + 1}번째 띠, 시계 방향 ${i % 6 + 1}번째 부채꼴, ${values[i] || '빈칸'}${fixed[i] ? ', 고정 숫자' : ''}${bad.has(i) ? ', 숫자 중복' : ''}`);
    cell.querySelector('text').textContent = values[i] || '';
  });
  $('moonUndo').disabled = history.length === 0;
  $('moonErase').disabled = Boolean(fixed[selected]) || !values[selected];
  $('moonNumbers').querySelectorAll('button').forEach(button => { button.disabled = Boolean(fixed[selected]); });
  $('moonStatus').textContent = bad.size ? '붉게 표시된 칸의 숫자가 중복됩니다.' : '';
  $('moonComplete').hidden = !solved(values);
}

function select(index) {
  selected = index;
  render();
  cells[selected].focus({preventScroll:true});
}

function change(number) {
  if (fixed[selected] || values[selected] === number) return;
  history.push({values: values.slice(), selected});
  values[selected] = number;
  render();
  cells[selected].focus({preventScroll:true});
}

$('moonBoard').addEventListener('click', event => {
  const cell = event.target.closest('[data-cell]');
  if (cell) select(Number(cell.dataset.cell));
});
$('moonBoard').addEventListener('keydown', event => {
  if (/^[1-6]$/.test(event.key)) { event.preventDefault(); change(Number(event.key)); }
  else if (['Backspace', 'Delete', '0'].includes(event.key)) { event.preventDefault(); change(0); }
  else if (['Enter', ' '].includes(event.key)) { event.preventDefault(); select(selected); }
  else {
    const r = Math.floor(selected / 6), c = selected % 6;
    const next = {
      ArrowLeft: r * 6 + (c + 5) % 6, ArrowRight: r * 6 + (c + 1) % 6,
      ArrowUp: Math.max(0, r - 1) * 6 + c, ArrowDown: Math.min(5, r + 1) * 6 + c,
    }[event.key];
    if (next !== undefined) { event.preventDefault(); select(next); }
  }
});
$('moonNumbers').addEventListener('click', event => {
  const button = event.target.closest('[data-number]');
  if (button) change(Number(button.dataset.number));
});
$('moonErase').addEventListener('click', () => change(0));
$('moonUndo').addEventListener('click', () => {
  const previous = history.pop();
  if (previous) { values = previous.values; select(previous.selected); }
});
$('moonReset').addEventListener('click', () => {
  if (!values.some((n, i) => n !== fixed[i])) return;
  if (confirm('입력한 숫자를 모두 초기화할까요?')) {
    history.push({values: values.slice(), selected});
    values = fixed.slice();
    render();
  }
});
render();

import { traceGlasses, stopConflicts } from '../lib/juru-marble.js';

const path = window.marblePath;
const cells = document.getElementById('marbleCells');
const glasses = document.getElementById('marbleGlasses');
const status = document.getElementById('marbleStatus');
const values = Array(81).fill(0);
let selected = 4;

function render() {
  const { stops, distance } = traceGlasses(path, values);
  const { bad, reasons } = stopConflicts(path, values, stops);
  const marked = new Set(stops.map(index => {
    const [r, c] = path[index];
    return r * 9 + c;
  }));
  glasses.replaceChildren();
  for (const cell of marked) {
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttribute('href', '/icons/juru-marble/vodka-shot.png');
    image.setAttribute('x', String(cell % 9 * 50 + 5));
    image.setAttribute('y', String(Math.floor(cell / 9) * 50 + 5));
    image.setAttribute('width', '40');
    image.setAttribute('height', '40');
    glasses.append(image);
  }
  for (const cell of cells.children) {
    const i = Number(cell.dataset.cell);
    cell.textContent = values[i] || '';
    cell.classList.toggle('selected', i === selected);
    cell.classList.toggle('conflict', bad.has(i));
    cell.tabIndex = i === selected ? 0 : -1;
    cell.setAttribute('aria-label', `${Math.floor(i / 9) + 1}행 ${i % 9 + 1}열, ${values[i] || '빈칸'}${marked.has(i) ? ', 잔' : ''}${bad.has(i) ? ', 정차 규칙 위반' : ''}`);
  }
  const progress = distance > 32 ? `출발 칸을 지나쳤습니다 · ${distance} / 32칸`
    : distance === 32 ? '출발 칸에 도착했습니다 · 32 / 32칸'
    : distance ? `정차 ${marked.size}칸 · 이동 ${distance} / 32칸`
    : '잔이 있는 칸에 숫자를 입력하면 다음 정차 칸에 잔이 표시됩니다.';
  status.textContent = [...reasons, progress].join(' · ');
}

function change(number) {
  values[selected] = number;
  render();
}

function select(index) {
  selected = index;
  render();
  cells.children[selected].focus();
}

cells.addEventListener('click', event => {
  const cell = event.target.closest('[data-cell]');
  if (cell) select(Number(cell.dataset.cell));
});
cells.addEventListener('keydown', event => {
  if (/^[1-9]$/.test(event.key)) {
    event.preventDefault();
    change(Number(event.key));
  } else if (['Backspace', 'Delete', '0'].includes(event.key)) {
    event.preventDefault();
    change(0);
  } else if (event.key.startsWith('Arrow')) {
    const r = Math.floor(selected / 9), c = selected % 9;
    const next = {
      ArrowLeft: r * 9 + Math.max(0, c - 1),
      ArrowRight: r * 9 + Math.min(8, c + 1),
      ArrowUp: Math.max(0, r - 1) * 9 + c,
      ArrowDown: Math.min(8, r + 1) * 9 + c,
    }[event.key];
    if (next !== undefined) {
      event.preventDefault();
      select(next);
    }
  }
});
document.getElementById('marbleNumbers').addEventListener('click', event => {
  const button = event.target.closest('[data-number]');
  if (button) change(Number(button.dataset.number));
});
document.getElementById('marbleErase').addEventListener('click', () => change(0));
render();

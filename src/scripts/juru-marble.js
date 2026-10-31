import { traceGlasses, stopConflicts, sudokuConflicts, marbleSolved, parseMarbleState } from '../lib/juru-marble.js';

const { path, givens: fixed, puzzleId, preview } = window.marbleConfig;
const cells = document.getElementById('marbleCells');
const glasses = document.getElementById('marbleGlasses');
const status = document.getElementById('marbleStatus');
const notesButton = document.getElementById('marbleNotes');
let values = fixed.slice();
let notes = Array.from({length:81}, () => []);
let selected = 4, notesMode = false;

function persist() {
  if (preview || !puzzleId) return;
  try { window.saveLocalState(puzzleId, { version:1, puzzleId, values:values.slice(), notes:notes.map(note => note.slice()) }); }
  catch { window.showToast('브라우저에 저장하지 못했습니다.'); }
}

function render() {
  const { stops, distance } = traceGlasses(path, values);
  const { bad: stopBad, reasons } = stopConflicts(path, values, stops);
  const sudokuBad = sudokuConflicts(values);
  const bad = new Set([...stopBad, ...sudokuBad]);
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
    cell.replaceChildren();
    if (values[i]) cell.textContent = values[i];
    else if (notes[i].length) {
      const grid = document.createElement('span');
      grid.className = 'notes';
      grid.setAttribute('aria-hidden', 'true');
      for (let n = 1; n <= 9; n++) {
        const digit = document.createElement('span');
        digit.textContent = notes[i].includes(n) ? n : '';
        grid.append(digit);
      }
      cell.append(grid);
    }
    cell.classList.toggle('selected', i === selected);
    cell.classList.toggle('conflict', bad.has(i));
    cell.tabIndex = i === selected ? 0 : -1;
    cell.setAttribute('aria-pressed', String(i === selected));
    cell.setAttribute('aria-label', `${Math.floor(i / 9) + 1}행 ${i % 9 + 1}열, ${values[i] || '빈칸'}${fixed[i] ? ', 고정 숫자' : ''}${marked.has(i) ? ', 잔' : ''}${bad.has(i) ? ', 규칙 위반' : ''}${notes[i].length ? ', 메모 ' + notes[i].join(', ') : ''}`);
  }
  const progress = distance > 32 ? `출발 칸을 지나쳤습니다 · ${distance} / 32칸`
    : distance === 32 ? '출발 칸에 도착했습니다 · 32 / 32칸'
    : distance ? `정차 ${marked.size}칸 · 이동 ${distance} / 32칸`
    : '잔이 있는 칸에 숫자를 입력하면 다음 정차 칸에 잔이 표시됩니다.';
  status.textContent = [...(sudokuBad.size ? ['스도쿠 숫자 중복'] : []), ...reasons, progress].join(' · ');
  document.getElementById('marbleComplete').hidden = !marbleSolved(values, fixed);
}

function change(number) {
  if (fixed[selected]) return;
  if (notesMode && number) {
    if (values[selected]) return;
    notes[selected] = notes[selected].includes(number) ? notes[selected].filter(n => n !== number) : [...notes[selected], number].sort((a,b) => a-b);
  } else {
    values[selected] = number;
    notes[selected] = [];
  }
  persist();
  render();
  cells.children[selected].focus({preventScroll:true});
}

function select(index) {
  selected = index;
  render();
  cells.children[selected].focus({preventScroll:true});
}

function toggleNotes() {
  notesMode = !notesMode;
  notesButton.setAttribute('aria-pressed', String(notesMode));
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
  } else if (event.key.toLowerCase() === 'm') {
    event.preventDefault();
    toggleNotes();
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
notesButton.addEventListener('click', toggleNotes);
document.getElementById('marbleReset')?.addEventListener('click', () => {
  if (!confirm('입력한 숫자와 메모를 모두 지울까요?')) return;
  values = fixed.slice();
  notes = Array.from({length:81}, () => []);
  persist();
  render();
});

function restore() {
  let saved;
  if (!preview && puzzleId) {
    try { saved = parseMarbleState(window.loadLocalState(puzzleId), puzzleId, fixed); } catch {}
  }
  values = saved?.values || fixed.slice();
  notes = saved?.notes || Array.from({length:81}, () => []);
  render();
}
// Device-only progress. This test puzzle never submits completions or cloud saves.
if (!preview && puzzleId) window.startLocalPuzzle(puzzleId, restore, restore);
else restore();

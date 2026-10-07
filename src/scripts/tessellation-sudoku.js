import { givens, cells as geometry, conflicts, solved, parseTessellationState } from '../lib/tessellation-sudoku.js';

const $ = id => document.getElementById(id);
const game = $('tessellationGame');
const puzzleId = game.dataset.puzzleId;
const preview = game.dataset.preview === 'true';
const fixed = givens;
const cells = [...$('tessellationBoard').querySelectorAll('[data-cell]')];
let values = fixed.slice(), selected = 0;
let notes = Array.from({length:geometry.length}, () => []), notesMode = false;
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
    cell.classList.toggle('has-notes', !values[i] && notes[i].length > 0);
    cell.tabIndex = i === selected ? 0 : -1;
    cell.setAttribute('aria-pressed', String(i === selected));
    cell.setAttribute('aria-label', `${geometry[i].row + 1}행 ${geometry[i].col + 1}열, ${values[i] || '빈칸'}${geometry[i].octagon ? ', 팔각형' : ', 사각형'}${fixed[i] ? ', 고정 숫자' : ''}${bad.has(i) ? ', 규칙 위반' : ''}${notes[i].length ? ', 메모 ' + notes[i].join(', ') : ''}`);
    const content = cell.querySelector('.cell-content');
    content.replaceChildren();
    const shape = geometry[i];
    const addText = (label, x, y, size, className) => {
      const digit = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      digit.setAttribute('x', x); digit.setAttribute('y', y);
      digit.setAttribute('font-size', size); digit.setAttribute('class', className);
      digit.textContent = label; content.append(digit);
    };
    if (values[i]) addText(values[i], shape.x, shape.y, shape.octagon ? 54 : 38, 'cell-value');
    else for (const n of notes[i]) {
      const step = shape.octagon ? 26 : 17;
      addText(n, shape.x + ((n-1)%3-1)*step, shape.y + (Math.floor((n-1)/3)-1)*step,
        shape.octagon ? 21 : 15, 'note-value');
    }
  });
  $('tessellationComplete').hidden = !complete;
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
  persist();
  render();
  cells[selected].focus({preventScroll:true});
}

function toggleNotes() {
  notesMode = !notesMode;
  $('tessellationNotes').setAttribute('aria-pressed', String(notesMode));
}

$('tessellationNotes').addEventListener('click', () => {
  toggleNotes();
  cells[selected].focus({preventScroll:true});
});

$('tessellationBoard').addEventListener('click', event => {
  const cell = event.target.closest('[data-cell]');
  if (cell) select(Number(cell.dataset.cell));
});
$('tessellationBoard').addEventListener('keydown', event => {
  if (/^[1-9]$/.test(event.key)) { event.preventDefault(); change(Number(event.key)); }
  else if (['Backspace', 'Delete', '0'].includes(event.key)) { event.preventDefault(); change(0); }
  else if (event.key.toLowerCase() === 'm') { event.preventDefault(); toggleNotes(); }
  else if (['Enter', ' '].includes(event.key)) { event.preventDefault(); select(selected); }
  else {
    const direction = {ArrowLeft:[0,-1],ArrowRight:[0,1],ArrowUp:[-1,0],ArrowDown:[1,0]}[event.key];
    if (direction) {
      event.preventDefault();
      const current = geometry[selected];
      const candidates = geometry.map((cell,i) => ({cell,i})).filter(({cell}) => direction[0]
        ? cell.col === current.col && (cell.row-current.row)*direction[0] > 0
        : cell.row === current.row && (cell.col-current.col)*direction[1] > 0);
      candidates.sort((a,b) => Math.abs(a.cell.row-current.row)+Math.abs(a.cell.col-current.col)
        - Math.abs(b.cell.row-current.row)-Math.abs(b.cell.col-current.col));
      if (candidates.length) select(candidates[0].i);
    }
  }
});
$('tessellationNumbers').addEventListener('click', event => {
  const button = event.target.closest('[data-number]');
  if (button) change(Number(button.dataset.number));
});
$('tessellationErase').addEventListener('click', () => change(0));
$('tessellationReset').addEventListener('click', () => {
  if (!ready) return;
  if (!values.some((n, i) => n !== fixed[i]) && !notes.some(a => a.length)) return;
  if (confirm('입력한 숫자와 메모를 모두 초기화할까요?')) {
    values = fixed.slice();
    notes = Array.from({length:geometry.length}, () => []);
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
  const parsed = parseTessellationState(saved, puzzleId);
  values = parsed?.values || fixed.slice();
  notes = parsed?.notes || Array.from({length:geometry.length}, () => []);
  ready = true;
  render();
  window.initCloudBtns();
}

if (!preview) {
  window.handleCloudSave = () => window.saveProgressCloud(puzzleId, state());
  window.handleCloudLoad = async () => {
    const saved = await window.loadProgressCloud(puzzleId);
    if (saved == null) return;
    const parsed = parseTessellationState(saved, puzzleId);
    if (!parsed) { window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.'); return; }
    values = parsed.values;
    notes = parsed.notes;
    completionRecorded = false;
    persist();
    render();
  };
  window.startLocalPuzzle(puzzleId, init, () => { ready = false; init(); });
}

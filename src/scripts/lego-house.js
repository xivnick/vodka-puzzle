import { conflicts, solved, parseLegoHouseState } from '../lib/lego-house.js';

const $ = id => document.getElementById(id);
const game = $('legoGame');
const puzzleId = game.dataset.puzzleId;
const preview = game.dataset.preview === 'true';
const fixed = Array(81).fill(0);
const cells = [...$('legoBoard').querySelectorAll('[data-cell]')];
let values = fixed.slice(), selected = 0;
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
    cell.setAttribute('aria-label', `${Math.floor(i / 9) + 1}번 보드, ${Math.floor(i % 9 / 3) + 1}행 ${i % 3 + 1}열, ${values[i] || '빈칸'}${fixed[i] ? ', 고정 숫자' : ''}${bad.has(i) ? ', 규칙 위반' : ''}${notes[i].length ? ', 메모 ' + notes[i].join(', ') : ''}`);
    cell.replaceChildren();
    if (values[i]) {
      const entry=document.createElement('span');
      entry.className='entry';
      entry.textContent=values[i];
      cell.append(entry);
    }
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
  $('legoComplete').hidden = !complete;
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
  $('legoNotes').setAttribute('aria-pressed', String(notesMode));
}

$('legoNotes').addEventListener('click', () => {
  toggleNotes();
  cells[selected].focus({preventScroll:true});
});

$('legoBoard').addEventListener('click', event => {
  const cell = event.target.closest('[data-cell]');
  if (cell) select(Number(cell.dataset.cell));
});
$('legoBoard').addEventListener('keydown', event => {
  if (/^[1-9]$/.test(event.key)) { event.preventDefault(); change(Number(event.key)); }
  else if (['Backspace', 'Delete', '0'].includes(event.key)) { event.preventDefault(); change(0); }
  else if (event.key.toLowerCase() === 'm') { event.preventDefault(); toggleNotes(); }
  else if (['Enter', ' '].includes(event.key)) { event.preventDefault(); select(selected); }
  else {
    const b=Math.floor(selected/9), local=selected%9;
    const r=Math.floor(b/3)*3+Math.floor(local/3), c=b%3*3+local%3;
    const index=(row,col)=>(Math.floor(row/3)*3+Math.floor(col/3))*9+(row%3)*3+col%3;
    const next = {
      ArrowLeft: index(r,Math.max(0,c-1)), ArrowRight: index(r,Math.min(8,c+1)),
      ArrowUp: index(Math.max(0,r-1),c), ArrowDown: index(Math.min(8,r+1),c),
    }[event.key];
    if (next !== undefined) { event.preventDefault(); select(next); }
  }
});
$('legoNumbers').addEventListener('click', event => {
  const button = event.target.closest('[data-number]');
  if (button) change(Number(button.dataset.number));
});
$('legoErase').addEventListener('click', () => change(0));
$('legoReset').addEventListener('click', () => {
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
  const parsed = parseLegoHouseState(saved, puzzleId);
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
    const parsed = parseLegoHouseState(saved, puzzleId);
    if (!parsed) { window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.'); return; }
    values = parsed.values;
    notes = parsed.notes;
    completionRecorded = false;
    persist();
    render();
  };
  window.startLocalPuzzle(puzzleId, init, () => { ready = false; init(); });
}

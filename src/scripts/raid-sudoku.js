import {raids, conflicts as findConflicts, solved as isSolved, skyscraperClueStates, weightedArrowStates, sandwichClueStates} from '../lib/raid-sudoku.js';

const $ = id => document.getElementById(id);
const game = $('raidGame');
const puzzleId = game.dataset.puzzleId;
const preview = game.dataset.preview === 'true';
const puzzle = raids[Number(game.dataset.number)-1];
const givens = puzzle.givens;
const label = n => n || '';
// Copy edits must not invalidate progress saved against the same puzzle clues.
const definitionSignature = ({summary, rules, difficulty, ...definition}) => JSON.stringify(definition);
const boardSignature = definitionSignature(puzzle);
function matchesBoardSignature(signature) {
  if (signature === boardSignature) return true;
  try {
    const stored = JSON.parse(signature);
    if (definitionSignature(stored) === boardSignature) return true;
    // Preserve input from the original transcription, which omitted gray r9c7.
    return puzzleId === '261109_08' && Array.isArray(stored.shaded)
      && definitionSignature({...stored, shaded:[...stored.shaded, 78]}) === boardSignature;
  }
  catch { return false; }
}
const conflicts = values => findConflicts(puzzle,values);
const solved = values => isSolved(puzzle,values);
function parseRaidSudokuState(saved, id) {
 if (!saved || saved.version !== 1 || saved.puzzleId !== id || !matchesBoardSignature(saved.boardSignature) || !Array.isArray(saved.values) || saved.values.length !== 81 || !saved.values.every((n,i) => Number.isInteger(n) && n >= 0 && n <= 9 && (!givens[i] || n === givens[i])) || !Array.isArray(saved.notes) || saved.notes.length !== 81 || !saved.notes.every(a => Array.isArray(a) && a.every(n => Number.isInteger(n) && n >= 1 && n <= 9))) return null;
 return {values:[...saved.values], notes:saved.notes.map((a,i)=>saved.values[i]?[]:[...new Set(a)].sort((a,b)=>a-b))};
}
const fixed = givens.flat();
const cells = [...$('raidBoard').querySelectorAll('[data-cell]')];

// Native button borders and fractional grid tracks affect the visible cell center.
// Measure those centers instead of assuming the SVG is nine equal squares.
if (puzzle.lines) {
  const artwork = game.querySelector('.raid-decoration');
  function alignBetweenLines() {
    const bounds = artwork.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    artwork.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
    const geometry = cells.map(cell => {
      const rect = cell.getBoundingClientRect();
      const style = getComputedStyle(cell);
      const left = parseFloat(style.borderLeftWidth) || 0;
      const right = parseFloat(style.borderRightWidth) || 0;
      const top = parseFloat(style.borderTopWidth) || 0;
      const bottom = parseFloat(style.borderBottomWidth) || 0;
      return {
        x: rect.left - bounds.left + (rect.width + left - right) / 2,
        y: rect.top - bounds.top + (rect.height + top - bottom) / 2,
        size: Math.min(rect.width - left - right, rect.height - top - bottom),
      };
    });
    artwork.querySelectorAll('[data-between-line]').forEach(group => {
      const line = puzzle.lines[Number(group.dataset.betweenLine)];
      const thickness = Math.min(...line.map(i => geometry[i].size));
      const path = group.querySelector('polyline');
      path.setAttribute('points', line.map(i => `${geometry[i].x},${geometry[i].y}`).join(' '));
      path.setAttribute('stroke-width', String(thickness * .075));
      group.querySelectorAll('circle').forEach((circle, index) => {
        const center = geometry[index === 0 ? line[0] : line.at(-1)];
        circle.setAttribute('cx', String(center.x));
        circle.setAttribute('cy', String(center.y));
        circle.setAttribute('r', String(center.size * .44));
        circle.setAttribute('stroke-width', String(center.size * .055));
      });
    });
  }
  alignBetweenLines();
  new ResizeObserver(alignBetweenLines).observe($('raidBoard'));
  document.fonts?.ready.then(alignBetweenLines);
}
// Place each termination marker on the painted shared border, then center
// the visible digit itself, rather than relying on font baseline approximations.
if (puzzle.edges) {
  const artwork = game.querySelector('.raid-clues');
  const measure = document.createElement('canvas').getContext('2d');
  function alignTerminationClues() {
    const bounds = artwork.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    artwork.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
    const geometry = cells.map(cell => {
      const rect = cell.getBoundingClientRect();
      const style = getComputedStyle(cell);
      const left = parseFloat(style.borderLeftWidth) || 0;
      const right = parseFloat(style.borderRightWidth) || 0;
      const top = parseFloat(style.borderTopWidth) || 0;
      const bottom = parseFloat(style.borderBottomWidth) || 0;
      return {rect, right, bottom,
        x: rect.left + (rect.width + left - right) / 2,
        y: rect.top + (rect.height + top - bottom) / 2,
        size: Math.min(rect.width - left - right, rect.height - top - bottom)};
    });
    artwork.querySelectorAll('[data-zero-edge]').forEach(group => {
      const [a,b] = puzzle.edges[Number(group.dataset.zeroEdge)];
      const first = geometry[a], second = geometry[b];
      const vertical = Math.floor(a / 9) === Math.floor(b / 9);
      const x = (vertical ? first.rect.right - first.right / 2 : (first.x + second.x) / 2) - bounds.left;
      const y = (vertical ? (first.y + second.y) / 2 : first.rect.bottom - first.bottom / 2) - bounds.top;
      const size = Math.min(first.size, second.size);
      const background = group.querySelector('[data-zero-background]'), text = group.querySelector('text');
      background.setAttribute('cx', String(x));
      background.setAttribute('cy', String(y));
      text.style.fontSize = `${size * .39}px`;
      if (group.dataset.zeroMarker === 'outline') text.style.strokeWidth = `${size * .045}px`;
      text.setAttribute('x', '0');
      text.setAttribute('y', '0');
      const ink = text.getBBox();
      if (background.dataset.zeroBackground === 'circle' || !measure) {
        background.setAttribute('rx', String(size * .22));
        background.setAttribute('ry', String(size * .22));
        text.setAttribute('x', String(x - ink.x - ink.width / 2));
        text.setAttribute('y', String(y - ink.y - ink.height / 2));
      } else {
        // SVG text bounds include font line space. Measure the painted glyph
        // instead, so the mask covers only the zero and a tiny rounded margin.
        text.style.dominantBaseline = 'alphabetic';
        text.style.textAnchor = 'start';
        measure.font = getComputedStyle(text).font;
        const metrics = measure.measureText('0');
        const {actualBoundingBoxLeft:left, actualBoundingBoxRight:right,
          actualBoundingBoxAscent:ascent, actualBoundingBoxDescent:descent} = metrics;
        background.setAttribute('rx', String((left + right) / 2 + size * .018));
        background.setAttribute('ry', String((ascent + descent) / 2 + size * .012));
        text.setAttribute('x', String(x + (left - right) / 2));
        text.setAttribute('y', String(y + (ascent - descent) / 2));
      }
    });
  }
  alignTerminationClues();
  new ResizeObserver(alignTerminationClues).observe($('raidBoard'));
  document.fonts?.ready.then(alignTerminationClues);
}
let values = fixed.slice(), selected = 0;
let notes = Array.from({length:81}, (_, i) => preview && game.dataset.sampleNotes === 'true' && !fixed[i] ? [1,2,3,4,5,6,7,8,9] : []), notesMode = false;
let ready = preview, completionRecorded = false;

function state() {
  return { version: 1, puzzleId, boardSignature, values: [...values], notes: notes.map(note => [...note]) };
}

function persist() {
  if (preview || !ready) return;
  try { window.saveLocalState(puzzleId, state()); }
  catch { window.showToast('브라우저에 저장하지 못했습니다.'); }
}

function render() {
  const bad = conflicts(values);
  const complete = solved(values);
  const skyscraperStates = skyscraperClueStates(puzzle, values);
  const sandwichStates = sandwichClueStates(puzzle, values);
  game.querySelectorAll('[data-outside-clue]').forEach(clue => {
    const index = Number(clue.dataset.outsideClue);
    const status = skyscraperStates[index] ?? sandwichStates[index]?.[Number(clue.dataset.outsideDigit)];
    const invalid = status === 'invalid';
    clue.classList.toggle('conflict', invalid);
    clue.classList.toggle('valid', status === 'valid');
    if (invalid) clue.setAttribute('aria-label', `${clue.textContent}, 규칙 위반`);
    else if (status === 'valid') clue.setAttribute('aria-label', `${clue.textContent}, 조건 충족`);
    else clue.removeAttribute('aria-label');
  });
  const arrowStates = weightedArrowStates(puzzle, values);
  game.querySelectorAll('[data-arrow-clue]').forEach(clue => {
    const status = arrowStates[Number(clue.dataset.arrowClue)];
    clue.classList.toggle('valid', status === 'valid');
    clue.classList.toggle('conflict', status === 'invalid');
    const marker = status === 'valid' ? 'raidArrowValid' : status === 'invalid' ? 'raidArrowInvalid' : 'raidArrowHead';
    clue.querySelector('line').setAttribute('marker-end', `url(#${marker})`);
    const description = status === 'valid' ? '합계 일치' : status === 'invalid' ? '합계 불일치' : '입력 중';
    clue.setAttribute('aria-label', `${clue.querySelector('text').textContent}, ${description}`);
  });
  cells.forEach((cell, i) => {
    cell.classList.toggle('selected', !complete && i === selected);
    cell.classList.toggle('conflict', bad.has(i));
    cell.classList.toggle('has-notes', !values[i] && notes[i].length > 0);
    cell.tabIndex = i === selected ? 0 : -1;
    cell.setAttribute('aria-pressed', String(i === selected));
    cell.setAttribute('aria-label', `${Math.floor(i / 9) + 1}행 ${i % 9 + 1}열, ${label(values[i]) || '빈칸'}${fixed[i] ? ', 고정 숫자' : ''}${bad.has(i) ? ', 규칙 위반' : ''}${notes[i].length ? ', 메모 ' + notes[i].map(label).join(', ') : ''}`);
    cell.replaceChildren();
    if (values[i]) {
      const digit = document.createElement('span');
      digit.className = 'cell-value';
      digit.textContent = label(values[i]);
      cell.append(digit);
    }
    else if (notes[i].length) {
      const box = document.createElement('span');
      box.className = 'notes';
      box.setAttribute('aria-hidden', 'true');
      for (let n = 1; n <= 9; n++) {
        const digit = document.createElement('span');
        digit.textContent = notes[i].includes(n) ? label(n) : '';
        box.append(digit);
      }
      cell.append(box);
    }
  });
  $('raidComplete').hidden = !complete;
  if (!complete) completionRecorded = false;
  else if (!preview && ready && window.puzzlePage?.published && !completionRecorded) {
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
  $('raidNotes').setAttribute('aria-pressed', String(notesMode));
}

$('raidNotes').addEventListener('click', () => {
  toggleNotes();
  cells[selected].focus({preventScroll:true});
});

$('raidBoard').addEventListener('click', event => {
  const cell = event.target.closest('[data-cell]');
  if (cell) select(Number(cell.dataset.cell));
});
$('raidBoard').addEventListener('keydown', event => {
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
$('raidNumbers').addEventListener('click', event => {
  const button = event.target.closest('[data-number]');
  if (button) change(Number(button.dataset.number));
});
$('raidErase').addEventListener('click', () => change(0));
$('raidReset').addEventListener('click', () => {
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
  const parsed = parseRaidSudokuState(saved, puzzleId);
  values = parsed?.values || fixed.slice();
  notes = parsed?.notes || Array.from({length:81}, () => []);
  ready = true;
  render();
  window.initCloudBtns();
}

if (!preview) {
  window.checkComplete = () => { if (ready) render(); };
  window.handleCloudSave = () => window.saveProgressCloud(puzzleId, state());
  window.handleCloudLoad = async () => {
    const saved = await window.loadProgressCloud(puzzleId);
    if (saved == null) return;
    const parsed = parseRaidSudokuState(saved, puzzleId);
    if (!parsed) { window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.'); return; }
    values = parsed.values;
    notes = parsed.notes;
    completionRecorded = false;
    persist();
    render();
  };
  window.startLocalPuzzle(puzzleId, init, () => { ready = false; init(); });
}

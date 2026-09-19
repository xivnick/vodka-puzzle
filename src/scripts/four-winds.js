import { arrowCells, analyzeFourWinds, cellKey, validateArrow } from '../lib/four-winds.js';

const game = document.getElementById('fwGame');
const board = document.getElementById('fwBoard');
const status = document.getElementById('fwStatus');
const complete = document.getElementById('fwComplete');
const ns = 'http://www.w3.org/2000/svg';
const puzzles = JSON.parse(game.dataset.puzzles);
const states = puzzles.map(() => []);
let puzzleIndex = 0;
let selected = null;
let cursor = { r: 0, c: 0 };
let keyboard = false;
let pointer = null;

const puzzle = () => puzzles[puzzleIndex];
const arrows = () => states[puzzleIndex];
const active = cell => puzzle().cells[cell.r]?.[cell.c] !== -1 && puzzle().cells[cell.r]?.[cell.c] !== undefined;
const clue = cell => puzzle().cells[cell.r]?.[cell.c] > 0;

function svgNode(tag, attrs = {}, parent = board) {
  const node = document.createElementNS(ns, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  parent.append(node);
  return node;
}

function announce(message) { status.textContent = message; }

function snappedEnd(source, cell) {
  const dr = cell.r - source.r;
  const dc = cell.c - source.c;
  return Math.abs(dc) >= Math.abs(dr) ? { r: source.r, c: cell.c } : { r: cell.r, c: source.c };
}

function draftArrow() {
  if (!selected || !selected.end || cellKey(selected.source) === cellKey(selected.end)) return null;
  return { source: selected.source, end: selected.end };
}

function linePoints(arrow) {
  const dr = Math.sign(arrow.end.r - arrow.source.r);
  const dc = Math.sign(arrow.end.c - arrow.source.c);
  return {
    x1: (arrow.source.c + .5 + dc * .48) * 50,
    y1: (arrow.source.r + .5 + dr * .48) * 50,
    x2: (arrow.end.c + .5) * 50,
    y2: (arrow.end.r + .5) * 50,
  };
}

function drawArrow(arrow, index, preview = false, analysis = null) {
  const invalid = preview && validateArrow(puzzle(), arrow, arrows());
  const target = puzzle().cells[arrow.source.r][arrow.source.c];
  const total = analysis?.totals.get(cellKey(arrow.source)) || 0;
  const state = total > target ? 'over' : total === target ? 'exact' : 'under';
  const color = invalid || state === 'over' ? '#b65c5c' : state === 'exact' ? '#5b8c64' : preview ? '#8a98a8' : '#527aa3';
  const fill = invalid || state === 'over' ? '#f4d5d5' : state === 'exact' ? '#dcebdc' : '#fff';
  const marker = invalid || state === 'over' ? 'fwArrowError' : state === 'exact' ? 'fwArrowExact' : preview ? 'fwArrowPreview' : 'fwArrowHead';
  for (const cell of arrowCells(arrow)) {
    if (!active(cell)) continue;
    svgNode('rect', { x: cell.c * 50 + 2, y: cell.r * 50 + 2, width: 46, height: 46, fill });
  }
  const line = svgNode('line', { ...linePoints(arrow), stroke: color, 'stroke-width': 3.5, 'stroke-linecap': 'square', 'marker-end': `url(#${marker})` });
  if (!preview) line.dataset.arrowIndex = index;
}

function render() {
  const current = puzzle();
  const rows = current.cells.length;
  const cols = current.cells[0].length;
  const analysis = analyzeFourWinds(current, arrows());
  board.replaceChildren();
  board.dataset.keyboard = String(keyboard);
  board.setAttribute('viewBox', `-3 -3 ${cols * 50 + 6} ${rows * 50 + 6}`);
  board.setAttribute('aria-label', `${current.label}, ${rows}행 ${cols}열. 현재 ${cursor.r + 1}행 ${cursor.c + 1}열.`);

  const defs = svgNode('defs');
  for (const [id, color] of [['fwArrowHead', '#527aa3'], ['fwArrowPreview', '#8a98a8'], ['fwArrowExact', '#5b8c64'], ['fwArrowError', '#b65c5c']]) {
    const marker = svgNode('marker', { id, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 4.5, markerHeight: 4.5, orient: 'auto-start-reverse', markerUnits: 'strokeWidth' }, defs);
    svgNode('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: color }, marker);
  }

  current.cells.forEach((row, r) => row.forEach((value, c) => {
    if (value === -1) return;
    const key = cellKey({ r, c });
    const total = analysis.totals.get(key) || 0;
    const clueFill = value > 0 && total > value ? '#f4d5d5' : value > 0 && total === value ? '#dcebdc' : '#fff';
    const isSelected = selected && cellKey(selected.source) === key;
    svgNode('rect', { x: c * 50, y: r * 50, width: 50, height: 50, fill: isSelected ? 'rgba(111,155,208,.22)' : clueFill });
  }));
  arrows().forEach((arrow, index) => drawArrow(arrow, index, false, analysis));
  const draft = draftArrow();
  if (draft) drawArrow(draft, -1, true, analyzeFourWinds(current, [...arrows(), draft]));

  current.cells.forEach((row, r) => row.forEach((value, c) => {
    if (value === -1) return;
    const neighbors = [[-1, 0, 0, 0, 50, 0], [0, 1, 50, 0, 50, 50], [1, 0, 0, 50, 50, 50], [0, -1, 0, 0, 0, 50]];
    neighbors.forEach(([dr, dc, x1, y1, x2, y2], edge) => {
      const neighbor = current.cells[r + dr]?.[c + dc];
      if (neighbor === undefined || neighbor === -1) svgNode('line', { x1: c * 50 + x1, y1: r * 50 + y1, x2: c * 50 + x2, y2: r * 50 + y2, stroke: '#333', 'stroke-width': 2.4 });
      else if (edge < 2) svgNode('line', { x1: c * 50 + x1, y1: r * 50 + y1, x2: c * 50 + x2, y2: r * 50 + y2, stroke: '#b7b9bb', 'stroke-width': 1.5, 'stroke-dasharray': '5 5' });
    });
    if (value > 0) {
      const text = svgNode('text', { x: c * 50 + 25, y: r * 50 + 32, 'text-anchor': 'middle', 'font-size': 23, 'font-weight': 500, fill: '#222' });
      text.textContent = value;
    }
  }));
  if (keyboard && active(cursor)) svgNode('rect', { x: cursor.c * 50 + 3, y: cursor.r * 50 + 3, width: 44, height: 44, fill: 'none', stroke: '#4a6fa5', 'stroke-width': 2, 'stroke-dasharray': '3 3' });
  complete.hidden = !analysis.complete;
  if (analysis.complete) announce('퍼즐을 완성했습니다!');
}

function eventCell(event, clamp = false) {
  const box = board.getBoundingClientRect();
  const cols = puzzle().cells[0].length;
  const rows = puzzle().cells.length;
  const x = (event.clientX - box.left) / box.width * cols * 50;
  const y = (event.clientY - box.top) / box.height * rows * 50;
  if (!clamp && (x < 0 || y < 0 || x >= cols * 50 || y >= rows * 50)) return null;
  return { r: Math.max(0, Math.min(rows - 1, Math.floor(y / 50))), c: Math.max(0, Math.min(cols - 1, Math.floor(x / 50))) };
}

function arrowAt(cell) {
  const key = cellKey(cell);
  return arrows().findIndex(arrow => arrowCells(arrow).some(part => cellKey(part) === key));
}

function addArrow(arrow) {
  const error = validateArrow(puzzle(), arrow, arrows());
  if (error) { announce(error); selected = null; render(); return false; }
  states[puzzleIndex] = [...arrows(), arrow];
  selected = null;
  announce('화살표를 그렸습니다.');
  render();
  return true;
}

function removeArrow(index) {
  if (index < 0) return;
  states[puzzleIndex] = arrows().filter((_, arrowIndex) => arrowIndex !== index);
  selected = null;
  announce('화살표를 지웠습니다.');
  render();
}

board.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !event.isPrimary || pointer) return;
  const cell = eventCell(event);
  if (!cell || !active(cell)) return;
  event.preventDefault();
  board.focus({ preventScroll: true });
  keyboard = false;
  cursor = cell;
  const occupied = arrowAt(cell);
  if (occupied >= 0 && !clue(cell)) {
    pointer = { id: event.pointerId, remove: occupied, startX: event.clientX, startY: event.clientY, moved: false };
  } else if (clue(cell)) {
    selected = { source: cell, end: cell };
    pointer = { id: event.pointerId, source: cell, startX: event.clientX, startY: event.clientY, moved: false };
  } else if (selected) {
    addArrow({ source: selected.source, end: snappedEnd(selected.source, cell) });
    return;
  } else return;
  board.setPointerCapture(event.pointerId);
  render();
});

board.addEventListener('pointermove', event => {
  if (!pointer || pointer.id !== event.pointerId) return;
  if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 7) pointer.moved = true;
  if (!pointer.source) return;
  const cell = eventCell(event, true);
  selected.end = snappedEnd(pointer.source, cell);
  cursor = selected.end;
  render();
});

board.addEventListener('pointerup', event => {
  if (!pointer || pointer.id !== event.pointerId) return;
  const action = pointer;
  pointer = null;
  if (action.remove >= 0 && !action.moved) { removeArrow(action.remove); return; }
  if (action.source && action.moved) { addArrow({ source: action.source, end: selected.end }); return; }
  if (action.source) {
    selected = { source: action.source, end: action.source };
    announce(`숫자 ${puzzle().cells[action.source.r][action.source.c]}에서 출발합니다. 끝 칸을 선택하세요.`);
    render();
  }
});

board.addEventListener('pointercancel', () => { pointer = null; selected = null; render(); });

board.addEventListener('keydown', event => {
  const directions = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if (directions[event.key]) {
    event.preventDefault();
    keyboard = true;
    const [dr, dc] = directions[event.key];
    const rows = puzzle().cells.length;
    const cols = puzzle().cells[0].length;
    cursor = { r: Math.max(0, Math.min(rows - 1, cursor.r + dr)), c: Math.max(0, Math.min(cols - 1, cursor.c + dc)) };
    if (selected) selected.end = snappedEnd(selected.source, cursor);
    announce(`${cursor.r + 1}행 ${cursor.c + 1}열${clue(cursor) ? `, 숫자 ${puzzle().cells[cursor.r][cursor.c]}` : ''}`);
    render();
    return;
  }
  if (event.key === 'Escape') { event.preventDefault(); selected = null; render(); return; }
  if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeArrow(arrowAt(cursor)); return; }
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  keyboard = true;
  if (selected && cellKey(selected.source) !== cellKey(cursor)) { addArrow({ source: selected.source, end: snappedEnd(selected.source, cursor) }); return; }
  const occupied = arrowAt(cursor);
  if (occupied >= 0) { removeArrow(occupied); return; }
  if (clue(cursor)) { selected = { source: { ...cursor }, end: { ...cursor } }; announce('방향키로 끝 칸을 정한 뒤 Enter를 누르세요.'); render(); }
});

document.getElementById('fwReset').addEventListener('click', () => {
  if (arrows().length && !confirm('현재 문제를 초기화하시겠습니까?')) return;
  states[puzzleIndex] = [];
  selected = null;
  status.textContent = '';
  render();
});

render();

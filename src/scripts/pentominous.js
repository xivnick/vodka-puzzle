import { edgeKey, validatePentominous } from '../lib/pentominous.js';

const game = document.getElementById('pentominousGame');
if (game) {
  const puzzle = JSON.parse(game.dataset.puzzle);
  const { rows, cols, clues } = puzzle;
  const board = document.getElementById('pentominousBoard');
  const undo = document.getElementById('pentominousUndo');
  const reset = document.getElementById('pentominousReset');
  const complete = document.getElementById('pentominousComplete');
  const status = document.getElementById('pentominousStatus');
  const storageKey = 'pentominous-260929-preview';
  const size = 40;
  const width = cols * size, height = rows * size;
  const validEdges = new Set();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const index = r * cols + c;
    if (c < cols - 1) validEdges.add(edgeKey(index, index + 1));
    if (r < rows - 1) validEdges.add(edgeKey(index, index + cols));
  }
  let edges = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (Array.isArray(saved)) edges = new Set(saved.filter(key => validEdges.has(key)));
  } catch { /* Storage may be unavailable. */ }
  const history = [];
  let gesture = null, selected = null;
  board.setAttribute('viewBox', `0 0 ${width} ${height}`);

  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify([...edges])); } catch { /* Optional local progress. */ }
  }
  function checkpoint() {
    history.push([...edges]);
    if (history.length > 200) history.shift();
  }
  function edgeAt(x, y, preferred = null) {
    if (x < 0 || y < 0 || x > width || y > height) return null;
    const gridCol = Math.round(x / size), gridRow = Math.round(y / size);
    const verticalDistance = Math.abs(x - gridCol * size);
    const horizontalDistance = Math.abs(y - gridRow * size);
    const vertical = gridCol > 0 && gridCol < cols && verticalDistance < 11;
    const horizontal = gridRow > 0 && gridRow < rows && horizontalDistance < 11;
    if (vertical && (!horizontal || (preferred === 'vertical' || preferred !== 'horizontal' && verticalDistance <= horizontalDistance))) {
      const row = Math.min(rows - 1, Math.floor(y / size));
      return edgeKey(row * cols + gridCol - 1, row * cols + gridCol);
    }
    if (horizontal) {
      const col = Math.min(cols - 1, Math.floor(x / size));
      return edgeKey((gridRow - 1) * cols + col, gridRow * cols + col);
    }
    return null;
  }
  function position(event) {
    const rect = board.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width * width,
      y: (event.clientY - rect.top) / rect.height * height };
  }
  function paint(key) {
    if (!key || gesture.visited.has(key)) return false;
    gesture.visited.add(key);
    if (gesture.mode === 'draw') edges.add(key);
    else edges.delete(key);
    return true;
  }
  function render() {
    const result = validatePentominous(puzzle, edges);
    let html = '';
    for (const region of result.regions) {
      if (region.shape || region.cells.length < 5) {
        const bad = !region.shape || region.clueMismatch || region.sameShapeNeighbor;
        const fill = bad ? '#fce8e7' : '#e9f4e9';
        for (const index of region.cells) {
          const r = Math.floor(index / cols), c = index % cols;
          html += `<rect x="${c * size}" y="${r * size}" width="${size}" height="${size}" fill="${fill}"/>`;
        }
      }
    }
    if (selected !== null) {
      const r = Math.floor(selected / cols), c = selected % cols;
      html += `<rect x="${c * size + 2}" y="${r * size + 2}" width="${size - 4}" height="${size - 4}" fill="#e7eef7"/>`;
    }
    for (let r = 1; r < rows; r++) html += `<path d="M0 ${r * size}H${width}" stroke="#d2d8df" stroke-width="1" stroke-dasharray="3 4"/>`;
    for (let c = 1; c < cols; c++) html += `<path d="M${c * size} 0V${height}" stroke="#d2d8df" stroke-width="1" stroke-dasharray="3 4"/>`;
    for (const key of edges) {
      const [a, b] = key.split(':').map(Number);
      if (b - a === 1) {
        const x = (b % cols) * size, y = Math.floor(a / cols) * size;
        html += `<path d="M${x} ${y}V${y + size}" stroke="#334f72" stroke-width="4" stroke-linecap="round"/>`;
      } else {
        const x = (a % cols) * size, y = Math.floor(b / cols) * size;
        html += `<path d="M${x} ${y}H${x + size}" stroke="#334f72" stroke-width="4" stroke-linecap="round"/>`;
      }
    }
    clues.forEach((row, r) => [...row].forEach((clue, c) => {
      if (clue === '.') return;
      html += `<text x="${(c + .5) * size}" y="${(r + .5) * size}" dy=".35em" text-anchor="middle" font-size="25" font-weight="600" fill="#202a36" pointer-events="none">${clue}</text>`;
    }));
    html += `<rect x="1.5" y="1.5" width="${width - 3}" height="${height - 3}" fill="none" stroke="#202a36" stroke-width="3" pointer-events="none"/>`;
    board.innerHTML = html;
    complete.hidden = !result.complete;
    undo.disabled = !history.length;
    reset.disabled = !edges.size;
    const formed = result.regions.filter(region => region.shape && !region.clueMismatch && !region.sameShapeNeighbor).length;
    status.textContent = result.complete ? '퍼즐을 완성했습니다.' : `규칙에 맞는 펜토미노 영역 ${formed}개.`;
  }
  board.addEventListener('pointerdown', event => {
    if (event.button !== 0 || gesture) return;
    const point = position(event), key = edgeAt(point.x, point.y);
    if (!key) { selected = Math.min(rows - 1, Math.floor(point.y / size)) * cols + Math.min(cols - 1, Math.floor(point.x / size)); render(); return; }
    event.preventDefault();
    board.focus({ preventScroll: true });
    board.setPointerCapture(event.pointerId);
    checkpoint();
    gesture = { id: event.pointerId, mode: edges.has(key) ? 'erase' : 'draw', visited: new Set(), point };
    paint(key);
    render();
  });
  board.addEventListener('pointermove', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const next = position(event), previous = gesture.point;
    const dx = next.x - previous.x, dy = next.y - previous.y;
    const preferred = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 5));
    let changed = false;
    for (let step = 1; step <= steps; step++) {
      const fraction = step / steps;
      const key = edgeAt(previous.x + dx * fraction, previous.y + dy * fraction, preferred);
      changed = paint(key) || changed;
    }
    gesture.point = next;
    if (changed) render();
  });
  function end(event) {
    if (!gesture || gesture.id !== event.pointerId) return;
    gesture = null;
    persist();
    render();
  }
  board.addEventListener('pointerup', end);
  board.addEventListener('pointercancel', end);
  board.addEventListener('lostpointercapture', end);
  function revert() {
    if (!history.length) return;
    edges = new Set(history.pop());
    persist(); render();
  }
  undo.addEventListener('click', revert);
  reset.addEventListener('click', () => {
    if (!edges.size) return;
    checkpoint(); edges.clear(); selected = null; persist(); render();
  });
  board.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault(); revert(); return;
    }
    const directions = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (directions[event.key]) {
      event.preventDefault();
      if (selected === null) selected = 0;
      const [dr, dc] = directions[event.key];
      const row = Math.floor(selected / cols) + dr, col = selected % cols + dc;
      if (row >= 0 && row < rows && col >= 0 && col < cols) {
        const next = row * cols + col;
        if (event.shiftKey) {
          checkpoint();
          const key = edgeKey(selected, next);
          if (edges.has(key)) edges.delete(key); else edges.add(key);
          persist();
        }
        selected = next;
      }
      render();
    } else if (event.key === 'Escape') { selected = null; render(); }
  });
  render();
}

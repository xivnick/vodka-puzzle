import { edgeKey, parseStarDivisionState, validateStarDivision } from '../lib/star-division.js';

const game = document.getElementById('star-divisionGame');
if (game) {
  const puzzle = JSON.parse(game.dataset.puzzle);
  const puzzleId = game.dataset.puzzleId;
  const preview = game.dataset.preview === 'true';
  const { rows, cols, clues } = puzzle;
  const board = document.getElementById('star-divisionBoard');
  const reset = document.getElementById('star-divisionReset');
  const complete = document.getElementById('star-divisionComplete');
  const status = document.getElementById('star-divisionStatus');
  const storageKey = `${puzzleId}-preview`;
  const size = 40;
  const glyphMeasure = document.createElement('canvas').getContext('2d');
  const width = cols * size, height = rows * size;
  const framePadding = 3;
  const validEdges = new Set();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const index = r * cols + c;
    if (c < cols - 1) validEdges.add(edgeKey(index, index + 1));
    if (r < rows - 1) validEdges.add(edgeKey(index, index + cols));
  }
  let edges = new Set();
  if (preview) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (Array.isArray(saved)) edges = new Set(saved.filter(key => validEdges.has(key)));
      else if ([1, 2].includes(saved?.version) && Array.isArray(saved.lines)) {
        edges = new Set(saved.lines.filter(key => validEdges.has(key)));
      }
    } catch { /* Storage may be unavailable. */ }
  }
  let press = null;
  let ready = preview, owner = null, completionRecorded = false;
  const account = () => window.puzzleAccount?.user?.id || 'guest';
  board.setAttribute('viewBox', `${-framePadding} ${-framePadding} ${width + framePadding * 2} ${height + framePadding * 2}`);

  const snapshot = () => ({ version: 1, puzzleId, lines: [...edges] });
  function persist() {
    if (!ready) return;
    try {
      if (preview) localStorage.setItem(storageKey, JSON.stringify(snapshot()));
      else if (owner === account()) window.saveLocalState(puzzleId, snapshot());
    } catch { window.showToast?.('브라우저에 저장하지 못했습니다.'); }
  }
  function edgeAt(x, y) {
    if (x < 0 || y < 0 || x > width || y > height) return null;
    const gridCol = Math.round(x / size), gridRow = Math.round(y / size);
    const verticalDistance = Math.abs(x - gridCol * size);
    const horizontalDistance = Math.abs(y - gridRow * size);
    const vertical = gridCol > 0 && gridCol < cols && verticalDistance < 14;
    const horizontal = gridRow > 0 && gridRow < rows && horizontalDistance < 14;
    if (vertical && (!horizontal || verticalDistance <= horizontalDistance)) {
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
    return { x: (event.clientX - rect.left) / rect.width * (width + framePadding * 2) - framePadding,
      y: (event.clientY - rect.top) / rect.height * (height + framePadding * 2) - framePadding };
  }
  function toggleLine(key) {
    if (!ready || !preview && owner !== account()) return;
    if (edges.has(key)) edges.delete(key);
    else edges.add(key);
    persist(); render();
  }
  function render() {
    const result = validateStarDivision(puzzle, edges);
    let html = '';
    for (const region of result.regions) {
      if (region.feedback === 'pending') continue;
      const fill = region.feedback === 'valid' ? '#e9f4e9' : '#fce8e7';
      for (const index of region.cells) {
        const r = Math.floor(index / cols), c = index % cols;
        html += `<rect x="${c * size}" y="${r * size}" width="${size}" height="${size}" fill="${fill}" pointer-events="none"/>`;
      }
    }
    for (let r = 1; r < rows; r++) html += `<path d="M0 ${r * size}H${width}" stroke="#d2d8df" stroke-width="1" vector-effect="non-scaling-stroke" stroke-dasharray="3 4"/>`;
    for (let c = 1; c < cols; c++) html += `<path d="M${c * size} 0V${height}" stroke="#d2d8df" stroke-width="1" vector-effect="non-scaling-stroke" stroke-dasharray="3 4"/>`;
    for (const key of edges) {
      const [a, b] = key.split(':').map(Number);
      if (b - a === 1) {
        const x = (b % cols) * size, y = Math.floor(a / cols) * size;
        html += `<path d="M${x} ${y}V${y + size}" stroke="#334f72" stroke-width="3" vector-effect="non-scaling-stroke" stroke-linecap="round"/>`;
      } else {
        const x = (a % cols) * size, y = Math.floor(b / cols) * size;
        html += `<path d="M${x} ${y}H${x + size}" stroke="#334f72" stroke-width="3" vector-effect="non-scaling-stroke" stroke-linecap="round"/>`;
      }
    }
    clues.forEach((row, r) => [...row].forEach((clue, c) => {
      if (clue === '.') return;
      if (clue === '*') {
        const x = (c + .5) * size, y = (r + .5) * size;
        // Match the 30px star used by Star Battle at the shared 480px board width.
        const fontSize = 30 * (width + framePadding * 2) / 480;
        html += `<text x="${x}" y="${y}" text-anchor="middle" font-family="sans-serif" font-size="${fontSize}" fill="#333" pointer-events="none">★</text>`;
        return;
      }
      html += `<text x="${(c + .5) * size}" y="${(r + .5) * size}" text-anchor="middle" font-size="25" font-weight="600" fill="#202a36" pointer-events="none">${clue}</text>`;
    }));
    html += `<rect x="0" y="0" width="${width}" height="${height}" fill="none" stroke="#202a36" stroke-width="3" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
    board.innerHTML = html;
    // Align the visible ink, rather than the font's line box, to each cell center.
    for (const text of board.querySelectorAll('text')) {
      const style = getComputedStyle(text);
      glyphMeasure.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const bounds = glyphMeasure.measureText(text.textContent);
      text.setAttribute('text-anchor', 'start');
      text.setAttribute('transform', `translate(${(bounds.actualBoundingBoxLeft - bounds.actualBoundingBoxRight) / 2} ${(bounds.actualBoundingBoxAscent - bounds.actualBoundingBoxDescent) / 2})`);
    }
    complete.hidden = !result.complete;
    reset.disabled = !ready || !edges.size;
    status.textContent = result.complete ? '퍼즐을 완성했습니다.' : '점선을 눌러 영역을 나누세요.';
    if (!result.complete) completionRecorded = false;
    if (!preview && ready && owner === account() && window.puzzlePage?.published && result.complete && !completionRecorded) {
      completionRecorded = true;
      window.recordCompletion(puzzleId, snapshot());
    }
  }
  board.addEventListener('contextmenu', event => event.preventDefault());
  board.addEventListener('pointerdown', event => {
    if (!ready || !preview && owner !== account() || event.button !== 0 || press) return;
    const point = position(event), key = edgeAt(point.x, point.y);
    if (!key) return;
    press = { id: event.pointerId, key, x: event.clientX, y: event.clientY };
  });
  window.addEventListener('pointermove', event => {
    if (!press || press.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) {
      press = null;
    }
  });
  window.addEventListener('pointerup', event => {
    if (!press || press.id !== event.pointerId) return;
    const { key, x, y } = press;
    press = null;
    if (Math.hypot(event.clientX - x, event.clientY - y) <= 10) {
      toggleLine(key);
    }
  });
  window.addEventListener('pointercancel', event => {
    if (!press || press.id !== event.pointerId) return;
    press = null;
  });
  reset.addEventListener('click', () => {
    if (!ready || !preview && owner !== account() || !edges.size) return;
    edges.clear(); persist(); render();
  });
  function init() {
    const nextOwner = account();
    if (ready && owner === nextOwner) return;
    owner = nextOwner;
    ready = false;
    press = null;
    completionRecorded = false;
    let saved = null;
    try { saved = window.loadLocalState(puzzleId); } catch {}
    const parsed = parseStarDivisionState(puzzle, saved, puzzleId);
    edges = parsed?.lines || new Set();
    ready = true;
    render();
    window.initCloudBtns();
  }
  if (!preview) {
    window.handleCloudSave = () => {
      if (ready && owner === account() && window.puzzlePage?.published) return window.saveProgressCloud(puzzleId, snapshot());
    };
    window.handleCloudLoad = async () => {
      if (!ready || owner !== account() || !window.puzzlePage?.published) return;
      const requestedOwner = owner, before = JSON.stringify(snapshot());
      const saved = await window.loadProgressCloud(puzzleId);
      if (saved == null || requestedOwner !== account() || before !== JSON.stringify(snapshot())) return;
      const parsed = parseStarDivisionState(puzzle, saved, puzzleId);
      if (!parsed) { window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.'); return; }
      edges = parsed.lines;
      persist();
      render();
    };
    init();
    window.puzzleAuthReady.then(init);
    window.addEventListener('puzzle-auth-ready', init);
  }
  window.checkComplete = render;
  render();
}

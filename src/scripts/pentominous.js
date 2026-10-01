import { edgeKey, parsePentominousState, validatePentominous } from '../lib/pentominous.js';

const game = document.getElementById('pentominousGame');
if (game) {
  const puzzle = JSON.parse(game.dataset.puzzle);
  const puzzleId = game.dataset.puzzleId;
  const preview = game.dataset.preview === 'true';
  const { rows, cols, clues } = puzzle;
  const board = document.getElementById('pentominousBoard');
  const modeButton = document.getElementById('pentominousMode');
  const undo = document.getElementById('pentominousUndo');
  const reset = document.getElementById('pentominousReset');
  const complete = document.getElementById('pentominousComplete');
  const status = document.getElementById('pentominousStatus');
  const storageKey = puzzleId === 'test-pentominous-260929' ? 'pentominous-260929-preview' : `${puzzleId}-preview`;
  const size = 40;
  const width = cols * size, height = rows * size;
  const validEdges = new Set();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const index = r * cols + c;
    if (c < cols - 1) validEdges.add(edgeKey(index, index + 1));
    if (r < rows - 1) validEdges.add(edgeKey(index, index + cols));
  }
  let edges = new Set(), crosses = new Set();
  if (preview) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (Array.isArray(saved)) edges = new Set(saved.filter(key => validEdges.has(key)));
      else if ([1, 2].includes(saved?.version) && Array.isArray(saved.lines) && Array.isArray(saved.crosses)) {
        edges = new Set(saved.lines.filter(key => validEdges.has(key)));
        crosses = new Set(saved.crosses.filter(key => validEdges.has(key) && !edges.has(key)));
      }
    } catch { /* Storage may be unavailable. */ }
  }
  const history = [];
  let press = null, longPressMeans = 'cross';
  let ready = preview, owner = null, completionRecorded = false;
  const account = () => window.puzzleAccount?.user?.id || 'guest';
  board.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const snapshot = () => ({ version: 1, puzzleId, lines: [...edges], crosses: [...crosses] });
  function persist() {
    if (!ready) return;
    try {
      if (preview) localStorage.setItem(storageKey, JSON.stringify(snapshot()));
      else if (owner === account()) window.saveLocalState(puzzleId, snapshot());
    } catch { window.showToast?.('브라우저에 저장하지 못했습니다.'); }
  }
  function checkpoint() {
    history.push(snapshot());
    if (history.length > 200) history.shift();
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
    return { x: (event.clientX - rect.left) / rect.width * width,
      y: (event.clientY - rect.top) / rect.height * height };
  }
  function toggleMark(key, mark) {
    if (!ready || !preview && owner !== account()) return;
    checkpoint();
    const target = mark === 'line' ? edges : crosses;
    const other = mark === 'line' ? crosses : edges;
    if (target.has(key)) target.delete(key);
    else { other.delete(key); target.add(key); }
    persist(); render();
  }
  function render() {
    const result = validatePentominous(puzzle, edges);
    let html = puzzle.water ? '<defs><pattern id="pentominousWater" width="16" height="8" patternUnits="userSpaceOnUse"><path d="M-4 4Q0 0 4 4T12 4T20 4" fill="none" stroke="#83afc6" stroke-width="1.6"/></pattern></defs>' : '';
    for (const region of result.regions) {
      if (region.shape || region.cells.length < 5) {
        const bad = !region.shape || region.clueMismatch || region.sameShapeNeighbor || region.tooMuchWater;
        const fill = bad ? '#fce8e7' : '#e9f4e9';
        for (const index of region.cells) {
          const r = Math.floor(index / cols), c = index % cols;
          html += `<rect x="${c * size}" y="${r * size}" width="${size}" height="${size}" fill="${fill}"/>`;
        }
      }
    }
    puzzle.water?.forEach((row, r) => [...row].forEach((cell, c) => {
      if (cell === '~') html += `<rect x="${c * size + 2}" y="${r * size + 2}" width="${size - 4}" height="${size - 4}" fill="url(#pentominousWater)" pointer-events="none"/>`;
    }));
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
    for (const key of crosses) {
      const [a, b] = key.split(':').map(Number);
      const x = b - a === 1 ? (b % cols) * size : (a % cols + .5) * size;
      const y = b - a === 1 ? (Math.floor(a / cols) + .5) * size : Math.floor(b / cols) * size;
      html += `<rect x="${x - 9}" y="${y - 9}" width="18" height="18" fill="white"/>`;
      html += `<path d="M${x - 6} ${y - 6}L${x + 6} ${y + 6}M${x + 6} ${y - 6}L${x - 6} ${y + 6}" stroke="#58636f" stroke-width="2.5" stroke-linecap="round"/>`;
    }
    clues.forEach((row, r) => [...row].forEach((clue, c) => {
      if (clue === '.') return;
      html += `<text x="${(c + .5) * size}" y="${(r + .5) * size}" dy=".35em" text-anchor="middle" font-size="25" font-weight="600" fill="#202a36" ${puzzle.water ? 'stroke="white" stroke-width="3" stroke-linejoin="round" paint-order="stroke"' : ''} pointer-events="none">${clue}</text>`;
    }));
    html += `<rect x="1.5" y="1.5" width="${width - 3}" height="${height - 3}" fill="none" stroke="#202a36" stroke-width="3" pointer-events="none"/>`;
    board.innerHTML = html;
    complete.hidden = !result.complete;
    undo.disabled = !ready || !history.length;
    reset.disabled = !ready || !edges.size && !crosses.size;
    const formed = result.regions.filter(region => region.shape && !region.clueMismatch && !region.sameShapeNeighbor && !region.tooMuchWater).length;
    status.textContent = result.complete ? '퍼즐을 완성했습니다.' : `규칙에 맞는 펜토미노 영역 ${formed}개.`;
    if (!preview && ready && owner === account() && result.complete && !completionRecorded) {
      completionRecorded = true;
      window.recordCompletion(puzzleId, snapshot());
    }
  }
  modeButton.addEventListener('click', () => {
    longPressMeans = longPressMeans === 'cross' ? 'line' : 'cross';
    modeButton.textContent = longPressMeans === 'cross' ? '길게 눌러 x 표시' : '길게 눌러 선 긋기';
    modeButton.setAttribute('aria-pressed', String(longPressMeans === 'line'));
  });
  board.addEventListener('contextmenu', event => event.preventDefault());
  board.addEventListener('pointerdown', event => {
    if (!ready || !preview && owner !== account() || event.button !== 0 || press) return;
    const point = position(event), key = edgeAt(point.x, point.y);
    if (!key) return;
    press = { id: event.pointerId, key, x: event.clientX, y: event.clientY, long: false, timer: null };
    press.timer = setTimeout(() => {
      if (!press || press.id !== event.pointerId) return;
      press.long = true;
      toggleMark(key, longPressMeans);
    }, 550);
  });
  window.addEventListener('pointermove', event => {
    if (!press || press.id !== event.pointerId || press.long) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) {
      clearTimeout(press.timer);
      press = null;
    }
  });
  window.addEventListener('pointerup', event => {
    if (!press || press.id !== event.pointerId) return;
    const { key, long, timer, x, y } = press;
    clearTimeout(timer);
    press = null;
    if (!long && Math.hypot(event.clientX - x, event.clientY - y) <= 10) {
      toggleMark(key, longPressMeans === 'cross' ? 'line' : 'cross');
    }
  });
  window.addEventListener('pointercancel', event => {
    if (!press || press.id !== event.pointerId) return;
    clearTimeout(press.timer);
    press = null;
  });
  function revert() {
    if (!ready || !preview && owner !== account() || !history.length) return;
    const previous = history.pop();
    edges = new Set(previous.lines);
    crosses = new Set(previous.crosses);
    persist(); render();
  }
  undo.addEventListener('click', revert);
  reset.addEventListener('click', () => {
    if (!ready || !preview && owner !== account() || !edges.size && !crosses.size) return;
    checkpoint(); edges.clear(); crosses.clear(); persist(); render();
  });
  function init() {
    const nextOwner = account();
    if (ready && owner === nextOwner) return;
    owner = nextOwner;
    ready = false;
    if (press) clearTimeout(press.timer);
    press = null;
    history.length = 0;
    completionRecorded = false;
    let saved = null;
    try { saved = window.loadLocalState(puzzleId); } catch {}
    const parsed = parsePentominousState(puzzle, saved, puzzleId);
    edges = parsed?.lines || new Set();
    crosses = parsed?.crosses || new Set();
    ready = true;
    render();
    window.initCloudBtns();
  }
  if (!preview) {
    window.handleCloudSave = () => {
      if (ready && owner === account()) return window.saveProgressCloud(puzzleId, snapshot());
    };
    window.handleCloudLoad = async () => {
      if (!ready || owner !== account()) return;
      const requestedOwner = owner, before = JSON.stringify(snapshot());
      const saved = await window.loadProgressCloud(puzzleId);
      if (saved == null || requestedOwner !== account() || before !== JSON.stringify(snapshot())) return;
      const parsed = parsePentominousState(puzzle, saved, puzzleId);
      if (!parsed) { window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.'); return; }
      checkpoint();
      edges = parsed.lines;
      crosses = parsed.crosses;
      persist();
      render();
    };
    init();
    window.puzzleAuthReady.then(init);
    window.addEventListener('puzzle-auth-ready', init);
  }
  render();
}

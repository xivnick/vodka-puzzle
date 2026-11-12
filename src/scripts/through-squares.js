import { edgeKey, inspectThroughSquares, parseThroughSquaresState } from '../lib/through-squares.js';

const game = document.getElementById('throughSquaresGame');
if (game) {
  const puzzle = JSON.parse(game.dataset.puzzle), id = game.dataset.puzzleId, n = puzzle.size;
  const board = document.getElementById('throughSquaresBoard'), status = document.getElementById('throughSquaresStatus');
  const erase = document.getElementById('throughSquaresErase'), reset = document.getElementById('throughSquaresReset');
  const complete = document.getElementById('throughSquaresComplete');
  let edges = new Set(), selected = null, ready = false, completionRecorded = false;
  const state = () => ({ version: 1, puzzleId: id, edges: [...edges] });
  const xy = cell => [(cell % n + .5) * 40, (Math.floor(cell / n) + .5) * 40];
  function persist() {
    try { window.saveLocalState(id, state()); }
    catch { window.showToast?.('브라우저에 저장하지 못했습니다.'); }
  }
  function render() {
    const result = inspectThroughSquares(puzzle, edges);
    let html = '<rect width="520" height="520" fill="white"/>';
    puzzle.squares.forEach(([r, c], index) => {
      const visits = result.visits[index];
      const fill = visits === 1 ? '#c7dfc7' : visits > 1 ? '#edbaba' : '#c4c4c6';
      html += `<rect x="${c * 40 + 9}" y="${r * 40 + 9}" width="62" height="62" fill="${fill}"/>`;
    });
    for (const cell of result.conflicts) {
      const [x, y] = xy(cell);
      html += `<rect x="${x - 20}" y="${y - 20}" width="40" height="40" fill="#edbaba" fill-opacity=".7"/>`;
    }
    if (selected !== null) {
      const [x, y] = xy(selected);
      html += `<rect x="${x - 20}" y="${y - 20}" width="40" height="40" fill="#4a6fa5" fill-opacity=".16"/>`;
    }
    for (let i = 0; i <= n; i++) html += `<path d="M0 ${i * 40}H520 M${i * 40} 0V520" fill="none" stroke="#b8b8b8" stroke-width="1.3" stroke-dasharray="3 3"/>`;
    for (const key of edges) {
      const [a, b] = key.split(':').map(Number), [x, y] = xy(a), [u, v] = xy(b);
      html += `<path d="M${x} ${y}L${u} ${v}" fill="none" stroke="#4a6fa5" stroke-width="5" stroke-linecap="round"/>`;
    }
    for (const [cell, label] of [[puzzle.start, 'S'], [puzzle.finish, 'F']]) {
      const [x, y] = xy(cell);
      html += `<text x="${x}" y="${y}" dy=".35em" text-anchor="middle" font-size="25" fill="#222" stroke="white" stroke-width="3" paint-order="stroke">${label}</text>`;
    }
    board.innerHTML = html;
    erase.disabled = !ready || selected === null || ![...edges].some(key => key.split(':').map(Number).includes(selected));
    reset.disabled = !ready || !edges.size;
    complete.hidden = !result.complete;
    status.textContent = result.complete ? '퍼즐을 완성했습니다.' : result.conflicts.size ? '규칙에 어긋나는 칸이 있습니다.' : '';
    if (!result.complete) completionRecorded = false;
    if (ready && result.complete && window.puzzlePage?.published && !completionRecorded) {
      completionRecorded = true; window.recordCompletion(id, state());
    }
  }
  function cellAt(event) {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(board.getScreenCTM().inverse());
    const c = Math.floor(point.x / 40), r = Math.floor(point.y / 40);
    return c >= 0 && c < n && r >= 0 && r < n ? r * n + c : null;
  }
  function straightEdges(a, b) {
    if (a === null || b === null || a === b) return [];
    const sameRow = Math.floor(a / n) === Math.floor(b / n);
    if (!sameRow && a % n !== b % n) return [];
    const step = Math.sign(b - a) * (sameRow ? 1 : n), keys = [];
    for (let cell = a; cell !== b; cell += step) keys.push(edgeKey(cell, cell + step));
    return keys;
  }
  const apply = (keys, removing) => keys.forEach(key => removing ? edges.delete(key) : edges.add(key));
  board.addEventListener('click', event => {
    if (!ready) return;
    const current = cellAt(event); if (current === null) return;
    const keys = straightEdges(selected, current);
    apply(keys, keys.every(key => edges.has(key)));
    selected = selected === current ? null : current;
    persist(); render();
  });
  erase.addEventListener('click', () => {
    if (!ready || selected === null) return;
    edges = new Set([...edges].filter(key => !key.split(':').map(Number).includes(selected)));
    persist(); render();
  });
  reset.addEventListener('click', () => {
    if (!ready || !edges.size || !confirm('그린 선을 모두 지울까요?')) return;
    edges.clear(); selected = null; persist(); render();
  });
  function restore(saved) {
    edges = parseThroughSquaresState(puzzle, saved, id) || new Set();
    selected = null; completionRecorded = false;
  }
  function init() {
    let saved = null;
    try { saved = window.loadLocalState(id); } catch {}
    restore(saved); ready = true; render();
  }
  window.handleCloudSave = () => { if (ready && window.puzzlePage?.published) return window.saveProgressCloud(id, state()); };
  window.handleCloudLoad = async () => {
    if (!ready || !window.puzzlePage?.published) return;
    const owner = window.puzzleAccount?.user?.id, before = JSON.stringify(state());
    const saved = await window.loadProgressCloud(id);
    if (saved == null || owner !== window.puzzleAccount?.user?.id || before !== JSON.stringify(state())) return;
    if (!parseThroughSquaresState(puzzle, saved, id)) { window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.'); return; }
    restore(saved); persist(); render();
  };
  window.checkComplete = render;
  window.startLocalPuzzle(id, init, init);
}

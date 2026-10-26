import { inspectArrowMaze, parseArrowMazeState } from '../lib/arrow-maze.js';

const game = document.getElementById('arrowMazeGame');
if (game) {
  const puzzle = JSON.parse(game.dataset.puzzle), puzzleId = game.dataset.puzzleId;
  const count = puzzle.size ** 2, board = document.getElementById('arrowMazeBoard');
  const textMeasure = document.createElement('canvas').getContext('2d');
  const shapes = puzzle.directions.map(direction => {
    if (!direction) return { markup: '<circle cx="50" cy="50" r="43"/>', x: 50, y: 50 };
    const diagonal = direction[0] && direction[1];
    const points = diagonal
      ? [[8, 50], [50, 8], [80, 38], [92, 26], [92, 92], [26, 92], [38, 80]]
      : [[8, 25], [48, 25], [48, 8], [92, 50], [48, 92], [48, 75], [8, 75]];
    // Center labels on the filled polygon, including its arrowhead and tail.
    let area = 0, cx = 0, cy = 0;
    points.forEach(([x, y], index) => {
      const [nx, ny] = points[(index + 1) % points.length], cross = x * ny - nx * y;
      area += cross; cx += (x + nx) * cross; cy += (y + ny) * cross;
    });
    const angle = Math.atan2(direction[0], direction[1]) - (diagonal ? Math.PI / 4 : 0);
    const dx = cx / (3 * area) - 50, dy = cy / (3 * area) - 50;
    return {
      markup: `<polygon points="${points.map(point => point.join(',')).join(' ')}" transform="rotate(${angle * 180 / Math.PI} 50 50)"/>`,
      x: 50 + dx * Math.cos(angle) - dy * Math.sin(angle),
      y: 50 + dx * Math.sin(angle) + dy * Math.cos(angle),
    };
  });
  const pad = [...game.querySelectorAll('[data-number]')];
  const erase = document.getElementById('arrowMazeErase');
  const reset = document.getElementById('arrowMazeReset'), complete = document.getElementById('arrowMazeComplete');
  const status = document.getElementById('arrowMazeStatus');
  let values, selected = 1, ready = false, completionRecorded = false;
  let keyBuffer = '', keyTimer;
  const state = () => ({ version: 1, puzzleId, values: [...values] });
  const clearBuffer = () => { clearTimeout(keyTimer); keyBuffer = ''; };
  function persist() {
    try { window.saveLocalState(puzzleId, state()); }
    catch { window.showToast?.('브라우저에 저장하지 못했습니다.'); }
  }
  function render() {
    const result = inspectArrowMaze(puzzle, values);
    const focused = board.contains(document.activeElement);
    board.innerHTML = values.map((value, index) => {
      const r = Math.floor(index / puzzle.size), c = index % puzzle.size, shape = shapes[index];
      const fixed = Object.hasOwn(puzzle.givens, index), conflict = result.conflicts.has(index);
      const fill = conflict ? '#f5d0d0' : index === selected ? '#e8edf5' : '#fff';
      const color = conflict ? '#b05050' : fixed ? '#222' : '#4a6fa5';
      const content = value ? `<text x="0" y="0" font-size="30" font-weight="${fixed ? 700 : 500}">${value}</text>`
        : '';
      const label = `${r + 1}행 ${c + 1}열, ${fixed ? '고정 숫자 ' : ''}${value || '빈칸'}${conflict ? ', 규칙 오류' : ''}`;
      return `<g data-cell="${index}" transform="translate(${c * 100} ${r * 100})" role="button" tabindex="${selected === index ? 0 : -1}" aria-label="${label}" aria-pressed="${index === selected}" style="cursor:${fixed ? 'default' : 'pointer'}"><rect width="100" height="100" fill="transparent"/><g fill="${fill}" stroke="#333" stroke-width="2.3" stroke-linejoin="miter">${shape.markup}</g><g data-label-center="${shape.x},${shape.y}" fill="${color}" text-anchor="middle" pointer-events="none">${content}</g></g>`;
    }).join('');
    centerLabels();
    if (focused) board.querySelector(`[data-cell="${selected}"]`)?.focus({ preventScroll: true });
    pad.forEach(button => {
      button.disabled = !ready || Object.hasOwn(puzzle.givens, selected);
    });
    erase.disabled = !ready || Object.hasOwn(puzzle.givens, selected) || !values[selected];
    reset.disabled = !ready || values.every((value, index) => value === (puzzle.givens[index] || 0));
    complete.hidden = !result.complete;
    if (!result.complete) completionRecorded = false;
    if (ready && result.complete && window.puzzlePage?.published && !completionRecorded) {
      completionRecorded = true; window.recordCompletion(puzzleId, state());
    }
  }
  function centerLabels() {
    board.querySelectorAll('[data-label-center]').forEach(label => {
      if (!label.children.length) return;
      const [x, y] = label.dataset.labelCenter.split(',').map(Number);
      // SVG bounds include font padding. Measure the visible digits instead.
      const bounds = [...label.children].map(text => {
        const style = getComputedStyle(text);
        textMeasure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const metrics = textMeasure.measureText(text.textContent);
        const tx = Number(text.getAttribute('x')) - metrics.width / 2, ty = Number(text.getAttribute('y'));
        return { left: tx - metrics.actualBoundingBoxLeft, right: tx + metrics.actualBoundingBoxRight,
          top: ty - metrics.actualBoundingBoxAscent, bottom: ty + metrics.actualBoundingBoxDescent };
      });
      const cx = (Math.min(...bounds.map(b => b.left)) + Math.max(...bounds.map(b => b.right))) / 2;
      const cy = (Math.min(...bounds.map(b => b.top)) + Math.max(...bounds.map(b => b.bottom))) / 2;
      label.setAttribute('transform', `translate(${x - cx} ${y - cy})`);
    });
  }
  function select(index, focus = false) {
    clearBuffer(); selected = index; render();
    if (focus) board.querySelector(`[data-cell="${selected}"]`)?.focus({ preventScroll: true });
  }
  function input(value) {
    if (!ready || Object.hasOwn(puzzle.givens, selected)) return;
    values[selected] = value;
    persist(); render();
    status.textContent = `${Math.floor(selected / puzzle.size) + 1}행 ${selected % puzzle.size + 1}열, ${value || '지웠습니다.'}`;
  }
  board.addEventListener('click', event => {
    const cell = event.target.closest('[data-cell]');
    if (cell && ready) select(Number(cell.dataset.cell), true);
  });
  pad.forEach(button => button.addEventListener('click', () => { clearBuffer(); input(Number(button.dataset.number)); }));
  erase.addEventListener('click', () => { clearBuffer(); input(0); });
  reset.addEventListener('click', () => {
    if (!ready || !confirm('입력한 숫자를 초기화할까요?')) return;
    clearBuffer(); values = Array.from({ length: count }, (_, index) => puzzle.givens[index] || 0);
    persist(); render();
  });
  game.addEventListener('keydown', event => {
    if (!ready || event.ctrlKey || event.metaKey || event.altKey) return;
    if (!event.target.closest('#arrowMazeBoard')) return;
    const r = Math.floor(selected / puzzle.size), c = selected % puzzle.size, n = puzzle.size;
    const moves = { ArrowUp: Math.max(0, r - 1) * n + c, ArrowDown: Math.min(n - 1, r + 1) * n + c, ArrowLeft: r * n + Math.max(0, c - 1), ArrowRight: r * n + Math.min(n - 1, c + 1) };
    if (event.key in moves) { event.preventDefault(); select(moves[event.key], true); }
    else if (/^\d$/.test(event.key)) {
      event.preventDefault();
      const number = Number(keyBuffer + event.key); clearBuffer();
      if (number >= 10 && number <= count) input(number);
      else if (event.key === '1') { keyBuffer = '1'; keyTimer = setTimeout(() => { keyBuffer = ''; input(1); }, 450); }
      else if (event.key !== '0') input(Number(event.key));
    } else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); clearBuffer(); input(0); }
  });
  function restore(saved) {
    clearBuffer();
    const parsed = parseArrowMazeState(puzzle, saved, puzzleId);
    values = parsed?.values || Array.from({ length: count }, (_, index) => puzzle.givens[index] || 0);
    completionRecorded = false;
  }
  function init() {
    let saved = null;
    try { saved = window.loadLocalState(puzzleId); } catch {}
    restore(saved); ready = true; render();
  }
  window.handleCloudSave = () => { if (ready && window.puzzlePage?.published) return window.saveProgressCloud(puzzleId, state()); };
  window.handleCloudLoad = async () => {
    if (!ready || !window.puzzlePage?.published) return;
    const owner = window.puzzleAccount?.user?.id, before = JSON.stringify(state());
    const saved = await window.loadProgressCloud(puzzleId);
    if (saved == null || owner !== window.puzzleAccount?.user?.id || before !== JSON.stringify(state())) return;
    if (!parseArrowMazeState(puzzle, saved, puzzleId)) { window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.'); return; }
    restore(saved); persist(); render();
  };
  window.checkComplete = render;
  window.startLocalPuzzle(puzzleId, init, init);
  document.fonts.ready.then(centerLabels);
}

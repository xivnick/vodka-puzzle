import { inspectArrowMaze, parseArrowMazeState } from '../lib/arrow-maze.js';

const game = document.getElementById('arrowMazeGame');
if (game) {
  const puzzle = JSON.parse(game.dataset.puzzle), puzzleId = game.dataset.puzzleId;
  const count = puzzle.size ** 2, board = document.getElementById('arrowMazeBoard');
  const pad = [...game.querySelectorAll('[data-number]')];
  const memoButton = document.getElementById('arrowMazeMemo'), erase = document.getElementById('arrowMazeErase');
  const reset = document.getElementById('arrowMazeReset'), complete = document.getElementById('arrowMazeComplete');
  const status = document.getElementById('arrowMazeStatus');
  let values, notes, selected = 1, memo = false, ready = false, completionRecorded = false;
  let keyBuffer = '', keyTimer;
  const state = () => ({ version: 1, puzzleId, values: [...values], notes: notes.map(row => [...row]) });
  const clearBuffer = () => { clearTimeout(keyTimer); keyBuffer = ''; };
  function persist() {
    try { window.saveLocalState(puzzleId, state()); }
    catch { window.showToast?.('브라우저에 저장하지 못했습니다.'); }
  }
  function render() {
    const result = inspectArrowMaze(puzzle, values);
    const focused = board.contains(document.activeElement);
    board.innerHTML = values.map((value, index) => {
      const r = Math.floor(index / puzzle.size), c = index % puzzle.size, direction = puzzle.directions[index];
      const fixed = Object.hasOwn(puzzle.givens, index), conflict = result.conflicts.has(index);
      const fill = conflict ? '#f5d0d0' : index === selected ? '#e8edf5' : '#fff';
      const color = conflict ? '#b05050' : fixed ? '#222' : '#4a6fa5';
      const angle = direction ? Math.atan2(direction[0], direction[1]) * 180 / Math.PI : 0;
      const diagonal = direction && direction[0] && direction[1];
      const shape = direction
        ? diagonal
          ? `<path d="M8 50L50 8L80 38L92 26V92H26L38 80Z" transform="rotate(${angle - 45} 50 50)"/>`
          : `<path d="M8 25H48V8L92 50L48 92V75H8Z" transform="rotate(${angle} 50 50)"/>`
        : '<circle cx="50" cy="50" r="43"/>';
      // Compact candidates stay inside the shared center of all arrow directions.
      const candidates = notes[index].slice().sort((a, b) => a - b);
      const content = value ? `<text x="50" y="51" font-size="30" font-weight="${fixed ? 700 : 500}">${value}</text>`
        : candidates.map((number, position) => `<text x="${35 + position % 4 * 10}" y="${35 + Math.floor(position / 4) * 10}" font-size="8">${number}</text>`).join('');
      const label = `${r + 1}행 ${c + 1}열, ${fixed ? '고정 숫자 ' : ''}${value || (candidates.length ? '메모 ' + candidates.join(', ') : '빈칸')}${conflict ? ', 규칙 오류' : ''}`;
      return `<g data-cell="${index}" transform="translate(${c * 100} ${r * 100})" role="button" tabindex="${selected === index ? 0 : -1}" aria-label="${label}" aria-pressed="${index === selected}" style="cursor:${fixed ? 'default' : 'pointer'}"><rect width="100" height="100" fill="transparent"/><g fill="${fill}" stroke="#333" stroke-width="2.3" stroke-linejoin="miter">${shape}</g><g fill="${color}" text-anchor="middle" dominant-baseline="central" pointer-events="none">${content}</g></g>`;
    }).join('');
    if (focused) board.querySelector(`[data-cell="${selected}"]`)?.focus({ preventScroll: true });
    pad.forEach(button => {
      button.disabled = !ready || Object.hasOwn(puzzle.givens, selected);
      button.classList.toggle('used', values.includes(Number(button.dataset.number)));
    });
    memoButton.setAttribute('aria-pressed', String(memo));
    erase.disabled = !ready || Object.hasOwn(puzzle.givens, selected) || !values[selected] && !notes[selected].length;
    reset.disabled = !ready || values.every((value, index) => value === (puzzle.givens[index] || 0) && !notes[index].length);
    complete.hidden = !result.complete;
    if (!result.complete) completionRecorded = false;
    if (ready && result.complete && window.puzzlePage?.published && !completionRecorded) {
      completionRecorded = true; window.recordCompletion(puzzleId, state());
    }
  }
  function select(index, focus = false) {
    clearBuffer(); selected = index; render();
    if (focus) board.querySelector(`[data-cell="${selected}"]`)?.focus({ preventScroll: true });
  }
  function input(value) {
    if (!ready || Object.hasOwn(puzzle.givens, selected)) return;
    if (memo && value) {
      values[selected] = 0;
      notes[selected] = notes[selected].includes(value) ? notes[selected].filter(number => number !== value) : [...notes[selected], value];
    } else { values[selected] = value; notes[selected] = []; }
    persist(); render();
    status.textContent = `${Math.floor(selected / puzzle.size) + 1}행 ${selected % puzzle.size + 1}열, ${value ? `${memo ? '메모 ' : ''}${value}` : '지웠습니다.'}`;
  }
  board.addEventListener('click', event => {
    const cell = event.target.closest('[data-cell]');
    if (cell && ready) select(Number(cell.dataset.cell), true);
  });
  pad.forEach(button => button.addEventListener('click', () => { clearBuffer(); input(Number(button.dataset.number)); }));
  memoButton.addEventListener('click', () => { clearBuffer(); memo = !memo; render(); });
  erase.addEventListener('click', () => { clearBuffer(); input(0); });
  reset.addEventListener('click', () => {
    if (!ready || !confirm('입력한 숫자와 메모를 초기화할까요?')) return;
    clearBuffer(); values = Array.from({ length: count }, (_, index) => puzzle.givens[index] || 0);
    notes = Array.from({ length: count }, () => []); persist(); render();
  });
  game.addEventListener('keydown', event => {
    if (!ready || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.toLowerCase() === 'm') { event.preventDefault(); memoButton.click(); return; }
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
    notes = parsed?.notes || Array.from({ length: count }, () => []);
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
}

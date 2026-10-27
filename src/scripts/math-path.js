import { inspectMathPath, parseMathPathState, playableCells } from '../lib/math-path.js';

const game = document.getElementById('mathPathGame');
if (game) {
  const puzzle = JSON.parse(game.dataset.puzzle), puzzleId = game.dataset.puzzleId;
  const count = puzzle.size ** 2, board = document.getElementById('mathPathBoard');
  const playable = playableCells(puzzle), playableSet = new Set(playable), max = playable.length;
  const regionAt = new Map(puzzle.regions.flatMap((region, index) => region.cells.map(cell => [cell, index])));
  // Draw shared edges once, above all cell fills, so no later cell clips a border.
  const thinEdges = [], thickEdges = [];
  for (let row = 0; row <= puzzle.size; row++) {
    for (let column = 0; column < puzzle.size; column++) {
      const above = row ? regionAt.get((row - 1) * puzzle.size + column) : undefined;
      const below = row < puzzle.size ? regionAt.get(row * puzzle.size + column) : undefined;
      if (above === undefined && below === undefined) continue;
      (above === below ? thinEdges : thickEdges).push(`M${column * 100} ${row * 100}h100`);
    }
  }
  for (let column = 0; column <= puzzle.size; column++) {
    for (let row = 0; row < puzzle.size; row++) {
      const left = column ? regionAt.get(row * puzzle.size + column - 1) : undefined;
      const right = column < puzzle.size ? regionAt.get(row * puzzle.size + column) : undefined;
      if (left === undefined && right === undefined) continue;
      (left === right ? thinEdges : thickEdges).push(`M${column * 100} ${row * 100}v100`);
    }
  }
  const borders = `<g fill="none" stroke="#292929" stroke-linecap="square" stroke-linejoin="miter" pointer-events="none"><path d="${thinEdges.join('')}" stroke-width="1.2"/><path d="${thickEdges.join('')}" stroke-width="4"/><rect width="600" height="600" stroke-width="4"/></g>`;
  const textMeasure = document.createElement('canvas').getContext('2d');
  const pad = [...game.querySelectorAll('[data-number]')];
  const memoButton = document.getElementById('mathPathMemo'), erase = document.getElementById('mathPathErase');
  const reset = document.getElementById('mathPathReset'), complete = document.getElementById('mathPathComplete');
  const status = document.getElementById('mathPathStatus');
  let values, notes, selected = 0, memo = false, ready = false, completionRecorded = false;
  let keyBuffer = '', keyTimer;
  const state = () => ({ version: 1, puzzleId, values: [...values], notes: notes.map(row => [...row]) });
  const clearBuffer = () => { clearTimeout(keyTimer); keyBuffer = ''; };
  function persist() {
    try { window.saveLocalState(puzzleId, state()); }
    catch { window.showToast?.('브라우저에 저장하지 못했습니다.'); }
  }
  function render() {
    const result = inspectMathPath(puzzle, values);
    const focused = board.contains(document.activeElement);
    board.innerHTML = '<rect width="600" height="600" fill="#222"/>' + playable.map(index => {
      const value = values[index], r = Math.floor(index / puzzle.size), c = index % puzzle.size;
      const region = puzzle.regions[regionAt.get(index)], conflict = result.conflicts.has(index);
      const fill = conflict ? '#f5d0d0' : index === selected ? '#e8edf5' : '#fff';
      const color = conflict ? '#b05050' : '#4a6fa5';
      const candidates = notes[index].slice().sort((a, b) => a - b);
      const clue = region.cells[0] === index && region.target !== undefined
        ? `<text x="9" y="23" font-size="20" fill="#222">${region.target}${region.operation || ''}</text>` : '';
      const content = value ? `<text data-center="50,50" font-size="34" font-weight="500">${value}</text>`
        : candidates.map((number, position) => {
          const row = Math.floor(position / 5), columns = Math.min(5, candidates.length - row * 5);
          const x = 50 + (position % 5 - (columns - 1) / 2) * 17;
          const y = 55 + (row - (Math.ceil(candidates.length / 5) - 1) / 2) * 11;
          return `<text data-center="${x},${y}" font-size="10">${number}</text>`;
        }).join('');
      const label = `${r + 1}행 ${c + 1}열, ${value || (candidates.length ? '메모 ' + candidates.join(', ') : '빈칸')}${clue ? ', 영역 단서 ' + region.target + (region.operation || '') : ''}${conflict ? ', 규칙 오류' : ''}`;
      return `<g data-cell="${index}" transform="translate(${c * 100} ${r * 100})" role="button" tabindex="${selected === index ? 0 : -1}" aria-label="${label}" aria-pressed="${index === selected}" style="cursor:pointer"><rect width="100" height="100" fill="${fill}"/><g pointer-events="none">${clue}<g fill="${color}">${content}</g></g></g>`;
    }).join('') + borders;
    centerNumbers();
    if (focused) board.querySelector(`[data-cell="${selected}"]`)?.focus({ preventScroll: true });
    pad.forEach(button => {
      button.disabled = !ready || !playableSet.has(selected);
    });
    memoButton.setAttribute('aria-pressed', String(memo));
    erase.disabled = !ready || !playableSet.has(selected) || !values[selected] && !notes[selected].length;
    reset.disabled = !ready || values.every((value, index) => value === (0) && !notes[index].length);
    complete.hidden = !result.complete;
    if (!result.complete) completionRecorded = false;
    if (ready && result.complete && window.puzzlePage?.published && !completionRecorded) {
      completionRecorded = true; window.recordCompletion(puzzleId, state());
    }
  }
  function centerNumbers() {
    board.querySelectorAll('[data-center]').forEach(text => {
      const [x, y] = text.dataset.center.split(',').map(Number);
      const style = getComputedStyle(text);
      textMeasure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const metrics = textMeasure.measureText(text.textContent);
      // Center the visible glyphs, independently of baseline and font side bearings.
      text.setAttribute('x', x - (metrics.actualBoundingBoxRight - metrics.actualBoundingBoxLeft) / 2);
      text.setAttribute('y', y + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2);
    });
  }
  function select(index, focus = false) {
    clearBuffer(); selected = index; render();
    if (focus) board.querySelector(`[data-cell="${selected}"]`)?.focus({ preventScroll: true });
  }
  function input(value) {
    if (!ready || !playableSet.has(selected)) return;
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
    clearBuffer(); values = Array.from({ length: count }, (_, index) => 0);
    notes = Array.from({ length: count }, () => []); persist(); render();
  });
  game.addEventListener('keydown', event => {
    if (!ready || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.toLowerCase() === 'm') { event.preventDefault(); memoButton.click(); return; }
    if (!event.target.closest('#mathPathBoard')) return;
    const r = Math.floor(selected / puzzle.size), c = selected % puzzle.size, n = puzzle.size;
    const moves = { ArrowUp: Math.max(0, r - 1) * n + c, ArrowDown: Math.min(n - 1, r + 1) * n + c, ArrowLeft: r * n + Math.max(0, c - 1), ArrowRight: r * n + Math.min(n - 1, c + 1) };
    if (event.key in moves) {
      event.preventDefault();
      const offsets = { ArrowUp: -n, ArrowDown: n, ArrowLeft: -1, ArrowRight: 1 };
      let target = moves[event.key];
      while (target >= 0 && target < count && !playableSet.has(target)) {
        if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && Math.floor((target + offsets[event.key]) / n) !== r) return;
        target += offsets[event.key];
      }
      if (playableSet.has(target)) select(target, true);
    }
    else if (/^\d$/.test(event.key)) {
      event.preventDefault();
      const number = Number(keyBuffer + event.key); clearBuffer();
      if (number >= 10 && number <= max) input(number);
      else if (['1', '2', '3'].includes(event.key)) { keyBuffer = event.key; keyTimer = setTimeout(() => { const value = Number(keyBuffer); keyBuffer = ''; input(value); }, 450); }
      else if (event.key !== '0') input(Number(event.key));
    } else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); clearBuffer(); input(0); }
  });
  function restore(saved) {
    clearBuffer();
    const parsed = parseMathPathState(puzzle, saved, puzzleId);
    values = parsed?.values || Array.from({ length: count }, (_, index) => 0);
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
    if (!parseMathPathState(puzzle, saved, puzzleId)) { window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.'); return; }
    restore(saved); persist(); render();
  };
  window.checkComplete = render;
  window.startLocalPuzzle(puzzleId, init, init);
  document.fonts.ready.then(centerNumbers);
}

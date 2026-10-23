import { directions, sourcesFor, rayCells, analyzeArrows, parseArrowsState } from '../lib/arrows.js';

const game = document.getElementById('arrowsGame');
if (game) {
  const puzzle = JSON.parse(game.dataset.puzzle), puzzleId = game.dataset.puzzleId;
  const sources = sourcesFor(puzzle), n = puzzle.cells.length, size = 40;
  const board = document.getElementById('arrowsBoard');
  const reset = document.getElementById('arrowsReset'), erase = document.getElementById('arrowsErase');
  const complete = document.getElementById('arrowsComplete'), status = document.getElementById('arrowsStatus');
  let arrows = sources.map(() => null), selected = null, ready = false, owner = null, completionRecorded = false;
  const account = () => window.puzzleAccount?.user?.id || 'guest';
  const editable = () => ready && owner === account();
  const snapshot = () => ({ version: 1, puzzleId, arrows: [...arrows] });
  board.setAttribute('viewBox', `-2 -2 ${(n + 2) * size + 4} ${(n + 2) * size + 4}`);
  function persist() {
    if (!editable()) return;
    try { window.saveLocalState(puzzleId, snapshot()); }
    catch { window.showToast?.('브라우저에 저장하지 못했습니다.'); }
  }
  function render() {
    const result = analyzeArrows(puzzle, arrows);
    const ray = new Set(selected === null ? [] : rayCells(puzzle, sources[selected], arrows[selected]).map(([r, c]) => `${r}:${c}`));
    const candidates = new Map();
    if (selected !== null) directions.forEach((direction, d) => {
      const first = rayCells(puzzle, sources[selected], d)[0];
      if (first) candidates.set(first.join(':'), d);
    });
    let html = '';
    puzzle.cells.forEach((row, r) => row.forEach((value, c) => {
      const x = (c + 1) * size, y = (r + 1) * size, count = result.counts[r][c];
      const d = candidates.get(`${r}:${c}`);
      const fill = d !== undefined ? '#dce8f7' : ray.has(`${r}:${c}`) ? '#edf3fb' : 'white';
      const color = count > value ? '#b33c35' : count === value ? '#3b783e' : '#222';
      const target = d === undefined ? '' : ` data-direction="${d}" role="button" tabindex="0" aria-label="${r + 1}행 ${c + 1}열 숫자 ${value}, ${directions[d].label}쪽 화살표 선택" style="cursor:pointer"`;
      html += `<g${target}><rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${fill}" stroke="#888" stroke-width=".8"/><text x="${x + size / 2}" y="${y + size / 2}" text-anchor="middle" dominant-baseline="central" font-size="23" fill="${color}">${value}</text></g>`;
    }));
    sources.forEach((source, i) => {
      const x = (source.c + 1) * size, y = (source.r + 1) * size;
      const side = source.r === -1 ? '위' : source.r === n ? '아래' : source.c === -1 ? '왼쪽' : '오른쪽';
      const position = source.r === -1 || source.r === n ? source.c + 1 : source.r + 1;
      const direction = directions[arrows[i]];
      html += `<g data-source="${i}" role="button" tabindex="0" aria-label="${side} ${position}번째 칸, ${direction ? direction.label + '쪽 화살표' : '비어 있음'}" aria-pressed="${selected === i}" style="cursor:pointer"><rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${selected === i ? '#dce8f7' : '#fafafa'}" stroke="#888" stroke-width=".8"/>`;
      if (direction) {
        const cx = x + size / 2, cy = y + size / 2;
        html += `<path d="M${cx - 11} ${cy}H${cx + 11}M${cx + 4} ${cy - 7}L${cx + 11} ${cy}L${cx + 4} ${cy + 7}" transform="rotate(${Math.atan2(direction.dr, direction.dc) * 180 / Math.PI} ${cx} ${cy})" fill="none" stroke="#334f72" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>`;
      }
      html += '</g>';
    });
    html += `<rect x="${size}" y="${size}" width="${n * size}" height="${n * size}" fill="none" stroke="#202a36" stroke-width="3" pointer-events="none"/>`;
    const focusedDirection = board.contains(document.activeElement) ? document.activeElement.closest('[data-direction]')?.dataset.direction : null;
    const focused = board.contains(document.activeElement) ? document.activeElement.closest('[data-source]')?.dataset.source : null;
    board.innerHTML = html;
    if (focused != null) board.querySelector(`[data-source="${focused}"]`)?.focus({ preventScroll: true });
    if (focusedDirection != null) board.querySelector(`[data-direction="${focusedDirection}"]`)?.focus({ preventScroll: true });
    erase.disabled = !editable() || selected === null || arrows[selected] === null;
    reset.disabled = !editable() || arrows.every(d => d === null);
    complete.hidden = !result.complete;
    status.textContent = result.complete ? '퍼즐을 완성했습니다.' : selected === null ? '바깥 칸을 선택하세요.' : '색으로 표시된 근처 숫자 칸을 눌러 방향을 선택하세요.';
    if (!result.complete) completionRecorded = false;
    if (editable() && window.puzzlePage?.published && result.complete && !completionRecorded) {
      completionRecorded = true; window.recordCompletion(puzzleId, snapshot());
    }
  }
  function select(event) {
    if (!editable()) return;
    const target = event.target.closest('[data-direction]');
    if (target && selected !== null) {
      const d = Number(target.dataset.direction);
      if (!rayCells(puzzle, sources[selected], d).length) return;
      arrows[selected] = d; persist(); render();
      return;
    }
    const cell = event.target.closest('[data-source]');
    if (!cell) return;
    selected = Number(cell.dataset.source); render();
  }
  board.addEventListener('click', select);
  board.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(event); }
  });
  erase.addEventListener('click', () => {
    if (!editable() || selected === null) return;
    arrows[selected] = null; persist(); render();
  });
  reset.addEventListener('click', () => {
    if (!editable()) return;
    arrows = sources.map(() => null); selected = null; persist(); render();
  });
  function init() {
    const nextOwner = account();
    if (ready && owner === nextOwner) return;
    owner = nextOwner; ready = false; selected = null; completionRecorded = false;
    let saved = null;
    try { saved = window.loadLocalState(puzzleId); } catch {}
    arrows = parseArrowsState(puzzle, saved, puzzleId) || sources.map(() => null);
    ready = true; render(); window.initCloudBtns();
  }
  window.handleCloudSave = () => {
    if (editable() && window.puzzlePage?.published) return window.saveProgressCloud(puzzleId, snapshot());
  };
  window.handleCloudLoad = async () => {
    if (!editable() || !window.puzzlePage?.published) return;
    const requestedOwner = owner, before = JSON.stringify(snapshot());
    const saved = await window.loadProgressCloud(puzzleId);
    if (saved == null || requestedOwner !== account() || before !== JSON.stringify(snapshot())) return;
    const parsed = parseArrowsState(puzzle, saved, puzzleId);
    if (!parsed) { window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.'); return; }
    arrows = parsed; persist(); render();
  };
  window.checkComplete = render;
  init(); window.puzzleAuthReady.then(init); window.addEventListener('puzzle-auth-ready', init);
}

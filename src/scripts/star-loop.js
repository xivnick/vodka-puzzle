import {size, regions, edgeKey, analyze, parseStarLoopState} from '../lib/star-loop.js';
const $ = id => document.getElementById(id);
const game = $('starLoopGame'), board = $('starLoopBoard'), puzzleId = game.dataset.puzzleId;
const regionIds = regions.flat();
let values = Array(size * size).fill(0), edges = new Set(), selected = null, anchor = null;
let mode = 'loop', inputSwapped = false, gesture = null, ready = false, completionRecorded = false;
const state = () => ({version:1, puzzleId, values:[...values], edges:[...edges]});
const xy = i => [(i % size + .5) * 40, (Math.floor(i / size) + .5) * 40];
function persist() {
  if (!ready) return;
  try { window.saveLocalState(puzzleId, state()); }
  catch { window.showToast('브라우저에 저장하지 못했습니다.'); }
}
function render() {
  const {bad, complete} = analyze(values, edges);
  let html = '';
  for (let i = 0; i < values.length; i++) {
    const [x,y] = xy(i);
    html += `<rect x="${x-20}" y="${y-20}" width="40" height="40" fill="${bad.has(i) ? '#fbeaea' : selected === i ? '#e1e9f3' : '#fff'}"/>`;
  }
  for (let n = 1; n < size; n++) html += `<path d="M${n*40} 0V480M0 ${n*40}H480" fill="none" stroke="#aaa" stroke-width="1"/>`;
  for (const key of edges) {
    const [a,b] = key.split(':').map(Number), [x,y] = xy(a), [u,v] = xy(b);
    html += `<path d="M${x} ${y}L${u} ${v}" stroke="${bad.has(a) || bad.has(b) ? '#c34242' : '#4a6fa5'}" stroke-width="5" stroke-linecap="round"/>`;
    const dx = (u-x)/40, dy = (v-y)/40;
    html += `<path data-edge="${key}" d="M${x+dx*8} ${y+dy*8}L${u-dx*8} ${v-dy*8}" stroke="transparent" stroke-width="16"/>`;
  }
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (r < size-1 && regions[r][c] !== regions[r+1][c]) html += `<path d="M${c*40} ${(r+1)*40}h40" stroke="#222" stroke-width="3"/>`;
    if (c < size-1 && regions[r][c] !== regions[r][c+1]) html += `<path d="M${(c+1)*40} ${r*40}v40" stroke="#222" stroke-width="3"/>`;
    const i = r * size + c;
    if (values[i]) {
      const [x,y] = xy(i);
      html += `<text x="${x}" y="${y}" dy=".35em" text-anchor="middle" font-family="sans-serif" font-size="${values[i] === 1 ? 29 : 24}" fill="${bad.has(i) ? '#c34242' : values[i] === 1 ? '#333' : '#999'}" pointer-events="none">${values[i] === 1 ? '★' : '×'}</text>`;
    }
  }
  html += '<rect x="1.5" y="1.5" width="477" height="477" fill="none" stroke="#222" stroke-width="3" pointer-events="none"/>';
  board.innerHTML = html;
  $('starLoopComplete').hidden = !complete;
  $('starLoopStatus').textContent = (selected === null ? '' : `${Math.floor(selected / size)+1}행 ${selected % size+1}열, 영역 ${regionIds[selected]+1}. `)
    + (complete ? '퍼즐을 완성했습니다.' : bad.size ? `규칙에 어긋나는 칸 ${bad.size}개.` : '');
  if (!complete) completionRecorded = false;
  else if (ready && window.puzzlePage?.published && !completionRecorded) {
    completionRecorded = true; window.recordCompletion(puzzleId, state());
  }
}
function cancelPress() {
  if (gesture) clearTimeout(gesture.timer);
  gesture = null;
}
function setMode(next) {
  cancelPress(); mode = next; anchor = null;
  game.querySelectorAll('[data-mode]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  });
}
function toggleInput() {
  cancelPress(); inputSwapped = !inputSwapped;
  $('starLoopNotes').textContent = inputSwapped ? '길게 눌러 ★ 표시' : '길게 눌러 x 표시';
  $('starLoopNotes').setAttribute('aria-pressed', String(inputSwapped));
}
game.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
$('starLoopNotes').addEventListener('click', toggleInput);
function cell(event) {
  const rect = board.getBoundingClientRect();
  const c = Math.floor((event.clientX-rect.left) / rect.width * size), r = Math.floor((event.clientY-rect.top) / rect.height * size);
  return r >= 0 && r < size && c >= 0 && c < size ? r * size + c : null;
}
function straight(a,b) {
  if (a === null || b === null || a === b) return [];
  const sameRow = Math.floor(a / size) === Math.floor(b / size);
  if (!sameRow && a % size !== b % size) return [];
  const step = Math.sign(b-a) * (sameRow ? 1 : size), keys = [];
  for (let i = a; i !== b; i += step) {
    if (values[i] === 1 || values[i+step] === 1) return [];
    keys.push(edgeKey(i,i+step));
  }
  return keys;
}
function mark(i, value) {
  selected = i; anchor = null;
  values[i] = values[i] === value ? 0 : value;
  if (values[i] === 1) for (const key of edges) if (key.split(':').map(Number).includes(i)) edges.delete(key);
  persist(); render();
}
function activateMark(i, secondary = false) {
  mark(i, secondary !== inputSwapped ? 2 : 1);
}
board.addEventListener('pointerdown', event => {
  if (!ready || event.button !== 0 || gesture) return;
  const i = cell(event); if (i === null) return;
  gesture = {id:event.pointerId, start:i, x:event.clientX, y:event.clientY, moved:false, long:false, timer:null, hit:event.target.closest('[data-edge]')?.dataset.edge};
  if (mode === 'star') gesture.timer = setTimeout(() => {
    if (!gesture || gesture.id !== event.pointerId || gesture.moved) return;
    gesture.long = true; activateMark(i, true);
  }, 550);
});
window.addEventListener('pointermove', event => {
  if (!gesture || event.pointerId !== gesture.id) return;
  if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 10) {
    clearTimeout(gesture.timer); gesture.moved = true; anchor = null;
  }
});
function end(event) {
  if (!gesture || event.pointerId !== gesture.id) return;
  const current = gesture; cancelPress();
  if (event.type === 'pointerup' && !current.moved && !current.long
    && Math.hypot(event.clientX - current.x, event.clientY - current.y) <= 10) {
    selected = current.start; board.focus({preventScroll:true});
    if (mode === 'star') { activateMark(current.start); return; }
    if (current.hit && edges.has(current.hit)) { edges.delete(current.hit); anchor = null; }
    else {
      const keys = straight(anchor,current.start);
      if (keys.length) {
        const erase = keys.every(key => edges.has(key));
        keys.forEach(key => erase ? edges.delete(key) : edges.add(key)); anchor = null;
      } else anchor = anchor === current.start ? null : current.start;
    }
  } else if (!current.long) anchor = null;
  persist(); render();
}
window.addEventListener('pointerup', end);
window.addEventListener('pointercancel', end);
window.addEventListener('blur', cancelPress);
board.addEventListener('contextmenu', event => {
  event.preventDefault(); if (!ready) return;
  const i = cell(event); if (i === null) return;
  const alreadyMarked = gesture?.long;
  cancelPress();
  if (!alreadyMarked) {
    if (mode === 'star') activateMark(i, true); else mark(i, 2);
  }
});
function erase() {
  if (!ready || selected === null) return;
  values[selected] = 0;
  for (const key of edges) if (key.split(':').map(Number).includes(selected)) edges.delete(key);
  anchor = null; persist(); render();
}
$('starLoopErase').addEventListener('click', erase);
$('starLoopReset').addEventListener('click', () => {
  if (!ready || !values.some(Boolean) && !edges.size) return;
  if (!confirm('입력한 별, 메모와 선을 모두 초기화할까요?')) return;
  values.fill(0); edges.clear(); selected = null; anchor = null; cancelPress(); persist(); render();
});
board.addEventListener('keydown', event => {
  if (!ready) return;
  const direction = {ArrowLeft:-1, ArrowRight:1, ArrowUp:-size, ArrowDown:size}[event.key];
  if (direction) {
    event.preventDefault();
    if (selected === null) selected = 0;
    else {
      const next = selected + direction;
      if (next >= 0 && next < size * size && (Math.abs(direction) === size || Math.floor(next / size) === Math.floor(selected / size))) selected = next;
    }
    anchor = null; render();
  } else if (event.key.toLowerCase() === 'm') {event.preventDefault(); toggleInput();}
  else if (['Delete','Backspace'].includes(event.key)) {event.preventDefault(); erase();}
  else if (['Enter',' '].includes(event.key) && selected !== null && mode === 'star') {event.preventDefault(); activateMark(selected);}
});
function init() {
  cancelPress(); anchor = null;
  let saved = null;
  try { saved = window.loadLocalState(puzzleId); } catch {}
  const restored = parseStarLoopState(saved,puzzleId);
  values = restored?.values || Array(size * size).fill(0); edges = restored?.edges || new Set();
  ready = true; completionRecorded = false; render(); window.initCloudBtns();
}
window.handleCloudSave = () => window.saveProgressCloud(puzzleId,state());
window.handleCloudLoad = async () => {
  const before = JSON.stringify(state()), owner = window.puzzleAccount?.user?.id;
  const saved = await window.loadProgressCloud(puzzleId);
  if (saved == null || owner !== window.puzzleAccount?.user?.id || before !== JSON.stringify(state())) return;
  const restored = parseStarLoopState(saved,puzzleId);
  if (!restored) {window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.'); return;}
  cancelPress(); anchor = null; values = restored.values; edges = restored.edges; completionRecorded = false;
  persist(); render();
};
window.checkComplete = render;
window.startLocalPuzzle(puzzleId,init,init);

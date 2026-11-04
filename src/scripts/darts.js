import { dartsPuzzles, inspectDarts, parseDartsState, createDartPlacement } from '../lib/darts.js';
const game = document.getElementById('dartsGame');
const puzzleId = game.dataset.puzzleId;
const puzzle = dartsPuzzles[puzzleId];
const regions = [...game.querySelectorAll('.dart-region')];
const complete = document.getElementById('dartsComplete');
const labels = [...game.querySelectorAll('.dart-label')];
const landedDarts = [...game.querySelectorAll('.placed-dart')];
const flights = new Map();
let selected = [], placements = [], ready = false, completionRecorded = false;
function state() { return { version: 1, puzzleId, selected: [...selected], placements: placements.map(hit => ({...hit})) }; }
function persist() {
  if (!ready) return;
  try { window.saveLocalState(puzzleId, state()); }
  catch { window.showToast('브라우저에 저장하지 못했습니다.'); }
}
function render() {
  const result = inspectDarts(selected, puzzle);
  regions.forEach((region, index) => {
    const chosen = selected.includes(index);
    region.classList.toggle('chosen', chosen);
    labels[index].classList.toggle('chosen', chosen);
    if (!chosen) stopFlight(index);
    const hit = placements.find(hit => hit.index === index);
    if (hit) {
      landedDarts[index].setAttribute('transform', `translate(${hit.x} ${hit.y})`);
      landedDarts[index].dataset.angle = hit.angle;
      landedDarts[index].querySelector('use').setAttribute('transform', `rotate(${hit.angle})`);
    }
    landedDarts[index].style.display = chosen && !flights.has(index) ? 'block' : 'none';
    region.setAttribute('aria-pressed', String(chosen));
    region.setAttribute('aria-label', `${puzzle.scores[index]}점, 다트 ${chosen ? '꽂힘, 다시 던지려면 초기화하세요' : '놓기'}`);
    region.setAttribute('aria-disabled', String(!ready));
  });
  game.querySelectorAll('.remaining-dart').forEach((dart, index) => dart.classList.toggle('used', index < selected.length));
  document.getElementById('dartsRemaining').setAttribute('aria-label', `남은 다트 ${puzzle.darts - selected.length}개`);
  const sum = document.getElementById('dartsSum');
  const failed = result.sum > puzzle.target || selected.length === puzzle.darts && !result.solved;
  sum.textContent = result.sum;
  sum.classList.toggle('failed', failed);
  sum.setAttribute('aria-label', `${result.sum}${failed ? ', 목표와 맞지 않습니다' : ''}`);
  document.getElementById('dartsRandom').disabled = !ready;
  complete.hidden = !result.solved;
  if (!result.solved) completionRecorded = false;
  else if (ready && !completionRecorded) {
    completionRecorded = true;
    if (window.puzzlePage?.published) window.recordCompletion(puzzleId, state());
  }
}
function stopFlight(index) {
  const flight = flights.get(index);
  if (!flight) return;
  flights.delete(index);
  flight.animation.cancel();
  flight.overlay.remove();
}
function throwDart(index) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  stopFlight(index);
  const marker = landedDarts[index];
  const matrix = game.querySelector('.darts-board').getScreenCTM();
  if (!matrix) return;
  const position = marker.transform.baseVal.consolidate().matrix;
  const tip = new DOMPoint(position.e, position.f).matrixTransform(matrix);
  const scale = Math.hypot(matrix.a, matrix.b);
  const svgNS = 'http://www.w3.org/2000/svg';
  const overlay = document.createElementNS(svgNS, 'svg');
  overlay.setAttribute('aria-hidden', 'true');
  Object.assign(overlay.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden', zIndex: '2000', color: '#222' });
  const anchor = document.createElementNS(svgNS, 'g');
  anchor.setAttribute('transform', `translate(${tip.x} ${tip.y})`);
  const moving = document.createElementNS(svgNS, 'g');
  const icon = document.createElementNS(svgNS, 'use');
  icon.setAttribute('href', '#dartTip');
  icon.setAttribute('transform', `scale(${scale}) rotate(${marker.dataset.angle})`);
  moving.append(icon); anchor.append(moving); overlay.append(anchor); document.body.append(overlay);
  const dy = Math.max(window.innerHeight + 120 - tip.y, (window.innerWidth - tip.x) * 2.1);
  const dx = dy * Math.tan((20 - Number(marker.dataset.angle)) * Math.PI / 180);
  const animation = moving.animate([
    { transform: `translate(${dx}px, ${dy}px) rotate(14deg) scale(1.65)`, offset: 0 },
    { transform: 'translate(0, 0) rotate(0deg) scale(1)', offset: .8 },
    { transform: 'translate(0, 0) rotate(5deg) scale(1)', offset: .88 },
    { transform: 'translate(0, 0) rotate(-2deg) scale(1)', offset: .95 },
    { transform: 'translate(0, 0) rotate(0deg) scale(1)' },
  ], { duration: 420, easing: 'cubic-bezier(.3,.05,.65,1)' });
  flights.set(index, { overlay, animation });
  animation.onfinish = () => { stopFlight(index); render(); };
}
// Keep the tip aligned with the board if the viewport moves during a throw.
function settleFlights() {
  if (!flights.size) return;
  [...flights.keys()].forEach(stopFlight);
  render();
}
window.addEventListener('resize', settleFlights);
window.addEventListener('scroll', settleFlights, { passive: true, capture: true });
function placeDart(index) {
  if (!ready) return;
  if (selected.includes(index)) {
    window.showToast('이미 다트가 꽂힌 영역입니다. 다시 던지려면 초기화하세요.');
    return;
  }
  if (selected.length >= puzzle.darts) {
    window.showToast('다트를 모두 던졌습니다. 다시 던지려면 초기화하세요.');
    return;
  }
  const hit = createDartPlacement(index, puzzle);
  if (!hit) { window.showToast('던질 위치를 잡지 못했습니다. 다시 눌러주세요.'); return; }
  selected.push(index); placements.push(hit);
  render(); throwDart(index);
  persist(); render();
}
document.getElementById('dartsRandom').addEventListener('click', () => {
  if (!ready) return;
  const available = puzzle.scores.map((_, index) => index).filter(index => !selected.includes(index));
  if (selected.length >= puzzle.darts) {
    window.showToast('다트를 모두 던졌습니다. 다시 던지려면 초기화하세요.');
    return;
  }
  placeDart(available[Math.floor(Math.random() * available.length)]);
});
regions.forEach((region, index) => {
  region.addEventListener('click', () => placeDart(index));
  region.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); placeDart(index); }
  });
});
document.getElementById('dartsReset').addEventListener('click', () => {
  if (!ready || !selected.length) return;
  selected = []; placements = []; persist(); render();
});
function restore(saved) {
  [...flights.keys()].forEach(stopFlight);
  const parsed = parseDartsState(saved, puzzleId);
  selected = parsed?.selected || []; placements = parsed?.placements || []; completionRecorded = false;
}
window.handleCloudSave = () => window.saveProgressCloud(puzzleId, state());
window.handleCloudLoad = async () => {
  const saved = await window.loadProgressCloud(puzzleId);
  if (saved == null) return;
  if (!parseDartsState(saved, puzzleId)) { window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.'); return; }
  restore(saved); persist(); render();
};
function init() {
  if (ready) return;
  let saved = null;
  try { saved = window.loadLocalState(puzzleId); } catch {}
  restore(saved); ready = true; render(); window.initCloudBtns();
}
render();
window.startLocalPuzzle(puzzleId, init, () => { ready = false; init(); });

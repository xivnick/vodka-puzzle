import { dartsPuzzles, inspectDarts, parseDartsState } from '../lib/darts.js';
const game = document.getElementById('dartsGame');
const puzzleId = game.dataset.puzzleId;
const puzzle = dartsPuzzles[puzzleId];
const regions = [...game.querySelectorAll('.dart-region')];
const complete = document.getElementById('dartsComplete');
const landedDarts = [...game.querySelectorAll('.placed-dart')];
const flights = new Map();
let selected = [], ready = false, completionRecorded = false;
function state() { return { version: 1, puzzleId, selected: [...selected] }; }
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
    if (!chosen) stopFlight(index);
    landedDarts[index].style.display = chosen && !flights.has(index) ? 'block' : 'none';
    region.setAttribute('aria-pressed', String(chosen));
    region.setAttribute('aria-label', `${puzzle.scores[index]}점, 다트 ${chosen ? '지우기' : '놓기'}`);
    region.setAttribute('aria-disabled', String(!ready || !chosen && selected.length === puzzle.darts));
  });
  game.querySelectorAll('.remaining-dart').forEach((dart, index) => dart.classList.toggle('used', index < selected.length));
  document.getElementById('dartsRemaining').setAttribute('aria-label', `남은 다트 ${puzzle.darts - selected.length}개`);
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
  Object.assign(overlay.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden', zIndex: '2000', color: '#4a6fa5' });
  const anchor = document.createElementNS(svgNS, 'g');
  anchor.setAttribute('transform', `translate(${tip.x} ${tip.y})`);
  const moving = document.createElementNS(svgNS, 'g');
  const icon = document.createElementNS(svgNS, 'use');
  icon.setAttribute('href', '#dartTip');
  icon.setAttribute('transform', `scale(${scale}) rotate(${marker.dataset.angle})`);
  moving.append(icon); anchor.append(moving); overlay.append(anchor); document.body.append(overlay);
  const dx = window.innerWidth + 120 - tip.x;
  const dy = -Math.max(180, dx * .85);
  const animation = moving.animate([
    { transform: `translate(${dx}px, ${dy}px) rotate(-14deg) scale(1.65)`, offset: 0 },
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
function toggle(index) {
  if (!ready) return;
  const placing = !selected.includes(index);
  if (!placing) selected = selected.filter(value => value !== index);
  else {
    if (selected.length >= puzzle.darts) { window.showToast('놓은 다트를 먼저 지워주세요.'); return; }
    selected.push(index);
  }
  if (placing) throwDart(index);
  persist(); render();
}
regions.forEach((region, index) => {
  region.addEventListener('click', () => toggle(index));
  region.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(index); }
  });
});
document.getElementById('dartsReset').addEventListener('click', () => {
  if (!ready || !selected.length || !confirm('놓은 다트를 모두 지울까요?')) return;
  selected = []; persist(); render();
});
function restore(saved) { selected = parseDartsState(saved, puzzleId)?.selected || []; completionRecorded = false; }
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

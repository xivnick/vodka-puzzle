import { dartsPuzzles, inspectDarts, parseDartsState } from '../lib/darts.js';
const game = document.getElementById('dartsGame');
const puzzleId = game.dataset.puzzleId;
const puzzle = dartsPuzzles[puzzleId];
const regions = [...game.querySelectorAll('.dart-region')];
const complete = document.getElementById('dartsComplete');
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
function toggle(index) {
  if (!ready) return;
  if (selected.includes(index)) selected = selected.filter(value => value !== index);
  else {
    if (selected.length >= puzzle.darts) { window.showToast('놓은 다트를 먼저 지워주세요.'); return; }
    selected.push(index);
  }
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

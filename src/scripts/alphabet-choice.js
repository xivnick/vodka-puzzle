import { words, inspectAlphabetChoice, parseAlphabetChoiceState } from '../lib/alphabet-choice.js';
const game = document.getElementById('alphabetGame');
const puzzleId = game.dataset.puzzleId;
const cells = [...game.querySelectorAll('.alphabet-cell')];
const pad = document.getElementById('alphabetPad');
const complete = document.getElementById('alphabetComplete');
let values = words.map(() => '');
let selected = 0;
let ready = false;
let completionRecorded = false;
function state() { return { version: 1, puzzleId, values: [...values] }; }
function persist() {
  if (!ready) return;
  try { window.saveLocalState(puzzleId, state()); }
  catch { window.showToast('브라우저에 저장하지 못했습니다.'); }
}
function render() {
  const result = inspectAlphabetChoice(values);
  cells.forEach((cell, index) => {
    cell.querySelector('.letter').textContent = values[index];
    cell.querySelector('.word').classList.toggle('satisfied', result.satisfied[index]);
    cell.classList.toggle('selected', selected === index);
    cell.tabIndex = selected === index ? 0 : -1;
    cell.setAttribute('aria-selected', String(selected === index));
    cell.setAttribute('aria-label', `${Math.floor(index/5)+1}행 ${index%5+1}열 ${words[index]}, ${values[index] || '빈칸'}${result.satisfied[index] ? ', 경로 있음' : ''}`);
  });
  document.getElementById('alphabetPrompt').textContent = `${words[selected]}에서 글자를 고르세요`;
  pad.replaceChildren(...[...new Set(words[selected])].map(letter => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = letter;
    button.dataset.letter = letter;
    button.disabled = !ready;
    button.setAttribute('aria-pressed', String(values[selected] === letter));
    return button;
  }));
  complete.hidden = !result.solved;
  if (!result.solved) completionRecorded = false;
  else if (ready && !completionRecorded) {
    completionRecorded = true;
    if (window.puzzlePage?.published) window.recordCompletion(puzzleId, state());
  }
}
function input(letter) {
  if (!ready || letter && !words[selected].includes(letter)) return;
  values[selected] = letter;
  persist(); render();
  document.getElementById('alphabetStatus').textContent = `${words[selected]}, ${letter ? `${letter} 입력` : '지웠습니다.'}`;
}
cells.forEach((cell, index) => cell.addEventListener('click', () => { selected = index; render(); }));
pad.addEventListener('click', event => {
  const button = event.target.closest('[data-letter]');
  if (button) input(button.dataset.letter);
});
document.getElementById('alphabetErase').addEventListener('click', () => input(''));
document.getElementById('alphabetReset').addEventListener('click', () => {
  if (!ready || !confirm('입력한 글자를 모두 지울까요?')) return;
  values.fill(''); persist(); render();
});
document.getElementById('alphabetBoard').addEventListener('keydown', event => {
  if (!ready || event.ctrlKey || event.metaKey || event.altKey) return;
  const row = Math.floor(selected/5), column = selected%5;
  const moves = { ArrowUp: Math.max(0,row-1)*5+column, ArrowDown: Math.min(5,row+1)*5+column, ArrowLeft: row*5+Math.max(0,column-1), ArrowRight: row*5+Math.min(4,column+1) };
  if (event.key in moves) { event.preventDefault(); selected = moves[event.key]; render(); cells[selected].focus({preventScroll:true}); }
  else if (/^[a-z]$/i.test(event.key)) { event.preventDefault(); input(event.key.toUpperCase()); }
  else if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); input(''); }
});
function restore(saved) { values = parseAlphabetChoiceState(saved, puzzleId)?.values || words.map(() => ''); completionRecorded = false; }
window.handleCloudSave = () => window.saveProgressCloud(puzzleId, state());
window.handleCloudLoad = async () => {
  const saved = await window.loadProgressCloud(puzzleId);
  if (saved == null) return;
  if (!parseAlphabetChoiceState(saved, puzzleId)) { window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.'); return; }
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

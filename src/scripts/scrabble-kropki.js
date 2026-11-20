import { size, inspectScrabble, parseScrabbleState } from '../lib/scrabble-kropki.js';

const game = document.getElementById('scrabbleGame');
const puzzleId = game.dataset.puzzleId;
const cells = [...game.querySelectorAll('.cell')];
const words = [...game.querySelectorAll('[data-word]')];
const dots = [...game.querySelectorAll('.dot')].map(element => ({ element, label: element.getAttribute('aria-label') }));
const completion = document.getElementById('scrabbleComplete');
const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

let values = cells.map(() => '');
let selected = 0;
const state = () => ({ version: 1, puzzleId, values: [...values] });

function persist() {
  try { window.saveLocalState(puzzleId, state()); }
  catch { window.showToast('브라우저에 저장하지 못했습니다.'); }
}

function select(index) {
  cells[selected].classList.remove('selected');
  cells[selected].tabIndex = -1;
  selected = index;
  cells[selected].classList.add('selected');
  cells[selected].tabIndex = 0;
}

function render() {
  const { counts, satisfiedDots, solved } = inspectScrabble(values);
  cells.forEach((cell, index) => {
    cell.textContent = values[index];
    cell.setAttribute('aria-label', `${Math.floor(index / size) + 1}행 ${index % size + 1}열, ${values[index] || '빈칸'}`);
  });
  words.forEach(element => {
    const word = element.dataset.word;
    const placed = counts.get(word) === 1;
    element.classList.toggle('found', placed);
    if (placed) element.setAttribute('aria-label', `${word}, 배치됨`);
    else element.removeAttribute('aria-label');
  });
  dots.forEach(({ element, label }, index) => {
    const satisfied = satisfiedDots[index];
    element.classList.toggle('satisfied', satisfied);
    element.setAttribute('aria-label', satisfied ? `${label}, 조건 충족` : label);
  });
  completion.hidden = !solved;
  if (solved && window.puzzlePage?.published) window.recordCompletion(puzzleId, state());
}

function input(letter) {
  if (values[selected] === letter) return;
  values[selected] = letter;
  persist();
  render();
}

cells.forEach((cell, index) => {
  cell.addEventListener('focus', () => select(index));
  cell.addEventListener('click', () => select(index));
});
game.querySelectorAll('[data-letter]').forEach(button => {
  button.addEventListener('click', () => input(button.dataset.letter));
});
document.getElementById('scrabbleErase').addEventListener('click', () => input(''));
document.getElementById('scrabbleReset').addEventListener('click', () => {
  if (!values.some(Boolean) || !confirm('입력한 글자를 모두 지울까요?')) return;
  values.fill('');
  select(0);
  persist();
  render();
});

game.addEventListener('keydown', event => {
  if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
  if (/^[a-z]$/i.test(event.key)) {
    event.preventDefault();
    input(event.key.toUpperCase());
  } else if (event.key === 'Backspace' || event.key === 'Delete') {
    event.preventDefault();
    input('');
  } else if (Object.hasOwn(moves, event.key) && cells[selected] === event.target) {
    event.preventDefault();
    const [rowDelta, columnDelta] = moves[event.key];
    const row = Math.floor(selected / size) + rowDelta;
    const column = selected % size + columnDelta;
    if (row < 0 || row >= size || column < 0 || column >= size) return;
    select(row * size + column);
    cells[selected].focus({ preventScroll: true });
  }
});

function restore() {
  let saved;
  try { saved = window.loadLocalState(puzzleId); } catch {}
  values = parseScrabbleState(saved, puzzleId) ?? cells.map(() => '');
  render();
}

window.checkComplete = render;
window.handleCloudSave = () => window.saveProgressCloud(puzzleId, state());
window.handleCloudLoad = async () => {
  const saved = await window.loadProgressCloud(puzzleId);
  if (saved == null) return;
  const parsed = parseScrabbleState(saved, puzzleId);
  if (!parsed) {
    window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.');
    return;
  }
  values = parsed;
  persist();
  render();
};
select(0);
window.startLocalPuzzle(puzzleId, restore, restore);

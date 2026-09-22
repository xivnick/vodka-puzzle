import { evaluateFormula, formatFraction, hasExactNumbers } from '../lib/formula-completion.js';

const game = document.getElementById('formulaGame');
const puzzle = JSON.parse(game.dataset.puzzle);
const puzzleId = game.dataset.puzzleId;
const preview = game.dataset.preview === 'true';
const numberCounts = puzzle.numbers.reduce((map, value) => {
  const number = String(value);
  map.set(number, (map.get(number) || 0) + 1);
  return map;
}, new Map());
const validTokens = new Set([...numberCounts.keys(), '+', '-', '*', '/', '(', ')']);
const availableNumbers = [...numberCounts.keys()];
const expression = document.getElementById('formulaExpression');
const resultElement = document.getElementById('formulaResult');
const complete = document.getElementById('formulaComplete');
const status = document.getElementById('formulaStatus');
const numberButtons = [...document.querySelectorAll('#formulaKeypad [data-number]')];
const operatorButtons = [...document.querySelectorAll('#formulaKeypad [data-operator]')];
const openButton = document.querySelector('#formulaKeypad [data-token="("]');
const closeButton = document.querySelector('#formulaKeypad [data-token=")"]');
const backspaceButton = document.querySelector('#formulaKeypad [data-action="backspace"]');
const resetButton = document.getElementById('formulaReset');
let tokens = [];
let ready = preview;
let completionRecorded = false;
let keyboardNumberBuffer = '';
let keyboardNumberTimer;
let persistTimer;
let persistPending = false;

function state() { return { version: 1, puzzleId, tokens: [...tokens] }; }
function announce(message) { status.textContent = message; }
function usedCounts() {
  return tokens.filter(token => numberCounts.has(token)).reduce((map, number) => {
    map.set(number, (map.get(number) || 0) + 1);
    return map;
  }, new Map());
}
function tokenState() {
  const last = tokens.at(-1) || '';
  const open = tokens.filter(token => token === '(').length;
  const close = tokens.filter(token => token === ')').length;
  const needsValue = !last || ['+', '-', '*', '/', '('].includes(last);
  const canUseOperator = numberCounts.has(last) || last === ')';
  return { needsValue, canUseOperator, canClose: canUseOperator && open > close };
}
function flushPersist() {
  if (!persistPending || preview || !ready) return;
  persistPending = false;
  clearTimeout(persistTimer);
  try { window.saveLocalState(puzzleId, state()); }
  catch { window.showToast('브라우저에 저장하지 못했습니다.'); }
}
function persist() {
  if (preview || !ready) return;
  persistPending = true;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(flushPersist, 120);
}
function checkComplete(solved) {
  complete.hidden = !solved;
  expression.classList.toggle('solved', solved);
  if (!solved) { completionRecorded = false; return; }
  announce('퍼즐을 완성했습니다!');
  if (!preview && ready && !completionRecorded) {
    completionRecorded = true;
    window.recordCompletion(puzzleId, state());
  }
}
function render() {
  expression.replaceChildren();
  if (!tokens.length) {
    const placeholder = document.createElement('span');
    placeholder.className = 'expression-placeholder';
    placeholder.textContent = '수식을 완성하세요';
    expression.append(placeholder);
  } else {
    tokens.forEach(token => {
      const element = document.createElement('span');
      element.className = `expression-token${numberCounts.has(token) ? ' number' : ''}`;
      element.textContent = token === '*' ? '×' : token === '/' ? '÷' : token;
      expression.append(element);
    });
  }
  let solved = false;
  try {
    const result = evaluateFormula(tokens);
    resultElement.textContent = result ? `= ${formatFraction(result.value)}` : '';
    solved = Boolean(result)
      && result.value.n === BigInt(puzzle.target) * result.value.d
      && hasExactNumbers(puzzle.numbers, result.used);
  } catch { resultElement.textContent = ''; }

  const used = usedCounts();
  const current = tokenState();
  numberButtons.forEach(button => {
    const number = button.dataset.number;
    const exhausted = (used.get(number) || 0) >= numberCounts.get(number);
    button.classList.toggle('used', exhausted);
    button.disabled = !ready || !current.needsValue || exhausted;
  });
  operatorButtons.forEach(button => { button.disabled = !ready || !current.canUseOperator; });
  openButton.disabled = !ready || !current.needsValue;
  closeButton.disabled = !ready || !current.canClose;
  backspaceButton.disabled = !ready || tokens.length === 0;
  resetButton.disabled = !ready || tokens.length === 0;
  checkComplete(solved);
}
function insert(token) {
  if (!ready) return;
  const current = tokenState();
  if (numberCounts.has(token)) {
    if (!current.needsValue || (usedCounts().get(token) || 0) >= numberCounts.get(token)) return;
  } else if ('+-*/'.includes(token)) {
    if (!current.canUseOperator) return;
  } else if (token === '(') {
    if (!current.needsValue) return;
  } else if (token === ')') {
    if (!current.canClose) return;
  } else return;
  tokens.push(token);
  completionRecorded = false;
  persist();
  render();
}
function backspace() {
  if (!ready || !tokens.length) return;
  tokens.pop();
  completionRecorded = false;
  persist();
  render();
}
function clearKeyboardNumberBuffer() {
  keyboardNumberBuffer = '';
  clearTimeout(keyboardNumberTimer);
}
function inputNumberKey(key) {
  clearTimeout(keyboardNumberTimer);
  let candidate = keyboardNumberBuffer + key;
  let matches = availableNumbers.filter(number => number.startsWith(candidate));
  if (!matches.length) {
    candidate = key;
    matches = availableNumbers.filter(number => number.startsWith(candidate));
  }
  if (!matches.length) { clearKeyboardNumberBuffer(); return; }
  if (matches.includes(candidate) && !matches.some(number => number.length > candidate.length)) {
    clearKeyboardNumberBuffer();
    insert(candidate);
    return;
  }
  keyboardNumberBuffer = candidate;
  announce(`${candidate} 다음 숫자 입력 대기`);
  keyboardNumberTimer = setTimeout(clearKeyboardNumberBuffer, 800);
}
function parseState(saved) {
  if (!saved || saved.version !== 1 || saved.puzzleId !== puzzleId || !Array.isArray(saved.tokens)) return null;
  if (!saved.tokens.every(token => typeof token === 'string' && validTokens.has(token))) return null;
  const counts = saved.tokens.filter(token => numberCounts.has(token)).reduce((map, number) => {
    map.set(number, (map.get(number) || 0) + 1);
    return map;
  }, new Map());
  if ([...counts].some(([number, count]) => count > numberCounts.get(number))) return null;
  return [...saved.tokens];
}

document.querySelectorAll('#formulaKeypad [data-token]').forEach(button => button.addEventListener('click', () => {
  clearKeyboardNumberBuffer();
  insert(button.dataset.token);
}));
backspaceButton.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  event.preventDefault();
  clearKeyboardNumberBuffer();
  backspace();
});
backspaceButton.addEventListener('click', event => {
  if (event.detail !== 0) return;
  clearKeyboardNumberBuffer();
  backspace();
});
resetButton.addEventListener('click', () => {
  if (!ready || !tokens.length) return;
  if (!confirm('입력한 수식을 초기화할까요?')) return;
  clearKeyboardNumberBuffer();
  tokens = [];
  completionRecorded = false;
  persist();
  render();
  announce('퍼즐을 초기화했습니다.');
});
window.addEventListener('pagehide', flushPersist);
game.addEventListener('keydown', event => {
  const key = event.key;
  if (/^\d$/.test(key)) { event.preventDefault(); inputNumberKey(key); }
  else if ('+-*/()'.includes(key)) { event.preventDefault(); clearKeyboardNumberBuffer(); insert(key); }
  else if (key === 'Backspace' || key === 'Delete') {
    event.preventDefault();
    if (keyboardNumberBuffer) clearKeyboardNumberBuffer();
    else backspace();
  }
});

function init() {
  if (ready) return;
  let saved = null;
  try { saved = window.loadLocalState(puzzleId); } catch {}
  tokens = parseState(saved) || [];
  ready = true;
  render();
  window.initCloudBtns();
}

render();
if (!preview) {
  window.handleCloudSave = () => window.saveProgressCloud(puzzleId, state());
  window.handleCloudLoad = async () => {
    const saved = await window.loadProgressCloud(puzzleId);
    if (saved == null) return;
    const parsed = parseState(saved);
    if (!parsed) { window.showToast('이 문제에 맞는 저장 데이터가 아닙니다.'); return; }
    tokens = parsed;
    completionRecorded = false;
    persist();
    render();
  };
  window.puzzleAuthReady.then(init);
  window.addEventListener('puzzle-auth-ready', init);
}

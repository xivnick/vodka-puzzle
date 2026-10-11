// Test-only session state; never connected to account completion or cloud saving.
import { readPreview, savePreview, resetPreview, createBoard, solution } from '../lib/time-machine-preview.js';
const ids = {board:'sudokuBoard', numberPad:'sudokuNumbers', notesButton:'sudokuNotes', eraseButton:'sudokuErase', resetBoardButton:'sudokuReset', gameMessage:'sudokuMessage', pageTitle:'pageTitle', successTitle:'sudokuComplete'};
const $ = id => id === 'pageTitle' ? document.querySelector('.page-heading h1') : document.getElementById(ids[id] || id);
const today = 11;
let tickets, currentDay, selected, notesMode, boards;
function initialize() {
  ({tickets, boards} = readPreview());
  const requested = Number(new URLSearchParams(location.search).get('day'));
  currentDay = [9, 10].includes(requested) && boards.has(requested) ? requested : today;
  selected = -1; notesMode = false;
  $('gameMessage').textContent = '';
  render();
}
function streak() {
  const days = [8, ...[...boards].filter(([, board]) => board.complete).map(([day]) => day)].sort((a, b) => b - a);
  let count = 0, previous = days[0], connected = false;
  if (today - previous > 2) return { count: 0, connected: false };
  for (const day of days) {
    if (previous - day > 2) break;
    if (day === 8) { count += 12; connected = true; } else count++;
    previous = day;
  }
  return { count, connected };
}
function render() {
  const board = boards.get(currentDay), past = currentDay !== today, run = streak();
  const todayComplete = boards.get(today).complete;
  $('ticketCount').textContent = `${tickets}회`;
  $('pageTitle').textContent = `2610${String(currentDay).padStart(2, '0')} Daily Sudoku`;
  $('pastNavigation').hidden = !past;

  $('dailyStreak').hidden = past;
  $('streakLabel').textContent = run.connected
    ? `${run.count + (todayComplete ? 0 : 1)}일 연속 ${todayComplete ? '완성' : '도전 중..'}`
    : todayComplete ? '1일 연속 완성' : '1일 연속 도전 중..';
  $('flame').src = `/icons/daily-streak/${todayComplete ? 'flame-filled' : 'flame'}.svg`;
  $('notesButton').setAttribute('aria-pressed', String(notesMode));
  $('board').replaceChildren(...board.values.map((value, i) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = `sudoku-cell${board.givens[i] ? ' given' : ''}${selected === i ? ' selected' : ''}`;
    cell.disabled = board.complete;
    cell.setAttribute('aria-label', `${Math.floor(i / 9) + 1}행 ${i % 9 + 1}열, ${value || '빈 칸'}${board.givens[i] ? ', 주어진 숫자' : ''}`);
    cell.setAttribute('aria-pressed', String(selected === i));
    if (value) cell.textContent = value;
    else if (board.notes[i].size) {
      const grid = document.createElement('span'); grid.className = 'notes';
      for (let n = 1; n <= 9; n++) { const digit = document.createElement('span'); digit.textContent = board.notes[i].has(n) ? n : ''; grid.append(digit); }
      cell.append(grid);
    }
    cell.addEventListener('click', () => { selected = i; render(); });
    return cell;
  }));
  for (const id of ['notesButton', 'eraseButton', 'resetBoardButton', 'demoCompleteButton']) $(id).disabled = board.complete;
  for (const button of $('numberPad').children) button.disabled = board.complete;
  $('successPanel').hidden = !board.complete;
  if (board.complete) {
    $('successTitle').hidden = false;
    $('successTitle').textContent = '퍼즐을 완성했습니다!';
    $('successDescription').textContent = run.connected ? `${run.count}일 연속 완성` : '';
    $('successTodayButton').hidden = !past;
    $('successTodayButton').textContent = todayComplete ? '오늘의 완료 보기' : '오늘의 스도쿠 풀기';
  }
  $('rankDescription').textContent = '시연에서는 완료 기록이 표시되지 않습니다.';
  savePreview({tickets, boards});
}
function inputNumber(number) {
  const board = boards.get(currentDay);
  if (selected < 0 || board.givens[selected] || board.complete) return;
  if (notesMode) {
    board.values[selected] = 0;
    if (board.notes[selected].has(number)) board.notes[selected].delete(number); else board.notes[selected].add(number);
  } else { board.values[selected] = number; board.notes[selected].clear(); }
  $('gameMessage').textContent = '';
  if (board.values.every(Boolean)) checkCompletion(); else render();
}
function checkCompletion() {
  const board = boards.get(currentDay), groups = [];
  for (let n = 0; n < 9; n++) {
    groups.push(Array.from({ length: 9 }, (_, i) => n * 9 + i));
    groups.push(Array.from({ length: 9 }, (_, i) => i * 9 + n));
    groups.push(Array.from({ length: 9 }, (_, i) => (Math.floor(n / 3) * 3 + Math.floor(i / 3)) * 9 + n % 3 * 3 + i % 3));
  }
  const valid = board.values.every(value => value >= 1 && value <= 9) && groups.every(group => new Set(group.map(i => board.values[i])).size === 9);
  if (valid) { board.complete = true; selected = -1; $('gameMessage').textContent = ''; }
  else $('gameMessage').textContent = '같은 행·열·3×3 구역에 중복된 숫자가 있는지 확인해 주세요.';
  render();
}
for (const button of $('numberPad').children) button.addEventListener('click', () => inputNumber(Number(button.dataset.number)));
$('notesButton').addEventListener('click', () => { notesMode = !notesMode; render(); });
function erase() { const board = boards.get(currentDay); if (selected < 0 || board.givens[selected] || board.complete) return; board.values[selected] = 0; board.notes[selected].clear(); $('gameMessage').textContent = ''; render(); }
$('eraseButton').addEventListener('click', erase);
$('resetBoardButton').addEventListener('click', () => { boards.set(currentDay, createBoard(currentDay)); selected = -1; $('gameMessage').textContent = ''; render(); });
$('demoCompleteButton').addEventListener('click', () => { boards.get(currentDay).values = [...solution]; checkCompletion(); });
$('restartDemoButton').addEventListener('click', () => { resetPreview(); location.assign('/test/daily-sudoku/tickets/'); });
document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || boards.get(currentDay).complete) return;
  if (/^[1-9]$/.test(event.key)) { event.preventDefault(); inputNumber(Number(event.key)); }
  else if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); erase(); }
  else if (event.key.toLowerCase() === 'm') { notesMode = !notesMode; render(); }
});
initialize();

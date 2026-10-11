// Standalone UI example. All state is in memory; no account, storage, or network calls.
const ids = {board:'sudokuBoard', numberPad:'sudokuNumbers', notesButton:'sudokuNotes', eraseButton:'sudokuErase', resetBoardButton:'sudokuReset', gameMessage:'sudokuMessage', pageTitle:'pageTitle', successTitle:'sudokuComplete'};
const $ = id => id === 'pageTitle' ? document.querySelector('.page-heading h1') : document.getElementById(ids[id] || id);
const today = 11;
const missedDays = [9, 10];
const solution = Array.from({ length: 81 }, (_, i) => (Math.floor(i / 9) * 3 + Math.floor(Math.floor(i / 9) / 3) + i % 9) % 9 + 1);
let tickets, currentDay, selected, notesMode, chosenDay, boards;

function createBoard(day) {
  const givens = solution.map((number, i) => ((i * 17 + day * 7) % 11 < 5 ? number : 0));
  return { givens, values: [...givens], notes: Array.from({ length: 81 }, () => new Set()), complete: false };
}
function initialize() {
  tickets = 2; currentDay = today; selected = -1; notesMode = false; chosenDay = null;
  boards = new Map([[today, createBoard(today)]]);
  $('ticketDialog').close();
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
  $('ticketCount').textContent = `${tickets}장`;
  $('pageTitle').textContent = `2610${String(currentDay).padStart(2, '0')} Daily Sudoku`;
  $('pastNavigation').hidden = !past;
  $('pastBadge').textContent = `다시 도전 · 10월 ${currentDay}일`;
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
    $('successDescription').textContent = run.connected
      ? `${run.count}일의 불꽃이 ${past ? '다시 이어졌어요' : '이어졌어요'}.${!todayComplete ? '\n오늘 문제를 풀면 ' + (run.count + 1) + '일이 돼요.' : ''}`
      : '놓친 문제를 완성하면 이전 스트릭과 이어져요.';
    $('successTodayButton').hidden = !past;
    $('successTodayButton').textContent = todayComplete ? '오늘의 완료 보기' : '오늘의 스도쿠 풀기';
  }
  $('rankDescription').textContent = '시연에서는 완료 기록이 표시되지 않습니다.';
  renderWallet();
}
function renderWallet() {
  $('walletCount').textContent = `${tickets}장`;
  const solved = [...boards.values()].filter(board => board.complete).length;
  $('rewardText').textContent = tickets >= 2 ? '보유 한도 도달' : `${12 - solved}문제`;
  $('rewardProgress').value = 18 + solved;
  $('dateList').replaceChildren(...missedDays.map(day => {
    const board = boards.get(day), row = document.createElement('button'); row.type = 'button'; row.className = 'date-row';
    const left = document.createElement('span'), title = document.createElement('span'), description = document.createElement('span'), action = document.createElement('span');
    title.className = 'date-title'; title.textContent = `10월 ${day}일 · ${day === 9 ? '금' : '토'}요일`;
    description.className = 'date-description'; description.textContent = board?.complete ? '다시 도전으로 완성했어요' : board ? '열어둔 문제 · 추가 도전권 없이 이어서 풀기' : streak().connected ? '놓친 하루의 기록을 채울 수 있어요' : '완성하면 12일의 불꽃이 이어져요';
    action.className = 'date-action'; action.textContent = board?.complete ? '완료 보기 ›' : board ? '이어서 풀기 ›' : tickets ? '1장으로 열기 ›' : '도전권 없음';
    row.disabled = !board && !tickets;
    left.append(title, description); row.append(left, action);
    row.addEventListener('click', () => {
      if (board) { $('ticketDialog').close(); openDay(day); return; }
      chosenDay = day;
      $('walletView').hidden = true; $('confirmView').hidden = false;
      $('ticketDialog').setAttribute('aria-labelledby', 'confirmTitle');
      $('confirmTitle').textContent = `10월 ${day}일 문제를 열까요?`;
      $('confirmView').querySelector('.dialog-description').textContent = `다시 도전권 1장을 사용합니다. ${streak().connected ? '완성하면 놓친 하루가 스트릭에 더해져요.' : '문제를 완성하면 12일의 불꽃이 이어져요.'}`;
      $('confirmDate').textContent = `2610${String(day).padStart(2, '0')} Daily Sudoku`;
      $('confirmBalance').textContent = `보유 ${tickets}장 → ${tickets - 1}장`;
      $('useTicketButton').focus();
    });
    return row;
  }));
}
function showWallet() {
  renderWallet(); $('walletView').hidden = false; $('confirmView').hidden = true;
  $('ticketDialog').setAttribute('aria-labelledby', 'dialogTitle'); $('ticketDialog').showModal();
}
function openDay(day) { currentDay = day; selected = -1; notesMode = false; $('gameMessage').textContent = ''; render(); }
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
$('walletButton').addEventListener('click', showWallet);
$('closeDialogButton').addEventListener('click', () => $('ticketDialog').close());
$('backButton').addEventListener('click', () => { $('walletView').hidden = false; $('confirmView').hidden = true; $('ticketDialog').setAttribute('aria-labelledby', 'dialogTitle'); $('closeDialogButton').focus(); });
$('useTicketButton').addEventListener('click', () => {
  if (chosenDay === null || !tickets || boards.has(chosenDay)) return;
  tickets--; boards.set(chosenDay, createBoard(chosenDay)); $('ticketDialog').close(); openDay(chosenDay);
});
for (const id of ['todayButton', 'successTodayButton']) $(id).addEventListener('click', () => openDay(today));
$('notesButton').addEventListener('click', () => { notesMode = !notesMode; render(); });
function erase() { const board = boards.get(currentDay); if (selected < 0 || board.givens[selected] || board.complete) return; board.values[selected] = 0; board.notes[selected].clear(); $('gameMessage').textContent = ''; render(); }
$('eraseButton').addEventListener('click', erase);
$('resetBoardButton').addEventListener('click', () => { boards.set(currentDay, createBoard(currentDay)); selected = -1; $('gameMessage').textContent = ''; render(); });
$('demoCompleteButton').addEventListener('click', () => { boards.get(currentDay).values = [...solution]; checkCompletion(); });
$('restartDemoButton').addEventListener('click', initialize);
document.addEventListener('keydown', event => {
  if ($('ticketDialog').open || event.ctrlKey || event.metaKey || event.altKey || boards.get(currentDay).complete) return;
  if (/^[1-9]$/.test(event.key)) { event.preventDefault(); inputNumber(Number(event.key)); }
  else if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); erase(); }
  else if (event.key.toLowerCase() === 'm') { notesMode = !notesMode; render(); }
});
initialize();
// A direct view link makes the ticket layout easy to review independently.
if (new URLSearchParams(location.search).get('view') === 'tickets') showWallet();

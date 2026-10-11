import {readPreview, savePreview, createBoard, firstDay, today, dateForDay, isPreviewDay, wasCompleted} from '../lib/time-machine-preview.js';
const state = readPreview();
const base = '/test/daily-sudoku/';
const parameter = new URLSearchParams(location.search).get('day');
let selected = parameter !== null && isPreviewDay(Number(parameter)) ? Number(parameter) : today;
document.getElementById('remainingUses').textContent = state.tickets;
const calendars = document.getElementById('pastDates');
const first = dateForDay(firstDay), last = dateForDay(today);
const monthSelect = document.getElementById('calendarMonth');
const previousMonth = document.getElementById('previousMonth');
const nextMonth = document.getElementById('nextMonth');
const months = [];
for (let cursor = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1)); cursor >= new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1)); cursor.setUTCMonth(cursor.getUTCMonth() - 1)) {
  months.push({year:cursor.getUTCFullYear(), month:cursor.getUTCMonth()});
  const option = document.createElement('option');
  option.value = months.length - 1; option.textContent = `${cursor.getUTCFullYear()}년 ${cursor.getUTCMonth() + 1}월`;
  monthSelect.append(option);
}
function renderMonth() {
  const index = Number(monthSelect.value), {year, month} = months[index];
  previousMonth.disabled = index === months.length - 1;
  nextMonth.disabled = index === 0;
  calendars.replaceChildren();
  const section = document.createElement('section'); section.className = 'time-machine-month';
  const grid = document.createElement('div'); grid.className = 'time-machine-calendar'; grid.setAttribute('aria-label', `${year}년 ${month + 1}월`);
  const weekdays = ['일','월','화','수','목','금','토'];
  for (const weekday of weekdays) { const label = document.createElement('span'); label.className = `calendar-weekday${weekday === '일' ? ' sunday' : weekday === '토' ? ' saturday' : ''}`; label.textContent = weekday; grid.append(label); }
  const offset = new Date(Date.UTC(year, month, 1)).getUTCDay();
  for (let i = 0; i < offset; i++) { const blank = document.createElement('span'); blank.className = 'calendar-blank'; blank.setAttribute('aria-hidden','true'); grid.append(blank); }
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  for (let date = 1; date <= daysInMonth; date++) {
    const day = Math.round((Date.UTC(year, month, date) - Date.UTC(2026, 9, 1)) / 86400000) + 1;
    const board = state.boards.get(day), available = isPreviewDay(day);
    const complete = wasCompleted(day) || board?.complete;
    const opened = Boolean(board);
    const cell = document.createElement(available ? 'button' : 'span');
    cell.className = `calendar-day${available ? '' : ' unavailable'}${complete ? ' complete' : ''}${day === today ? ' today' : ''}${day === selected ? ' selected-date' : ''}${opened && !complete && day !== today ? ' in-progress' : ''}`;
    if (available) {
      cell.type = 'button';
      cell.setAttribute('aria-pressed', String(day === selected));
      cell.addEventListener('click', () => { selected = day; renderMonth(); renderSelection(); });
      cell.setAttribute('aria-label', `${month + 1}월 ${date}일, ${day === today ? '오늘, ' : ''}${complete ? '완료' : opened && day !== today ? '진행 중' : '미완료'}`);
    }
    const number = document.createElement('span'); number.className = 'calendar-number'; number.textContent = date;
    const status = document.createElement('span'); status.className = 'calendar-status'; status.textContent = complete ? '✓' : day === today ? '오늘' : opened ? '진행' : '';
    status.setAttribute('aria-hidden','true'); cell.append(number, status); grid.append(cell);
  }
  section.append(grid); calendars.append(section);
}
document.getElementById('todayMonth').addEventListener('click', () => { monthSelect.value = '0'; selected = today; renderMonth(); renderSelection(); });
monthSelect.addEventListener('change', renderMonth);
previousMonth.addEventListener('click', () => { monthSelect.value = Number(monthSelect.value) + 1; renderMonth(); });
nextMonth.addEventListener('click', () => { monthSelect.value = Number(monthSelect.value) - 1; renderMonth(); });
function renderSelection() {
  const date = dateForDay(selected), board = state.boards.get(selected);
  const complete = wasCompleted(selected) || board?.complete;
  const opened = Boolean(board);
  document.getElementById('departureTitle').textContent = `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일`;
  document.getElementById('departureStatus').textContent = complete ? '완료' : selected === today ? '오늘의 문제' : opened ? '진행 중' : '미완료';
  document.getElementById('departureDescription').textContent = selected === today ? '티켓 없이 풀 수 있습니다.' : complete ? '완성한 문제를 다시 확인할 수 있습니다.' : opened ? '사용한 티켓으로 이어서 풀 수 있습니다.' : state.tickets ? '티켓 1장을 사용하여 이 문제를 엽니다.' : '사용할 티켓이 없습니다.';
  const button = document.getElementById('departButton');
  button.textContent = selected === today ? '데일리 스도쿠 풀기' : complete ? '완료한 문제 보기' : opened ? '이어서 풀기' : '티켓 사용하기';
  button.disabled = selected !== today && !complete && !opened && !state.tickets;
}
document.getElementById('departButton').addEventListener('click', () => {
  if (selected === today) { location.assign('/daily-sudoku/'); return; }
  if (!wasCompleted(selected) && !state.boards.has(selected)) {
    if (!state.tickets) return;
    state.tickets--; state.boards.set(selected, createBoard(selected)); savePreview(state);
  }
  location.assign(`${base}tickets/?day=${selected}`);
});
const selectedDate = dateForDay(selected);
monthSelect.value = months.findIndex(({year, month}) => year === selectedDate.getUTCFullYear() && month === selectedDate.getUTCMonth());
renderMonth();
renderSelection();

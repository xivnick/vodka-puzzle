import {readPreview, savePreview, createBoard, firstDay, today, dateForDay, titleForDay, isPreviewDay, wasCompleted} from '../lib/time-machine-preview.js';
const state = readPreview();
const base = '/test/daily-sudoku/';
const parameter = new URLSearchParams(location.search).get('day');
const selected = parameter === null ? null : Number(parameter);
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
  for (const weekday of weekdays) { const label = document.createElement('span'); label.className = 'calendar-weekday'; label.textContent = weekday; grid.append(label); }
  const offset = new Date(Date.UTC(year, month, 1)).getUTCDay();
  for (let i = 0; i < offset; i++) { const blank = document.createElement('span'); blank.className = 'calendar-blank'; blank.setAttribute('aria-hidden','true'); grid.append(blank); }
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  for (let date = 1; date <= daysInMonth; date++) {
    const day = Math.round((Date.UTC(year, month, date) - Date.UTC(2026, 9, 1)) / 86400000) + 1;
    const board = state.boards.get(day), available = isPreviewDay(day);
    const complete = wasCompleted(day) || board?.complete;
    const opened = Boolean(board);
    const cell = document.createElement(available ? 'a' : 'span');
    cell.className = `calendar-day${available ? '' : ' unavailable'}${complete ? ' complete' : ''}${day === today ? ' today' : ''}${opened && !complete && day !== today ? ' in-progress' : ''}`;
    if (available) {
      cell.href = opened || complete || day === today ? `${base}tickets/?day=${day}` : `${base}time-machine/?day=${day}`;
      cell.setAttribute('aria-label', `${month + 1}월 ${date}일, ${day === today ? '오늘, ' : ''}${complete ? '완료' : opened && day !== today ? '진행 중' : '미완료'}`);
    }
    const number = document.createElement('span'); number.className = 'calendar-number'; number.textContent = date;
    const status = document.createElement('span'); status.className = 'calendar-status'; status.textContent = complete ? '✓' : day === today ? '오늘' : opened ? '진행' : '';
    status.setAttribute('aria-hidden','true'); cell.append(number, status); grid.append(cell);
  }
  section.append(grid); calendars.append(section);
}
monthSelect.addEventListener('change', renderMonth);
previousMonth.addEventListener('click', () => { monthSelect.value = Number(monthSelect.value) + 1; renderMonth(); });
nextMonth.addEventListener('click', () => { monthSelect.value = Number(monthSelect.value) - 1; renderMonth(); });
renderMonth();
if (selected !== null && isPreviewDay(selected) && selected < today && !wasCompleted(selected)) {
  document.getElementById('dateSelection').hidden = true;
  document.getElementById('departure').hidden = false;
  document.getElementById('departureTitle').textContent = titleForDay(selected);
  const opened = state.boards.has(selected);
  document.getElementById('departureDescription').textContent = opened ? '이미 열린 문제입니다. 추가 횟수 없이 이동합니다.' : state.tickets ? `타임머신 1회를 사용합니다. 사용 후 ${state.tickets - 1}회가 남습니다.` : '남은 타임머신이 없습니다.';
  const button = document.getElementById('departButton'); button.disabled = !opened && !state.tickets;
  button.addEventListener('click', () => {
    if (!state.boards.has(selected)) {
      if (!state.tickets) return;
      state.tickets--; state.boards.set(selected, createBoard(selected)); savePreview(state);
    }
    location.assign(`${base}tickets/?day=${selected}`);
  });
}

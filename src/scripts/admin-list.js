import { $, bootstrap, displayState, editorPath, labels, listPath, listQuery, loadPuzzles, message } from './admin.js';

let rows = [];
function sortRows() {
  rows.sort((a,b) => b.sort_order-a.sort_order ||
    (b.published_at === null ? Infinity : Date.parse(b.published_at)) - (a.published_at === null ? Infinity : Date.parse(a.published_at)) ||
    a.puzzle_id.localeCompare(b.puzzle_id));
}
function renderList() {
  const search = $('adminSearch').value.trim().toLowerCase(), filter = $('adminFilter').value;
  const visible = rows.filter(row => (filter === 'all' || displayState(row) === filter) && `${row.title} ${row.puzzle_id}`.toLowerCase().includes(search));
  $('adminCount').textContent = `${visible.length}개 / 전체 ${rows.length}개`;
  const list = $('adminList'); list.replaceChildren();
  const query = listQuery();
  if (!visible.length) {
    const empty = document.createElement('p'); empty.className = 'admin-help'; empty.textContent = '검색 결과가 없습니다.'; list.append(empty);
  }
  for (const row of visible) {
    const link = document.createElement('a'); link.className = 'admin-row';
    query.set('id', row.puzzle_id);
    link.href = editorPath + '?' + query;
    const title = document.createElement('span'); title.className = 'admin-row-title'; title.textContent = row.title;
    const state = displayState(row);
    if (state !== 'published') {
      const status = document.createElement('span');
      status.className = 'admin-row-state';
      status.textContent = `(${labels[state]})`;
      title.append(' ', status);
    }
    link.append(title);
    if ([1, 2, 3].includes(row.difficulty)) {
      const mark = document.createElement('span');
      mark.className = 'puzzle-difficulty';
      mark.setAttribute('role', 'img');
      mark.setAttribute('aria-label', `난이도 ${row.difficulty}`);
      for (let index = 0; index < row.difficulty; index += 1) {
        const diamond = document.createElement('span');
        diamond.className = 'difficulty-diamond';
        diamond.setAttribute('aria-hidden', 'true');
        mark.append(diamond);
      }
      link.append(mark);
    }
    list.append(link);
  }
}

function filterList() {
  const query = new URLSearchParams();
  if ($('adminSearch').value.trim()) query.set('q', $('adminSearch').value.trim());
  if ($('adminFilter').value !== 'all') query.set('state', $('adminFilter').value);
  history.replaceState(history.state, '', query.size ? listPath + '?' + query : listPath);
  renderList();
}

async function reload() {
  $('adminRefresh').disabled = true;
  try {
    rows = await loadPuzzles();
    sortRows();
    renderList();
    message('');
  } catch {
    message('문제 목록을 불러오지 못했습니다. 로그인 상태를 확인하고 다시 시도해 주세요.');
  } finally {
    $('adminRefresh').disabled = false;
  }
}

const query = listQuery();
$('adminSearch').value = query.get('q') || '';
if (Object.hasOwn(labels, query.get('state'))) $('adminFilter').value = query.get('state');
$('adminSearch').addEventListener('input', filterList);
$('adminFilter').addEventListener('change', filterList);
$('adminRefresh').addEventListener('click', reload);
window.addEventListener('pageshow', event => { if (event.persisted) bootstrap(reload); });
bootstrap(reload);

const $ = id => document.getElementById(id);
const season = document.documentElement.dataset.season;
let rows = [], selected = null, dirty = false, saving = false;
const message = text => { $('adminStatus').textContent = text; };
function displayState(row) {
  if (row.status === 'published' && new Date(row.published_at) > new Date()) return 'scheduled';
  return row.status;
}
const labels = { draft:'초안', test:'테스트', scheduled:'예약 공개', published:'공개' };
function koreanInput(value) {
  if (!value) return '';
  return new Date(new Date(value).getTime() + 9*60*60*1000).toISOString().slice(0,19);
}
function selectRow(row) {
  if (saving || dirty && !confirm('저장하지 않은 변경사항을 버리고 다른 문제를 열까요?')) { $('adminSelect').value = selected?.puzzle_id || ''; return; }
  selected = row; dirty = false;
  $('adminEmpty').hidden = true; $('adminForm').hidden = false;
  $('adminPuzzleId').textContent = row.puzzle_id;
  $('adminPreview').href = `/${row.puzzle_id}/`;
  $('adminTitle').value = row.title; $('adminSummary').value = row.summary;
  $('adminDifficulty').value = row.difficulty || '';
  $('adminType').value = row.puzzle_type; $('adminState').value = row.status;
  $('adminDate').value = koreanInput(row.published_at); $('adminOrder').value = row.sort_order;
  $('adminDate').required = row.status === 'published';
  renderList();
}
function renderList() {
  const search = $('adminSearch').value.trim().toLowerCase(), filter = $('adminFilter').value;
  const visible = rows.filter(row => (filter === 'all' || displayState(row) === filter) && `${row.title} ${row.puzzle_id}`.toLowerCase().includes(search));
  $('adminCount').textContent = `${visible.length}개 / 전체 ${rows.length}개`;
  const list = $('adminSelect'); list.replaceChildren();
  const placeholder = document.createElement('option'); placeholder.value = '';
  placeholder.textContent = visible.length ? '수정할 문제를 선택하세요' : '검색 결과가 없습니다';
  placeholder.disabled = true; list.append(placeholder);
  // Keep the open editor selected even when its row is outside the search/filter.
  const choices = selected && !visible.some(row => row.puzzle_id === selected.puzzle_id) ? [selected,...visible] : visible;
  for (const row of choices) {
    const option = document.createElement('option'); option.value = row.puzzle_id;
    option.textContent = `${row.title} · ${row.puzzle_id} · ${labels[displayState(row)]}`;
    if (!visible.includes(row)) option.textContent += ' (현재 편집 중)';
    list.append(option);
  }
  list.value = selected?.puzzle_id || '';
}
async function rpc(name,args) {
  const { data, error } = await window.puzzleAccount.client.rpc(name,args);
  if (error) throw error;
  return data;
}
async function reload() {
  if (saving || dirty && !confirm('저장하지 않은 변경사항을 버리고 새로고침할까요?')) return;
  $('adminRefresh').disabled = true;
  try {
    rows = await rpc('admin_list_puzzles',{requested_season:season});
    const previous = selected?.puzzle_id; dirty = false;
    const row = rows.find(row => row.puzzle_id === previous);
    if (row) selectRow(row); else { selected = null; $('adminForm').hidden = true; $('adminEmpty').hidden = false; }
    renderList(); message('');
  } catch { message('문제 목록을 불러오지 못했습니다. 로그인 상태를 확인하고 다시 시도해 주세요.'); }
  finally { $('adminRefresh').disabled = false; }
}
$('adminSearch').addEventListener('input',renderList);
$('adminFilter').addEventListener('change',renderList);
$('adminRefresh').addEventListener('click',reload);
$('adminSelect').addEventListener('change',()=>{
  const row = rows.find(row => row.puzzle_id === $('adminSelect').value);
  if (row) selectRow(row);
});
$('adminForm').addEventListener('input',()=>{dirty = true;});
$('adminState').addEventListener('change',()=>{
  const published = $('adminState').value === 'published';
  $('adminDate').required = published;
  if (published && !$('adminDate').value) $('adminDate').value = koreanInput(new Date().toISOString());
});
$('adminForm').addEventListener('submit',async event => {
  event.preventDefault(); if (!selected || saving) return;
  const date = $('adminDate').value;
  const args = { requested_season:season, requested_puzzle:selected.puzzle_id,
    new_title:$('adminTitle').value.trim(), new_summary:$('adminSummary').value.trim(),
    new_type:$('adminType').value.trim(), new_difficulty:$('adminDifficulty').value.trim() || null, new_status:$('adminState').value,
    new_published_at:date ? new Date(`${date}+09:00`).toISOString() : null,
    new_sort_order:Number($('adminOrder').value), expected_updated_at:selected.updated_at };
  saving = true; $('adminSave').disabled = true; $('adminSelect').disabled = true; message('저장하는 중...');
  try {
    const result = await rpc('admin_update_puzzle',args);
    const updated = Array.isArray(result) ? result[0] : result;
    if (!updated?.puzzle_id) throw new Error('Missing updated puzzle');
    rows = rows.map(row => row.puzzle_id === updated.puzzle_id ? updated : row);
    rows.sort((a,b)=>b.sort_order-a.sort_order || (Date.parse(b.published_at)||Infinity)-(Date.parse(a.published_at)||Infinity) || a.puzzle_id.localeCompare(b.puzzle_id));
    saving = false; dirty = false; selectRow(updated);
    message(`저장했습니다. 현재 상태: ${labels[displayState(updated)]}`);
  } catch (error) {
    message(error.message?.includes('EDIT_CONFLICT') ? '다른 곳에서 수정된 문제입니다. 새로고침한 뒤 다시 수정해 주세요.' : '저장하지 못했습니다. 입력 내용과 관리자 권한을 확인해 주세요.');
  } finally { saving = false; $('adminSave').disabled = false; $('adminSelect').disabled = false; }
});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
async function bootstrap() {
  await window.puzzleAuthReady;
  if (!window.puzzleAccount.user) { $('adminAccess').textContent = '관리자 구글 계정으로 로그인해 주세요.'; $('adminLogin').hidden = false; return; }
  try {
    if (!await rpc('is_puzzle_admin',{})) { $('adminAccess').textContent = '이 계정에는 관리자 권한이 없습니다.'; return; }
    $('adminAccess').hidden = true; $('adminPanel').hidden = false; await reload();
  } catch { $('adminAccess').textContent = '관리자 권한을 확인하지 못했습니다. 다시 로그인해 주세요.'; }
}
bootstrap();

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
  if (saving || dirty && !confirm('저장하지 않은 변경사항을 버리고 다른 문제를 열까요?')) return;
  selected = row; dirty = false;
  $('adminEmpty').hidden = true; $('adminForm').hidden = false;
  $('adminPuzzleId').textContent = row.puzzle_id;
  $('adminPreview').href = `/${row.puzzle_id}/`;
  $('adminTitle').value = row.title; $('adminSummary').value = row.summary;
  $('adminType').value = row.puzzle_type; $('adminState').value = row.status;
  $('adminDate').value = koreanInput(row.published_at); $('adminOrder').value = row.sort_order;
  $('adminDate').required = row.status === 'published';
  renderList();
}
function renderList() {
  const search = $('adminSearch').value.trim().toLowerCase(), filter = $('adminFilter').value;
  const visible = rows.filter(row => (filter === 'all' || displayState(row) === filter) && `${row.title} ${row.puzzle_id}`.toLowerCase().includes(search));
  $('adminCount').textContent = `${visible.length}개 / 전체 ${rows.length}개`;
  const list = $('adminList'); list.replaceChildren();
  for (const row of visible) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'admin-row';
    button.setAttribute('aria-pressed', String(selected?.puzzle_id === row.puzzle_id));
    const title = document.createElement('span'); title.className = 'admin-row-title'; title.textContent = row.title;
    const meta = document.createElement('span'); meta.className = 'admin-row-meta'; meta.textContent = `${row.puzzle_id} · ${labels[displayState(row)]}`;
    button.append(title,meta); button.addEventListener('click',() => selectRow(row)); list.append(button);
  }
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
    new_type:$('adminType').value.trim(), new_status:$('adminState').value,
    new_published_at:date ? new Date(`${date}+09:00`).toISOString() : null,
    new_sort_order:Number($('adminOrder').value), expected_updated_at:selected.updated_at };
  saving = true; $('adminSave').disabled = true; message('저장하는 중...');
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
  } finally { saving = false; $('adminSave').disabled = false; }
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

const $ = id => document.getElementById(id);
const season = document.documentElement.dataset.season;
let rows = [], selected = null, dirty = false, saving = false;
const message = text => { $('adminStatus').textContent = text; };
function displayState(row) {
  if (row.status === 'published' && new Date(row.published_at) > new Date()) return 'scheduled';
  return row.status;
}
const labels = { draft:'초안', test:'테스트', scheduled:'예약 공개', published:'공개' };
const dateFormat = new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false});
const formatDate = value => value ? dateFormat.format(new Date(value)) : '—';
function koreanInput(value) {
  if (!value) return '';
  return new Date(new Date(value).getTime() + 9*60*60*1000).toISOString().slice(0,19);
}
function sortRows() {
  rows.sort((a,b) => b.sort_order-a.sort_order ||
    (b.published_at === null ? Infinity : Date.parse(b.published_at)) - (a.published_at === null ? Infinity : Date.parse(a.published_at)) ||
    a.puzzle_id.localeCompare(b.puzzle_id));
}
function publicationUI() {
  const state = $('adminState').value;
  $('adminSchedule').hidden = state !== 'scheduled';
  $('adminDate').required = state === 'scheduled';
  $('adminDate').setCustomValidity('');
  $('adminPublicationHelp').textContent = state === 'draft' || state === 'test'
    ? '목록에 표시되지 않으며, 완료 기록과 클라우드 저장을 사용하지 않습니다.'
    : state === 'scheduled' ? '지정한 한국 시간부터 목록·완료 기록·클라우드 저장이 활성화됩니다.'
    : '목록·완료 기록·클라우드 저장이 활성화됩니다.';
}
function values() {
  const state = $('adminState').value;
  return {
    title:$('adminTitle').value.trim(), summary:$('adminSummary').value.trim(),
    puzzle_type:$('adminType').value.trim(), difficulty:Number($('adminDifficulty').value),
    status:state === 'scheduled' ? 'published' : state,
    published_at:state === 'scheduled'
      ? ($('adminDate').value === koreanInput(selected.published_at) ? selected.published_at
        : $('adminDate').value ? new Date(`${$('adminDate').value}+09:00`).toISOString() : null)
      : selected.published_at,
    sort_order:Number($('adminOrder').value),
  };
}
function hasChanges() {
  if (!selected) return false;
  const current = values();
  return Object.entries(current).some(([key,value]) => key === 'published_at'
    ? Date.parse(value) !== Date.parse(selected[key]) && !(value === null && selected[key] === null)
    : value !== selected[key]) || $('adminState').value !== displayState(selected);
}
function updateDirty() {
  dirty = hasChanges();
  $('adminSave').disabled = !dirty || saving;
  $('adminSaveStatus').textContent = dirty ? '저장하지 않은 변경사항' : '';
}
function selectRow(row) {
  if (saving || dirty && !confirm('저장하지 않은 변경사항을 버리고 다른 문제를 열까요?')) return false;
  selected = row; dirty = false;
  $('adminEmpty').hidden = true; $('adminForm').hidden = false;
  $('adminPuzzleId').textContent = row.puzzle_id;
  $('adminPreview').href = `/${row.puzzle_id}/`;
  $('adminTitle').value = row.title; $('adminSummary').value = row.summary;
  $('adminDifficulty').value = String(row.difficulty ?? 0);
  $('adminType').value = row.puzzle_type; $('adminState').value = displayState(row);
  $('adminDate').value = koreanInput(row.published_at); $('adminOrder').value = row.sort_order;
  publicationUI(); updateDirty(); renderList();
  return true;
}
function renderList() {
  const search = $('adminSearch').value.trim().toLowerCase(), filter = $('adminFilter').value;
  const visible = rows.filter(row => (filter === 'all' || displayState(row) === filter) && `${row.title} ${row.puzzle_id}`.toLowerCase().includes(search));
  $('adminCount').textContent = `${visible.length}개 / 전체 ${rows.length}개`;
  const list = $('adminList'); list.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement('p'); empty.className = 'admin-help'; empty.textContent = '검색 결과가 없습니다.'; list.append(empty);
  }
  for (const row of visible) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'admin-row';
    button.setAttribute('aria-pressed', String(selected?.puzzle_id === row.puzzle_id));
    button.disabled = saving;
    const title = document.createElement('span'); title.className = 'admin-row-title'; title.textContent = row.title;
    const state = document.createElement('span'); state.className = 'admin-row-state'; state.textContent = labels[displayState(row)];
    const meta = document.createElement('span'); meta.className = 'admin-row-meta';
    meta.textContent = `${row.puzzle_id} · ${row.difficulty ? '◆'.repeat(row.difficulty) : '난이도 미지정'} · ${formatDate(row.published_at)}`;
    button.append(title,state,meta);
    button.addEventListener('click',()=>{ if (selectRow(row)) $('adminEditor').scrollIntoView({block:'start',behavior:'smooth'}); });
    list.append(button);
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
    rows = await rpc('admin_list_puzzles',{requested_season:season}); sortRows();
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
$('adminForm').addEventListener('input',updateDirty);
$('adminForm').addEventListener('change',updateDirty);
$('adminState').addEventListener('change',publicationUI);
$('adminDate').addEventListener('input',()=>$('adminDate').setCustomValidity(''));
$('adminForm').addEventListener('submit',async event => {
  event.preventDefault(); if (!selected || saving || !hasChanges()) return;
  const current = values(), state = $('adminState').value;
  if (state === 'scheduled' && (!current.published_at || Date.parse(current.published_at) <= Date.now())) {
    $('adminDate').setCustomValidity('현재보다 미래의 한국 시간을 입력해 주세요.'); $('adminDate').reportValidity(); return;
  }
  if (state === 'published' && displayState(selected) !== 'published') current.published_at = new Date().toISOString();
  const publicationChanged = current.status !== selected.status || Date.parse(current.published_at) !== Date.parse(selected.published_at) && !(current.published_at === null && selected.published_at === null);
  if (current.status === 'published' && publicationChanged && !confirm(`「${current.title}」\n${state === 'scheduled' ? `${formatDate(current.published_at)} (한국 시간)에 예약 공개` : '지금 공개'}합니다.\n목록·완료 기록·클라우드 저장이 활성화됩니다.\n저장할까요?`)) return;
  const args = { requested_season:season, requested_puzzle:selected.puzzle_id,
    new_title:current.title, new_summary:current.summary, new_type:current.puzzle_type,
    new_difficulty:current.difficulty, new_status:current.status, new_published_at:current.published_at,
    new_sort_order:current.sort_order, expected_updated_at:selected.updated_at };
  saving = true; $('adminFields').disabled = true; $('adminRefresh').disabled = true; renderList();
  $('adminSaveStatus').textContent = '저장하는 중...'; message('');
  try {
    const result = await rpc('admin_update_puzzle',args);
    const updated = Array.isArray(result) ? result[0] : result;
    if (!updated?.puzzle_id) throw new Error('Missing updated puzzle');
    rows = rows.map(row => row.puzzle_id === updated.puzzle_id ? updated : row); sortRows();
    saving = false; dirty = false; selectRow(updated);
    $('adminSaveStatus').textContent = '저장 완료';
    window.showToast('저장했습니다.');
  } catch (error) {
    $('adminSaveStatus').textContent = '저장하지 않은 변경사항';
    message(error.message?.includes('EDIT_CONFLICT') ? '다른 곳에서 수정된 문제입니다. 새로고침한 뒤 다시 수정해 주세요.' : '저장하지 못했습니다. 입력 내용과 관리자 권한을 확인해 주세요.');
  } finally {
    saving = false; $('adminFields').disabled = false; $('adminRefresh').disabled = false;
    $('adminSave').disabled = !dirty; renderList();
  }
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

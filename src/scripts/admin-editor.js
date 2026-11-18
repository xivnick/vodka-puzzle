import { $, bootstrap, displayState, formatDate, listPath, listQuery, loadPuzzles, message, rpc, season } from './admin.js';

const difficulty = $('adminForm').elements.namedItem('difficulty');
let selected = null, dirty = false, saving = false;
function koreanInput(value) {
  if (!value) return '';
  return new Date(new Date(value).getTime() + 9*60*60*1000).toISOString().slice(0,19);
}
function publicationUI() {
  const state = $('adminState').value;
  $('adminSchedule').hidden = state !== 'scheduled';
  $('adminDate').required = state === 'scheduled';
  $('adminDate').setCustomValidity('');
  $('adminPublicationHelp').textContent = state === 'test'
    ? '목록에 표시되지 않으며, 완료 기록과 클라우드 저장을 사용하지 않습니다.'
    : state === 'scheduled' ? '지정한 한국 시간부터 목록·완료 기록·클라우드 저장이 활성화됩니다.'
    : '목록·완료 기록·클라우드 저장이 활성화됩니다.';
}
function values() {
  const state = $('adminState').value;
  const status = state === displayState(selected) ? selected.status : state;
  return {
    title:$('adminTitle').value.trim(), summary:$('adminSummary').value.trim(),
    puzzle_type:$('adminType').value.trim(), difficulty:Number(difficulty.value),
    status:status === 'scheduled' ? 'published' : status,
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
  selected = row; dirty = false;
  $('adminForm').hidden = false;
  $('adminPuzzleId').textContent = row.puzzle_id;
  $('adminPreview').href = `/${row.puzzle_id}/`;
  $('adminTitle').value = row.title; $('adminSummary').value = row.summary;
  difficulty.value = String(row.difficulty ?? 0);
  $('adminType').value = row.puzzle_type; $('adminState').value = displayState(row);
  $('adminDate').value = koreanInput(row.published_at); $('adminOrder').value = row.sort_order;
  publicationUI(); updateDirty();
}
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
  saving = true; $('adminFields').disabled = true;
  $('adminSaveStatus').textContent = '저장하는 중...'; message('');
  try {
    const result = await rpc('admin_update_puzzle',args);
    const updated = Array.isArray(result) ? result[0] : result;
    if (!updated?.puzzle_id) throw new Error('Missing updated puzzle');
    saving = false; dirty = false; selectRow(updated);
    $('adminSaveStatus').textContent = '저장 완료';
    window.showToast('저장했습니다.');
  } catch (error) {
    $('adminSaveStatus').textContent = '저장하지 않은 변경사항';
    message(error.message?.includes('EDIT_CONFLICT') ? '다른 곳에서 수정된 문제입니다. 새로고침한 뒤 다시 수정해 주세요.' : '저장하지 못했습니다. 입력 내용과 관리자 권한을 확인해 주세요.');
  } finally {
    saving = false; $('adminFields').disabled = false;
    $('adminSave').disabled = !dirty;
  }
});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});

const query = listQuery();
const back = $('adminBack');
if (back && query.size) back.href = listPath + '?' + query;
const puzzleId = $('adminForm').dataset.previewPuzzle ?? new URLSearchParams(location.search).get('id');
bootstrap(async () => {
  if (!puzzleId) {
    message('목록에서 편집할 문제를 선택해 주세요.');
    return;
  }
  try {
    const row = (await loadPuzzles()).find(row => row.puzzle_id === puzzleId);
    if (row) selectRow(row);
    else message('해당 문제를 찾을 수 없습니다.');
  } catch {
    message('문제 정보를 불러오지 못했습니다. 다시 시도해 주세요.');
  }
});

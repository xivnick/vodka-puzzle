export const $ = id => document.getElementById(id);
export const season = document.documentElement.dataset.season;
export const message = text => { $('adminStatus').textContent = text; };
const dateFormat = new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false});
export const formatDate = value => value ? dateFormat.format(new Date(value)) : '—';
export function displayState(row) {
  if (row.status === 'published' && new Date(row.published_at) > new Date()) return 'scheduled';
  return row.status;
}
export const labels = { draft:'초안', test:'테스트', scheduled:'예약 공개', published:'공개' };
export async function rpc(name,args) {
  const { data, error } = await window.puzzleAccount.client.rpc(name,args);
  if (error) throw error;
  return data;
}
export async function bootstrap(load) {
  const login = $('adminLogin');
  const access = $('adminAccess');
  const panel = $('adminPanel');
  login.href = '/nickname/?' + new URLSearchParams({next:location.pathname + location.search});
  const deny = (text, showLogin = false) => {
    panel.hidden = true;
    access.hidden = false;
    access.textContent = text;
    login.hidden = !showLogin;
  };
  await window.puzzleAuthReady;
  if (!window.puzzleAccount.user) {
    deny('관리자 구글 계정으로 로그인해 주세요.', true);
    return;
  }
  try {
    if (!await rpc('is_puzzle_admin', {})) {
      deny('이 계정에는 관리자 권한이 없습니다.');
      return;
    }
  } catch {
    deny('관리자 권한을 확인하지 못했습니다. 다시 로그인해 주세요.');
    return;
  }
  access.hidden = true;
  login.hidden = true;
  panel.hidden = false;
  await load();
}

export const listPath = document.querySelector('.admin-shell').dataset.listPath;
export const editorPath = document.querySelector('.admin-shell').dataset.editorPath;
export function listQuery() {
  const source = new URLSearchParams(location.search);
  const query = new URLSearchParams();
  for (const key of ['q', 'state']) {
    if (source.get(key)) query.set(key, source.get(key));
  }
  return query;
}
export function loadPuzzles() {
  return rpc('admin_list_puzzles', {requested_season:season});
}

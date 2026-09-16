import { createClient } from '@supabase/supabase-js';

const season = document.documentElement.dataset.season;
const client = createClient('https://hlhrzbylbwebtoytmmpd.supabase.co', 'sb_publishable_YHte_s6VgQOQlU91hdsOoA_sDJ4_03y', {
  auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true, storageKey: 'vodka_google_session' }
});
const account = window.puzzleAccount;
account.client = client;
let initialized = false;

export function safeNext(value) {
  try {
    const url = new URL(value || '/puzzle/', location.origin);
    if (url.origin === location.origin && url.pathname.startsWith('/puzzle/') && !/^\/puzzle\/(auth|nickname)(\/|$)/.test(url.pathname)) return url.pathname + url.search + url.hash;
  } catch {}
  return '/puzzle/';
}
function nextPage() { return safeNext(sessionStorage.getItem('puzzle_login_next')); }

async function loadProfile() {
  account.profile = null;
  if (!account.user) return;
  const { data, error } = await client.from('semester_nicknames').select('nickname').eq('season_id', season).eq('user_id', account.user.id).maybeSingle();
  if (error) throw error;
  account.profile = data;
}
account.reloadProfile = loadProfile;

client.auth.onAuthStateChange((_event, session) => {
  // Never make async Supabase calls inside this callback (the auth lock is held).
  if (initialized && (session?.user?.id || null) !== (account.user?.id || null)) setTimeout(() => location.reload(), 0);
});

async function bootstrap() {
  const callback = location.pathname === '/puzzle/auth/callback/';
  try {
    const params = new URLSearchParams(location.search);
    if (callback && params.has('error')) throw new Error('로그인이 취소되었거나 완료되지 않았습니다. 다시 시도해 주세요.');
    if (callback) {
      const code = params.get('code');
      if (!code) throw new Error('로그인 정보가 없습니다. 다시 로그인해 주세요.');
      const { error } = await client.auth.exchangeCodeForSession(code);
      history.replaceState(null, '', '/puzzle/auth/callback/');
      if (error) throw new Error('로그인 연결이 만료되었습니다. 다시 시도해 주세요.');
    }
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    account.user = data.session?.user || null;
    if (account.user && account.user.app_metadata?.provider !== 'google') {
      await client.auth.signOut({ scope: 'local' });
      account.user = null;
      throw new Error('구글 계정으로 로그인해 주세요.');
    }
    if (callback && !account.user) throw new Error('로그인이 완료되지 않았습니다. 다시 시도해 주세요.');
    await loadProfile();
    if (callback && account.user) {
      const target = account.profile ? nextPage() : '/puzzle/nickname/';
      if (account.profile) sessionStorage.removeItem('puzzle_login_next');
      location.replace(target);
    }
  } catch (error) {
    account.error = error.message?.startsWith('로그인') || error.message?.startsWith('구글') ? error.message : '계정 정보를 불러오지 못했습니다. 새로고침해 주세요.';
    if (callback) history.replaceState(null, '', '/puzzle/auth/callback/');
  } finally {
    initialized = true;
    window.resolvePuzzleAuth();
    window.dispatchEvent(new Event('puzzle-auth-ready'));
    const status = document.getElementById('authCallbackStatus');
    if (status && account.error) status.textContent = account.error;
    setupAccountPage();
  }
}

function setupAccountPage() {
  const login = document.getElementById('googleLogin');
  if (!login) return;
  const pageTitle = account.user ? '마이페이지' : '로그인';
  const heading = document.querySelector('.page-heading h1');
  if (heading) heading.textContent = pageTitle;
  document.title = `${pageTitle} · vodka puzzle`;
  const form = document.getElementById('nicknameForm');
  const input = document.getElementById('nickInput');
  const status = document.getElementById('nickStatus');
  const save = document.getElementById('useBtn');
  const logout = document.getElementById('logout');
  document.getElementById('accountLoading').hidden = true;
  login.hidden = !!account.user;
  form.hidden = !account.user;
  logout.hidden = !account.user;
  status.textContent = account.error || '';
  input.value = account.profile?.nickname || '';
  save.disabled = !!account.error;
  const requestedNext = new URLSearchParams(location.search).get('next');
  if (requestedNext) sessionStorage.setItem('puzzle_login_next', safeNext(requestedNext));
  login.disabled = false;
  login.addEventListener('click', async () => {
    login.disabled = true;
    status.textContent = '';
    try {
      const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/puzzle/auth/callback/' } });
      if (error) throw error;
    } catch {
      status.textContent = '구글 로그인을 시작하지 못했습니다. 다시 시도해 주세요.';
      login.disabled = false;
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (save.disabled) return;
    const nickname = input.value.trim();
    if (!nickname || [...nickname].length > 20 || nickname === '게스트') {
      status.textContent = '게스트를 제외한 1~20자의 닉네임을 입력해 주세요.';
      return;
    }
    save.disabled = true;
    try {
      const result = account.profile
        ? await client.from('semester_nicknames').update({ nickname }).eq('season_id', season).eq('user_id', account.user.id).select('nickname').single()
        : await client.from('semester_nicknames').insert({ season_id: season, user_id: account.user.id, nickname }).select('nickname').single();
      if (result.error) throw result.error;
      account.profile = result.data;
      window.dispatchEvent(new Event('puzzle-auth-ready'));
      const target = nextPage();
      sessionStorage.removeItem('puzzle_login_next');
      location.assign(target);
    } catch (error) {
      status.textContent = error.code === '23505' ? '이미 사용 중인 닉네임입니다.' : '닉네임을 저장하지 못했습니다. 다시 시도해 주세요.';
      save.disabled = false;
    }
  });
  logout.addEventListener('click', async () => {
    logout.disabled = true;
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) { status.textContent = '로그아웃하지 못했습니다. 다시 시도해 주세요.'; logout.disabled = false; return; }
    location.replace('/puzzle/');
  });
}

bootstrap();

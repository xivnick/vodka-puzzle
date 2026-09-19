const SEASON_ID = document.documentElement.dataset.season;
// ── Supabase config ──────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://hlhrzbylbwebtoytmmpd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_YHte_s6VgQOQlU91hdsOoA_sDJ4_03y';

// 퍼즐 페이지에서 방향키 입력이 보드 이동과 페이지 스크롤을 동시에 일으키지 않게 한다.
function preventPuzzleArrowScroll(event) {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  const isPuzzlePage = document.body?.classList.contains('puzzle-page') || !!document.querySelector('.board');
  if (!isPuzzlePage) return;

  const target = event.target instanceof Element ? event.target : null;
  if (target && target.closest('input, textarea, select, [contenteditable="true"]')) return;

  event.preventDefault();
}

window.addEventListener('keydown', preventPuzzleArrowScroll, { capture: true });

// iOS Safari 등에서 남는 더블탭 확대를 막는다. 서로 다른 버튼을 빠르게 누르는
// 동작은 유지하기 위해 짧은 시간 + 거의 같은 좌표인 경우만 차단한다.
let _lastTapZoomGuard = { time: 0, x: 0, y: 0 };

function isPuzzleInteractionPage() {
  return document.body?.classList.contains('puzzle-page') || !!document.querySelector('.board, .keypad, .expression-box');
}

function guardDoubleTapZoom(event) {
  if (!isPuzzleInteractionPage() || event.changedTouches.length !== 1) return;
  const touch = event.changedTouches[0];
  const now = Date.now();
  const dx = touch.clientX - _lastTapZoomGuard.x;
  const dy = touch.clientY - _lastTapZoomGuard.y;
  const isNearPreviousTap = dx * dx + dy * dy < 24 * 24;
  if (now - _lastTapZoomGuard.time < 360 && isNearPreviousTap) {
    event.preventDefault();
  }
  _lastTapZoomGuard = { time: now, x: touch.clientX, y: touch.clientY };
}

document.addEventListener('touchstart', guardDoubleTapZoom, { capture: true, passive: false });

document.addEventListener('dblclick', event => {
  if (isPuzzleInteractionPage()) event.preventDefault();
}, { capture: true });

document.addEventListener('gesturestart', event => {
  if (isPuzzleInteractionPage()) event.preventDefault();
}, { capture: true, passive: false });

// ── Supabase REST helpers ────────────────────────────────────────────────────
async function sbSelect(table, qs = '') {
  const params = new URLSearchParams(qs);
  params.set('season_id', `eq.${SEASON_ID}`);
  if (table === 'completions') params.set('excluded', 'eq.false');
  const requestedLimit = Number(params.get('limit')) || Infinity;
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    params.set('offset', String(offset));
    params.set('limit', String(Math.min(500, requestedLimit - rows.length)));
    const res = await fetch(`${SUPABASE_URL}/rest/v1/semester_${table}?${params}`, {
      headers: await accountHeaders()
    });
    if (!res.ok) throw new Error(`sbSelect ${table}: ${res.status}`);
    const page = await res.json(); rows.push(...page);
    if (page.length < Number(params.get('limit')) || rows.length >= requestedLimit) return rows;
  }
}

async function sbInsert(table, data) {
  const url = `${SUPABASE_URL}/rest/v1/semester_${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...await accountHeaders(true),
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ ...data, season_id: SEASON_ID, user_id: getUserId() }),
  });
  if (!res.ok) throw new Error(`sbInsert ${table}: ${res.status}`);
  return true;
}

// ── Account identity (provided by the shared OAuth client) ──────────────────
function getUserId() { return window.puzzleAccount?.user?.id || ''; }
function getNickname() { return window.puzzleAccount?.profile?.nickname || ''; }
async function accountHeaders(requireLogin = false) {
  await window.puzzleAuthReady;
  const client = window.puzzleAccount?.client;
  const session = client ? await client.auth.getSession() : { data: { session: null } };
  if (session.error) throw session.error;
  const token = session.data.session?.access_token;
  if (requireLogin && (!token || !getUserId() || !getNickname())) throw new Error('구글 로그인 후 닉네임을 설정해 주세요.');
  return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token || SUPABASE_ANON_KEY}` };
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg) {
  let el = document.getElementById('_toast');
  if (!el) {
    el = document.createElement('div');
    el.id = '_toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ── Header init ──────────────────────────────────────────────────────────────
const GUEST_NAME = '게스트';

function initHeader() {
  const link = document.getElementById('nicknameLink');
  if (!link) return;
  const saved = getNickname();
  link.textContent = saved || (getUserId() ? '닉네임 설정' : '로그인');
  if (!location.pathname.startsWith('/nickname') && !location.pathname.startsWith('/auth/')) {
    link.href = '/nickname/?next=' + encodeURIComponent(location.pathname + location.search + location.hash);
  }
  initRecentBanner();
}

let _recentCompletionCache = null;
let _puzzleTitleMapPromise = null;
let _recentBannerTimer = null;
let _recentBannerInFlight = null;
let _recentBannerInitPromise = null;
let _recentBannerRotateTimer = null;
let _recentBannerTransitionTimer = null;
let _recentBannerTransitionToken = 0;
let _recentBannerIndex = 0;
let _recentBannerSignature = null;
let _recentBannerMessages = [];
const PUZZLE_TITLE_OVERRIDES = {
  tmp_01: '펜토미노 블리츠 1',
};

async function getLatestCompletions() {
  return refreshLatestCompletions();
}

async function fetchRecentCompletions() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/recent_completions`, {
    method: 'POST',
    headers: { ...await accountHeaders(), 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error(`recent_completions: ${res.status}`);
  return res.json();
}

async function refreshLatestCompletions(force = false) {
  if (_recentBannerInFlight) return _recentBannerInFlight;
  _recentBannerInFlight = (async () => {
    if (!force && _recentCompletionCache) return _recentCompletionCache;
    try {
      const rows = await fetchRecentCompletions();
      _recentCompletionCache = rows || [];
    } catch (e) {
      if (!_recentCompletionCache) _recentCompletionCache = [];
    } finally {
      _recentBannerInFlight = null;
    }
    return _recentCompletionCache;
  })();
  return _recentBannerInFlight;
}

async function getPuzzleTitleMap() {
  if (_puzzleTitleMapPromise) return _puzzleTitleMapPromise;
  _puzzleTitleMapPromise = (async () => {
    const map = new Map([...Object.entries(PUZZLE_TITLE_OVERRIDES), ...Object.entries(window.puzzleTitles || {})]);
    const pageTitle = document.querySelector('h1')?.textContent?.trim();
    if (typeof PUZZLE_ID !== 'undefined' && pageTitle && !map.has(PUZZLE_ID)) {
      map.set(PUZZLE_ID, pageTitle);
    }
    return map;
  })();
  return _puzzleTitleMapPromise;
}

function buildRecentBannerText(row, puzzleTitle) {
  const nick = escHtml(row.nickname);
  const title = escHtml(puzzleTitle || row.puzzle_id);
  return `<span class="recent-banner-strong">${nick}</span>님이 ` +
    `<span class="recent-banner-strong">${title}</span>를 풀었습니다!`;
}

function createRecentBannerSlot(messageHtml, state) {
  const slot = document.createElement('div');
  slot.className = `recent-banner-slot ${state}`;
  const track = document.createElement('div');
  track.className = 'recent-banner-track';
  const first = document.createElement('span');
  first.className = 'recent-banner-text';
  first.innerHTML = messageHtml;
  track.appendChild(first);
  slot.appendChild(track);
  return slot;
}

function finishRecentBannerTransition(banner) {
  clearTimeout(_recentBannerTransitionTimer);
  _recentBannerTransitionTimer = null;
  const viewport = banner.querySelector('.recent-banner-viewport');
  const visible = viewport?.querySelector('.incoming') || viewport?.querySelector('.current');
  banner.classList.remove('is-rolling');
  if (!viewport || !visible) return;
  const settled = visible.cloneNode(true);
  settled.classList.remove('incoming');
  settled.classList.add('current');
  settled.removeAttribute('aria-hidden');
  viewport.replaceChildren(settled);
}

function applyRecentBannerMessage(banner, messageHtml) {
  finishRecentBannerTransition(banner);
  let viewport = banner.querySelector('.recent-banner-viewport');
  if (!viewport) {
    banner.innerHTML = '';
    viewport = document.createElement('div');
    viewport.className = 'recent-banner-viewport';
    banner.appendChild(viewport);
  }
  const current = viewport.querySelector('.current');
  const incoming = createRecentBannerSlot(messageHtml, current ? 'incoming' : 'current');
  viewport.appendChild(incoming);
  if (!current) return;

  current.setAttribute('aria-hidden', 'true');
  const token = ++_recentBannerTransitionToken;
  requestAnimationFrame(() => {
    if (token !== _recentBannerTransitionToken || !incoming.isConnected) return;
    banner.classList.add('is-rolling');
    _recentBannerTransitionTimer = setTimeout(() => {
      if (token === _recentBannerTransitionToken) finishRecentBannerTransition(banner);
    }, 550);
  });
}

function stopRecentBannerRotation() {
  if (!_recentBannerRotateTimer) return;
  clearInterval(_recentBannerRotateTimer);
  _recentBannerRotateTimer = null;
}

function startRecentBannerRotation(banner, messages) {
  stopRecentBannerRotation();
  if (messages.length <= 1) return;
  _recentBannerRotateTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    _recentBannerIndex = (_recentBannerIndex + 1) % messages.length;
    applyRecentBannerMessage(banner, messages[_recentBannerIndex]);
  }, 6000);
}

function resumeRecentBannerRotation() {
  if (_recentBannerRotateTimer || _recentBannerMessages.length <= 1) return;
  const banner = document.getElementById('recentBanner');
  if (banner) startRecentBannerRotation(banner, _recentBannerMessages);
}

async function renderRecentBanner(rows) {
  const header = document.querySelector('.site-header');
  if (!header) return;
  let banner = document.getElementById('recentBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'recentBanner';
    banner.className = 'recent-banner';
    header.insertAdjacentElement('afterend', banner);
  }

  rows = rows || [];
  const signature = JSON.stringify(rows.map(row => [row.nickname, row.puzzle_id, row.completed_at]));
  if (signature === _recentBannerSignature) {
    if (document.visibilityState === 'visible') resumeRecentBannerRotation();
    return;
  }
  const hadPreviousData = _recentBannerSignature !== null;
  _recentBannerSignature = signature;
  if (hadPreviousData) _recentBannerIndex = 0;

  if (rows.length === 0) {
    banner.style.display = 'flex';
    _recentBannerTransitionToken++;
    finishRecentBannerTransition(banner);
    banner.innerHTML = '';
    _recentBannerMessages = [];
    stopRecentBannerRotation();
    return;
  }

  banner.style.display = 'flex';
  const titleMap = await getPuzzleTitleMap();
  _recentBannerMessages = rows.map(row => {
    const daily = /^daily-sudoku:(\d{4}-\d{2}-\d{2})$/.exec(row.puzzle_id);
    const puzzleTitle = daily ? `${daily[1].replaceAll('-', '').slice(2)} Daily Sudoku` : titleMap.get(row.puzzle_id) || row.puzzle_id;
    return buildRecentBannerText(row, puzzleTitle);
  });
  _recentBannerIndex = Math.min(_recentBannerIndex, _recentBannerMessages.length - 1);
  applyRecentBannerMessage(banner, _recentBannerMessages[_recentBannerIndex]);
  startRecentBannerRotation(banner, _recentBannerMessages);
}

function initRecentBanner() {
  if (!_recentBannerInitPromise) {
    _recentBannerInitPromise = (async () => {
      const rows = await getLatestCompletions();
      await renderRecentBanner(rows);
    })();
  }
  return _recentBannerInitPromise;
}

async function refreshRecentBanner(force = false) {
  const rows = await refreshLatestCompletions(force);
  await renderRecentBanner(rows);
}

function startRecentBannerPolling() {
  if (_recentBannerTimer || !document.querySelector('.site-header')) return;
  _recentBannerTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    refreshRecentBanner(true);
  }, 60000);
}

function stopRecentBannerPolling() {
  if (!_recentBannerTimer) return;
  clearInterval(_recentBannerTimer);
  _recentBannerTimer = null;
}

// ── Completion recording ─────────────────────────────────────────────────────
function _completionSavedKey(puzzleId) { return `completion_saved_${SEASON_ID}_${getUserId() || 'guest'}_${puzzleId}`; }

function isGuest() {
  const nick = getNickname();
  return !getUserId() || !nick || nick === GUEST_NAME;
}

const _completionInFlight = new Set();
const _completionRetries = new Map();

async function recordCompletion(puzzleId, state) {
  await window.puzzleAuthReady;
  const savedKey = _completionSavedKey(puzzleId);

  // 게스트로 완료했다가 닉네임을 설정한 경우 → 플래그 초기화 후 재기록
  if (localStorage.getItem(savedKey) === 'guest' && !isGuest()) {
    localStorage.removeItem(savedKey);
  }

  if (localStorage.getItem(savedKey) || _completionInFlight.has(savedKey)) return;

  if (isGuest()) {
    // 게스트는 저장 안 함 → 닉네임 설정 유도
    localStorage.setItem(savedKey, 'guest'); // 세션 내 중복 알림 방지
    setTimeout(() => {
      if (confirm('구글 로그인 후 닉네임을 설정하면 기록을 저장할 수 있습니다.\n로그인 화면으로 이동할까요?')) {
        location.href = '/nickname/?next=' + encodeURIComponent(location.pathname + location.search + location.hash);
      }
    }, 300);
    return;
  }

  if (!state || typeof state !== 'object' || Array.isArray(state)) return;
  const owner = getUserId();
  const snapshot = JSON.parse(JSON.stringify(state));
  _completionInFlight.add(savedKey);
  try {
    const headers = { ...await accountHeaders(true), 'Content-Type': 'application/json' };
    if (getUserId() !== owner) return;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_completion`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ requested_puzzle: puzzleId, submitted_state: snapshot, state_version: snapshot.version || 1 }),
    });
    if (!res.ok) throw new Error(`recordCompletion: ${res.status}`);
    await res.json();
    localStorage.setItem(savedKey, '1');
    clearTimeout(_completionRetries.get(savedKey));
    _completionRetries.delete(savedKey);
  } catch (e) {
    console.warn('recordCompletion failed:', e);
    if (!_completionRetries.has(savedKey)) showToast('완료 기록을 저장하지 못했습니다. 다시 시도합니다.');
    clearTimeout(_completionRetries.get(savedKey));
    const timer = setTimeout(() => {
      if (getUserId() === owner) return recordCompletion(puzzleId, snapshot);
      else _completionRetries.delete(savedKey);
    }, 30000);
    _completionRetries.set(savedKey, timer);
    return;
  } finally {
    _completionInFlight.delete(savedKey);
  }

  if (getUserId() !== owner) return;
  showToast('🎉 완료 기록을 저장했습니다!');
  _recentBannerIndex = 0;
  refreshRecentBanner(true);
  renderLeaderboard(puzzleId, 'leaderboard');
}

function resetCompletion(puzzleId) {
  localStorage.removeItem(_completionSavedKey(puzzleId));
}

// ── Cloud progress ────────────────────────────────────────────────────────────
async function sbUpsert(table, data, onConflict) {
  const url = `${SUPABASE_URL}/rest/v1/semester_${table}?on_conflict=${onConflict}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...await accountHeaders(true),
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ ...data, season_id: SEASON_ID, user_id: getUserId() }),
  });
  if (!res.ok) throw new Error(`sbUpsert ${table}: ${res.status}`);
  return true;
}

async function saveProgressCloud(puzzleId, state) {
  await window.puzzleAuthReady;
  if (isGuest()) { showToast('구글 로그인 후 닉네임을 설정해 주세요.'); return; }
  try {
    await sbUpsert('progress', {
      nickname: getNickname(),
      puzzle_id: puzzleId,
      state: state,
      saved_at: new Date().toISOString(),
    }, 'season_id,user_id,puzzle_id');
    showToast('저장했습니다.');
  } catch(e) {
    console.warn('saveProgressCloud failed:', e);
    showToast('저장에 실패했습니다.');
  }
}

async function loadProgressCloud(puzzleId) {
  await window.puzzleAuthReady;
  if (isGuest()) { showToast('구글 로그인 후 닉네임을 설정해 주세요.'); return null; }
  try {
    const rows = await sbSelect(
      'progress',
      `user_id=eq.${encodeURIComponent(getUserId())}&puzzle_id=eq.${encodeURIComponent(puzzleId)}&select=state&limit=1`
    );
    if (rows.length === 0) { showToast('불러올 데이터가 없습니다.'); return null; }
    showToast('불러왔습니다.');
    return rows[0].state;
  } catch(e) {
    console.warn('loadProgressCloud failed:', e);
    showToast('불러오기에 실패했습니다.');
    return null;
  }
}

function initCloudBtns() {
  const el = document.getElementById('cloudBtns');
  if (!el) return;
  el.style.display = isGuest() ? 'none' : 'flex';
}

function toggleRules(id = 'rulesBox') {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('open');
}

function saveLocalState(key, state) {
  localStorage.setItem(`${SEASON_ID}:${getUserId() || 'guest'}:${key}`, JSON.stringify(state));
}

function loadLocalState(key) {
  const storageKey = `${SEASON_ID}:${getUserId() || 'guest'}:${key}`;
  let raw = localStorage.getItem(storageKey);
  if (!raw && !getUserId()) {
    raw = localStorage.getItem(`${SEASON_ID}::${key}`);
    if (raw) localStorage.setItem(storageKey, raw);
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

async function loadCloudState(puzzleId, applyState) {
  const state = await loadProgressCloud(puzzleId);
  if (state == null) return false;
  applyState(state);
  return true;
}

function confirmPuzzleReset(puzzleId, resetFn, message = '정말 초기화하시겠습니까?') {
  if (!confirm(message)) return false;
  resetFn();
  resetCompletion(puzzleId);
  return true;
}

// ── Leaderboard ──────────────────────────────────────────────────────────────
async function renderLeaderboard(puzzleId, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const titleEl = container.closest('.lb-section')?.querySelector('.lb-title');
  container.innerHTML = '<div class="lb-loading">불러오는 중...</div>';

  let rows;
  try {
    rows = await sbSelect(
      'completions',
      `puzzle_id=eq.${encodeURIComponent(puzzleId)}&select=nickname,completed_at&order=completed_at.asc&limit=500`
    );
  } catch (e) {
    container.innerHTML = '<div class="lb-empty">기록을 불러오지 못했습니다.</div>';
    return;
  }

  // dedup by nickname: keep earliest completed_at
  const bestMap = new Map();
  for (const row of rows) {
    if (!bestMap.has(row.nickname)) {
      bestMap.set(row.nickname, row.completed_at);
    }
  }

  const sorted = [...bestMap.entries()].sort((a, b) => new Date(a[1]) - new Date(b[1]));
  const total = sorted.length;

  if (titleEl) titleEl.textContent = `푼 사람(${total})`;

  if (total === 0) {
    container.innerHTML = '<div class="lb-empty">아직 기록이 없습니다.</div>';
    return;
  }

  const myNick = getNickname();
  const myIdx = (!myNick || isGuest()) ? -1 : sorted.findIndex(([nick]) => nick === myNick);
  const top = Math.min(10, total);

  function rowHtml(rank, nick, completedAt, extra) {
    const isMe = myNick && nick === myNick;
    return `<div class="lb-row${isMe ? ' lb-me' : ''}${extra ? ' ' + extra : ''}">` +
      `<span class="lb-rank">${rank}</span>` +
      `<span class="lb-name">${escHtml(nick)}</span>` +
      `<span class="lb-time">${fmtDatetime(completedAt)}</span>` +
      `</div>`;
  }

  function ellipsisHtml() {
    return `<div class="lb-row lb-ellipsis lb-ellipsis-toggle" role="button" tabindex="0" data-leaderboard-toggle="1">` +
      `<span class="lb-rank">⋯</span><span class="lb-name"></span><span class="lb-time"></span>` +
      `</div>`;
  }

  function render(expanded = false) {
    let html = '<div class="lb-list">';
    if (expanded || total <= 10) {
      for (let i = 0; i < total; i++) {
        html += rowHtml(i + 1, sorted[i][0], sorted[i][1]);
      }
    } else {
      for (let i = 0; i < top; i++) {
        html += rowHtml(i + 1, sorted[i][0], sorted[i][1]);
      }
      if (myIdx >= 10) {
        html += ellipsisHtml();
        html += rowHtml(myIdx + 1, sorted[myIdx][0], sorted[myIdx][1]);
        if (myIdx < total - 1) html += ellipsisHtml();
        if (myIdx < total - 1) html += rowHtml(total, sorted[total - 1][0], sorted[total - 1][1]);
      } else {
        html += ellipsisHtml();
        html += rowHtml(total, sorted[total - 1][0], sorted[total - 1][1]);
      }
    }

    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('[data-leaderboard-toggle]').forEach(toggle => {
      const toggleExpanded = () => render(true);
      toggle.addEventListener('click', toggleExpanded, { once: true });
      toggle.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        toggleExpanded();
      }, { once: true });
    });
  }

  render(container.dataset.expanded === '1');
}

// ── My completed puzzles ─────────────────────────────────────────────────────
async function getMyCompletedPuzzles() {
  await window.puzzleAuthReady;
  const nickname = getNickname();
  if (!nickname) return new Set();
  try {
    const rows = await sbSelect(
      'completions',
      `user_id=eq.${encodeURIComponent(getUserId())}&select=puzzle_id`
    );
    return new Set(rows.map(r => r.puzzle_id));
  } catch (e) {
    return new Set();
  }
}

// ── Solver rankings (for index page) ────────────────────────────────────────
async function getSolverRankings(puzzleIds = null) {
  try {
    const rows = await sbSelect('completions', 'select=nickname,puzzle_id,completed_at');
    const EXCLUDE = new Set(['puzzle_test']);
    const includeSet = Array.isArray(puzzleIds) ? new Set(puzzleIds) : null;
    const nickPuzzles = new Map(); // nickname -> Set of puzzle_ids
    const nickLastAt = new Map(); // nickname -> 가장 최근 completed_at
    for (const row of rows) {
      if (EXCLUDE.has(row.puzzle_id)) continue;
      if (includeSet && !includeSet.has(row.puzzle_id)) continue;
      if (!nickPuzzles.has(row.nickname)) {
        nickPuzzles.set(row.nickname, new Set());
        nickLastAt.set(row.nickname, row.completed_at);
      }
      nickPuzzles.get(row.nickname).add(row.puzzle_id);
      if (row.completed_at > nickLastAt.get(row.nickname)) {
        nickLastAt.set(row.nickname, row.completed_at);
      }
    }
    return [...nickPuzzles.entries()]
      .map(([nick, puzzles]) => ({ nick, count: puzzles.size, lastAt: nickLastAt.get(nick) }))
      .sort((a, b) => b.count - a.count || new Date(a.lastAt) - new Date(b.lastAt));
  } catch (e) {
    return [];
  }
}

// ── Solver counts (for index page) ──────────────────────────────────────────
async function getSolverCounts() {
  try {
    const rows = await sbSelect('completions', 'select=puzzle_id,nickname');
    const countMap = new Map();
    const seen = new Set();
    for (const row of rows) {
      const key = row.puzzle_id + '\0' + row.nickname;
      if (!seen.has(key)) {
        seen.add(key);
        countMap.set(row.puzzle_id, (countMap.get(row.puzzle_id) || 0) + 1);
      }
    }
    return countMap;
  } catch (e) {
    return new Map();
  }
}

// ── Utilities ────────────────────────────────────────────────────────────────
function fmtDatetime(isoStr) {
  const d = new Date(isoStr);
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mn = String(d.getMinutes()).padStart(2, '0');
  return `${mm}월 ${dd}일 ${hh}:${mn}`;
}

// ── 뒤로가기(bfcache) 복원 시 헤더·완료 상태 갱신 ──────────────────────────
window.addEventListener('pageshow', e => {
  if (!e.persisted) return;
  initHeader();
  initCloudBtns();
  refreshRecentBanner(true);
  // 퍼즐 페이지에 checkComplete가 있으면 호출 (게스트→닉네임 전환 후 완료 재기록)
  if (typeof checkComplete === 'function') checkComplete();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    resumeRecentBannerRotation();
    refreshRecentBanner(true);
    startRecentBannerPolling();
    return;
  }
  stopRecentBannerPolling();
  stopRecentBannerRotation();
});

startRecentBannerPolling();

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.addEventListener('puzzle-auth-ready', () => {
  initHeader();
  initCloudBtns();
});

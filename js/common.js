// ── Supabase config ──────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://hlhrzbylbwebtoytmmpd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_YHte_s6VgQOQlU91hdsOoA_sDJ4_03y';

// ── Supabase REST helpers ────────────────────────────────────────────────────
async function sbSelect(table, qs) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${qs ? '?' + qs : ''}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`sbSelect ${table}: ${res.status}`);
  return res.json();
}

async function sbInsert(table, data) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`sbInsert ${table}: ${res.status}`);
  return true;
}

// ── Nickname ─────────────────────────────────────────────────────────────────
const NICK_KEY = 'vodka_nickname';

function getNickname() {
  return localStorage.getItem(NICK_KEY) || '';
}

function setNickname(name) {
  localStorage.setItem(NICK_KEY, name);
}

async function registerNickname(name) {
  if (!name || name === GUEST_NAME) return;
  try {
    const url = `${SUPABASE_URL}/rest/v1/nicknames`;
    await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify({ nickname: name }),
    });
  } catch (e) {
    // 등록 실패해도 닉네임 설정 자체는 유지
  }
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
  link.textContent = saved || GUEST_NAME;
  initRecentBanner();
}

let _recentCompletionCache = null;
let _puzzleTitleMapPromise = null;
let _recentBannerTimer = null;
let _recentBannerInFlight = null;
let _recentBannerRotateTimer = null;
let _recentBannerIndex = 0;
const PUZZLE_TITLE_OVERRIDES = {
  tmp_01: '펜토미노 블리츠 1',
};

async function getLatestCompletions() {
  if (_recentCompletionCache) return _recentCompletionCache;
  try {
    const rows = await sbSelect(
      'completions',
      'select=nickname,puzzle_id,completed_at&order=completed_at.desc&limit=3'
    );
    _recentCompletionCache = rows || [];
  } catch (e) {
    _recentCompletionCache = [];
  }
  return _recentCompletionCache;
}

async function refreshLatestCompletions(force = false) {
  if (_recentBannerInFlight) return _recentBannerInFlight;
  _recentBannerInFlight = (async () => {
    if (!force && _recentCompletionCache) return _recentCompletionCache;
    try {
      const rows = await sbSelect(
        'completions',
        'select=nickname,puzzle_id,completed_at&order=completed_at.desc&limit=3'
      );
      _recentCompletionCache = rows || [];
    } catch (e) {
      if (force) _recentCompletionCache = [];
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
    const map = new Map(Object.entries(PUZZLE_TITLE_OVERRIDES));
    try {
      const res = await fetch('/puzzle/');
      if (!res.ok) throw new Error(`index fetch failed: ${res.status}`);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('[data-puzzle-id]').forEach(el => {
        const id = el.getAttribute('data-puzzle-id');
        if (!id || map.has(id)) return;
        const titleEl = el.querySelector('.title');
        const title = titleEl ? titleEl.textContent.trim() : '';
        if (title) map.set(id, title);
      });
    } catch (e) {
      // index를 못 읽으면 override/current page title만 사용
    }
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

function applyRecentBannerMessage(banner, messageHtml) {
  banner.classList.remove('is-animated');
  banner.innerHTML = '';
  const track = document.createElement('div');
  track.className = 'recent-banner-track';
  const first = document.createElement('span');
  first.className = 'recent-banner-text';
  first.innerHTML = messageHtml;
  track.appendChild(first);
  banner.appendChild(track);

  requestAnimationFrame(() => {
    const needsAnimation = track.scrollWidth > banner.clientWidth - 8;
    if (!needsAnimation) return;
    banner.classList.add('is-animated');
    const second = first.cloneNode(true);
    track.appendChild(second);
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
  }, 10000);
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

  if (!rows || rows.length === 0) {
    banner.style.display = 'none';
    stopRecentBannerRotation();
    return;
  }

  banner.style.display = 'flex';
  const titleMap = await getPuzzleTitleMap();
  const messages = rows.map(row => {
    const puzzleTitle = titleMap.get(row.puzzle_id) || row.puzzle_id;
    return buildRecentBannerText(row, puzzleTitle);
  });
  _recentBannerIndex = Math.min(_recentBannerIndex, messages.length - 1);
  applyRecentBannerMessage(banner, messages[_recentBannerIndex]);
  startRecentBannerRotation(banner, messages);
}

async function initRecentBanner() {
  const rows = await getLatestCompletions();
  await renderRecentBanner(rows);
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
function _completionSavedKey(puzzleId) { return `completion_saved_${puzzleId}`; }

function isGuest() {
  const nick = getNickname();
  return !nick || nick === GUEST_NAME;
}

async function recordCompletion(puzzleId) {
  const savedKey = _completionSavedKey(puzzleId);

  // 게스트로 완료했다가 닉네임을 설정한 경우 → 플래그 초기화 후 재기록
  if (localStorage.getItem(savedKey) === 'guest' && !isGuest()) {
    localStorage.removeItem(savedKey);
  }

  if (localStorage.getItem(savedKey)) return; // already recorded

  if (isGuest()) {
    // 게스트는 저장 안 함 → 닉네임 설정 유도
    localStorage.setItem(savedKey, 'guest'); // 세션 내 중복 알림 방지
    setTimeout(() => {
      if (confirm('닉네임을 설정하면 이 기록이 저장됩니다.\n닉네임 설정 페이지로 이동할까요?')) {
        location.href = '/puzzle/nickname/';
      }
    }, 300);
    return;
  }

  const nickname = getNickname();
  localStorage.setItem(savedKey, '1');

  try {
    const url = `${SUPABASE_URL}/rest/v1/completions?on_conflict=nickname,puzzle_id`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify({ puzzle_id: puzzleId, nickname: nickname }),
    });
    if (!res.ok) throw new Error(`recordCompletion: ${res.status}`);
  } catch (e) {
    console.warn('recordCompletion failed:', e);
    localStorage.removeItem(savedKey); // allow retry
    return;
  }

  showToast('🎉 완성했습니다!');
  _recentCompletionCache = [
    { nickname, puzzle_id: puzzleId, completed_at: new Date().toISOString() },
    ...(_recentCompletionCache || []).filter(row => !(row.nickname === nickname && row.puzzle_id === puzzleId)),
  ].slice(0, 3);
  _recentBannerIndex = 0;
  refreshRecentBanner();
  renderLeaderboard(puzzleId, 'leaderboard');
}

function resetCompletion(puzzleId) {
  localStorage.removeItem(_completionSavedKey(puzzleId));
}

// ── Cloud progress ────────────────────────────────────────────────────────────
async function sbUpsert(table, data, onConflict) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`sbUpsert ${table}: ${res.status}`);
  return true;
}

async function saveProgressCloud(puzzleId, state) {
  if (isGuest()) { showToast('닉네임을 설정해야 저장할 수 있습니다.'); return; }
  try {
    await sbUpsert('progress', {
      nickname: getNickname(),
      puzzle_id: puzzleId,
      state: state,
      saved_at: new Date().toISOString(),
    }, 'nickname,puzzle_id');
    showToast('저장했습니다.');
  } catch(e) {
    console.warn('saveProgressCloud failed:', e);
    showToast('저장에 실패했습니다.');
  }
}

async function loadProgressCloud(puzzleId) {
  if (isGuest()) { showToast('닉네임을 설정해야 불러올 수 있습니다.'); return null; }
  try {
    const rows = await sbSelect(
      'progress',
      `nickname=eq.${encodeURIComponent(getNickname())}&puzzle_id=eq.${encodeURIComponent(puzzleId)}&select=state&limit=1`
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
  localStorage.setItem(key, JSON.stringify(state));
}

function loadLocalState(key) {
  const raw = localStorage.getItem(key);
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
  const nickname = getNickname();
  if (!nickname) return new Set();
  try {
    const rows = await sbSelect(
      'completions',
      `nickname=eq.${encodeURIComponent(nickname)}&select=puzzle_id`
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
    refreshRecentBanner(true);
    startRecentBannerPolling();
    return;
  }
  stopRecentBannerPolling();
  stopRecentBannerRotation();
});

window.addEventListener('focus', () => {
  if (document.visibilityState === 'visible') refreshRecentBanner(true);
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
